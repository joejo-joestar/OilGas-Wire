# Newsletter Analytics Service

This service collects and stores analytics events for newsletters, such as email opens and link clicks. It is designed to be used in conjunction with Google Apps Script-based newsletter systems.

## Setup Instructions

> [!NOTE]
> This project requires a Google Cloud account **with billing enabled**.
>
> You will also need to have the Google Cloud SDK installed and configured on your local machine.
>
> Refer to the [installation documentation](https://cloud.google.com/sdk/docs/install) for installation instructions and the [initialization documentation](https://cloud.google.com/sdk/docs/initializing) for configuration instructions.
>
> Make sure you have the necessary permissions to create and manage resources in your Google Cloud project.

1. **Clone the Repository**:
    Use the following commands to clone the repository and navigate to the project directory.

    ```bash
    git clone https://github.com/joejo-joestar/OilGas-Wire.git
    cd OilGas-Wire/newsletter-analytics-service
    ```

2. **Set Up Google Cloud Project**:
    - Create a new project in the [Google Cloud Console](https://console.cloud.google.com/).
    - Enable the BigQuery API for your project.
    - Create a BigQuery dataset and table to store analytics events. Create a dataset named `newsletter_events` and a table called `events` in that dataset with the schema defined in [`newsletter_analytics.events.json`](newsletter_analytics.events.json)

3. **Deploy to Google Cloud Run**:
    Use the following command to deploy the service to Google Cloud Run. Make sure you are in the `newsletter-analytics-service` directory.

    ```bash
    gcloud run deploy newsletter-analytics-service --source . --platform managed --region us-central1 --allow-unauthenticated
    ```

> [!NOTE]
> The `--allow-unauthenticated` flag allows public access to the service.
>
> If you want to restrict access, remove this flag and configure IAM permissions accordingly.
>
> Make sure that you have the necessary permissions to change IAM policies in your Google Cloud project.

4. **Test Endpoint**:
    Use the provided `curl` command in the cloud console to test the endpoint. Make sure to replace the URL with your deployed service URL.

    ```bash
    curl -X POST "<SERVICE_URL>/track" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" -d '{  "src":"cloud-console", "eventType": "test-event", "eventDetail": "console-test", "durationSec": "25", "newsletterId": "test-from-console", "url": "https://www.oilandgas360.com/exxon-signs-initial-agreement-with-rosneft-to-chart-possible-path-to-recoup-russian-losses-sources-say/#utm_source=rss&utm_medium=rss&utm_campaign=exxon-signs-initial-agreement-with-rosneft-to-chart-possible-path-to-recoup-russian-losses-sources-say" }''
    ```

    This command sends a test event with the following fields:

    ```json
    {
        "src": "cloud-console",
        "eventType": "test-event",
        "eventDetail": "console-test",
        "durationSec": "25",
        "newsletterId": "test-from-console",
        "url": "https://www.oilandgas360.com/exxon-signs-initial-agreement-with-rosneft-to-chart-possible-path-to-recoup-russian-losses-sources-say/#utm_source=rss&utm_medium=rss&utm_campaign=exxon-signs-initial-agreement-with-rosneft-to-chart-possible-path-to-recoup-russian-losses-sources-say"
    }
    ```

    Which will be stored in the `events` table as such:

    <p align="center">
    <img src="../assets/bigquery sample.png" alt="BigQuery Record" title="BigQuery Record" width="600" >
    </p>

---

## Importing existing recipient mappings (recommended)

If you already have a CSV that maps `rid` (recipientHash) to email addresses, import it into BigQuery so the backend can join events to identities without Apps Script sending raw PII.

1. Export your data as CSV with columns: `recipientHash,email,newsletterId`.
2. Use the BigQuery UI or `bq` command-line tool to load the CSV into your dataset's `recipient_mappings` table.

Example `bq` command:

```bash
bq load --autodetect --source_format=CSV newsletter_analytics.recipient_mappings ./mappings.csv
```

Make sure the table exists (see `ddl_recipient_mappings.sql`) and that the account running the import has write access to BigQuery.

Recommended workflow: Keep the backend table `recipient_mappings` as the source-of-truth. Use periodic imports from your sheet when needed, and keep `ANALYTICS_SEND_MAPPINGS` disabled in Apps Script unless you want Apps Script to send incremental mapping updates during sends.

## Shortlink support (single-use tokens)

This service also provides a shortlink API to create short-lived, single-use tokens that map to a final target URL. Use this when you want to ensure the analytics service receives the click before redirecting to a third-party site (useful for redirectors that strip query params).

- POST /shortlink: create a token. Request body: `{ url, nid, rid, ttlSeconds }`. The service returns `{ ok: true, token, path, expiresAt }`.
- GET /s/:token: resolve a token, log a shortlink_click event, and issue an HTTP 302 redirect to the stored URL. Tokens are single-use and expire after the requested TTL (clamped to a maximum).

Notes:

- The current implementation uses an in-memory token store (suitable for single-instance testing). For production or multi-instance deployments, use a persistent store like Redis to share tokens between instances and ensure tokens survive service restarts.
- Default token lifetime used by Apps Script is 60 seconds and tokens are created as single-use by default.
