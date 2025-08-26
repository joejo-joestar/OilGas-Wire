/**
 * Feed.gs
 *
 * Fetch RSS/Atom feeds, filter by category-specific queries, and store items into
 * separate tabs in a Google Sheet. Configure categories below.
 */

var SHEET_ID = null;

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

function fetchAndStoreAll() {
    // Resolve SHEET_ID from Project Properties (getSheetId will throw if missing)
    var sheetId = getSheetId();

    CONFIG.forEach(function (cat) {
        try {
            fetchCategory(cat, sheetId);
        } catch (e) {
            Logger.log('Error fetching category %s: %s', cat.category, e.message);
        }
    });
}

function fetchCategory(cat, sheetId) {
    // Accept sheetId passed in (preferred) or fall back to global SHEET_ID for compatibility
    var idToUse = sheetId || SHEET_ID || getSheetId();
    var ss = SpreadsheetApp.openById(idToUse);
    var sheet = ss.getSheetByName(cat.sheetName) || ss.insertSheet(cat.sheetName);

    // Ensure headers
    ensureHeaders(sheet, cat.headers);

    // Load existing links and headlines to dedupe
    var existing = getExistingKeys(sheet, cat.headers);

    // Collect rows along with their parsed date so we can insert newest-first
    var newRowsObjs = [];

    // Build effective feed list: include configured feeds plus Google News per-query feeds if present
    var feedUrls = (cat.feeds || []).slice();
    if (cat.googleNewsQueries && cat.googleNewsQueries.length) {
        cat.googleNewsQueries.forEach(function (q) {
            var encoded = encodeURIComponent(q);
            feedUrls.push('https://news.google.com/rss/search?q=' + encoded + '&hl=en-US&gl=US&ceid=US:en');
        });
    }

    feedUrls.forEach(function (feedUrl) {
        try {
            var resp = UrlFetchApp.fetch(feedUrl, FETCH_OPTIONS);
            var xml = resp.getContentText();
            if (resp.getResponseCode() === 401 || resp.getResponseCode() === 403) {
                Logger.log('Failed to fetch %s: HTTP %s (site likely blocks automated requests)', feedUrl, resp.getResponseCode());
            }
            var items = parseFeed(xml, feedUrl);
            items.forEach(function (item) {
                // enforce cutoff year: skip items without a parsable date or older than MIN_YEAR
                var itemYear = getItemYear(item);
                if (!itemYear || itemYear < MIN_YEAR) return;

                var normTitle = normalizeTitle(item.title || '');
                var linkVal = item.link || '';
                if (matchesQueries(item, cat.queries) && !existing.links[linkVal] && !existing.titles[normTitle]) {
                    // enrich item with analyzed fields for better column population
                    item.analysis = analyzeItem(item);
                    var row = buildRowForCategory(item, cat);
                    var parsedDate = null;
                    try { parsedDate = item.pubDate ? new Date(item.pubDate) : null; } catch (e) { parsedDate = null; }
                    newRowsObjs.push({ row: row, date: parsedDate || new Date(0) });
                    // mark dedupe keys
                    if (linkVal) existing.links[linkVal] = true;
                    if (normTitle) existing.titles[normTitle] = true;
                }
            });
        } catch (e) {
            Logger.log('Failed to fetch or parse %s: %s', feedUrl, e.message);
        }
    });

    if (newRowsObjs.length > 0) {
        // Sort by date descending (newest first) then insert at the top (row 2) so newest appears first
        newRowsObjs.sort(function (a, b) { return b.date - a.date; });
        var rows = newRowsObjs.map(function (o) { return o.row; });
        try {
            // Ensure there's space and insert rows below the header
            sheet.insertRows(2, rows.length);
        } catch (e) {
            // insertRows may fail on some sheet protections; fall back to appending then sorting
            sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
            Logger.log('Fallback appended %s rows to %s (insert at top failed): %s', rows.length, cat.sheetName, e.message);
            // attempt to sort afterwards
            try { sortSheetByDate(sheet, cat.headers); } catch (e2) { Logger.log('Sort fallback failed: %s', e2.message); }
            return;
        }
        // Write the rows into the newly inserted area
        sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
        Logger.log('Inserted %s new rows at top of %s', rows.length, cat.sheetName);
    } else {
        Logger.log('No new rows for %s', cat.sheetName);
    }
    // Ensure sheet is sorted newest-first by the Date column after updating
    try {
        sortSheetByDate(sheet, cat.headers);
    } catch (e) {
        Logger.log('Unable to sort sheet %s by date: %s', cat.sheetName, e.message);
    }
}

// Ensure header row exists and matches provided headers
function ensureHeaders(sheet, headers) {
    var firstRow = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    var needRewrite = false;
    // If sheet is empty or headers don't match, set headers
    if (sheet.getLastRow() === 0) needRewrite = true;
    if (!needRewrite) {
        for (var i = 0; i < headers.length; i++) {
            if (firstRow[i] !== headers[i]) {
                needRewrite = true;
                break;
            }
        }
    }

    if (needRewrite) {
        sheet.clear();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
}

// Build a row matching category headers. Basic mapping; fields not available are left blank.
function buildRowForCategory(item, cat) {
    var h = cat.headers;
    var row = [];
    for (var i = 0; i < h.length; i++) {
        var col = h[i].toLowerCase();
        if (col.indexOf('date') !== -1) {
            row.push(item.pubDate ? new Date(item.pubDate) : '');
        } else if (col.indexOf('headline') !== -1 || col.indexOf('title') !== -1) {
            row.push(item.title || '');
        } else if (col.indexOf('article') !== -1 || col === 'article' || col.indexOf('snippet') !== -1) {
            // prefer summary, fallback to content; strip simple HTML and truncate for readability
            var raw = item.summary || item.content || '';
            var clean = (raw || '').toString().replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            row.push(truncateText(clean, ARTICLE_SNIPPET_MAX));
        } else if (col === 'link') {
            row.push(item.link || '');
        } else if (col === 'source') {
            row.push(item.source || '');
        } else {
            // Unknown column: attempt to infer from keywords in title/summary
            // Prefer structured analysis results if available
            var val = '';
            if (item.analysis) {
                if (col.indexOf('company') !== -1 || col.indexOf('companies') !== -1) val = item.analysis.company || '';
                else if (col.indexOf('deal') !== -1 || col.indexOf('type') !== -1) val = item.analysis.dealType || '';
                else if (col.indexOf('value') !== -1) val = item.analysis.dealValue || '';
                else if (col.indexOf('region') !== -1) val = item.analysis.region || '';
                else if (col.indexOf('commodity') !== -1) val = item.analysis.commodity || '';
                else if (col.toLowerCase().indexOf('price') !== -1) val = item.analysis.priceInfo || '';
            }
            if (!val) val = inferFieldFromItem(col, item);
            row.push(val);
        }
    }
    return row;
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

// Parse RSS or Atom XML and return array of items {title, link, pubDate, summary, content, source}
function parseFeed(xmlText, feedUrl) {
    var items = [];

    // Helper: detect if text looks like XML feed
    function looksLikeFeed(txt) {
        if (!txt) return false;
        var t = txt.toLowerCase();
        return t.indexOf('<rss') !== -1 || t.indexOf('<feed') !== -1 || t.indexOf('<rdf:rdf') !== -1 || t.indexOf('<?xml') !== -1;
    }

    // Helper: try to find feed link in HTML (link rel alternate type application/rss+xml or atom+xml)
    function findFeedUrlInHtml(html, baseUrl) {
        try {
            var re = /<link[^>]+type=["'](?:application\/rss\+xml|application\/atom\+xml|application\/rdf\+xml|text\/xml)["'][^>]*href=["']([^"']+)["']/ig;
            var m;
            while ((m = re.exec(html)) !== null) {
                if (m[1]) return resolveUrl(baseUrl, m[1]);
            }
            // fallback: look for <a ...>rss</a>
            var re2 = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*(?:rss|feed)\s*<\//i;
            var m2 = re2.exec(html);
            if (m2 && m2[1]) return resolveUrl(baseUrl, m2[1]);
        } catch (e) {
            // ignore
        }
        return null;
    }

    // Resolve relative URLs against base
    function resolveUrl(base, relative) {
        if (!relative) return relative;
        if (relative.indexOf('http') === 0) return relative;
        if (!base) return relative;
        // simple join
        try {
            var baseNoQuery = base.split('?')[0];
            if (relative.charAt(0) === '/') {
                var m = baseNoQuery.match(/^(https?:\/\/[^\/]+)/);
                return (m ? m[1] : baseNoQuery) + relative;
            }
            // otherwise append
            return baseNoQuery.replace(/\/[^\/]*$/, '/') + relative;
        } catch (e) {
            return relative;
        }
    }

    // Try to ensure xmlText contains the feed. If it's HTML, attempt to find embedded feed link.
    try {
        if (!looksLikeFeed(xmlText)) {
            // try to find feed link inside HTML
            var found = findFeedUrlInHtml(xmlText, feedUrl);
            if (found) {
                try {
                    var foundResp = UrlFetchApp.fetch(found, FETCH_OPTIONS);
                    xmlText = foundResp.getContentText();
                    if (foundResp.getResponseCode() === 401 || foundResp.getResponseCode() === 403) {
                        Logger.log('parseFeed error: discovered feed %s returned HTTP %s', found, foundResp.getResponseCode());
                        return items;
                    }
                } catch (e) {
                    Logger.log('parseFeed error: failed fetching discovered feed URL %s : %s', found, e.message);
                    return items;
                }
            } else {
                // try to extract the XML fragment starting at <rss or <feed
                var startIdx = Math.max(xmlText.toLowerCase().indexOf('<rss'), xmlText.toLowerCase().indexOf('<feed'), xmlText.toLowerCase().indexOf('<rdf:rdf'));
                if (startIdx > 0) {
                    xmlText = xmlText.substring(startIdx);
                } else {
                    Logger.log('parseFeed error: response is not a feed and no feed link found for %s', feedUrl);
                    return items;
                }
            }
        }

        // (only minimal sanitization)
        xmlText = xmlText.replace(/\uFFFE|\uFEFF/g, '');

        var doc = XmlService.parse(xmlText);
        var root = doc.getRootElement();
        var ns = root.getNamespace();
        var name = root.getName().toLowerCase();

        if (name === 'rss') {
            var channel = root.getChild('channel', ns) || root.getChild('channel');
            if (!channel) return items;
            var chTitle = channel.getChildText('title') || '';
            var rssItems = channel.getChildren('item');
            rssItems.forEach(function (it) {
                var content = it.getChildText('content:encoded') || it.getChildText('description') || '';
                var link = it.getChildText('link') || '';
                if (!link) {
                    var guid = it.getChildText('guid');
                    if (guid && guid.indexOf('http') === 0) link = guid;
                }
                // Prefer <source> child if present (Google News provides this), otherwise use channel title
                var itemSource = it.getChildText('source', ns) || it.getChildText('source') || chTitle;
                var newItem = {
                    title: it.getChildText('title') || '',
                    link: link || '',
                    pubDate: it.getChildText('pubDate') || '',
                    summary: it.getChildText('description') || '',
                    content: content,
                    source: itemSource,
                    feedUrl: feedUrl
                };
                // normalize HTML-in-title or site-specific HTML snippets
                newItem = normalizeItemHtmlFields(newItem) || newItem;
                items.push(newItem);
                // if this is a Google News RSS item, titles are "{headline} - {source}"; extract source
                if (feedUrl && feedUrl.indexOf('news.google.com') !== -1) {
                    var last = items[items.length - 1];
                    parseGoogleTitle(last);
                    // if parseGoogleTitle left HTML fragments, normalize again
                    last = normalizeItemHtmlFields(last) || last;
                    // attempt to resolve Google News redirect link to publisher URL
                    try { last.link = resolveGoogleNewsLink(last.link || last.feedUrl); } catch (e) { }
                    // If there's no snippet/summary, duplicate the cleaned headline for readability
                    if ((!last.summary || !last.summary.toString().trim()) && last.title) {
                        last.summary = truncateText(humanizeHeadline(last.title), ARTICLE_SNIPPET_MAX);
                    }
                }
            });
        } else if (name === 'feed') {
            var feedTitle = root.getChildText('title', ns) || '';
            var entries = root.getChildren('entry', ns);
            entries.forEach(function (ent) {
                var link = '';
                try {
                    var linkEl = ent.getChild('link', ns);
                    if (linkEl) {
                        var href = linkEl.getAttribute('href');
                        if (href) link = href.getValue();
                    }
                } catch (e) { }
                var content = ent.getChildText('content', ns) || ent.getChildText('summary', ns) || '';
                // Prefer <source> element within entry if present
                var entrySource = ent.getChildText('source', ns) || ent.getChildText('source') || feedTitle;
                var newEnt = {
                    title: ent.getChildText('title', ns) || '',
                    link: link || ent.getChildText('link', ns) || '',
                    pubDate: ent.getChildText('updated', ns) || ent.getChildText('published', ns) || '',
                    summary: ent.getChildText('summary', ns) || '',
                    content: content,
                    source: entrySource,
                    feedUrl: feedUrl
                };
                newEnt = normalizeItemHtmlFields(newEnt) || newEnt;
                items.push(newEnt);
                if (feedUrl && feedUrl.indexOf('news.google.com') !== -1) {
                    var last2 = items[items.length - 1];
                    parseGoogleTitle(last2);
                    last2 = normalizeItemHtmlFields(last2) || last2;
                    try { last2.link = resolveGoogleNewsLink(last2.link || last2.feedUrl); } catch (e) { }
                    if ((!last2.summary || !last2.summary.toString().trim()) && last2.title) {
                        last2.summary = truncateText(humanizeHeadline(last2.title), ARTICLE_SNIPPET_MAX);
                    }
                }
            });
        } else {
            Logger.log('parseFeed error: unknown root element %s for %s', name, feedUrl);
        }
    } catch (e) {
        Logger.log('parseFeed error: %s', e.message);
    }

    return items;
}

function getExistingKeys(sheet, headers) {
    var res = { links: {}, titles: {} };
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return res;
    var headerCount = headers.length;
    // read link column (assumed last) and title column (assumed 2nd)
    var links = sheet.getRange(2, headerCount, lastRow - 1, 1).getValues();
    var titles = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    for (var i = 0; i < links.length; i++) {
        var l = links[i][0];
        if (l) res.links[l] = true;
    }
    for (var j = 0; j < titles.length; j++) {
        var t = titles[j][0];
        if (t) res.titles[normalizeTitle(t)] = true;
    }
    return res;
}

function normalizeTitle(t) {
    return (t || '').toString().trim().toLowerCase().replace(/\s+/g, ' ').replace(/["'’`\-–—:;,.()]/g, '');
}

// Sort the sheet by the Date column (newest first). Expects headers array so we can
// determine which column contains the date. If no Date column is present, no-op.
function sortSheetByDate(sheet, headers) {
    if (!sheet || !headers || headers.length === 0) return;
    // find index of the first header that contains 'date' (case-insensitive)
    var dateCol = -1;
    for (var i = 0; i < headers.length; i++) {
        if ((headers[i] || '').toString().toLowerCase().indexOf('date') !== -1) { dateCol = i + 1; break; }
    }
    if (dateCol === -1) return; // nothing to sort by

    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), headers.length);
    // nothing to sort if only header or empty
    if (lastRow <= 1) return;

    try {
        // Range.sort expects 1-based column index relative to the sheet
        // Sort descending (newest first)
        sheet.getRange(2, 1, lastRow - 1, lastCol).sort({ column: dateCol, ascending: false });
    } catch (e) {
        // As a fallback, try the sheet-level sort method
        try {
            sheet.sort(dateCol, false);
        } catch (e2) {
            throw new Error('Unable to sort sheet by date: ' + e2.message);
        }
    }
}

function getItemYear(item) {
    if (!item) return null;
    var dateStr = item.pubDate || item.pubdate || item.updated || item.published || '';
    if (!dateStr) return null;
    // If it's already a Date object
    if (Object.prototype.toString.call(dateStr) === '[object Date]') {
        return dateStr.getFullYear();
    }
    // Try Date.parse (handles RFC2822 and ISO formats)
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getFullYear();

    // Fallback: look for 4-digit year
    var m = dateStr.match(/(20\d{2})/);
    if (m && m[1]) return parseInt(m[1], 10);
    return null;
}

// Diagnostic: fetch each configured feed and log response metadata + sample content
function fetchFeedDiagnostics() {
    CONFIG.forEach(function (cat) {
        cat.feeds.forEach(function (feedUrl) {
            try {
                var resp = UrlFetchApp.fetch(feedUrl, FETCH_OPTIONS);
                var code = resp.getResponseCode();
                var ct = resp.getHeaders()['Content-Type'] || resp.getHeaders()['content-type'] || '';
                var text = resp.getContentText();
                var snippet = text ? text.substring(0, 4096) : '';
                var looks = (text || '').toLowerCase().indexOf('<rss') !== -1 || (text || '').toLowerCase().indexOf('<feed') !== -1;
                Logger.log('DIAG %s -> code:%s content-type:%s looksLikeFeed:%s url:%s', cat.sheetName, code, ct, looks, feedUrl);
                if (!looks) Logger.log('DIAG SNIPPET %s: %s', feedUrl, snippet.replace(/\n/g, ' ').substring(0, 800));
            } catch (e) {
                Logger.log('DIAG ERROR fetching %s : %s', feedUrl, e.message);
            }
        });
    });
}
