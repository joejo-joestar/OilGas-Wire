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
 * Installable onSelectionChange handler that logs when a user selects a cell
 * that contains a hyperlink. This is a lightweight, non-invasive way to detect
 * user interest in article links inside the sheet without changing the link URL.
 *
 * Notes:
 * - Selection is a proxy for a click; it may fire when users navigate with keyboard
 *   or inspect the cell, so expect some false-positives.
 * - This function should be installed as an installable trigger via
 *   `createSelectionTrigger()` (below) so it has permission to write to sheets
 *   and to call the analytics logging APIs.
 */
function selectionClickLogger(e) {
    try {
        if (!e || !e.range) return;
        var range = e.range;
        // Only handle single-cell selections to avoid noise
        if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
        var cell = range;
        var row = cell.getRow();
        if (row < 2) return; // skip header row

        // Try to get a hyperlink from RichText
        var url = null;
        try {
            var rtv = cell.getRichTextValue && cell.getRichTextValue();
            if (rtv && typeof rtv.getLinkUrl === 'function') url = rtv.getLinkUrl();
        } catch (err) { url = null; }

        // If no rich-text link, check for HYPERLINK(...) formula
        if (!url) {
            try {
                var f = cell.getFormula && cell.getFormula();
                if (f && /HYPERLINK\(/i.test(f)) {
                    // crude extraction: attempt to read the first argument
                    var m = f.match(/HYPERLINK\(\s*(?:"([^"]+)"|([^,\)]+))/i);
                    if (m) url = (m[1] || m[2] || '').toString().trim();
                    // strip surrounding quotes if present
                    url = url.replace(/^\"|\"$/g, '');
                }
            } catch (err) { /* ignore */ }
        }

        // Fallback: if display text looks like a URL use it
        if (!url) {
            try { var txt = cell.getDisplayValue && cell.getDisplayValue(); if (txt && /^https?:\/\//i.test(txt)) url = txt; } catch (err) { /* ignore */ }
        }

        if (!url) return; // nothing to log

        // Normalize URL (basic)
        try { url = url.toString(); } catch (err) { /* ignore */ }

        // Prepare payload and call the existing sheet-side logging API
        try {
            var nid = PropertiesService.getScriptProperties().getProperty('NEWSLETTER_NID') || '';
            // Use existing helper that logs click events into analytics spreadsheet
            logSheetClickApi({ nid: nid, rid: '', url: url, ua: '', referer: '' });
        } catch (err) { /* ignore logging errors */ }

    } catch (err) { /* swallow any errors to avoid breaking user session */ }
}

/**
 * Helper to programmatically create the installable onSelectionChange trigger
 * for `selectionClickLogger` on the active spreadsheet.
 * Run once from the script editor (or via menu) and grant permissions when prompted.
 */
function createSelectionTrigger() {
    try {
        var ss = SpreadsheetApp.getActive();
        ScriptApp.newTrigger('selectionClickLogger').forSpreadsheet(ss).onSelectionChange().create();
        return { ok: true };
    } catch (err) { return { ok: false, error: (err && err.message) || err }; }
}

/**
 * Remove any existing triggers that call `selectionClickLogger`.
 */
function deleteSelectionTriggers() {
    try {
        var triggers = ScriptApp.getProjectTriggers();
        for (var i = 0; i < triggers.length; i++) {
            var t = triggers[i];
            if (t.getHandlerFunction && t.getHandlerFunction() === 'selectionClickLogger') ScriptApp.deleteTrigger(t);
        }
        return { ok: true };
    } catch (err) { return { ok: false, error: (err && err.message) || err }; }
}
