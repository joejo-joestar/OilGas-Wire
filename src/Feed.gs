/**
 * Feed.gs
 *
 * Fetch RSS/Atom feeds, filter by category-specific queries, and store items into
 * separate tabs in a Google Sheet. Configure categories below.
 */


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
