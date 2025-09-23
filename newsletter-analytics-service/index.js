const express = require('express');
const cors = require('cors');
const { BigQuery } = require('@google-cloud/bigquery');

const app = express();
app.use(express.json());

// IMPORTANT: Enable CORS for the Google Apps Script origin.
// This is required for your web app to be able to send requests.
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
        eventType: event.eventType,
        newsletterId: event.newsletterId,
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