/**
 * FeedUtils.gs
 * Feed parsing helpers. Accepts RSS/Atom XML or HTML (with discovery links)
 * and returns normalized item objects suitable for analysis and sheet rows.
 * @param {string} xmlText Response body (may be HTML)
 * @param {string} feedUrl The requested feed URL (used for discovery heuristics)
 * @return {Array<FeedItem>} items
 */
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