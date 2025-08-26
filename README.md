<h1 align="center">Automated Newsletter & RSS Feed</h1>

This project aggregates RSS/Atom feeds, filters items by category queries and an oil & gas relevance heuristic, and writes results into separate tabs in a Google Sheet via Google Apps Script.

## Repo layout

- `src/` – Apps Script source files (GS and HTML). This is the `rootDir` used by `clasp`.
- `src/appsscript.json` – Apps Script manifest (runtime/timezone).
- `structure.json` – Example configuration for categories/tabs.
up (manual)

1. Open the Google Sheet you want to use and note its ID from the URL.
2. Open the Apps Script editor for that Google Sheet (Extensions → Apps Script) to create or inspect a bound script.

## Using clasp (recommended)

This repository already contains a working `src/` folder and a `.clasp.json`. Typical workflow on Windows (cmd.exe):

1. Install [clasp](https://github.com/google/clasp) (global) or use the local devDependency:

    ```cmd
    npm install -g @google/clasp
    ```

    or

    ```cmd
    npm install
    npx clasp --version
    ```

2. Login to your Google account:

    ```cmd
    clasp login
    ```

3. If you already have an Apps Script project and want to clone it into `src/` (this sets `scriptId` in `.clasp.json`):

    ```cmd
    clasp clone YOUR_SCRIPT_ID --rootDir src
    ```

4. To create a new container-bound project attached to a Google Sheet:

    ```cmd
    clasp create --title "Oil & Gas Newsletter" --parentId YOUR_SHEET_ID --rootDir src --type sheets
    ```

5. Push local edits to Apps Script:

    ```cmd
    clasp push
    ```

6. Pull remote edits locally:

    ```cmd
    clasp pull
    ```

If you prefer, edit `.clasp.json` directly to set or change the `scriptId`.

- `.claspignore` — ignore list for push operations.
- `package.json` — handy npm scripts: `npm run login`, `npm run push`, `npm run pull`.

## Notes & limitations

- The parser uses `XmlService` and heuristic parsing; some feeds may need custom parsing.
- Deduplication is based on the link column; if feeds omit links, duplicates may appear.
- The script expects sheet headers to match configured `headers` and will reset the sheet if they differ.

### Troubleshooting

- If `clasp push` fails with authorization issues, re-run `clasp login`.
- If remote and local are out of sync, run `clasp pull` and resolve conflicts before `clasp push`.
