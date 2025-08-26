function getSheetId() {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) {
        throw new Error('Please set SHEET_ID in Project Properties (File → Project properties → Script properties)');
    }
    return id;
}

function setSheetId(id) {
    if (!id) throw new Error('setSheetId requires a non-empty id');
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
}

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

// Clean simple HTML fragments and common HTML entities from item text fields.
// Returns a new item object with cleaned title/summary/content/source (if present).
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
        // remove tags
        t = t.replace(/<[^>]+>/g, ' ');
        // collapse whitespace and trim
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

// Truncate text to a maximum length, appending ellipsis when truncated.
function truncateText(s, maxLen) {
    if (!s) return '';
    maxLen = maxLen || ARTICLE_SNIPPET_MAX;
    var str = s.toString();
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen - 1).trim() + '\u2026';
}

// Convert compact headlines into a human-friendly snippet if needed
function humanizeHeadline(h) {
    if (!h) return '';
    return h.replace(/\s+/g, ' ').trim();
}

// Try to resolve Google News redirect URL to the publisher URL when possible.
// This is a heuristic: News links often contain 'articles/' or 'url?q=' redirect patterns.
function resolveGoogleNewsLink(link) {
    if (!link) return '';
    try {
        // If link contains 'articles/' and a publisher URL, try to extract
        var m = link.match(/url=([^&]+)/);
        if (m && m[1]) return decodeURIComponent(m[1]);
        // fallback: return as-is
        return link;
    } catch (e) {
        return link;
    }
}

// Parse Google News-style titles like "Headline - Source" into headline and source
function parseGoogleTitle(item) {
    if (!item || !item.title) return;
    var t = item.title.toString();
    var m = t.match(/^(.*)\s[-–—]\s([^\n]+)$/);
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
        // Avoid matching very short tokens (e.g., 'uk') inside other words.
        var compactR = r.toLowerCase().replace(/\s+/g, '');
        if (compactR.length >= 3 && lc.indexOf(compactR) !== -1) return r;
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

// Map guessed region to a canonical name using REGION_CANONICALS (from Config)
function canonicalizeRegion(region) {
    if (!region) return '';
    var key = region.toString().toLowerCase();
    if (typeof REGION_CANONICALS !== 'undefined' && REGION_CANONICALS[key]) return REGION_CANONICALS[key];
    return region;
}

// Analyze an item and extract structured fields using regex heuristics and source-specific rules
function analyzeItem(item) {
    var text = ((item.title || '') + '\n' + (item.summary || '') + '\n' + (item.content || '')).replace(/\s+/g, ' ');
    var lc = text.toLowerCase();
    var res = {
        company: '',
        dealType: '',
        dealValue: '',
        region: '',
        commodity: '',
        priceInfo: ''
    };

    // Company extraction: look for 'CompanyA to acquire CompanyB' or 'CompanyA buys CompanyB' or 'CompanyA and CompanyB'
    var companyRegex = /([A-Z][A-Za-z0-9&\.\-]{2,}(?:\s+[A-Z][A-Za-z0-9&\.\-]{2,})*)(?:\s+(?:to acquire|acquires|buys|buys out|acquired|acquired by|and)\s+([A-Z][A-Za-z0-9&\.\-]{2,}))/;
    var m = text.match(companyRegex);
    // If regex finds candidate company names, only accept them if they match our known companies list
    if (m) {
        var c1 = guessCompanyFromText(m[1]);
        var c2 = m[2] ? guessCompanyFromText(m[2]) : '';
        if (c1 || c2) {
            var parts = [];
            if (c1) parts.push(c1);
            if (c2) parts.push(c2);
            res.company = parts.join(' / ');
        }
    }

    // If company not found by regex (or regex candidates weren't known), search the full text for known companies
    if (!res.company) {
        var compGuess = guessCompanyFromText(text);
        if (compGuess) res.company = compGuess;
    }

    // Deal type
    if (lc.indexOf('joint venture') !== -1 || lc.indexOf('joint-venture') !== -1) res.dealType = 'Joint Venture';
    else if (lc.indexOf('acquire') !== -1 || lc.indexOf('acquires') !== -1 || lc.indexOf('acquired') !== -1) res.dealType = 'Acquisition';
    else if (lc.indexOf('merger') !== -1 || lc.indexOf('merge') !== -1) res.dealType = 'Merger';

    // Deal value (simple $ or m/bn extraction)
    var valueRegex = /([$€£]\s?[0-9,.]+\s?(bn|m|million|billion|thousand)?)/i;
    var mv = text.match(valueRegex);
    if (mv) res.dealValue = mv[0];

    // Region: only accept regions from the known regions list
    var regGuess = guessRegionFromText(text);
    if (regGuess) {
        res.region = canonicalizeRegion(regGuess) || regGuess;
    }

    // Commodity and price info
    if (lc.indexOf('brent') !== -1) res.commodity = 'Brent';
    else if (lc.indexOf('wti') !== -1) res.commodity = 'WTI';
    // price info: look for patterns like 'rose 2%' or '$70/bbl' or 'down 1.5%'
    var priceRegex = /\$\s?[0-9]+(?:\.[0-9]+)?\s?\/?bbl|\$\s?[0-9,.]+|\b(up|down|rose|fell|declined)\s+[0-9\.]+%/i;
    var p = text.match(priceRegex);
    if (p) res.priceInfo = p[0];

    // If commodity not detected above, try to identify from CONFIG.COMMODITIES list
    if (!res.commodity) {
        try {
            res.commodity = identifyCommodity(text) || '';
        } catch (e) {
            // ignore and leave empty
        }
    }

    return res;
}

function inferFieldFromItem(col, item) {
    // Simple heuristics: try to fill companies, region, commodity, price, etc.
    var text = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
    if (col.indexOf('company') !== -1 || col.indexOf('companies') !== -1) {
        // Look for 'at <Company>' or 'of <Company>' is complex; leave blank for now
        return '';
    }
    if (col.indexOf('region') !== -1) {
        // Try to find continent/country mentions (super naive)
        var regions = ['asia', 'europe', 'africa', 'middle east', 'usa', 'united states', 'china', 'india'];
        for (var i = 0; i < regions.length; i++) if (text.indexOf(regions[i]) !== -1) return regions[i];
        return '';
    }
    if (col.indexOf('deal') !== -1 || col.indexOf('value') !== -1) return '';
    if (col.indexOf('industry') !== -1) return 'Oil & Gas';
    if (col.indexOf('commodity') !== -1) {
        if (text.indexOf('brent') !== -1) return 'Brent';
        if (text.indexOf('wti') !== -1) return 'WTI';
        return '';
    }
    return '';
}

// Identify commodity from free text using the COMMODITIES list in Config.gs.
// Returns the first matching commodity (case-insensitive) or 'Miscellaneous' when none found.
function identifyCommodity(text) {
    if (!text) return 'Miscellaneous';
    var lc = text.toString().toLowerCase();
    try {
        if (typeof COMMODITIES !== 'undefined' && COMMODITIES && COMMODITIES.length) {
            for (var i = 0; i < COMMODITIES.length; i++) {
                var c = COMMODITIES[i];
                if (!c) continue;
                var token = c.toString().toLowerCase();
                // Exact word-boundary match first
                var re = new RegExp('\\b' + escapeRegExp(token) + '\\b');
                if (re.test(lc)) return c;
                // Fallback: compact match (useful for short tokens like LNG)
                if (lc.indexOf(token.replace(/\s+/g, '')) !== -1) return c;
            }
        }
    } catch (e) {
        // ignore errors and fall back
    }
    // Fallback heuristics (similar to old/raw mats.gs)
    var heur = ['oil', 'gas', 'lng', 'steel', 'pipe', 'chemical', 'valve', 'flange', 'diesel'];
    for (var j = 0; j < heur.length; j++) {
        if (lc.indexOf(heur[j]) !== -1) return heur[j].charAt(0).toUpperCase() + heur[j].slice(1);
    }
    return 'Miscellaneous';
}

// Check whether an item matches any of the category queries (case-insensitive substring)
// Check whether an item matches any of the category queries (case-insensitive substring)
// AND ensure the item is relevant to oil & gas industry. This enforces that only
// oil & gas related news are stored regardless of feed source.
function matchesQueries(item, queries) {
    // require industry relevance first
    if (!isAboutOilAndGas(item)) return false;

    if (!queries || queries.length === 0) return true; // no queries -> accept all oil & gas items
    var hay = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
    return queries.some(function (q) { return hay.indexOf(q.toLowerCase()) !== -1; });
}

// Very small heuristic to determine if an item is about the oil & gas industry.
// Uses a list of common tokens and phrases. This is intentionally conservative
// to reduce false positives from general business feeds.
function isAboutOilAndGas(item) {
    var text = ((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.content || '')).toLowerCase();
    if (!text) return false;
    var tokens = [
        'oil', 'gas', 'crude', 'brent', 'wti', 'petrol', 'pipeline', 'rig', 'platform', 'offshore', 'onshore',
        'refinery', 'ngl', 'lng', 'liquefied natural gas', 'upstream', 'midstream', 'downstream', 'petro', 'fossil',
        'exploration', 'drilling', 'well', 'barrel', 'barrels', 'hydrocarbon', 'psa', 'production'
    ];
    for (var i = 0; i < tokens.length; i++) {
        if (text.indexOf(tokens[i]) !== -1) return true;
    }
    return false;
}
