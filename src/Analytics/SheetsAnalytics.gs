/**
 * SheetsAnalytics.gs
 * Sheet-side helpers: ensureHiddenOpenPixel, logging APIs used by sheet-side scripts.
 * Relies on shared helpers in SharedAnalytics.gs.
 */

function ensureHiddenOpenPixel(sheetId, nid) {
    try {
        sheetId = sheetId || getSheetId && getSheetId();
        if (!sheetId) return { ok: false, error: 'missing sheetId' };
        nid = (nid || '').toString();
        var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
        if (!webapp) return { ok: false, error: 'WEBAPP_URL not configured' };
        var sigBase = (nid || '') + '|' + '' + '|' + 'sheet' + '|' + 'sheet_open';
        var sig = '';
        try { sig = computeHmacHex(sigBase) || ''; } catch (e) { sig = ''; }

        var ss = SpreadsheetApp.openById(sheetId);
        var hiddenName = '.analytics_hidden';
        var sh = ss.getSheetByName(hiddenName);
        if (!sh) { sh = ss.insertSheet(hiddenName); }
        var sep = webapp.indexOf('?') === -1 ? '?' : '&';
        var urlPart = webapp + sep + 'analytics=open&nid=' + encodeURIComponent(nid) + '&rid=&src=sheet&eventDetail=sheet_open' + (sig ? ('&sig=' + encodeURIComponent(sig)) : '');
        var formula = '=IMAGE("' + urlPart + '&cb=" & TO_TEXT(NOW()))';
        try { sh.getRange(1, 1).setFormula(formula); } catch (e) { sh.getRange(1, 1).setValue('=IMAGE("' + urlPart + '")'); }
        try { ss.getSheetByName(hiddenName).hideSheet(); } catch (e) { /* ignore */ }
        return { ok: true };
    } catch (e) { return { ok: false, error: (e && e.message) || 'error' }; }
}

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
// SheetsAnalytics.gs
// Sheet-side analytics APIs for clicks, active-time, and manual open logging

/**
 * Ensure a hidden sheet contains a pixel IMAGE formula that calls the webapp
 * analytics endpoint when the spreadsheet is opened in a browser. This logs
 * a 'sheet_open' event without requiring an onOpen trigger or user interaction.
 * The image URL is signed using the existing computeHmacHex(...) helper so
 * the analytics endpoint will accept the request.
 */
function ensureHiddenOpenPixel(sheetId, nid) {
    try {
        sheetId = sheetId || getSheetId && getSheetId();
        if (!sheetId) return { ok: false, error: 'missing sheetId' };
        nid = (nid || '').toString();
        var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
        if (!webapp) return { ok: false, error: 'WEBAPP_URL not configured' };
        // create signature for pixel: base = nid|rid|src|eventDetail (rid empty)
        var sigBase = (nid || '') + '|' + '' + '|' + 'sheet' + '|' + 'sheet_open';
        var sig = '';
        try { sig = computeHmacHex(sigBase) || ''; } catch (e) { sig = ''; }

        var ss = SpreadsheetApp.openById(sheetId);
        var hiddenName = '.analytics_hidden';
        var sh = ss.getSheetByName(hiddenName);
        if (!sh) {
            sh = ss.insertSheet(hiddenName);
        }
        // Build IMAGE formula that includes a cache-buster via NOW(); this causes
        // the URL to be evaluated when the sheet recalculates/opens in the browser.
        var sep = webapp.indexOf('?') === -1 ? '?' : '&';
        var urlPart = webapp + sep + 'analytics=open&nid=' + encodeURIComponent(nid) + '&rid=&src=sheet&eventDetail=sheet_open' + (sig ? ('&sig=' + encodeURIComponent(sig)) : '');
        var formula = '=IMAGE("' + urlPart + '&cb=" & TO_TEXT(NOW()))';
        try {
            sh.getRange(1, 1).setFormula(formula);
        } catch (e) {
            // fallback to setValue if formula fails
            sh.getRange(1, 1).setValue('=IMAGE("' + urlPart + '")');
        }
        // hide the sheet so end-users don't see the payload
        try { ss.getSheetByName(hiddenName).hideSheet(); } catch (e) { /* ignore */ }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e && e.message) || 'error' };
    }
}

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
