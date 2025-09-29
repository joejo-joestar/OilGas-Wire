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

## API Endpoints

### Shortlink support (multi-use, optionally expirable tokens)

This service provides a shortlink API to create tokens that map to a final target URL. The shortlink lets the analytics service receive and record a click before redirecting to the destination — useful when third-party redirectors strip query parameters.

- POST /shortlink: create a token. Request body: `{ url, nid, rid, ttlSeconds? }`. The `ttlSeconds` field is optional; if omitted the token is persistent (non-expiring). The service returns `{ ok: true, token, path, expiresAt }` where `expiresAt` will be `null` for non-expiring tokens.
- GET /s/:token: resolve a token, log a `shortlink_click` event, and issue an HTTP 302 redirect to the stored URL. Tokens are multi-use by default; if a TTL was supplied when creating the token it will expire after that time.

Notes:

- The current implementation supports two storage backends:
  - In-memory Map (default): simple and suited for local testing or single-instance deployments. Non-expiring tokens stored here are lost on process restart.
  - Redis (recommended for production): when `REDIS_URL` is provided, tokens are stored in Redis and shared across instances. Redis-backed tokens persist until explicitly expired by TTL (if set) or deleted.
- By default the Apps Script client does not request a TTL so tokens are persistent and multi-use. If you need single-use tokens or short-lived tokens, set `ttlSeconds` in the `POST /shortlink` request when creating the token.
