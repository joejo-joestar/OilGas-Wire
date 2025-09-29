/**
 * MailAnalytics.gs
 * Helpers for building signed redirect and pixel URLs used in emails.
 * Relies on shared helpers in SharedAnalytics.gs (computeHmacHex, getWebappOrigin, etc.).
 */

function buildAnalyticsRedirectUrl(baseUrl, nid, rid, src, eventDetail, useShortlink) {
    src = (src || 'mail');
    eventDetail = (eventDetail || 'headline_click');
    if (typeof useShortlink === 'undefined') useShortlink = true;
    var ANALYTICS_ENDPOINT = PropertiesService.getScriptProperties().getProperty('ANALYTICS_ENDPOINT') || '';
    // If requested, try to create a shortlink on the analytics backend (single-use, 60s TTL).
    if (useShortlink) {
        try {
            if (ANALYTICS_ENDPOINT) {
                var payload = { url: baseUrl || '', nid: nid || '', rid: rid || '' };
                var options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
                try {
                    var resp = UrlFetchApp.fetch(ANALYTICS_ENDPOINT.replace(/\/+$/, '') + '/shortlink', options);
                    if (resp && resp.getResponseCode && resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
                        try {
                            var body = JSON.parse(resp.getContentText());
                            if (body && body.ok && body.path) {
                                // Return the absolute shortlink URL
                                return ANALYTICS_ENDPOINT.replace(/\/+$/, '') + body.path;
                            }
                        } catch (e) { /* fallthrough to signed redirect fallback */ }
                    }
                } catch (e) { /* fallthrough to signed redirect fallback */ }
            }
        } catch (e) { /* ignore shortlink creation errors and fall back */ }
    }

    // Fallback: original signed redirect (legacy behavior)
    var enc = Utilities.base64Encode(baseUrl);
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) throw new Error('Set WEBAPP_URL in Script Properties to your webapp URL so analytics redirect links can be built');
    var sep = webapp.indexOf('?') === -1 ? '?' : '&';
    var sig = '';
    try { sig = computeHmacHex((nid || '') + '|' + (rid || '') + '|' + (baseUrl || '') + '|' + (src || '') + '|' + (eventDetail || '')); } catch (e) { sig = ''; }
    return webapp + sep + 'analytics=r&target=' + encodeURIComponent(enc) + '&nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid || '') + '&src=' + encodeURIComponent(src) + '&eventDetail=' + encodeURIComponent(eventDetail) + (sig ? '&sig=' + encodeURIComponent(sig) : '');
}

/**
 * Build a 1x1 tracking pixel URL for a specific recipient (rid).
 * Embed this image in the email for basic open-tracking: <img src="..." width="1" height="1" />
 * Note: image open tracking is best-effort and can be blocked by clients.
 */
function buildAnalyticsOpenPixelUrl(nid, rid) {
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) throw new Error('Set WEBAPP_URL in Script Properties to your webapp URL so analytics pixel links can be built');
    var sep = webapp.indexOf('?') === -1 ? '?' : '&';
    var params = 'analytics=ping&nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid || '') + '&src=mail&eventDetail=open';
    return webapp + sep + params;
}

/**
 * Backwards-compatible pixel builder used elsewhere in the project.
 * Accepts optional src and eventDetail values.
 */
function buildAnalyticsPixelUrl(nid, rid, src, eventDetail) {
    src = (src || 'mail');
    eventDetail = (eventDetail || 'open');
    var webapp = PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
    if (!webapp) throw new Error('Set WEBAPP_URL in Script Properties to your webapp URL so analytics pixel links can be built');
    var sep = webapp.indexOf('?') === -1 ? '?' : '&';
    var params = 'analytics=ping&nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid || '') + '&src=' + encodeURIComponent(src || '') + '&eventDetail=' + encodeURIComponent(eventDetail || '');
    return webapp + sep + params;
}
