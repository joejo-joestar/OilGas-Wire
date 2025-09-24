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
    var ss = SpreadsheetApp.openById(sheetId);

    var allFeedUrls = new Set();
    var newsQueryMap = {};
    CONFIG.forEach(function (cat) {
        (cat.feeds || []).forEach(function (feedUrl) { allFeedUrls.add(feedUrl); });
        if (cat.googleNewsQueries && cat.googleNewsQueries.length) {
            cat.googleNewsQueries.forEach(function (q) {
                var encoded = encodeURIComponent(q);
                var gUrl = 'https://news.google.com/rss/search?q=' + encoded;
                allFeedUrls.add(gUrl);
                newsQueryMap[gUrl] = q;
            });
        }
    });

    var allItems = [];
    allFeedUrls.forEach(function (feedUrl) {
        try {
            var resp = UrlFetchApp.fetch(feedUrl, FETCH_OPTIONS);
            if (resp.getResponseCode() !== 200) {
                Logger.log('Failed to fetch %s: HTTP %s', feedUrl, resp.getResponseCode());
                return;
            }
            var xml = resp.getContentText();
            var parsedItems = parseFeed(xml, feedUrl);
            if ((newsQueryMap[feedUrl]) && (!parsedItems || parsedItems.length === 0)) {
                Logger.log('Google News query returned empty results for query: "%s" (feedUrl=%s)', newsQueryMap[feedUrl], feedUrl);
            }
            allItems = allItems.concat(parsedItems);
        } catch (e) {
            Logger.log('Failed to fetch or parse %s: %s', feedUrl, e.message);
        }
    });

    var assignedItemLinks = new Set();

    CONFIG.forEach(function (cat) {
        try {
            var sheet = ss.getSheetByName(cat.sheetName) || ss.insertSheet(cat.sheetName);
            ensureHeaders(sheet, cat.headers);
            var existing = getExistingKeys(sheet, cat.headers);
            var newRowsObjs = [];
            var existingTitles = (existing.titles || []).slice();

            allItems.forEach(function (item) {
                var itemYear = getItemYear(item);
                if (!itemYear || itemYear < MIN_YEAR) return;

                var normTitle = normalizeTitle(item.title || '');
                var linkVal = item.link || '';

                if (assignedItemLinks.has(linkVal) || existing.links[linkVal]) {
                    return;
                }

                if (doesItemMatchCategory(item, cat)) {
                    var alreadyExact = existingTitles.includes(normTitle);
                    if (alreadyExact) return;

                    item.analysis = analyzeItem(item);
                    var row = buildRowForCategory(item, cat);
                    var parsedDate = item.pubDate ? new Date(item.pubDate) : new Date(0);
                    newRowsObjs.push({ row: row, date: parsedDate, normTitle: normTitle, link: linkVal });

                    assignedItemLinks.add(linkVal);
                }
            });

            var accepted = [];
            var acceptedNorms = [];
            for (var ni = 0; ni < newRowsObjs.length; ni++) {
                var cand = newRowsObjs[ni];
                var cNorm = cand.normTitle;
                if (!cNorm) continue;
                var isDuplicate = false;
                for (var ei = 0; ei < existingTitles.length; ei++) {
                    if (similarity(cNorm, existingTitles[ei]) >= FUZZY_DEDUPE_THRESHOLD) { isDuplicate = true; break; }
                }
                if (isDuplicate) continue;
                for (var ai = 0; ai < acceptedNorms.length; ai++) {
                    if (similarity(cNorm, acceptedNorms[ai]) >= FUZZY_DEDUPE_THRESHOLD) { isDuplicate = true; break; }
                }
                if (isDuplicate) continue;
                accepted.push(cand);
                acceptedNorms.push(cNorm);
            }

            if (accepted.length > 0) {
                accepted.sort(function (a, b) { return b.date - a.date; });
                var rows = accepted.map(function (o) { return o.row; });
                sheet.insertRows(2, rows.length);
                sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
                Logger.log('Inserted %s new rows into %s', rows.length, cat.sheetName);
                try {
                    // Use the centralized helper to sort the sheet by date (newest-first)
                    sortSheetByDate(sheet, cat.headers);
                } catch (se) { Logger.log('Failed to auto-sort sheet %s: %s', cat.sheetName, se && se.message); }
            } else {
                Logger.log('No new items for %s', cat.sheetName);
            }
        } catch (e) {
            Logger.log('Error processing category %s: %s', cat.category, e.message);
        }
    });
}