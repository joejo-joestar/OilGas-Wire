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

// Simple in-memory token store for shortlinks. Keys are tokens -> { url, nid, rid, expiresAt, used }
// Note: This is ephemeral and only suitable for single-instance deployments or testing.
const shortlinkStore = new Map();

function generateToken(len = 8) {
    return crypto.randomBytes(len).toString('hex');
}

// Cleanup expired tokens periodically
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of shortlinkStore.entries()) {
        if (v.expiresAt <= now || v.used) shortlinkStore.delete(k);
    }
}, 30 * 1000);

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

// Create a shortlink token for a specific target URL. Tokens are single-use and expire after 60 seconds.
app.post('/shortlink', (req, res) => {
    const body = req.body || {};
    const url = body.url || '';
    const nid = body.nid || '';
    const rid = body.rid || '';
    const ttl = Number(body.ttlSeconds) || 60;
    if (!url) return res.status(400).json({ ok: false, error: 'url required' });
    const token = generateToken(6); // 12 hex chars
    const expiresAt = Date.now() + Math.min(Math.max(ttl, 5), 60 * 60) * 1000; // clamp
    shortlinkStore.set(token, { url: url, nid: nid, rid: rid, expiresAt: expiresAt, used: false });
    return res.json({ ok: true, token: token, path: '/s/' + token, expiresAt: new Date(expiresAt).toISOString() });
});

// Resolve shortlink: log the click and redirect to the stored URL. Tokens are single-use.
app.get('/s/:token', async (req, res) => {
    const token = (req.params && req.params.token) || '';
    const entry = shortlinkStore.get(token);
    if (!entry) return res.status(404).send('Not found');
    if (entry.used) { shortlinkStore.delete(token); return res.status(410).send('Gone'); }
    if (entry.expiresAt <= Date.now()) { shortlinkStore.delete(token); return res.status(410).send('Expired'); }

    // Mark used (single-use)
    entry.used = true; shortlinkStore.set(token, entry);

    // Log click as an event to BigQuery (best-effort)
    const row = {
        eventTimestamp: new Date().toISOString(),
        src: 'shortlink',
        eventType: 'click',
        eventDetail: 'shortlink_click',
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