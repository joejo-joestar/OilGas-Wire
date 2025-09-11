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

// Manual open logging (explicit user action in sheet)
function logSheetManualOpenApi(body) {
    try {
        var nid = (body.nid || '').toString();
        var rid = (body.rid || '').toString();
        var target = resolveAnalyticsTarget(nid);
        var evt = { timestamp: new Date(), eventType: 'manual_open', eventDetail: 'sheet_manual_open', nid: nid, recipientHash: rid, src: 'sheet', url: (body.url || ''), ua: (body.ua || ''), referer: (body.referer || '') };
        logAnalyticsEvent(target.spreadsheetId, evt);
        return { ok: true };
    } catch (e) { return { ok: false, error: e && e.message }; }
}
