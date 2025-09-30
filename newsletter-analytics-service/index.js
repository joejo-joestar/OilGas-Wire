const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// IMPORTANT: Enable CORS for the Google Apps Script origin.
// This is required for the web app to be able to send requests.
app.use(cors({ origin: 'https://script.google.com' }));

const bigquery = new BigQuery();
const datasetId = 'newsletter_analytics';
const tableId = 'events';

// Simple in-memory token store for shortlinks. Keys are tokens -> { url, nid, rid, expiresAt }
// Note: This is ephemeral and only suitable for single-instance deployments or testing.
// Tokens are now multi-use and non-expiring by default unless a TTL is explicitly desired.
const shortlinkStore = new Map();

function generateToken(len = 8) {
    return crypto.randomBytes(len).toString('hex');
}

// Cleanup expired tokens periodically — only removes tokens that have an explicit expiresAt set
// (we now default to non-expiring tokens, so this usually does nothing).
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of shortlinkStore.entries()) {
        if (v && v.expiresAt && v.expiresAt <= now) shortlinkStore.delete(k);
    }
}, 60 * 1000);

app.post('/track', async (req, res) => {
    const event = req.body;

    if (!event.eventType || !event.newsletterId) {
        console.warn('Received invalid event:', event);
        return res.status(400).send('Missing required event fields.');
    }

    const row = {
        eventTimestamp: new Date().toISOString(),
        src: event.src || 'unknown',
        eventType: event.eventType,
        eventDetail: event.eventDetail,
        newsletterId: event.newsletterId || null,
        recipientHash: event.recipientHash || null,
        url: event.url || null,
        durationSec: event.durationSec || null,
        userAgent: req.get('User-Agent') || null,
    };

    try {
        await bigquery.dataset(datasetId).table(tableId).insert([row]);
        // Respond with 204 No Content for a successful, lightweight response.
        res.status(204).send();
    } catch (error) {
        console.error('Failed to insert data into BigQuery:', JSON.stringify(error));
        res.status(500).send('Internal Server Error');
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Analytics service listening on port ${PORT}`);
});

// Accept recipientHash -> email mappings. Stores mapping for later join with events.
app.post('/map', async (req, res) => {
    const mapping = req.body;

    // Verify signature header against ANALYTICS_SECRET
    const secret = process.env.ANALYTICS_SECRET || '';
    const sigHeader = req.get('X-Signature') || req.get('x-signature') || '';
    if (!secret) {
        console.warn('ANALYTICS_SECRET not set on server; rejecting mapping POST for safety');
        return res.status(403).send('Server not configured to accept mappings');
    }
    if (!sigHeader) {
        console.warn('Missing X-Signature header for mapping POST');
        return res.status(401).send('Missing signature');
    }

    // Recreate signature base used by Apps Script: recipientHash|email|emailHash|newsletterId
    const base = (mapping.recipientHash || '') + '|' + (mapping.email || '') + '|' + (mapping.emailHash || '') + '|' + (mapping.newsletterId || '');
    const hmac = crypto.createHmac('sha256', secret).update(base).digest('hex');
    if (hmac !== sigHeader) {
        console.warn('Invalid signature for mapping POST', { expected: hmac, got: sigHeader });
        return res.status(401).send('Invalid signature');
    }

    if (!mapping || !mapping.recipientHash) {
        console.warn('Received invalid mapping:', mapping);
        return res.status(400).send('Missing recipientHash');
    }

    const row = {
        mappedAt: new Date().toISOString(),
        recipientHash: mapping.recipientHash || null,
        email: mapping.email || null,
        emailHash: mapping.emailHash || null,
        newsletterId: mapping.newsletterId || null
    };

    try {
        await bigquery.dataset(datasetId).table('recipient_mappings').insert([row]);
        res.status(204).send();
    } catch (error) {
        console.error('Failed to insert mapping into BigQuery:', JSON.stringify(error));
        res.status(500).send('Internal Server Error');
    }
});

// Create a shortlink token for a specific target URL. Tokens are multi-use and optionally expirable.
app.post('/shortlink', async (req, res) => {
    const body = req.body || {};
    const url = body.url || '';
    const nid = body.nid || '';
    const rid = body.rid || '';
    // Tokens are multi-use and non-expiring by default. If ttlSeconds is provided
    // we will honor it, but by default tokens do not expire.
    const ttl = (typeof body.ttlSeconds !== 'undefined') ? Number(body.ttlSeconds) : null;
    if (!url) return res.status(400).json({ ok: false, error: 'url required' });
    const token = generateToken(6); // 12 hex chars
    const payload = JSON.stringify({ url: url, nid: nid, rid: rid });
    // If REDIS_URL is provided, store in Redis with EX expiry
    const REDIS_URL = process.env.REDIS_URL || '';
    if (REDIS_URL) {
        // lazy-load redis client
        try {
            if (!global.redisClient) {
                const { createClient } = require('redis');
                const client = createClient({ url: REDIS_URL });
                client.on('error', (err) => console.error('Redis error', err));
                client.connect().catch((e) => console.error('Redis connect error', e));
                global.redisClient = client;
            }
            // SET token -> payload. If TTL requested, set EX; otherwise leave persistent.
            if (ttl && !isNaN(ttl) && Number(ttl) > 0) {
                const clamped = Math.min(Math.max(Number(ttl), 5), 60 * 60);
                global.redisClient.set('shortlink:' + token, payload, { EX: clamped }).catch((e) => console.error('Redis set error', e));
            } else {
                global.redisClient.set('shortlink:' + token, payload).catch((e) => console.error('Redis set error', e));
            }
            return res.json({ ok: true, token: token, path: '/s/' + token, expiresAt: ttl ? new Date(Date.now() + Math.min(Math.max(Number(ttl), 5), 60 * 60) * 1000).toISOString() : null });
        } catch (e) {
            console.error('Redis shortlink set failed, falling back to memory store', e && e.message);
        }
    }
    // If Redis not configured, persist token to BigQuery (durable) as a fallback.
    try {
        const expiresAt = ttl ? new Date(Date.now() + Math.min(Math.max(Number(ttl), 5), 60 * 60) * 1000).toISOString() : null;
        const row = {
            token: token,
            url: url,
            nid: nid || null,
            rid: rid || null,
            createdAt: new Date().toISOString(),
            expiresAt: expiresAt
        };
        // Insert into `shortlinks` table
        await bigquery.dataset(datasetId).table('shortlinks').insert([row]);
        return res.json({ ok: true, token: token, path: '/s/' + token, expiresAt: expiresAt });
    } catch (e) {
        // BigQuery insert failed — fall back to in-memory store
        console.error('BigQuery shortlink insert failed, falling back to memory store', e && e.message);
        shortlinkStore.set(token, { url: url, nid: nid, rid: rid, expiresAt: ttl ? Date.now() + Math.min(Math.max(Number(ttl), 5), 60 * 60) * 1000 : null });
        return res.json({ ok: true, token: token, path: '/s/' + token, expiresAt: ttl ? new Date(Date.now() + Math.min(Math.max(Number(ttl), 5), 60 * 60) * 1000).toISOString() : null });
    }
});

// Resolve shortlink: log the click and redirect to the stored URL. Tokens are single-use.
app.get('/s/:token', async (req, res) => {
    const token = (req.params && req.params.token) || '';
    const REDIS_URL = process.env.REDIS_URL || '';
    let entry = null;
    if (REDIS_URL && global.redisClient) {
        try {
            const key = 'shortlink:' + token;
            const val = await global.redisClient.get(key);
            if (!val) return res.status(404).send('Not found');
            try { entry = JSON.parse(val); } catch (e) { entry = null; }
        } catch (e) {
            console.error('Redis shortlink consume error', e && e.message);
            // fall back to memory below
        }
    }
    if (!entry) {
        // Try BigQuery lookup for persistent tokens
        try {
            const sql = `SELECT token, url, nid, rid, createdAt, expiresAt FROM \`${datasetId}.shortlinks\` WHERE token = @token ORDER BY createdAt DESC LIMIT 1`;
            const options = { query: sql, params: { token: token }, location: 'US' };
            const [job] = await bigquery.createQueryJob(options);
            const [rows] = await job.getQueryResults();
            if (rows && rows.length) {
                const r = rows[0];
                if (r.expiresAt && new Date(r.expiresAt) <= new Date()) {
                    return res.status(410).send('Expired');
                }
                entry = { url: r.url, nid: r.nid, rid: r.rid };
            }
        } catch (e) {
            console.error('BigQuery shortlink lookup error', e && e.message);
        }
        if (!entry) {
            const mem = shortlinkStore.get(token);
            if (!mem) return res.status(404).send('Not found');
            if (mem.expiresAt && mem.expiresAt <= Date.now()) { shortlinkStore.delete(token); return res.status(410).send('Expired'); }
            entry = mem;
        }
    }

    // Log click as an event to BigQuery (best-effort)
    const row = {
        eventTimestamp: new Date().toISOString(),
        src: 'mail',
        eventType: 'click',
        eventDetail: 'mail_headline_click',
        newsletterId: entry.nid || null,
        recipientHash: entry.rid || null,
        url: entry.url || null,
        durationSec: null,
        userAgent: req.get('User-Agent') || null,
    };
    try {
        await bigquery.dataset(datasetId).table(tableId).insert([row]);
    } catch (err) {
        console.error('Failed to log shortlink click:', err && err.message);
    }

    // Redirect to final URL (302)
    return res.redirect(302, entry.url);
});