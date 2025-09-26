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