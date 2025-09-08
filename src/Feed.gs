/**
 * Feed.gs
 *
 * Fetch RSS/Atom feeds, filter by category-specific queries, and store items into
 * separate tabs in a Google Sheet. Configure categories below.
 */


/**
 * Entry point: fetch all configured categories and store new items in the sheet.
 * Iterates `CONFIG` and calls `fetchCategory` for each category.
 * @return {void}
 */
function fetchAndStoreAll() {
    var sheetId = getSheetId();

    CONFIG.forEach(function (cat) {
        try {
            fetchCategory(cat, sheetId);
        } catch (e) {
            Logger.log('Error fetching category %s: %s', cat.category, e.message);
        }
    });
}

/**
 * Fetch and store items for a single category.
 * @param {CategoryConfig} cat Category config object (feeds, headers, queries, sheetName).
 * @param {string=} sheetId Optional spreadsheet id to use instead of Project property.
 * @return {void}
 */
function fetchCategory(cat, sheetId) {
    var idToUse = sheetId || SHEET_ID || getSheetId();
    var ss = SpreadsheetApp.openById(idToUse);
    var sheet = ss.getSheetByName(cat.sheetName) || ss.insertSheet(cat.sheetName);

    ensureHeaders(sheet, cat.headers);

    var existing = getExistingKeys(sheet, cat.headers);

    var newRowsObjs = [];

    // Build effective feed list: include configured feeds plus Google News per-query feeds if present
    var feedUrls = (cat.feeds || []).slice();
    if (cat.googleNewsQueries && cat.googleNewsQueries.length) {
        cat.googleNewsQueries.forEach(function (q) {
            var encoded = encodeURIComponent(q);
            feedUrls.push('https://news.google.com/rss/search?q=' + encoded);
        });
    }

    feedUrls.forEach(function (feedUrl) {
        try {
            var resp = UrlFetchApp.fetch(feedUrl, FETCH_OPTIONS);
            var xml = resp.getContentText();
            if (resp.getResponseCode() === 401 || resp.getResponseCode() === 403) {
                Logger.log('Failed to fetch %s: HTTP %s (site likely blocks automated requests)', feedUrl, resp.getResponseCode());
            }
            var items = parseFeed(xml, feedUrl);
            items.forEach(function (item) {
                // enforce cutoff year: skip items without a parsable date or older than MIN_YEAR
                var itemYear = getItemYear(item);
                if (!itemYear || itemYear < MIN_YEAR) return;

                var normTitle = normalizeTitle(item.title || '');
                var linkVal = item.link || '';
                if (matchesQueries(item, cat.queries) && !existing.links[linkVal] && !existing.titles[normTitle]) {
                    // enrich item with analyzed fields for better column population
                    item.analysis = analyzeItem(item);
                    var row = buildRowForCategory(item, cat);
                    var parsedDate = null;
                    try { parsedDate = item.pubDate ? new Date(item.pubDate) : null; } catch (e) { parsedDate = null; }
                    newRowsObjs.push({ row: row, date: parsedDate || new Date(0) });
                    // mark dedupe keys
                    if (linkVal) existing.links[linkVal] = true;
                    if (normTitle) existing.titles[normTitle] = true;
                }
            });
        } catch (e) {
            Logger.log('Failed to fetch or parse %s: %s', feedUrl, e.message);
        }
    });

    if (newRowsObjs.length > 0) {
        // Sort by date descending (newest first) then insert at the top (row 2) so newest appears first
        newRowsObjs.sort(function (a, b) { return b.date - a.date; });
        var rows = newRowsObjs.map(function (o) { return o.row; });
        try {
            // Ensure there's space and insert rows below the header
            sheet.insertRows(2, rows.length);
        } catch (e) {
            // insertRows may fail on some sheet protections; fall back to appending then sorting
            sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
            Logger.log('Fallback appended %s rows to %s (insert at top failed): %s', rows.length, cat.sheetName, e.message);
            // attempt to sort afterwards
            try { sortSheetByDate(sheet, cat.headers); } catch (e2) { Logger.log('Sort fallback failed: %s', e2.message); }
            return;
        }
        // Write the rows into the newly inserted area
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
        Logger.log('Inserted %s new rows at top of %s', rows.length, cat.sheetName);
    } else {
        Logger.log('No new rows for %s', cat.sheetName);
    }
    // Ensure sheet is sorted newest-first by the Date column after updating
    try {
        sortSheetByDate(sheet, cat.headers);
    } catch (e) {
        Logger.log('Unable to sort sheet %s by date: %s', cat.sheetName, e.message);
    }
}
