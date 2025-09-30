/**
 * WebAnalytics.gs
 * Webapp GET/POST handlers: pixel opens, redirect clicks, pings, and JSON APIs.
 * Uses shared helpers from SharedAnalytics.gs.
 */

function handleAnalyticsGet(e) {
    var params = e && e.parameter ? e.parameter : {};
    var type = params.analytics || '';
    // Pixel tracking disabled: ignore 'open' requests
    if (type === 'r') return analyticsRedirect(params);
    if (type === 'ping') return analyticsPing(params);
    return HtmlService.createHtmlOutput('');
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
        // Previously wrote debug rows to an analytics spreadsheet (ANALYTICS_SPREADSHEET_ID).
        // Analytics sheet has been removed/migrated — keep a server-side log instead.
        var ref_in = (params.r || '') || '';
        Logger.log('analytics: incoming_redirect nid=%s rid=%s src=%s eventDetail=%s referer=%s url=%s', nid, rid, src, eventDetail, ref_in, url);
    } catch (err) { /* ignore logging errors */ }
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
            var rua = (params.ua || '') || (params['user-agent'] || '');
            Logger.log('analytics: blocked_target nid=%s rid=%s src=%s eventDetail=%s finalUrl=%s referer=%s ua=%s', nid, rid, src, eventDetail, finalUrl, referer, rua);
        } catch (e) { /* ignore */ }
        return HtmlService.createHtmlOutput('<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body></body></html>');
    }
    var target = resolveAnalyticsTarget(nid);
    var event = { timestamp: new Date(), eventType: 'click', eventDetail: eventDetail || 'click', nid: nid, recipientHash: rid, src: src || (referer && referer.indexOf(allowedOrigin) === 0 ? 'webapp' : 'unknown'), url: finalUrl, ua: (params.ua || '') || '', referer: referer };
    // recipientHash is the canonical id; ensure it's set
    event.recipientHash = event.recipientHash || rid || '';
    // Optionally attach server-side user identity (PII). Enable by setting ANALYTICS_LOG_USER=true in Script Properties.
    try {
        if (PropertiesService.getScriptProperties().getProperty('ANALYTICS_LOG_USER') === 'true') {
            try { var ue = Session.getActiveUser && Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : ''; if (ue) event.userEmail = ue; } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
    sendAnalyticsEvent(event);
    try {
        // Server-side log for successful redirect handling
        var rua2 = (params.ua || '') || (params['user-agent'] || '');
        Logger.log('analytics: logged_redirect nid=%s rid=%s src=%s eventDetail=%s finalUrl=%s referer=%s ua=%s', nid, rid, src, eventDetail, finalUrl, referer, rua2);
    } catch (e) { /* ignore */ }
    // If the finalUrl is same-origin (the webapp) and we verified the signature,
    // prefer to render the newsletter server-side with the validated rid injected.
    try {
        var webOriginCheck = getWebappOrigin() || '';
        if (verified && webOriginCheck && finalUrl && finalUrl.indexOf(webOriginCheck) === 0) {
            try {
                // Extract a date parameter if present so we can render the right newsletter
                var dateParam = null;
                var mDate = finalUrl.match(/[?&]date=([^&]+)/i);
                if (mDate && mDate[1]) dateParam = decodeURIComponent(mDate[1]);
                var sections = [];
                try { sections = buildVisibleSectionsForDate(dateParam); } catch (e) { sections = []; }
                var targetDate = dateParam || Utilities.formatDate(new Date(new Date().getTime() - 24 * 60 * 60 * 1000), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
                var drText = Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');
                var sheetId = getSheetId();
                var feedSheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/';
                var nid_local = 'newsletter-' + Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
                // Render the web template and inject the verified recipientHash (rid)
                var html = renderNewsletterWebHtml({ sections: sections, dateRangeText: drText, feedSheetUrl: feedSheetUrl, nid: nid_local, rid: rid });
                return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('Oil & Gas Market Newsletter');
            } catch (e) { /* fall back to redirect meta tag below on any render error */ }
        }
    } catch (e) { /* ignore rendering errors and fall back to redirect */ }

    function escapeHtmlAttr(s) { try { return (s || '').toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } catch (e) { return ''; } }
    var safeHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">' +
        // Ensure finalUrl carries the rid so the destination (e.g. the webapp) can pick up the visitor id.
        (function () {
            try {
                var f = finalUrl || '';
                var ridParam = (rid || '').toString();
                var sigParam = (sig || '').toString();
                var webOrigin = getWebappOrigin();
                // Append rid if provided and not already present
                if (ridParam && f.indexOf('rid=') === -1) {
                    var hashIndex = f.indexOf('#');
                    var hash = '';
                    if (hashIndex !== -1) { hash = f.substring(hashIndex); f = f.substring(0, hashIndex); }
                    var sep = f.indexOf('?') === -1 ? '?' : '&';
                    f = f + sep + 'rid=' + encodeURIComponent(ridParam) + hash;
                }
                // If redirect target is the webapp itself, also propagate the signature so doGet can verify
                try {
                    if (sigParam && webOrigin && f.indexOf(webOrigin) === 0 && f.indexOf('sig=') === -1) {
                        var hashIndex2 = f.indexOf('#');
                        var hash2 = '';
                        if (hashIndex2 !== -1) { hash2 = f.substring(hashIndex2); f = f.substring(0, hashIndex2); }
                        var sep2 = f.indexOf('?') === -1 ? '?' : '&';
                        f = f + sep2 + 'sig=' + encodeURIComponent(sigParam) + hash2;
                    }
                } catch (e) { /* ignore signature propagation failures */ }
                // Propagate the original base64-encoded target so the final webapp can
                // reconstruct the exact URL that was originally signed. This helps
                // verification when WEBAPP_URL in script properties doesn't exactly
                // match the runtime incoming URL (different deployments, domains).
                try {
                    if (t && webOrigin && f.indexOf(webOrigin) === 0 && f.indexOf('signed_target=') === -1) {
                        var hashIndex3 = f.indexOf('#');
                        var hash3 = '';
                        if (hashIndex3 !== -1) { hash3 = f.substring(hashIndex3); f = f.substring(0, hashIndex3); }
                        var sep3 = f.indexOf('?') === -1 ? '?' : '&';
                        // `t` is the base64-encoded original target as received in the redirect params
                        f = f + sep3 + 'signed_target=' + encodeURIComponent(t) + hash3;
                    }
                } catch (e) { /* ignore signed_target propagation failures */ }
                try { Logger.log('analyticsRedirect: forwarding to finalUrl=%s (rid present=%s, sigPresent=%s)', f, !!ridParam, !!sigParam); } catch (e) { /* ignore logging errors */ }
                return '<meta http-equiv="refresh" content="0;url=' + escapeHtmlAttr(f) + '">';
            } catch (e) { return '<meta http-equiv="refresh" content="0;url=' + escapeHtmlAttr(finalUrl) + '">'; }
        })() +
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
    // Treat eventDetails containing 'open' (e.g. 'open', 'email_open') as an 'open' event
    var edt = (eventDetail || '').toString().toLowerCase();
    var evtType = (edt.indexOf('open') !== -1) ? 'open' : 'page_view';
    var event = { timestamp: new Date(), eventType: evtType, eventDetail: eventDetail || (evtType === 'page_view' ? 'page_view' : 'open'), nid: nid, recipientHash: rid, src: src || 'webapp', url: url, ua: (params.ua || '') || '', referer: (params.r || '') || '' };
    // recipientHash is the canonical id; ensure it's set
    event.recipientHash = event.recipientHash || rid || '';
    try {
        if (PropertiesService.getScriptProperties().getProperty('ANALYTICS_LOG_USER') === 'true') {
            try { var ue2 = Session.getActiveUser && Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : ''; if (ue2) event.userEmail = ue2; } catch (e) { /* ignore */ }
        }
    } catch (e) { /* ignore */ }
    sendAnalyticsEvent(event);
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
        // Previously wrote raw POST bodies to the Analytics_Debug sheet. Instead log to server logs.
        var raw = '';
        try { raw = e && e.postData && e.postData.contents ? e.postData.contents.toString() : JSON.stringify({}); } catch (e2) { raw = '' + (e && e.postData && e.postData.contents); }
        var ct = (e && e.postData && e.postData.type) || '';
        var ref = (e && e.parameter && e.parameter.r) || (e && e.headers && (e.headers.Referer || e.headers.referer)) || '';
        Logger.log('Analytics POST debug action=%s contentType=%s referer=%s body=%s', (e && e.parameter && e.parameter.action) || '', ct, ref, raw);
        return true;
    } catch (err) { Logger.log('logDebugPost error: ' + (err && err.message)); return false; }
}

function signRedirectApi(body) {
    var url = (body.url || body.u || '').toString();
    var nid = (body.nid || '').toString();
    var rid = (body.rid || '').toString();
    var src = (body.src || 'mail').toString();
    var eventDetail = (body.eventDetail || body.detail || 'headline_click').toString();
    if (!url) throw new Error('url required');
    var redirectUrl = buildAnalyticsRedirectUrl(url, nid, rid, src, eventDetail);
    return { ok: true, direct: false, redirectUrl: redirectUrl, finalTarget: url };
}

function logEventApi(body) {
    var payload = {
        eventType: (body.eventType || 'custom').toString(),
        eventDetail: (body.eventDetail || '').toString(),
        newsletterId: (body.nid || '').toString(),
        // canonical recipient id: prefer explicit recipientHash, else fall back to rid
        recipientHash: (body.recipientHash || body.rid || '').toString(),
        url: (body.url || '').toString(),
        userAgent: (body.ua || '').toString(),
        src: (body.src || 'webapp').toString()
    };
    sendAnalyticsEvent(payload);
    return { ok: true };
}

function logActiveTimeApi(body) {
    try {
        var payload = {
            eventType: 'active_time',
            newsletterId: (body.nid || '').toString(),
            // canonical recipient id: prefer explicit recipientHash, else fall back to rid
            recipientHash: (body.recipientHash || body.rid || '').toString(),
            durationSec: Number(body.seconds || 0),
            userAgent: (body.ua || '').toString(),
            src: (body.src || 'webapp').toString()
        };
        sendAnalyticsEvent(payload);
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
