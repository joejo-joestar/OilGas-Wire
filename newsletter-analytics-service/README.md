# Newsletter Analytics Service

This service collects and stores analytics events for newsletters, such as email opens and link clicks. It is designed to be used in conjunction with Google Apps Script-based newsletter systems.

## Setup Instructions

> [!NOTE]
> This project requires a Google Cloud account **with billing enabled**.
>
> You will also need to have the Google Cloud SDK installed and configured on your local machine.
>
> Refer to the [installation documentation](https://cloud.google.com/sdk/docs/install) for installation instructions and the [initialization documetation](https://cloud.google.com/sdk/docs/initializing) for configuration instructions.
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
    - Create a BigQuery dataset and table to store analytics events. Create a table named `newsletter_events` with the schema defined in [`newsletter-analytics.events.json`](newsletter-analytics.events.json)

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
    curl -X POST "<SERVICE_URL>/track" -H "Authorization: bearer $(gcloud auth print-identity-token)" -H "Content-Type: application/json" -d '{  "src":"cloud-console", "eventType": "gui-test", "eventDetail": "console-test", "durationSec": "25", "newsletterId": "test-from-console", "url": "something" }'
    ```
