<h1 align="center">Automated Newsletter & RSS Feed</h1>

<p align = "center">
  <img src="assets/pixpagercar.png" alt="Feed Car" title="Feed Car" width="128">
</p>

Aggregates RSS/Atom feeds, filters and enriches items (company, region, commodity, industry, price hints), and writes results into separate tabs in a Google Sheet using Google Apps Script.

## Repo layout

- `src/` – Apps Script source files (GS and HTML). This is the `rootDir` used by `clasp`.
- `src/appsscript.json` – Apps Script manifest (runtime/timezone).

## Configuration highlights

- [`src/Config.gs`](src/Config.gs) is the single place to tune behaviour:
  - `CONFIG`: categories, feeds, sheet names, headers and per-category Google News queries.
  - `COMMODITIES`: canonical commodity names used by the collector.
  - `INDUSTRIES`: canonical industry names.
  - `INDUSTRY_ALIASES`: editable alias map (tokens/phrases) used to detect industry from headlines and snippets.
  - `KNOWN_COMPANIES`: list of known company names used for improved detection.
  - `REGION_CANONICALS`: mapping from variant strings to canonical region names.

Edit those values in [`src/Config.gs`](src/Config.gs) and then `clasp push` to deploy changes.

## How it decides fields (short)

- Company: direct match against `KNOWN_COMPANIES` plus fuzzy fallbacks.
- Region: word-boundary matches against `KNOWN_REGIONS` then mapped through `REGION_CANONICALS`.
- Commodity: matched against `COMMODITIES` (aliases like `brent`/`wti` map to `Oil`).
- Industry: uses `INDUSTRY_ALIASES` then fuzzy fallback; editable in `Config.gs`.

## Running and debugging

1. Create or open the Google Sheet you want to use and note its ID.
2. Use [`clasp`](https://github.com/google/clasp) to create/clone or push the `src/` folder to Apps Script. Typical commands (Windows cmd.exe):

    ```cmd
    npm install -g @google/clasp
    clasp login
    clasp clone YOUR_SCRIPT_ID --rootDir src   # or
    clasp create --title "Oil & Gas Newsletter" --parentId YOUR_SHEET_ID --rootDir src --type sheets
    clasp push
    ```

3. In the Apps Script editor you can run `Debug.testRun()` (clears test sheets and fetches) or `Debug.fetchFeedDiagnostics()` (fetch each feed and log response metadata).

## Link display

Link cells are now written as formulas like `=HYPERLINK("https://...","LINK")` so the sheet shows `LINK` as the display text while preserving the original URL.

## Notes & limitations

- The parser uses `XmlService` and heuristic parsing; some feeds may require site-specific parsing or are blocked by the publisher (401/403).
- Deduplication relies on the link column and normalized title; if a feed omits links some duplicates may slip through.
- MIN_YEAR and other filters are set in [`src/Config.gs`](src/Config.gs) — adjust them to control cutoffs.

## Troubleshooting

- If Google blocks a feed (401/403), `Debug.fetchFeedDiagnostics()` helps confirm the response code and snippet.
- If items are misclassified, paste a sample headline and snippet and adjust `INDUSTRY_ALIASES` / `COMMODITIES` / `KNOWN_COMPANIES` as needed.
