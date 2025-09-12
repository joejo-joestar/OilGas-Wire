<h1 align="center">🛢️ OilGas-Wire</h1>

<p align="center">
  <img src="assets/pixpagercar.png" alt="Feed Car" title="Feed Car" width="128">
</p>

A Google Apps Script project that aggregates RSS/Atom feeds, filters items (company, region, commodity, industry, price hints), stores results in a Google Sheet, and generates a daily email newsletter with an optional web preview.

<p align="center">
<img src="assets/feed_sheets.png" alt="Feed Sheets" title="Feed Sheets" width="600" >
<img src="assets/newsletter_full.png" alt="Feed Sheets" title="Feed Sheets" width="600" >

</p>

---

## 👷‍♂️ How it works

1. Feeds are aggregated and stored in configured sheet tabs (see `Config.gs`). Each sheet expects a header row with recognizable column names such as `date`, `headline`/`title`, `link`, `source`, `snippet`.
2. `sendDailyNewsletter()` reads rows for the target date (previous day by default), builds visible sections, renders the HTML template, and sends a truncated HTML email.
3. `doGet(e)` is the web handler that renders the full newsletter for a requested date (defaults to previous day). Deploy it as a Web App to provide a permalink.

---

## ⚙️ Configuration (Script Properties)

Set these values in the Apps Script project's Script properties (Project Settings) or via the script API:

- `SHEET_ID` — ID of the Google Sheet containing feed data (required)
- `SEND_TO` — comma-separated list of recipient emails (required unless `TEST_RECIPIENT` is set)
- `TEST_RECIPIENT` — overrides `SEND_TO` and sends only to this address (useful for testing)
- `MAX_ITEMS_PER_SECTION` — number of items to include in the email preview (default: 6)
- `WEBAPP_URL` — optional: your deployed Web App URL. The mailer will append or substitute the date parameter using a `{date}` placeholder, e.g. `https://script.google.com/macros/s/XXX/exec?date={date}`

Note: when `WEBAPP_URL` is set the mailer includes a "View full newsletter" link that points to `WEBAPP_URL?date=YYYY-MM-DD` (or substitutes `{date}`). If not set, no permalink is included.

---

## 🚀 Deployment (Web App)

1. Open the project in the Apps Script editor.
2. Deploy → New deployment → choose "Web app".
3. Set "Execute as" to `Me` and "Who has access" to `Anyone` or `Anyone with the link` if you want the newsletter publicly viewable.
4. Copy the returned URL and set it to `WEBAPP_URL` (optionally include `{date}` where you want the date injected).

Once deployed, the script will include a link to `WEBAPP_URL?date=YYYY-MM-DD` so recipients can view the full newsletter online.

---

## 💻 Development notes

- The template files used are `Newsletter_Mail.html` (email) and `Newsletter_Web.html` (web preview) and they use Apps Script server-side scriptlets (for example `<?= ... ?>`). Edit these files in the Apps Script editor so evaluation is preserved.
- `AutoMailer.gs` contains utilities such as `buildVisibleSectionsForDate(dateStr)` and the `doGet(e)` web handler.
- Analytics helpers live under `src/Analytics/` and include `MailAnalytics.gs`, `SheetsAnalytics.gs`, `WebAnalytics.gs`, and `SharedAnalytics.gs`. These modules collect lightweight runtime metrics (mail/send stats, sheet writes, web preview hits) and write to the sheet or Cloud Logging/Logger as configured.
- If you change scopes, update `appsscript.json` and re-authorize the script the next time you run it.

---

## ▶️ How to run

Quick steps for local development (using `clasp`) and in the Apps Script editor, plus tips for testing and scheduling daily sends.

### Prerequisites

- Node.js and npm
- A Google account with access to the target Google Sheet
- (Optional) `clasp` is used to sync the `src/` directory with Apps Script

### Local (clasp) workflow for Windows (cmd.exe)

Install dependencies and authenticate with clasp:

```bash
npm install
clasp login
```

Pull or push the Apps Script project:

```bash
clasp pull   REM pulls existing Apps Script project into src/
clasp push   REM pushes local src/ files to Apps Script
```

To create a new Apps Script project tied to a Google Sheet:

```bash
npm run create-sheets
```

### Run / test in Apps Script editor

1. Open the project in the Apps Script editor (<https://script.google.com>) or after `clasp pull`.
2. In Project Settings → Script properties, set `SHEET_ID`, `TEST_RECIPIENT` (for safe testing), and other properties (`WEBAPP_URL`, `MAX_ITEMS_PER_SECTION`, etc.).

    Example properties format:

    ```text
    SHEET_ID=your-google-sheet-id
    SEND_TO=alice@example.com,bob@example.com
    TEST_RECIPIENT=you@example.com
    MAX_ITEMS_PER_SECTION=6
    WEBAPP_URL=https://script.google.com/macros/s/XXX/exec?date={date}
    ```

3. Select `sendDailyNewsletter` and run it from the editor. The first run will prompt you to authorize scopes.
4. Check Executions and the Cloud Logging / Logger output for runtime messages.

### Deploying the Web App

Follow the steps above. After deploying, you can:

- Preview: `WEBAPP_URL?preview=1`
- View a specific date: `WEBAPP_URL?date=YYYY-MM-DD`

Tip: set `WEBAPP_URL` in Script properties so outgoing emails include a permalink.

### Scheduling daily sends

In the Apps Script editor: Triggers → Add Trigger → select `sendDailyNewsletter` → Event source: Time-driven → Type: Day timer → Choose hour. The script will then run on schedule.

### Testing checklist

- Ensure `SHEET_ID` is correct and the sheet contains header columns (`date`, `headline`/`title`, `link`, `source`, `snippet`).
- Set `TEST_RECIPIENT` to your email to avoid spamming other recipients during tests.
- Use the `preview` query parameter to inspect the full HTML before sending: `WEBAPP_URL?preview=1`

### Troubleshooting

- Authorization errors: re-run a function in the Apps Script Editor to re-authorize.
- Missing data: confirm the configured sheet tabs (see `Config.gs`) and header names.
- Check Executions and Cloud Logging (Logger.log) for errors and runtime traces.

---

## 🗃️ Project Structure

```text
OilGas-Wire/
├── package.json                # Project metadata (dev tools)
├── README.md                   # This documentation
├── .claspignore                # git-like ignore file for clasp deployments
├── assets/                     # Static assets used by the repo
└── src/                        # Apps Script source files
  ├── appsscript.json             # Apps Script manifest (scopes, entry points)
  ├── AutoMailer.gs               # Main mailer + webapp handlers (sendDailyNewsletter, doGet)
  ├── Config.gs                   # CONFIG array and feed tab mappings
  ├── Feed.gs                     # Feed aggregation / parsing logic
  ├── Newsletter_Template.html    # Template used for email and web preview
  ├── Web_Preview.html            # Template used to preview newsletter HTML for any date
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

- Web preview (Apps Script Web App) with permalink and optional `?date=YYYY-MM-DD` to view historical newsletters.
- Template HTML (`Newsletter_Template.html`) used for the email body and web preview.
- Intelligent link handling: extracts URLs from `=HYPERLINK()` formulas in the sheet so cells that display a label still open the real URL.
- Configurable behavior via Script properties (`SEND_TO`, `TEST_RECIPIENT`, `MAX_ITEMS_PER_SECTION`, `WEBAPP_URL`, etc.).
- A lightweight preview UI (`Web_Preview.html`) served by the web app for manual QA. Visit the webapp with `?preview=1` to open a date picker and preview rendered HTML for any date.

![Newsletter Preview](assets/newsletter_preview.png)

- `getNewsletterHtml(dateStr)` server function returns rendered newsletter HTML for the requested date (used by the preview UI).
- `doGet(e)` supports a `preview` mode (`?preview=1`) in addition to `?date=YYYY-MM-DD`.

---
