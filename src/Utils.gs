/**
 * Utils.gs
 *
 * Shared helper/utility functions moved out of `Feed.gs` to keep the main file small.
 */

// Normalize to alpha-numeric lower string (no spaces) for compact fuzzy compares
function normalizeForFuzzy(s) {
    if (!s) return '';
    return s.toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Levenshtein distance (iterative DP) - small strings only
function levenshtein(a, b) {
    a = a || '';
    b = b || '';
    var m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = [i]; }
    for (var j = 1; j <= n; j++) dp[0][j] = j;
    for (var i = 1; i <= m; i++) {
        for (var j = 1; j <= n; j++) {
            var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

// Compute similarity 0..1 based on Levenshtein normalized by max length
function similarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    var A = normalizeForFuzzy(a), B = normalizeForFuzzy(b);
    var d = levenshtein(A, B);
    var max = Math.max(A.length, B.length);
    if (max === 0) return 0;
    return 1 - (d / max);
}

// Escape regular expression special chars in a string
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Return a matching company name from text using simple fuzzy (substring + word-boundary) checks
function guessCompanyFromText(text) {
    if (!text) return '';
    var lc = text.toLowerCase();
    for (var i = 0; i < KNOWN_COMPANIES.length; i++) {
        var name = KNOWN_COMPANIES[i];
        var re = new RegExp('\\b' + escapeRegExp(name.toLowerCase()) + '\\b');
        if (re.test(lc)) return name;
        // also check without spaces for some short tokens (e.g., ADNOC)
        if (lc.indexOf(name.toLowerCase().replace(/\s+/g, '')) !== -1) return name;
    }
    // Fuzzy fallback: check similarity against each known company using compacted forms
    var best = { name: '', score: 0 };
    var compactText = normalizeForFuzzy(text);
    for (var j = 0; j < KNOWN_COMPANIES.length; j++) {
        var k = KNOWN_COMPANIES[j];
        var sim = similarity(compactText, normalizeForFuzzy(k));
        if (sim > best.score) { best.score = sim; best.name = k; }
    }
    if (best.score >= FUZZY_THRESHOLD) return best.name;
    return '';
}

// Return a matching region from text
function guessRegionFromText(text) {
    if (!text) return '';
    var lc = text.toLowerCase();
    for (var j = 0; j < KNOWN_REGIONS.length; j++) {
        var r = KNOWN_REGIONS[j];
        var re2 = new RegExp('\\b' + escapeRegExp(r.toLowerCase()) + '\\b');
        if (re2.test(lc)) return r;
        if (lc.indexOf(r.toLowerCase().replace(/\s+/g, '')) !== -1) return r;
    }
    // Fuzzy fallback
    var bestR = { name: '', score: 0 };
    var compactText2 = normalizeForFuzzy(text);
    for (var k2 = 0; k2 < KNOWN_REGIONS.length; k2++) {
        var cand = KNOWN_REGIONS[k2];
        var s = similarity(compactText2, normalizeForFuzzy(cand));
        if (s > bestR.score) { bestR.score = s; bestR.name = cand; }
    }
    if (bestR.score >= FUZZY_THRESHOLD) return bestR.name;
    return '';
}

// Truncate text to maxLen characters and append ellipses if truncated. Returns empty string for falsy input.
function truncateText(s, maxLen) {
    if (!s) return '';
    var str = s.toString().replace(/\s+/g, ' ').trim();
    if (!maxLen || str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1).trim() + '…';
}

// Minimal HTML entity decode for common entities
function htmlEntityDecode(s) {
    if (!s) return '';
    return s.toString()
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// Make a headline more human-readable: strip tags, decode entities, collapse spaces,
// and ensure first character is capitalized. Returns empty string for falsy input.
function humanizeHeadline(h) {
    if (!h) return '';
    var s = h.toString();
    // remove tags and decode entities
    s = s.replace(/<[^>]+>/g, '');
    s = htmlEntityDecode(s);
    // convert multiple spaces / non-breaking spaces into a readable separator (em-dash)
    s = s.replace(/[\u00A0\s]{2,}/g, ' — ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return '';
    // capitalize first char if it's lowercase
    if (s.length > 1) s = s.charAt(0).toUpperCase() + s.slice(1);
    else s = s.toUpperCase();
    return s;
}

// Normalize item title/summary/content for feeds that embed HTML fragments in titles
// or return the article as an HTML snippet (e.g., Google News RSS or SaudiGulf Projects).
function normalizeItemHtmlFields(item) {
    if (!item) return item;
    try {
        var t = item.title || '';
        if (/(<a\s+[^>]*>.*?<\/a>)/i.test(t)) {
            var anchorMatch = t.match(/<a[^>]*>(.*?)<\/a>/ig);
            if (anchorMatch && anchorMatch.length) {
                var last = anchorMatch[anchorMatch.length - 1];
                var inner = last.replace(/<[^>]+>/g, '').trim();
                if (inner) item.title = inner;
            }
            var fontMatch = t.match(/<font[^>]*>([^<]+)<\/font>/i);
            if (fontMatch && fontMatch[1]) {
                item.source = item.source || fontMatch[1].trim();
            }
        }
        var contentFields = ['summary', 'content', 'description'];
        contentFields.forEach(function (f) {
            var v = item[f];
            if (v && /The post\s+<a[^>]*>.*?<\/a>\s+appeared first on/i.test(v)) {
                var postMatch = v.match(/The post\s+<a[^>]*>(.*?)<\/a>/i);
                if (postMatch && postMatch[1]) {
                    var clean = postMatch[1].replace(/<[^>]+>/g, '').trim();
                    if (clean) {
                        item.title = item.title && item.title.replace(/<[^>]+>/g, '').trim() || clean;
                    }
                }
                try {
                    var paraMatch = v.match(/<p>(.*?)<\/p>/i);
                    if (paraMatch && paraMatch[1]) {
                        var snippet = paraMatch[1].replace(/<[^>]+>/g, '').trim();
                        item.summary = snippet;
                    }
                } catch (e) { }
            }
        });
    } catch (e) {
        // non-fatal
    }
    return item;
}

// If Google News RSS provides titles as "{headline} - {source}", split them.
function parseGoogleTitle(item) {
    if (!item || !item.title) return;
    var t = item.title.toString();
    var m = t.match(/^(.*)\s[-–—]\s([^\n]+)$/);
    if (m && m.length >= 3) {
        var headline = m[1].trim();
        var src = m[2].trim();
        item.title = headline;
        var existing = (item.source || '').toString().toLowerCase();
        var isGooglePlaceholder = existing.indexOf('google news') !== -1 || existing.indexOf('top stories') !== -1 || existing.indexOf('news.google.com') !== -1 || existing === '';
        if (isGooglePlaceholder) item.source = src;
        return;
    }
    var parts = t.split(' - ');
    if (parts.length >= 2) {
        var src2 = parts[parts.length - 1].trim();
        var headline2 = parts.slice(0, parts.length - 1).join(' - ').trim();
        item.title = headline2;
        var existing2 = (item.source || '').toString().toLowerCase();
        var isGooglePlaceholder2 = existing2.indexOf('google news') !== -1 || existing2.indexOf('top stories') !== -1 || existing2.indexOf('news.google.com') !== -1 || existing2 === '';
        if (isGooglePlaceholder2) item.source = src2;
    }
}

// For Google News RSS items, the provided link often points to a Google redirect page.
// Try to fetch that page and extract the original publisher URL using common tags
// (og:url, canonical, or the first external anchor). Returns the resolved URL or
// the original input on failure.
function resolveGoogleNewsLink(gnUrl) {
    if (!gnUrl) return gnUrl;
    try {
        if (gnUrl.indexOf('news.google.com') === -1) return gnUrl;
        var resp = UrlFetchApp.fetch(gnUrl, FETCH_OPTIONS);
        var html = resp.getContentText();
        if (!html) return gnUrl;
        var m = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
        if (m && m[1]) {
            var u = m[1];
            if (u.indexOf('news.google.com') === -1) return u;
        }
        var m2 = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
        if (m2 && m2[1]) {
            if (m2[1].indexOf('news.google.com') === -1) return m2[1];
        }
        var m3 = html.match(/<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i);
        if (m3 && m3[1]) return m3[1];
    } catch (e) {
        Logger.log('resolveGoogleNewsLink error for %s : %s', gnUrl, e.toString());
    }
    return gnUrl;
}
