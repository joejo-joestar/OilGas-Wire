/**
 * MailAnalytics.gs
 * Helpers for building signed redirect and pixel URLs used in emails.
 * Relies on shared helpers in SharedAnalytics.gs (computeHmacHex, getWebappOrigin, etc.).
 */

function buildAnalyticsRedirectUrl(baseUrl, nid, rid, src, eventDetail) {
    src = (src || 'mail');
    eventDetail = (eventDetail || 'headline_click');
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
