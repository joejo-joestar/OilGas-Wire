/**
 * Feed.gs
 *
 * Fetch RSS/Atom feeds, filter by category-specific queries, and store items into
 * separate tabs in a Google Sheet. Configure categories below.
 */

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
        res.region = regGuess;
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
