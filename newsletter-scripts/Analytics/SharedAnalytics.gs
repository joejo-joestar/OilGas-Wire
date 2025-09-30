/**
 * SharedAnalytics.gs - Updated for Cloud Run Endpoint
 */
function sendAnalyticsEvent(payload) {
    const ANALYTICS_ENDPOINT = PropertiesService.getScriptProperties().getProperty('ANALYTICS_ENDPOINT');
    if (!ANALYTICS_ENDPOINT) {
        console.error("CRITICAL: ANALYTICS_ENDPOINT script property is not set.");
        return;
    }

    // Normalize common field names so backend receives a consistent schema.
    try {
        var out = {};
        // core fields
        // Prefer explicit source; default to 'apps-script' so backends don't get 'unknown'.
        out.src = payload.src || payload.source || 'apps-script';
        out.eventType = payload.eventType || payload.type || 'custom';
        out.eventDetail = payload.eventDetail || payload.detail || '';

        // newsletter id mapping
        out.newsletterId = payload.newsletterId || payload.nid || '';

        // recipient / hashed id (canonical)
        out.recipientHash = payload.recipientHash || payload.rid || '';

        // url / user agent / referer
        out.url = payload.url || payload.u || '';
        out.userAgent = payload.userAgent || payload.ua || payload.uaString || '';
        out.referer = payload.referer || payload.ref || payload.r || '';

        // duration / active time
        if (typeof payload.durationSec !== 'undefined') out.durationSec = payload.durationSec;
        else if (payload.extra && typeof payload.extra.seconds !== 'undefined') out.durationSec = payload.extra.seconds;

        // pass-through any other useful fields
        if (payload.timestamp) out.timestamp = (payload.timestamp && payload.timestamp.toISOString) ? payload.timestamp.toISOString() : (new Date(payload.timestamp)).toISOString();
        else out.timestamp = (new Date()).toISOString();

        if (payload.extra && typeof payload.extra === 'object') out.extra = payload.extra;
        // Optional server-side email when available/authorized
        if (payload.userEmail) out.userEmail = payload.userEmail;

        var options = {
            'method': 'post',
            'contentType': 'application/json',
            'muteHttpExceptions': true,
            'payload': JSON.stringify(out)
        };
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

/**
 * Store a mapping of recipientHash -> email address in the analytics backend.
 * This avoids sending raw email addresses alongside regular analytics events.
 * The analytics service must implement a POST /map endpoint to accept this payload.
 * @param {string} rid Hex SHA-256 recipient id
 * @param {string} email Plain email address
 * @param {string=} newsletterId Optional newsletter id to associate with the mapping
 */
function storeRecipientMapping(rid, email, newsletterId) {
    try {
        var ANALYTICS_ENDPOINT = PropertiesService.getScriptProperties().getProperty('ANALYTICS_ENDPOINT');
        if (!ANALYTICS_ENDPOINT) {
            Logger.log('storeRecipientMapping skipped: ANALYTICS_ENDPOINT not set');
            return;
        }
        var sendPlain = (PropertiesService.getScriptProperties().getProperty('ANALYTICS_SEND_PLAIN_EMAIL') || '') === 'true';
        var body = {
            recipientHash: (rid || '').toString(),
            newsletterId: newsletterId || ''
        };
        if (sendPlain) {
            body.email = (email || '').toString();
        } else {
            // Send hashed email to avoid transmitting raw PII. Backend can store emailHash for joins.
            try {
                body.emailHash = computeSha256Hex((email || '').toString().trim().toLowerCase());
            } catch (he) {
                body.emailHash = '';
            }
        }
        // Compute a signature for the mapping payload so the backend can verify authenticity.
        try {
            var sigBase = (body.recipientHash || '') + '|' + (body.email || '') + '|' + (body.emailHash || '') + '|' + (body.newsletterId || '');
            var sig = computeHmacHex(sigBase) || '';
        } catch (se) { var sig = ''; }

        var options = {
            'method': 'post',
            'contentType': 'application/json',
            'muteHttpExceptions': true,
            'payload': JSON.stringify(body),
            'headers': {
                'X-Signature': sig
            }
        };
        UrlFetchApp.fetch(ANALYTICS_ENDPOINT + '/map', options);
    } catch (e) {
        Logger.log('storeRecipientMapping error: ' + (e && e.message));
    }
}

function computeSha256Hex(value) {
    try {
        var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value || '', Utilities.Charset.UTF_8);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            var v = bytes[i]; if (v < 0) v += 256;
            hex += ('0' + v.toString(16)).slice(-2);
        }
        return hex;
    } catch (e) { return ''; }
}

/**
 * Resolve analytics target metadata for a given newsletter id (nid).
 * This helper is intentionally lightweight and defensive: it should never throw
 * and provides minimal metadata used by analytics handlers.
 * @param {string} nid
 * @return {{nid: string, webappOrigin: string, allowed: boolean}}
 */
function resolveAnalyticsTarget(nid) {
    try {
        var id = (nid || '').toString();
        var origin = getWebappOrigin() || '';
        return { nid: id, webappOrigin: origin, allowed: true };
    } catch (e) {
        return { nid: (nid || '').toString(), webappOrigin: '', allowed: false };
    }
}