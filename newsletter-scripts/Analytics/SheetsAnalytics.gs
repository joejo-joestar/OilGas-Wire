/**
 * SheetsAnalytics.gs
 * Sheet-side helpers: ensureHiddenOpenPixel, logging APIs used by sheet-side scripts.
 * Relies on shared helpers in SharedAnalytics.gs.
 */

function ensureHiddenOpenPixel(sheetId, nid) {
    // Pixel tracking disabled: do not insert IMAGE formulas into sheets.
    // Return a benign error so calling code knows the operation was skipped.
    return { ok: false, error: 'Analytics pixel disabled' };
}

/**
 * Ensure a hidden sheet contains a pixel IMAGE formula that calls the webapp
 * analytics endpoint when the spreadsheet is opened in a browser. This logs
 * a 'sheet_open' event without requiring an onOpen trigger or user interaction.
 * The image URL is signed using the existing computeHmacHex(...) helper so
 * the analytics endpoint will accept the request.
 */
// Pixel tracking removed: ensureHiddenOpenPixel is a no-op above.

// API called from the sidebar to log a click on an article inside the sheet
function logSheetClickApi(body) {
    try {
        var nid = (body.nid || '').toString();
        var rid = (body.rid || '').toString();
        var url = (body.url || '').toString();
        var ua = (body.ua || '').toString();
        var referer = (body.referer || '').toString();
        var target = resolveAnalyticsTarget(nid);
        var evt = { timestamp: new Date(), eventType: 'click', eventDetail: 'sheet_headline_click', nid: nid, recipientHash: rid, src: 'sheet', url: url, ua: ua, referer: referer };
        logAnalyticsEvent(target.spreadsheetId, evt);
        return { ok: true };
    } catch (e) { return { ok: false, error: e && e.message }; }
}

// API to record active time spent in the sheet sidebar or while viewing sheet
function logSheetActiveTimeApi(body) {
    try {
        var nid = (body.nid || '').toString();
        var rid = (body.rid || '').toString();
        var secs = Number(body.secondsActive || body.seconds || 0) || 0;
        var target = resolveAnalyticsTarget(nid);
        var evt = {
            timestamp: new Date(),
            eventType: 'active_time',
            eventDetail: 'active_sheet_time',
            nid: nid,
            recipientHash: rid,
            src: 'sheet',
            url: (body.sheetUrl || ''),
            ua: (body.ua || '') || '',
            referer: (body.referer || '') || '',
            extra: { seconds: secs }
        };
        logAnalyticsEvent(target.spreadsheetId, evt);
        return { ok: true };
    } catch (e) { return { ok: false, error: e && e.message }; }
}

/**
 * onSelectionChange is a simple trigger that runs automatically when a user
 * changes their selection in the spreadsheet. It runs with limited permissions.
 * Its role is to capture link selection events and store them in a temporary
 * cache. A separate, installable trigger will process this cache.
 *
 * @param {Object} e The event parameter for a selection change simple trigger.
 */
function onSelectionChange(e) {
    // First, check if tracking is enabled at all
    var props = PropertiesService.getUserProperties();
    if (props.getProperty('CLICK_TRACKING_ENABLED') !== 'true') {
        return;
    }

    try {
        if (!e || !e.range) return;
        var range = e.range;
        // Only handle single-cell selections to avoid noise
        if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;

        var cell = range;
        var row = cell.getRow();
        if (row < 2) return; // skip header row

        // Try to get a hyperlink from RichText or HYPERLINK() formula
        var url = getUrlFromCell(cell);
        if (!url) return; // nothing to log

        // Get the newsletter ID from script properties
        var nid = PropertiesService.getScriptProperties().getProperty('NEWSLETTER_NID') || '';

        // Add the click event to the user's cache
        var cache = CacheService.getUserCache();
        var key = 'clicked_links';
        var cached = cache.get(key);
        var clicks = cached ? JSON.parse(cached) : [];

        clicks.push({
            url: url,
            nid: nid,
            timestamp: new Date().toISOString()
        });

        // Store the updated array back in the cache. The cache has a size limit,
        // but for this purpose, it's unlikely to be an issue.
        // The cache expires after 6 hours, but our trigger runs every 5 mins.
        cache.put(key, JSON.stringify(clicks), 21600); // 6 hours expiry
        Logger.log('Cached click for URL: ' + url); // Added for identification

    } catch (err) {
        // Swallow errors to prevent breaking the user's experience.
        // We can log to the project logs for debugging if needed.
        // Logger.log('Error in onSelectionChange: ' + err.message);
    }
}

/**
 * Extracts a URL from a cell, checking RichText, HYPERLINK formulas, and
 * plain text content.
 * @param {GoogleAppsScript.Spreadsheet.Range} cell The cell to inspect.
 * @return {string|null} The extracted URL or null if not found.
 */
function getUrlFromCell(cell) {
    var url = null;
    try {
        // Try to get a hyperlink from RichText first
        var rtv = cell.getRichTextValue();
        if (rtv && rtv.getLinkUrl()) {
            url = rtv.getLinkUrl();
        }

        // If no rich-text link, check for HYPERLINK(...) formula
        if (!url) {
            var f = cell.getFormula();
            if (f && /HYPERLINK\(/i.test(f)) {
                var m = f.match(/HYPERLINK\(\s*(?:"([^"]+)"|'([^']+)'|([^,\)]+))/i);
                if (m) {
                    url = (m[1] || m[2] || m[3] || '').toString().trim();
                }
            }
        }

        // Fallback: if display text looks like a URL, use it
        if (!url) {
            var txt = cell.getDisplayValue();
            if (txt && /^https?:\/\//i.test(txt)) {
                url = txt;
            }
        }
    } catch (err) {
        url = null; /* ignore errors */
    }
    return url;
}
