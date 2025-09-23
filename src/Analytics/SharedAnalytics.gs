/**
 * SharedAnalytics.gs - Updated for Cloud Run Endpoint
 */
function sendAnalyticsEvent(payload) {
    const ANALYTICS_ENDPOINT = PropertiesService.getScriptProperties().getProperty('ANALYTICS_ENDPOINT');
    if (!ANALYTICS_ENDPOINT) {
        console.error("CRITICAL: ANALYTICS_ENDPOINT script property is not set.");
        return;
    }
    const options = {
        'method': 'post',
        'contentType': 'application/json',
        'muteHttpExceptions': true,
        'payload': JSON.stringify(payload)
    };
    try {
        UrlFetchApp.fetch(ANALYTICS_ENDPOINT + '/track', options);
    } catch (e) {
        console.error("Failed to send analytics event. Error: " + e.toString());
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