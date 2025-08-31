<h1 align="center">🛢️ OilGas-Wire</h1>

<p align="center">
  <img src="assets/pixpagercar.png" alt="Feed Car" title="Feed Car" width="128">
</p>

A simple Google Apps Script project that aggregates RSS/Atom feeds, filters items (company, region, commodity, industry, price hints), stores results in a Google Sheet, and generates a daily email newsletter with a web preview.

<p align="center">
<img src="assets/feed_sheets.png" alt="Feed Sheets" title="Feed Sheets" width="600" >
<img src="assets/newsletter_full.png" alt="Feed Sheets" title="Feed Sheets" width="600" >

</p>

---

## 👷‍♂️ How it works

1. Feeds are aggregated and stored in different sheet tabs as configured in [`Config.gs`](src/Config.gs). Each sheet should have a header row with recognizable column names like `date`, `headline`/`title`, `link`, `source`, `snippet`.
2. `sendDailyNewsletter()` reads the sheet rows for the target date (previous day by default), builds sections, renders [`Newsletter_Template.html`](src/Newsletter_Template.html), and sends a truncated HTML email.
3. A separate `doGet(e)` web handler renders the full newsletter for the requested date (defaults to previous day). Deploy this as a Web App to get a stable permalink.

---

## ⚙️ Configuration (Script Properties)

Set these in the Apps Script project (Project Settings → Script properties) or via the script:

- `SHEET_ID`: ID of the Google Sheet containing feed data (required)
- `SEND_TO`: comma-separated list of recipient emails (required unless `TEST_RECIPIENT` is set)
- `TEST_RECIPIENT`: when set, overrides `SEND_TO` and sends only to this address (useful for testing)
- `MAX_ITEMS_PER_SECTION`: number of items to include in the email preview (default 6)
- `WEBAPP_URL`: optional: set to your deployed webapp permalink. The mailer will append or substitute the date parameter (supports `{date}` placeholder). Example: `https://script.google.com/macros/s/XXX/exec` or `https://.../exec?d={date}`

> [!NOTE]
> By default the mailer uses the webapp URL (if set) as the "full newsletter" link in the email. If not set, no link is included.

---

## 🚀 Deployment (Web App)

1. Open the project in the Apps Script editor.
2. Deploy → New deployment → Select "Web app".
3. Set "Execute as" to `Me` and "Who has access" to `Anyone` or `Anyone with the link` (if you want viewers to open without signing in).
4. Copy the returned URL and set it as `WEBAPP_URL` in script properties (optionally include `{date}` where you want the date injected).

When the script sends a newsletter it will include a link to `WEBAPP_URL?date=YYYY-MM-DD` (or substitute `{date}`) so recipients can view the full newsletter in their browser.

---

## 💻 Development notes

- The templating in [`Newsletter_Template.html`](src/Newsletter_Template.html) uses Apps Script server-side scriptlets (`<?= ... ?>` and `<? ... ?>`): editing the file in the editor preserves evaluation.
- [`AutoMailer.gs`](src/AutoMailer.gs) contains utility functions `buildVisibleSectionsForDate(dateStr)` and `doGet(e)`: the latter is the web handler that accepts `?date=YYYY-MM-DD`.
- If you edit permissions/scopes, update `appsscript.json` accordingly and re-authorize the script when running.

---

## ▶️ How to run

Below are quick steps to run the project locally (with clasp) and in the Apps Script editor, plus tips for testing and scheduling daily sends.

### Prerequisites

- Node.js and npm installed
- A Google account with access to the target Google Sheet
- (Optional) `clasp` is included as a devDependency; you'll use `npm` scripts below

### Local (clasp) workflow — Windows (cmd.exe)

Install dependencies and authenticate clasp:

```cmd
npm install
clasp login
```

Pull the remote project (if already created) or push local `src/` to create/update the Apps Script project:

```cmd
clasp pull   REM pulls existing Apps Script project into src/
clasp push   REM pushes local src/ files to Apps Script
```

To create a new Apps Script project tied to a new Google Sheet:

```cmd
npm run create-sheets
```

### Run / test in Apps Script editor

1. Open the project in the Apps Script editor (<https://script.google.com>) or open the project after `clasp pull`.
2. In Project Settings → Script properties, set `SHEET_ID`, `TEST_RECIPIENT` (for safe testing), and any other properties (`WEBAPP_URL`, `MAX_ITEMS_PER_SECTION`, etc.).

    ```plaintext
    SHEET_ID=your-google-sheet-id
    SEND_TO=alice@example.com,bob@example.com
    TEST_RECIPIENT=you@example.com
    MAX_ITEMS_PER_SECTION=6
    WEBAPP_URL=https://script.google.com/macros/s/XXX/exec?date={date}
    ```

3. Use the dropdown next to the Run button to select `sendDailyNewsletter` and click Run. The first run will prompt you to authorize scopes.
4. Check Executions (left sidebar) and Logs for runtime output and debugging.

### Deploying the Web App

Follow the steps in the "Deployment (Web App)" section above. After deploying, use:

- Preview: `WEBAPP_URL?preview=1`
- View a specific date: `WEBAPP_URL?date=YYYY-MM-DD`

> [!TIP]
> set `WEBAPP_URL` in script properties so the mailer includes a permalink in emails.

### Scheduling daily sends

In the Apps Script editor: Triggers → Add Trigger → select function `sendDailyNewsletter` → Event source: Time-driven → Type: Day timer → Choose hour. Save; the script will run automatically on schedule.

### Testing checklist

- Ensure `SHEET_ID` is correct and the sheet has the required headers (`date`, `headline`/`title`, `link`, `source`, `snippet`).
- Set `TEST_RECIPIENT` to your email to avoid spamming other recipients during tests.
- Use the `preview` query param to inspect full HTML before sending: `WEBAPP_URL?preview=1`

### Troubleshooting

- Authorization errors: open the Apps Script Editor and re-run a function to re-authorize.
- Missing data: confirm the configured sheet tabs (see `Config.gs`) and header names.
- Check Executions and Stackdriver logs (Logger.log) for errors.

---

## 🗃️ Project Structure

```plaintext
OilGas-Wire/
├── package.json                # Project metadata (dev tools)
├── README.md                   # This documentation
├── .claspignore                # git-like ignore file for clasp deployments
├── assets/                     # Static assets used by the repo
│   └── pixpagercar.png         # Small header/logo image used in README
└── src/                        # Apps Script source files
    ├── appsscript.json             # Apps Script manifest (scopes, entry points)
    ├── AutoMailer.gs               # Main mailer + webapp handlers (sendDailyNewsletter, doGet)
    ├── Config.gs                   # CONFIG array and feed tab mappings
    ├── Feed.gs                     # Feed aggregation / parsing logic
    ├── Newsletter_Template.html    # Template used for email and web preview
    ├── WebPreview.html             # Template used to preview newsletter HTML for any date
    └── Utils/                 # Small utility modules used by scripts
        ├── Analysis.gs        # Content analysis utilities (tagging, scoring)
        ├── Debug.gs           # Debug helpers and logging utilities
        ├── FeedUtils.gs       # Feed parsing helpers
        ├── SheetUtils.gs      # Spreadsheet helper functions (reads, ranges)
        ├── TextUtils.gs       # Text processing helpers (truncate, cleanup)
        └── UnitTests.gs       # Lightweight tests and smoke checks
```

---

## ✨ Features

- Daily newsletter email that includes a truncated preview of each section and a link to view the full newsletter.
![Newsletter Mail](assets/newsletter_mail.png)

- Web preview (Apps Script Web App) with permalink and optional `?date=YYYY-MM-DD` parameter to view historical newsletters.
- Template HTML (`Newsletter_Template.html`) used for the email body and web preview
- Intelligent link handling: extracts URLs from `=HYPERLINK()` formulas in the sheet so cells that display 'LINK' still open the real URL.
- Configurable behavior via script properties (`SEND_TO`, `TEST_RECIPIENT`, `MAX_ITEMS_PER_SECTION`, `WEBAPP_URL`, etc.).
- A lightweight preview UI (`WebPreview.html`) served by the web app for manual QA. Visit the webapp with `?preview=1` to open a date picker and preview rendered HTML for any date.
![Newsletter Preview](assets/newsletter_preview.png)

- `getNewsletterHtml(dateStr)` server function that returns rendered newsletter HTML for the requested date (used by the preview UI).
- `doGet(e)` now supports a `preview` mode (`?preview=1`) in addition to the existing `?date=YYYY-MM-DD` parameter.
- Drive publishing has been removed from the default mail flow - the web app renders live content directly from the sheet (no Drive files required).

---
