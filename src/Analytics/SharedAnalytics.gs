/**
 * SharedAnalytics.gs
 * Common helpers used by mail- and webapp-analytics.
 */
var ANALYTICS_DEFAULT_SHEET = 'Analytics_Events';
var ANALYTICS_DAILY_SHEET = 'Analytics_Daily';

function getDedupeWindowSeconds() {
    var v = PropertiesService.getScriptProperties().getProperty('ANALYTICS_DEDUP_WINDOW_SECONDS') || '';
    var n = Number(v) || 30;
    return n;
}

function logAnalyticsEvent(targetSpreadsheetId, eventObj) {
    try {
        if (!targetSpreadsheetId) throw new Error('No target spreadsheet id');
        var ss = SpreadsheetApp.openById(targetSpreadsheetId);
        var sheet = ss.getSheetByName(ANALYTICS_DEFAULT_SHEET);
        if (!sheet) {
            sheet = ss.insertSheet(ANALYTICS_DEFAULT_SHEET);
            sheet.appendRow(['timestamp', 'src', 'eventType', 'eventDetail', 'time', 'nid', 'recipientHash', 'url', 'ua', 'referer', 'extra']);
        }
        if ((sheet.getLastRow() || 0) < 1) sheet.appendRow(['timestamp', 'src', 'eventType', 'eventDetail', 'time', 'nid', 'recipientHash', 'url', 'ua', 'referer', 'extra']);
        var timeVal = '';
        try {
            if (typeof eventObj.time !== 'undefined' && eventObj.time !== null) timeVal = Number(eventObj.time) || '';
            else if (eventObj.extra && typeof eventObj.extra.seconds !== 'undefined') timeVal = Number(eventObj.extra.seconds) || '';
        } catch (e) { timeVal = ''; }
        var row = [
            eventObj.timestamp || new Date(),
            eventObj.src || '',
            eventObj.eventType || '',
            eventObj.eventDetail || (eventObj.detail || '') || '',
            timeVal,
            eventObj.nid || '',
            eventObj.recipientHash || '',
            eventObj.url || '',
            eventObj.ua || '',
            eventObj.referer || '',
            JSON.stringify(eventObj.extra || {})
        ];
        sheet.appendRow(row);
        try {
            var ds = ss.getSheetByName(ANALYTICS_DAILY_SHEET);
            if (!ds) ds = ss.insertSheet(ANALYTICS_DAILY_SHEET);
            var dateKey = Utilities.formatDate(new Date(eventObj.timestamp || new Date()), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
            if ((ds.getLastRow() || 0) < 1) ds.appendRow(['date', 'eventType', 'nid', 'count']);
            var rows = ds.getRange(2, 1, Math.max(0, ds.getLastRow() - 1), 4).getValues();
            var found = false;
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
    try { var m = webapp.match(/^(https?:\/\/[^\/?#]+)/i); return m ? m[1] : ''; } catch (e) { return ''; }
}

function isTargetDomainAllowed(url) {
    try {
        var m = url.match(/^https?:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
        if (!m) return false;
        var host = m[1].toString().toLowerCase();
        var allowed = (PropertiesService.getScriptProperties().getProperty('ALLOWED_REDIRECT_DOMAINS') || '').toString().trim();
        if (!allowed) return true;
        var parts = allowed.split(',').map(function (s) { return (s || '').toString().toLowerCase().trim(); }).filter(Boolean);
        for (var i = 0; i < parts.length; i++) {
            var d = parts[i]; if (!d) continue;
            if (host === d || host.indexOf('.' + d) !== -1 || host.endsWith(d)) return true;
        }
        return false;
    } catch (e) { return false; }
}

function resolveAnalyticsTarget(nid) {
    var props = PropertiesService.getScriptProperties();
    var defaultId = props.getProperty('ANALYTICS_SPREADSHEET_ID');
    if (!defaultId) throw new Error('Set ANALYTICS_SPREADSHEET_ID in Script Properties to point to your analytics spreadsheet');
    return { spreadsheetId: defaultId };
}

function initAnalyticsSpreadsheet() {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID'));
    var s = ss.getSheetByName(ANALYTICS_DEFAULT_SHEET);
    if (!s) ss.insertSheet(ANALYTICS_DEFAULT_SHEET).appendRow(['timestamp', 'src', 'eventType', 'eventDetail', 'time', 'nid', 'recipientHash', 'url', 'ua', 'referer', 'extra']);
    var d = ss.getSheetByName(ANALYTICS_DAILY_SHEET);
    if (!d) ss.insertSheet(ANALYTICS_DAILY_SHEET).appendRow(['date', 'eventType', 'nid', 'count']);
    return true;
}
