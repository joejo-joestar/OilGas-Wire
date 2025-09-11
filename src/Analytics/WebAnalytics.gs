/**
 * WebAnalytics.gs
 * Webapp GET/POST handlers: pixel opens, redirect clicks, pings, and JSON APIs.
 * Uses shared helpers from SharedAnalytics.gs.
 */

function handleAnalyticsGet(e) {
    var params = e && e.parameter ? e.parameter : {};
    var type = params.analytics || '';
    if (type === 'open') return analyticsPixel(e);
    if (type === 'r') return analyticsRedirect(params);
    if (type === 'ping') return analyticsPing(params);
    return HtmlService.createHtmlOutput('');
}

function analyticsPixel(e) {
    var params = e && e.parameter ? e.parameter : {};
    var headers = e && e.headers ? e.headers : {};
    var nid = (params.nid || '').toString();
    var rid = (params.rid || '').toString();
    var src = (params.src || '').toString();
    var eventDetail = (params.eventDetail || params.detail || '').toString();
    var sig = (params.sig || '').toString();
    var allowedOrigin = getWebappOrigin();
    var referer = (params.r || '') || (headers && (headers.Referer || headers.referer)) || '';

    var sigBase = (nid || '') + '|' + (rid || '') + '|' + (src || '') + '|' + (eventDetail || '');
    if (!verifyHmacHex(sigBase, sig) && !(referer && referer.indexOf(allowedOrigin) === 0)) {
        return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
    }

    try {
        if ((src || '').toString().toLowerCase() === 'sheet') {
            var ref = referer || '';
            var m = ref.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
            if (m && m[1]) {
                var sheetId = m[1];
                var windowSec = getDedupeWindowSeconds();
                var now = new Date().getTime();
                try {
                    var target = resolveAnalyticsTarget(nid);
                    var ss = SpreadsheetApp.openById(target.spreadsheetId);
                    var sh = ss.getSheetByName(ANALYTICS_DEFAULT_SHEET);
                    if (sh) {
                        var lastRow = sh.getLastRow() || 0;
                        var maxScan = 500;
                        var start = Math.max(2, lastRow - maxScan + 1);
                        var num = Math.max(0, lastRow - start + 1);
                        if (num > 0) {
                            var rows = sh.getRange(start, 1, num, 11).getValues();
                            for (var i = rows.length - 1; i >= 0; i--) {
                                var row = rows[i];
                                var ts = row[0];
                                var et = (row[1] || '').toString();
                                var rowNid = (row[4] || '').toString();
                                var rowUrl = (row[7] || '').toString();
                                if (et === 'click' && rowNid === nid && rowUrl && rowUrl.indexOf(sheetId) !== -1) {
                                    var tms = ts instanceof Date ? ts.getTime() : (new Date(ts)).getTime();
                                    if (!isNaN(tms) && ((now - tms) / 1000) <= windowSec) {
                                        try {
                                            var dbgId = PropertiesService.getScriptProperties().getProperty('ANALYTICS_SPREADSHEET_ID');
                                            if (dbgId) {
                                                var dss = SpreadsheetApp.openById(dbgId);
                                                var ds = dss.getSheetByName('Analytics_Debug');
                                                if (!ds) ds = dss.insertSheet('Analytics_Debug');
                                                if ((ds.getLastRow() || 0) < 1) ds.appendRow(['timestamp', 'stage', 'nid', 'rid', 'src', 'eventDetail', 'sheetId', 'referer']);
                                                ds.appendRow([new Date(), 'dedupe_suppressed_sheet_open', nid, rid, src, eventDetail, sheetId, referer]);
                                            }
                                        } catch (err) { /* ignore */ }
                                        var gifB = Utilities.base64Decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
                                        return ContentService.createBinaryOutput(gifB).setMimeType(ContentService.MimeType.GIF);
                                    }
                                }
                            }
                        }
                    }
                } catch (err) { /* ignore */ }
            }
        }
    } catch (err) { /* ignore */ }

    var target = resolveAnalyticsTarget(nid);
    var eventTypeValue = 'email_open';
    try { if ((src || '').toString().toLowerCase() === 'sheet') eventTypeValue = 'sheet_open'; } catch (err) { eventTypeValue = 'email_open'; }
    var event = { timestamp: new Date(), eventType: eventTypeValue, eventDetail: eventDetail || eventTypeValue, nid: nid, recipientHash: rid, src: src || 'gmail', ua: (params.ua || '') || '', referer: referer };
    logAnalyticsEvent(target.spreadsheetId, event);
    var gif = Utilities.base64Decode('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
    return ContentService.createBinaryOutput(gif).setMimeType(ContentService.MimeType.GIF);
}

function analyticsRedirect(params) {
    var nid = (params.nid || '').toString();
    var rid = (params.rid || '').toString();
    var t = (params.target || '') + '';
    var src = (params.src || '').toString();
    var eventDetail = (params.eventDetail || params.detail || '').toString();
    var url = '';
    try { url = Utilities.newBlob(Utilities.base64Decode(t)).getDataAsString(); } catch (e) { url = decodeURIComponent(t || ''); }
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
    var verified = false;
    var finalUrl = url;
    try {
        var sigBaseOuter = (nid || '') + '|' + (rid || '') + '|' + (url || '') + '|' + (src || '') + '|' + (eventDetail || '');
        if (verifyHmacHex(sigBaseOuter, sig)) {
            verified = true; finalUrl = url;
        } else {
            try {
                var candidate = url; var depth = 0; var maxDepth = 6;
                while (candidate && depth < maxDepth) {
                    depth++;
                    var m = candidate.match(/[?&]target=([^&]+)/i);
                    if (!m || !m[1]) break;
                    try {
                        var innerEnc = decodeURIComponent(m[1]);
                        var innerDecoded = Utilities.newBlob(Utilities.base64Decode(innerEnc)).getDataAsString();
                        var sigBaseInner = (nid || '') + '|' + (rid || '') + '|' + (innerDecoded || '') + '|' + (src || '') + '|' + (eventDetail || '');
                        if (verifyHmacHex(sigBaseInner, sig)) { verified = true; finalUrl = innerDecoded; break; }
                        candidate = innerDecoded; finalUrl = innerDecoded;
                    } catch (e) { break; }
                }
            } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
    if (!verified && !(referer && referer.indexOf(allowedOrigin) === 0)) {
        return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
    }
    if (!isTargetDomainAllowed(finalUrl)) {
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
        } catch (e) { /* ignore */ }
        return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
    }
    var target = resolveAnalyticsTarget(nid);
    var event = { timestamp: new Date(), eventType: 'click', eventDetail: eventDetail || 'click', nid: nid, recipientHash: rid, src: src || (referer && referer.indexOf(allowedOrigin) === 0 ? 'web' : 'unknown'), url: finalUrl, ua: (params.ua || '') || '', referer: referer };
    logAnalyticsEvent(target.spreadsheetId, event);
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
    function escapeHtmlAttr(s) { try { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } catch (e) { return ''; } }
    var safeHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
        '<meta http-equiv="refresh" content="0;url=' + escapeHtmlAttr(finalUrl) + '">' +
        '</head><body><p>Redirecting&hellip; If you are not redirected, <a href="' + escapeHtmlAttr(finalUrl) + '">click here</a>.</p></body></html>';
    return HtmlService.createHtmlOutput(safeHtml).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

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

function doPost(e) {
    var body = {};
    try { logDebugPost(e); } catch (err) { }
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
        var ct = (e && e.postData && e.postData.type) || '';
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
    var evt = { timestamp: new Date(), eventType: (body.eventType || body.type || 'custom').toString(), eventDetail: (body.eventDetail || body.detail || '').toString(), nid: (body.nid || '').toString(), recipientHash: (body.rid || body.recipientHash || '').toString(), src: (body.src || '').toString(), url: (body.url || body.u || '').toString(), ua: (body.ua || '').toString(), referer: (body.referer || '').toString(), extra: body.extra || {} };
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
        var evt = { timestamp: new Date(), eventType: 'active_time', eventDetail: 'active_web_time', nid: nid, recipientHash: rid, src: 'web', url: (body.url || ''), ua: ua, referer: referer, extra: Object.assign({ seconds: secs }, extra) };
        logAnalyticsEvent(target.spreadsheetId, evt);
        return { ok: true };
    } catch (e) { return { ok: false, error: (e && e.message) || 'error' }; }
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
