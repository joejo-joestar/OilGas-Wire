// TextUtils.gs
// Small helpers for string normalization, HTML cleaning and Google News link/title handling.

function normalizeForFuzzy(s) {
    if (!s) return '';
    return s.toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

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

function similarity(a, b) {
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    var A = normalizeForFuzzy(a), B = normalizeForFuzzy(b);
    var d = levenshtein(A, B);
    var max = Math.max(A.length, B.length);
    if (max === 0) return 0;
    return 1 - (d / max);
}

function escapeRegExp(s) {
    return (s || '').toString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeItemHtmlFields(item) {
    if (!item || typeof item !== 'object') return item;

    function decodeEntities(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&nbsp;|&#160;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;|&#34;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&rsquo;|&lsquo;/g, "'")
            .replace(/&ldquo;|&rdquo;/g, '"');
    }

    function stripHtml(s) {
        if (s === null || s === undefined) return '';
        var t = decodeEntities(s);
        t = t.replace(/<[^>]+>/g, ' ');
        t = t.replace(/\s+/g, ' ').trim();
        return t;
    }

    var out = {};
    out.title = stripHtml(item.title || '');
    out.summary = stripHtml(item.summary || item.content || '');
    out.content = stripHtml(item.content || item.summary || '');
    out.source = stripHtml(item.source || '');
    out.link = item.link || '';
    out.pubDate = item.pubDate || item.published || item.updated || '';
    out.feedUrl = item.feedUrl || '';
    return out;
}

function truncateText(s, maxLen) {
    if (!s) return '';
    maxLen = maxLen || ARTICLE_SNIPPET_MAX;
    var str = s.toString();
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1).trim() + '\u2026';
}

function humanizeHeadline(h) {
    if (!h) return '';
    return h.replace(/\s+/g, ' ').trim();
}

function resolveGoogleNewsLink(link) {
    if (!link) return '';
    try {
        var m = link.match(/url=([^&]+)/);
        if (m && m[1]) return decodeURIComponent(m[1]);
        return link;
    } catch (e) {
        return link;
    }
}

function parseGoogleTitle(item) {
    if (!item || !item.title) return;
    var t = item.title.toString();
    var m = t.match(/^(.*)\s[-]\s([^\n]+)$/);
    if (m && m.length >= 3) {
        item.title = m[1].trim();
        var src = m[2].trim();
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
