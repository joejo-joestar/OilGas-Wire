/**
 * Analytics.gs
 * Minimal in-repo analytics for newsletter: pixel opens, redirect clicks, and simple pings.
 * Stores raw events in a configured spreadsheet (Analytics_Events) and daily aggregates
 * in Analytics_Daily. Designed to be generic: the `nid` (newsletter id) resolves to a
 * target spreadsheet via `Analytics_Config` sheet in the analytics spreadsheet or via
 * script properties.
 */

var ANALYTICS_DEFAULT_SHEET = 'Analytics_Events';
var ANALYTICS_DAILY_SHEET = 'Analytics_Daily';

/**
 * Handle analytics GET requests routed from doGet.
 * Supported query params:
 * - analytics=open&nid=<id>&rid=<recipientHash>
 * - analytics=r&target=<base64url>&nid=<id>&rid=<recipientHash>
 * - analytics=ping&nid=<id>&rid=<recipientHash>
 */
function handleAnalyticsGet(e) {
    var params = e && e.parameter ? e.parameter : {};
    var type = params.analytics || '';
    if (type === 'open') return analyticsPixel(params);
    if (type === 'r') return analyticsRedirect(params);
    if (type === 'ping') return analyticsPing(params);
    // unknown analytics action
    return HtmlService.createHtmlOutput('');
}

/**
 * Append an event row to the analytics events sheet for the resolved spreadsheet.
 * eventObj fields: { timestamp, eventType, nid, recipientHash, url, ua, referer, extra }
 */
function logAnalyticsEvent(targetSpreadsheetId, eventObj) {
    try {
        if (!targetSpreadsheetId) throw new Error('No target spreadsheet id');
        var ss = SpreadsheetApp.openById(targetSpreadsheetId);
        var sheet = ss.getSheetByName(ANALYTICS_DEFAULT_SHEET);
        if (!sheet) {
            sheet = ss.insertSheet(ANALYTICS_DEFAULT_SHEET);
            // Add `src` and `eventDetail` columns so callers can provide source (gmail, sheet, web) and a detailed action
            sheet.appendRow(['timestamp', 'eventType', 'eventDetail', 'nid', 'recipientHash', 'src', 'url', 'ua', 'referer', 'extra']);
        }
        var row = [
            eventObj.timestamp || new Date(),
            eventObj.eventType || '',
            eventObj.eventDetail || (eventObj.detail || '') || '',
            eventObj.nid || '',
            eventObj.recipientHash || '',
            eventObj.src || '',
            eventObj.url || '',
            eventObj.ua || '',
            eventObj.referer || '',
            JSON.stringify(eventObj.extra || {})
        ];
        sheet.appendRow(row);
        // simple daily aggregate increment (best-effort): write to daily sheet
        try {
            var ds = ss.getSheetByName(ANALYTICS_DAILY_SHEET);
            if (!ds) ds = ss.insertSheet(ANALYTICS_DAILY_SHEET);
            var dateKey = Utilities.formatDate(new Date(eventObj.timestamp || new Date()), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
            var existing = ds.getRange(1, 1, ds.getLastRow() || 1, ds.getLastColumn() || 3).getValues();
            // find header or create
            if ((ds.getLastRow() || 0) < 1) ds.appendRow(['date', 'eventType', 'nid', 'count']);
            var found = false;
            var rows = ds.getRange(2, 1, Math.max(0, ds.getLastRow() - 1), 4).getValues();
            for (var i = 0; i < rows.length; i++) {
                if (rows[i][0] === dateKey && rows[i][1] === eventObj.eventType && rows[i][2] === eventObj.nid) {
                    var cur = Number(rows[i][3] || 0) + 1;
                    ds.getRange(i + 2, 4).setValue(cur);
                    found = true; break;
                }
            }
            if (!found) ds.appendRow([dateKey, eventObj.eventType, eventObj.nid, 1]);
        } catch (e) { /* ignore aggregate errors */ }
    } catch (e) {
        Logger.log('logAnalyticsEvent error: ' + (e && e.message));
    }
}

/**
 * Helpers for signing and validating analytics URLs.
 */
function getAnalyticsSecret() {
    return PropertiesService.getScriptProperties().getProperty('ANALYTICS_SECRET') || '';
}

function computeHmacHex(value) {
    try {
        var secret = getAnalyticsSecret();
        if (!secret) return '';
        var bytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, value, secret);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            var v = bytes[i]; if (v < 0) v += 256;
            hex += ('0' + v.toString(16)).slice(-2);
        }
        return hex;
    } catch (e) { return ''; }
}

function verifyHmacHex(value, sig) {
    if (!sig) return false;
    var expect = computeHmacHex(value) || '';
    return expect && (expect === sig);
}

function getWebappOrigin() {
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) return '';
    try {
        var m = webapp.match(/^(https?:\/\/[^\/?#]+)/i);
        return m ? m[1] : '';
    } catch (e) { return ''; }
}

function isTargetDomainAllowed(url) {
    try {
        var m = url.match(/^https?:\/\/([^\/\?#]+)(?:[\/\?#]|$)/i);
        if (!m) return false;
        var host = m[1].toString().toLowerCase();
        var allowed = (PropertiesService.getScriptProperties().getProperty('ALLOWED_REDIRECT_DOMAINS') || '').toString().trim();
        if (!allowed) return true; // no whitelist configured -> allow by default
        var parts = allowed.split(',').map(function (s) { return (s || '').toString().toLowerCase().trim(); }).filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            var d = parts[i];
            if (!d) continue;
            if (host === d || host.indexOf('.' + d) !== -1 || host.endsWith(d)) return true;
        }
        return false;
    } catch (e) { return false; }
}

/**
 * Resolve analytics target spreadsheet.
 * For this project we use a single analytics spreadsheet configured via
 * Script Property `ANALYTICS_SPREADSHEET_ID`. There is no per-nid mapping.
 */
function resolveAnalyticsTarget(nid) {
    var props = PropertiesService.getScriptProperties();
    var defaultId = props.getProperty('ANALYTICS_SPREADSHEET_ID');
    if (!defaultId) throw new Error('Set ANALYTICS_SPREADSHEET_ID in Script Properties to point to your analytics spreadsheet');
    return { spreadsheetId: defaultId };
}

/**
 * Return a 1x1 transparent GIF response and log an 'email_open' event.
 */
function analyticsPixel(params) {
    var nid = (params.nid || '').toString();
    var rid = (params.rid || '').toString();
    var src = (params.src || '').toString();
    var eventDetail = (params.eventDetail || params.detail || '').toString();
    var sig = (params.sig || '').toString();
    var allowedOrigin = getWebappOrigin();
    var referer = (params.r || '') || '';
    // allow if signature valid OR request comes from webapp origin (page pings)
    // Signature includes nid|rid|src|eventDetail for stronger binding when present
    var sigBase = (nid || '') + '|' + (rid || '') + '|' + (src || '') + '|' + (eventDetail || '');
    if (!verifyHmacHex(sigBase, sig) && !(referer && referer.indexOf(allowedOrigin) === 0)) {
        return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }
    var target = resolveAnalyticsTarget(nid);
    var event = { timestamp: new Date(), eventType: 'email_open', eventDetail: eventDetail || 'email_open', nid: nid, recipientHash: rid, src: src || 'gmail', ua: (params.ua || '') || '', referer: referer };
    logAnalyticsEvent(target.spreadsheetId, event);
    // 1x1 transparent GIF
    var gif = Utilities.base64Decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    return ContentService.createBinaryOutput(gif).setMimeType(ContentService.MimeType.GIF);
}

/**
 * Log a click and redirect to target URL. Target is passed as base64 encoded value in `target` param.
 */
function analyticsRedirect(params) {
    var nid = (params.nid || '').toString();
    var rid = (params.rid || '').toString();
    var t = (params.target || '') + '';
    var src = (params.src || '').toString();
    var eventDetail = (params.eventDetail || params.detail || '').toString();
    var url = '';
    try { url = Utilities.newBlob(Utilities.base64Decode(t)).getDataAsString(); } catch (e) { url = decodeURIComponent(t || ''); }
    // Debug: record incoming redirect params so we can inspect signature/target in Analytics_Debug
    try {
        var dbgId_in = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID');
        if (dbgId_in) {
            var dss_in = SpreadsheetApp.openById(dbgId_in);
            var ds_in = dss_in.getSheetByName('Analytics_Debug');
            if (!ds_in) ds_in = dss_in.insertSheet('Analytics_Debug');
            if ((ds_in.getLastRow() || 0) < 1) ds_in.appendRow(['timestamp', 'stage', 'nid', 'rid', 'src', 'eventDetail', 'sig', 'referer', 'decodedUrl']);
            var ref_in = (params.r || '') || '';
            ds_in.appendRow([new Date(), 'incoming_redirect', nid, rid, src, eventDetail, (params.sig || ''), ref_in, url]);
        }
    } catch (err) { /* ignore debug write errors */ }
    var sig = (params.sig || '').toString();
    var referer = (params.r || '') || '';
    var allowedOrigin = getWebappOrigin();
    // Try to verify signature against the decoded url. If that fails, attempt to
    // detect an inner `target` parameter (nested analytics redirect) and verify
    // against the inner decoded URL. This unwraps double redirects that point
    // to our webapp again and prevents intermediate navigation to script.google.com
    var verified = false;
    var finalUrl = url;
    try {
        var sigBaseOuter = (nid || '') + '|' + (rid || '') + '|' + (url || '') + '|' + (src || '') + '|' + (eventDetail || '');
        if (verifyHmacHex(sigBaseOuter, sig)) {
            verified = true;
            finalUrl = url;
        } else {
            // recursively unwrap nested `target` params (depth-limited) to find an inner final URL
            try {
                var candidate = url;
                var depth = 0;
                var maxDepth = 6;
                while (candidate && depth < maxDepth) {
                    depth++;
                    var m = candidate.match(/[?&]target=([^&]+)/i);
                    if (!m || !m[1]) break;
                    try {
                        var innerEnc = decodeURIComponent(m[1]);
                        var innerDecoded = Utilities.newBlob(Utilities.base64Decode(innerEnc)).getDataAsString();
                        // check signature against this innerDecoded
                        var sigBaseInner = (nid || '') + '|' + (rid || '') + '|' + (innerDecoded || '') + '|' + (src || '') + '|' + (eventDetail || '');
                        if (verifyHmacHex(sigBaseInner, sig)) {
                            verified = true;
                            finalUrl = innerDecoded;
                            break;
                        }
                        // otherwise continue unwrapping further
                        candidate = innerDecoded;
                        finalUrl = innerDecoded;
                    } catch (e) {
                        break;
                    }
                }
            } catch (e) { /* ignore recursive unwrap errors */ }
        }
    } catch (e) { /* ignore verification errors */ }

    // Allow when referer is webapp origin (client-side web clicks) even if signature didn't verify
    if (!verified && !(referer && referer.indexOf(allowedOrigin) === 0)) {
        return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
    }

    // Validate target domain against allowed list
    if (!isTargetDomainAllowed(finalUrl)) {
        // write debug row for blocked domain
        try {
            var dbgId = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID');
            if (dbgId) {
                var dss = SpreadsheetApp.openById(dbgId);
                var ds = dss.getSheetByName('Analytics_Debug');
                if (!ds) ds = dss.insertSheet('Analytics_Debug');
                if ((ds.getLastRow() || 0) < 1) ds.appendRow(['timestamp', 'stage', 'nid', 'rid', 'src', 'eventDetail', 'finalUrl', 'referer', 'ua']);
                var rua = (params.ua || '') || (params['user-agent'] || '');
                ds.appendRow([new Date(), 'blocked_target', nid, rid, src, eventDetail, finalUrl, referer, rua]);
            }
        } catch (e) { /* ignore debug write errors */ }
        return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
    }
    var target = resolveAnalyticsTarget(nid);
    var event = { timestamp: new Date(), eventType: 'click', eventDetail: eventDetail || 'click', nid: nid, recipientHash: rid, src: src || (referer && referer.indexOf(allowedOrigin) === 0 ? 'web' : 'unknown'), url: finalUrl, ua: (params.ua || '') || '', referer: referer };
    logAnalyticsEvent(target.spreadsheetId, event);
    // write debug row for successful redirect logging to help trace Firefox issues
    try {
        var dbgId2 = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID');
        if (dbgId2) {
            var dss2 = SpreadsheetApp.openById(dbgId2);
            var ds2 = dss2.getSheetByName('Analytics_Debug');
            if (!ds2) ds2 = dss2.insertSheet('Analytics_Debug');
            if ((ds2.getLastRow() || 0) < 1) ds2.appendRow(['timestamp', 'stage', 'nid', 'rid', 'src', 'eventDetail', 'finalUrl', 'referer', 'ua']);
            var rua2 = (params.ua || '') || (params['user-agent'] || '');
            ds2.appendRow([new Date(), 'logged_redirect', nid, rid, src, eventDetail, finalUrl, referer, rua2]);
        }
    } catch (e) { /* ignore */ }
    // redirect by returning simple HTML that performs a META-refresh (more compatible than JS replace)
    function escapeHtmlAttr(s) { try { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } catch (e) { return ''; } }
    // Simple redirect: meta-refresh plus clickable fallback (no fetch-based interstitial)
    var safeHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
        '<meta http-equiv="refresh" content="0;url=' + escapeHtmlAttr(finalUrl) + '">' +
        '</head><body><p>Redirecting&hellip; If you are not redirected, <a href="' + escapeHtmlAttr(finalUrl) + '">click here</a>.</p></body></html>';
    return HtmlService.createHtmlOutput(safeHtml).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Simple ping endpoint for page views. Accepts nid and rid and logs a page_view event.
 */
function analyticsPing(params) {
    var nid = (params.nid || '').toString();
    var rid = (params.rid || '').toString();
    var url = (params.u || '') || '';
    var src = (params.src || '').toString();
    var eventDetail = (params.eventDetail || params.detail || '').toString();
    var target = resolveAnalyticsTarget(nid);
    var event = { timestamp: new Date(), eventType: 'page_view', eventDetail: eventDetail || 'page_view', nid: nid, recipientHash: rid, src: src || 'web', url: url, ua: (params.ua || '') || '', referer: (params.r || '') || '' };
    logAnalyticsEvent(target.spreadsheetId, event);
    return HtmlService.createHtmlOutput('');
}

/**
 * Apps Script API entrypoint for JSON POST requests. Accepts actions:
 * - signRedirect { url, nid, rid, src?, eventDetail? }
 * - logEvent { eventType, eventDetail, nid, rid, src, url, ua, referer }
 * - verify { url, nid, rid, src, eventDetail, sig }
 */
function doPost(e) {
    var body = {};
    // Log raw post for debugging to a debug sheet so we can confirm delivery
    try { logDebugPost(e); } catch (err) { /* ignore debug failures */ }
    try { body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {}; } catch (err) { body = {}; }
    var action = (body.action || body.a || '').toString();
    try {
        if (action === 'signRedirect') return ContentService.createTextOutput(JSON.stringify(signRedirectApi(body))).setMimeType(ContentService.MimeType.JSON);
        if (action === 'logEvent') return ContentService.createTextOutput(JSON.stringify(logEventApi(body))).setMimeType(ContentService.MimeType.JSON);
        if (action === 'logActiveTime') return ContentService.createTextOutput(JSON.stringify(logActiveTimeApi(body))).setMimeType(ContentService.MimeType.JSON);
        if (action === 'verify') return ContentService.createTextOutput(JSON.stringify(verifyApi(body))).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err && err.message })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unknown action' })).setMimeType(ContentService.MimeType.JSON);
}

function logDebugPost(e) {
    try {
        var ssId = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID');
        if (!ssId) return false;
        var ss = SpreadsheetApp.openById(ssId);
        var sheet = ss.getSheetByName('Analytics_Debug');
        if (!sheet) sheet = ss.insertSheet('Analytics_Debug');
        if ((sheet.getLastRow() || 0) < 1) sheet.appendRow(['timestamp', 'action', 'rawBody', 'contentType', 'referer']);
        var raw = '';
        try { raw = e && e.postData && e.postData.contents ? e.postData.contents.toString() : JSON.stringify({}); } catch (e2) { raw = '' + (e && e.postData && e.postData.contents); }
        var ct = (e && e.postData && e.postData.type) || ''; // content type
        var ref = (e && e.parameter && e.parameter.r) || (e && e.headers && (e.headers.Referer || e.headers.referer)) || '';
        sheet.appendRow([new Date(), (e && e.parameter && e.parameter.action) || '', raw, ct, ref]);
        return true;
    } catch (err) { Logger.log('logDebugPost error: ' + (err && err.message)); return false; }
}

function signRedirectApi(body) {
    var url = (body.url || body.u || '').toString();
    var nid = (body.nid || '').toString();
    var rid = (body.rid || '').toString();
    var src = (body.src || 'gmail').toString();
    var eventDetail = (body.eventDetail || body.detail || 'headline_click').toString();
    if (!url) throw new Error('url required');
    var redirectUrl = buildAnalyticsRedirectUrl(url, nid, rid, src, eventDetail);
    return { ok: true, direct: false, redirectUrl: redirectUrl, finalTarget: url };
}

function logEventApi(body) {
    var evt = {
        timestamp: new Date(),
        eventType: (body.eventType || body.type || 'custom').toString(),
        eventDetail: (body.eventDetail || body.detail || '').toString(),
        nid: (body.nid || '').toString(),
        recipientHash: (body.rid || body.recipientHash || '').toString(),
        src: (body.src || '').toString(),
        url: (body.url || body.u || '').toString(),
        ua: (body.ua || '').toString(),
        referer: (body.referer || '').toString(),
        extra: body.extra || {}
    };
    var target = resolveAnalyticsTarget(evt.nid);
    logAnalyticsEvent(target.spreadsheetId, evt);
    return { ok: true };
}

function logActiveTimeApi(body) {
    try {
        var nid = (body.nid || '').toString();
        var rid = (body.rid || '').toString();
        var secs = Number(body.secondsActive || body.seconds || 0) || 0;
        var ua = (body.ua || '').toString();
        var referer = (body.referer || '').toString();
        var extra = body.extra || {};
        var target = resolveAnalyticsTarget(nid);
        var evt = { timestamp: new Date(), eventType: 'active_time', eventDetail: 'active_time_seconds', nid: nid, recipientHash: rid, src: 'web', url: (body.url || ''), ua: ua, referer: referer, extra: Object.assign({ seconds: secs }, extra) };
        logAnalyticsEvent(target.spreadsheetId, evt);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e && e.message) || 'error' };
    }
}

function verifyApi(body) {
    var nid = (body.nid || '').toString();
    var rid = (body.rid || '').toString();
    var src = (body.src || '').toString();
    var eventDetail = (body.eventDetail || body.detail || '').toString();
    var sig = (body.sig || '').toString();
    var url = (body.url || body.u || '').toString();
    if (!url) return { ok: false, verified: false, reason: 'no url' };
    var base = nid + '|' + rid + '|' + (url || '') + '|' + (src || '') + '|' + (eventDetail || '');
    return { ok: true, verified: verifyHmacHex(base, sig) };
}





/**
 * Helper to build redirect URL for a link target and nid/rid.
 */
function buildAnalyticsRedirectUrl(baseUrl, nid, rid, src, eventDetail) {
    // src and eventDetail are optional; if not provided, default to email values
    src = (src || 'gmail');
    eventDetail = (eventDetail || 'headline_click');
    // If this is a news.google.com link, do not wrap — return direct URL to avoid mail client/frame issues
    var enc = Utilities.base64Encode(baseUrl);
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) throw new Error('Set WEBAPP_URL in Script Properties to your webapp URL so analytics redirect links can be built');
    var sep = webapp.indexOf('?') === -1 ? '?' : '&';
    // compute signature over nid|rid|url|src|eventDetail
    var sig = '';
    try { sig = computeHmacHex((nid || '') + '|' + (rid || '') + '|' + (baseUrl || '') + '|' + (src || '') + '|' + (eventDetail || '')); } catch (e) { sig = ''; }
    return webapp + sep + 'analytics=r&target=' + encodeURIComponent(enc) + '&nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid || '') + '&src=' + encodeURIComponent(src) + '&eventDetail=' + encodeURIComponent(eventDetail) + (sig ? '&sig=' + encodeURIComponent(sig) : '');
}

/**
 * Populate a feed sheet with signed redirect links in a new 'signed_link' column
 * so clicks from the sheet can be tracked. This writes next to the original link
 * and does not overwrite the existing link column.
 * Arguments:
 * - sheetId (optional): spreadsheet id to operate on. Defaults to getSheetId().
 * - sheetName: name of the tab containing links
 * - linkHeader: header substring to identify the link column (e.g. 'link')
 * - nid: newsletter id used for signing
 */
function writeSignedLinksToSheet(sheetId, sheetName, linkHeader, nid) {
    sheetId = sheetId || getSheetId();
    if (!sheetId) throw new Error('sheetId required or getSheetId() must work');
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet not found: ' + sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    var linkCol = -1;
    for (var i = 0; i < headers.length; i++) { if ((headers[i] || '').toString().toLowerCase().indexOf((linkHeader || 'link').toLowerCase()) !== -1) { linkCol = i + 1; break; } }
    if (linkCol === -1) throw new Error('Link column not found');
    // Find or create a 'signed_link' column at the end
    var signedCol = headers.length + 1;
    var signedHeader = 'signed_link';
    sheet.getRange(1, signedCol).setValue(signedHeader);
    var rows = sheet.getRange(2, linkCol, Math.max(0, sheet.getLastRow() - 1), 1).getValues();
    var out = [];
    for (var r = 0; r < rows.length; r++) {
        var raw = (rows[r][0] || '').toString();
        if (!raw) { out.push(['']); continue; }
        // if news.google.com link, keep direct; else create signed redirect with src=sheet
        try {
            var signed = buildAnalyticsRedirectUrl(raw, nid || '', '', 'sheet', 'headline_click');
            out.push([signed]);
        } catch (e) { out.push(['']); }
    }
    sheet.getRange(2, signedCol, out.length, 1).setValues(out);
    return { ok: true, rowsProcessed: out.length, signedColumn: signedHeader };
}

/**
 * Helper to build pixel URL
 */
function buildAnalyticsPixelUrl(nid, rid, src, eventDetail) {
    src = (src || 'gmail');
    eventDetail = (eventDetail || 'email_open');
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) throw new Error('Set WEBAPP_URL in Script Properties to your webapp URL so analytics pixel can be built');
    var sep = webapp.indexOf('?') === -1 ? '?' : '&';
    var sig = '';
    try { sig = computeHmacHex((nid || '') + '|' + (rid || '') + '|' + (src || '') + '|' + (eventDetail || '')); } catch (e) { sig = ''; }
    return webapp + sep + 'analytics=open&nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid || '') + '&src=' + encodeURIComponent(src) + '&eventDetail=' + encodeURIComponent(eventDetail) + (sig ? '&sig=' + encodeURIComponent(sig) : '');
}

/**
 * Helper to initialize analytics spreadsheet schema (creates sheets and headers).
 */
function initAnalyticsSpreadsheet() {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID'));
    var s = ss.getSheetByName(ANALYTICS_DEFAULT_SHEET);
    if (!s) ss.insertSheet(ANALYTICS_DEFAULT_SHEET).appendRow(['timestamp', 'eventType', 'eventDetail', 'nid', 'recipientHash', 'src', 'url', 'ua', 'referer', 'extra']);
    var d = ss.getSheetByName(ANALYTICS_DAILY_SHEET);
    if (!d) ss.insertSheet(ANALYTICS_DAILY_SHEET).appendRow(['date', 'eventType', 'nid', 'count']);
    // no Analytics_Config sheet needed for single-newsletter setup
    return true;
}
