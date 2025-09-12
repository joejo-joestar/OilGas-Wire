/**
 * AutoMailer.gs
 * Utilities to build and send a daily newsletter from the sheet.
 */

/**
 * Build the newsletter HTML for a given date range and list of items.
 * Uses `Newsletter_Mail.html` as the template in the project.
 * @param {{items: Array, dateRangeText: string}} data
 * @return {string} rendered HTML
 */
function renderNewsletterHtml(data) {
    var tpl = HtmlService.createTemplateFromFile('Newsletter_Mail');
    tpl.items = data.items || [];
    tpl.sections = data.sections || [];
    tpl.dateRangeText = data.dateRangeText || '';
    tpl.fullNewsletterUrl = data.fullNewsletterUrl || '';
    tpl.feedSheetUrl = data.feedSheetUrl || ('https://docs.google.com/spreadsheets/d/' + getSheetId() + '/');
    tpl.nid = data.nid || '';
    return tpl.evaluate().getContent();
}

/**
 * Render web-specific newsletter HTML (separate template with search & web-friendly layout)
 */
function renderNewsletterWebHtml(data) {
    var tpl = HtmlService.createTemplateFromFile('Newsletter_Web');
    tpl.sections = data.sections || [];
    tpl.dateRangeText = data.dateRangeText || '';
    // Build a signed feedSheetUrl for web footer clicks so clicks can be verified and logged server-side.
    var rawFeedSheetUrl = data.feedSheetUrl || ('https://docs.google.com/spreadsheets/d/' + getSheetId() + '/');
    tpl.feedSheetUrl = rawFeedSheetUrl;
    try {
        if (rawFeedSheetUrl && /^https?:\/\//i.test(rawFeedSheetUrl)) {
            var nid_for_web = data.nid || '';
            var src_web = 'web';
            var eventDetail_web = 'web_sheet_click';
            var sigBase_web = (nid_for_web || '') + '|' + '' + '|' + (rawFeedSheetUrl || '') + '|' + src_web + '|' + eventDetail_web;
            var sig_web = '';
            try { sig_web = computeHmacHex(sigBase_web); } catch (e) { sig_web = ''; }
            var sep_fs = rawFeedSheetUrl.indexOf('?') === -1 ? '?' : '&';
            tpl.feedSheetUrl = rawFeedSheetUrl + sep_fs + 'nid=' + encodeURIComponent(nid_for_web) + '&rid=&src=' + encodeURIComponent(src_web) + '&eventDetail=' + encodeURIComponent(eventDetail_web) + (sig_web ? '&sig=' + encodeURIComponent(sig_web) : '');
        }
    } catch (e) {}
    tpl.nid = data.nid || '';
    // provide deployed webapp URL to the template so client JS can call the JSON API reliably
    try { tpl.webappUrl = data.webappUrl || PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || ''; } catch (e) { tpl.webappUrl = data.webappUrl || ''; }
    // evaluate() returns an HtmlOutput; getContent() returns a string.
    // Return the HTML string here. The caller (doGet) will wrap it into an HtmlOutput
    // and can call setTitle() there.
    return tpl.evaluate().getContent();
}

/**
 * Template include helper — returns the raw content of a file so it can be injected into templates.
 * Usage inside templates: <?!= include('Styles_Common') ?>
 */
function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Build visible sections for a specific date (dateStr in 'yyyy-MM-dd') or for previous day when omitted.
 * Returns an array of sections suitable for `renderNewsletterHtml`.
 */
function buildVisibleSectionsForDate(dateStr) {
    var sheetId = getSheetId();
    var ss = SpreadsheetApp.openById(sheetId);

    var target;
    if (dateStr) {
        // expect yyyy-MM-dd
        var parts = (dateStr || '').toString().split('-');
        if (parts.length === 3) {
            target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }
    }
    if (!target) {
        var now = new Date();
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); // previous day
    }

    var dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    var sections = [];
    for (var ci = 0; ci < CONFIG.length; ci++) {
        var cfg = CONFIG[ci];
        var tab = cfg.sheetName || cfg.category;
        var sheet = ss.getSheetByName(tab);
        var sec = { title: cfg.category || tab, items: [] };
        if (!sheet) { sections.push(sec); continue; }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var rows = sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), sheet.getLastColumn()).getValues();

        function findHeaderIndex(prefixes) {
            prefixes = prefixes || [];
            for (var i = 0; i < headers.length; i++) {
                var h = (headers[i] || '').toString().toLowerCase();
                for (var j = 0; j < prefixes.length; j++) {
                    if (h.indexOf(prefixes[j]) !== -1) return i;
                }
            }
            return -1;
        }

        var dateCol = findHeaderIndex(['date']);
        var titleCol = findHeaderIndex(['headline', 'title']);
        var linkCol = findHeaderIndex(['link']);
        var sourceCol = findHeaderIndex(['source']);
        var snippetCol = findHeaderIndex(['snippet', 'summary']);
        var commodityCol = findHeaderIndex(['commodity']);
        var priceCol = findHeaderIndex(['price', 'value']);

        var linkFormulas = null;
        if (linkCol >= 0 && rows.length) {
            try { linkFormulas = sheet.getRange(2, linkCol + 1, rows.length, 1).getFormulas(); } catch (e) { linkFormulas = null; }
        }

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var dateVal = dateCol >= 0 ? row[dateCol] : null;
            var pubDate = null;
            if (dateVal instanceof Date) pubDate = dateVal;
            else if (dateVal) {
                var d = new Date(dateVal);
                if (!isNaN(d.getTime())) pubDate = d;
            }
            if (!pubDate) continue;
            if (pubDate >= dayStart && pubDate < dayEnd) {
                var rawLinkCell = '';
                if (linkFormulas && linkFormulas[r] && linkFormulas[r][0]) rawLinkCell = linkFormulas[r][0];
                else if (linkCol >= 0) rawLinkCell = row[linkCol] || '';

                var finalUrl = '';
                if (rawLinkCell) {
                    var fm = rawLinkCell.toString().match(/(?:^=)?HYPERLINK\(\s*"([^\"]+)"/i);
                    if (!fm) fm = rawLinkCell.toString().match(/HYPERLINK\(\s*'([^']+)'/i);
                    if (fm && fm[1]) finalUrl = fm[1];
                    else if (/^https?:\/\//i.test(rawLinkCell.toString())) finalUrl = rawLinkCell.toString();
                    else finalUrl = '';
                }

                sec.items.push({
                    pubDate: pubDate,
                    pubDateStr: Utilities.formatDate(pubDate, Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy HH:mm'),
                    headline: titleCol >= 0 ? row[titleCol] : (row[1] || ''),
                    link: finalUrl || (linkCol >= 0 ? (row[linkCol] || '') : ''),
                    source: sourceCol >= 0 ? (row[sourceCol] || '') : '',
                    snippet: snippetCol >= 0 ? (row[snippetCol] || '') : '',
                    commodity: commodityCol >= 0 ? (row[commodityCol] || '') : '',
                    price: priceCol >= 0 ? (row[priceCol] || '') : ''
                });
            }
        }
        sections.push(sec);
    }

    // return only sections that have items
    return sections.filter(function (s) { return s && s.items && s.items.length; });
}

/**
 * Web app GET handler — renders the previous day's newsletter HTML.
 */
function doGet(e) {
    // Route analytics endpoints when `analytics` parameter is present.
    // Supported: ?analytics=open (pixel), ?analytics=r (redirect), ?analytics=ping (simple GET track)
    if (e && e.parameter && e.parameter.analytics) {
        try {
            return handleAnalyticsGet(e);
        } catch (err) {
            // fall through to normal rendering on error
            Logger.log('Analytics handler error: ' + (err && err.message));
        }
    }
    // Debug helper: ?debug=1 returns a small diagnostic page showing client UA and server headers
    if (e && e.parameter && (e.parameter.debug === '1' || e.parameter.debug === 'true')) {
        try {
            var hdrs = (e && e.headers) ? JSON.stringify(e.headers, null, 2) : 'no headers available';
            var dbgHtml = '<!doctype html><html><head><meta charset="utf-8"><title>Webapp Debug</title></head><body>' +
                '<h2>Webapp Debug</h2>' +
                '<p>Open this page in the browser that fails (Firefox) and copy the contents below or take a screenshot.</p>' +
                '<h3>Client-side navigator.userAgent</h3><pre id="ua">(loading...)</pre>' +
                '<h3>Server-side headers (as seen by the webapp)</h3><pre>' + hdrs + '</pre>' +
                '<h3>Console</h3><pre id="console"></pre>' +
                '<script>try{document.getElementById("ua").textContent=navigator.userAgent;}catch(e){document.getElementById("ua").textContent="(error)"+e;}console.log("Webapp debug loaded");</script>' +
                '</body></html>';
            return HtmlService.createHtmlOutput(dbgHtml).setTitle('Webapp Debug').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
        } catch (err) { /* fall through to normal rendering on error */ }
    }
    // If preview UI requested, serve the small preview page (date picker + preview area)
    var isPreview = e && e.parameter && (e.parameter.preview === '1' || e.parameter.preview === 'true');
    if (isPreview) {
        return HtmlService.createHtmlOutputFromFile('Web_Preview').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('Newsletter Preview');
    }

    var dateParam = (e && e.parameter && e.parameter.date) ? e.parameter.date : null;
    // If the webapp was opened via a signed CTA link from email, verify the signature
    // and log a mail_web_click event server-side. Expected query params appended by
    // the mailer: rid=<hex>, src=<source>, eventDetail=<detail>, sig=<hmac>
    try {
        if (e && e.parameter && e.parameter.rid && e.parameter.sig) {
            try {
                var q = e.parameter;
                var rid_q = (q.rid || '').toString();
                var src_q = (q.src || 'mail').toString();
                var eventDetail_q = (q.eventDetail || q.detail || 'mail_web_click').toString();
                var nid_q = (q.nid || '') || '';
                // Reconstruct the target URL that the mailer signed: WEBAPP_URL with ?date=...
                var fullUrl = '';
                try {
                    var base = (PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '').toString();
                    if (base) {
                        var datep = (e.parameter.date || '');
                        var sep = base.indexOf('?') === -1 ? '?' : '&';
                        fullUrl = base + (datep ? (sep + 'date=' + encodeURIComponent(datep)) : '');
                    }
                } catch (ee) { fullUrl = ''; }
                var sigBase = (nid_q || '') + '|' + (rid_q || '') + '|' + (fullUrl || '') + '|' + (src_q || '') + '|' + (eventDetail_q || '');
                var sigOk = false;
                try { sigOk = verifyHmacHex(sigBase, (e.parameter.sig || '').toString()); } catch (ve) { sigOk = false; }
                if (sigOk) {
                    try {
                        var target = resolveAnalyticsTarget(nid_q);
                        var evt = { timestamp: new Date(), eventType: 'click', eventDetail: eventDetail_q || 'mail_web_click', nid: nid_q || '', recipientHash: rid_q, src: src_q || 'mail', url: fullUrl || '', ua: (e && e.headers && (e.headers['User-Agent'] || e.headers['user-agent'])) || '', referer: (e && e.parameter && e.parameter.r) || '' };
                        logAnalyticsEvent(target.spreadsheetId, evt);
                    } catch (le) { /* ignore logging errors */ }
                }
            } catch (err) { /* ignore verification errors */ }
        }
    } catch (err) { /* best-effort only */ }
    var sections = [];
    try { sections = buildVisibleSectionsForDate(dateParam); } catch (err) {
        var tplErr = HtmlService.createHtmlOutput('<p>Error building newsletter preview: ' + (err && err.message) + '</p>');
        return tplErr;
    }
    var targetDate = dateParam || Utilities.formatDate(new Date(new Date().getTime() - 24 * 60 * 60 * 1000), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    var drText = Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');
    // For web requests, render the web-specific template (includes search UI)
    var sheetId = getSheetId();
    var feedSheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/';
    var nid = 'newsletter-' + Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    var html = renderNewsletterWebHtml({ sections: sections, dateRangeText: drText, feedSheetUrl: feedSheetUrl, nid: nid });
    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('Business Excellence Newsletter');
}

/**
 * Returns rendered newsletter HTML for the given date (yyyy-MM-dd). Used by the preview UI.
 */
function getNewsletterHtml(dateStr) {
    var sections = buildVisibleSectionsForDate(dateStr);
    var dateObj = null;
    if (dateStr) {
        var parts = dateStr.toString().split('-');
        if (parts.length === 3) dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    if (!dateObj) dateObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
    var drText = Utilities.formatDate(dateObj, Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');
    return renderNewsletterHtml({ sections: sections, dateRangeText: drText });
}

/**
 * Send a daily newsletter email containing rows from the sheet for the previous day.
 * If today is 2025-08-27, we'll include up to the start of 2025-08-26 (previous day)
 * and exclude anything earlier than the day-before-previous (so only the previous day's rows).
 *
 * Configuration: set SEND_TO (comma-separated addresses) and SHEET_NAME (sheet tab) in script properties.
 */
function sendDailyNewsletter() {
    var props = PropertiesService.getScriptProperties();
    var sendTo = (props.getProperty('SEND_TO') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    // TEST_RECIPIENT (script property) — when set, override sendTo and send only to this address
    var testRecipient = (props.getProperty('TEST_RECIPIENT') || '').trim();
    if (testRecipient) {
        sendTo = [testRecipient];
        Logger.log('TEST_RECIPIENT set — overriding SEND_TO and sending only to: ' + testRecipient);
    }
    if (!sendTo.length) throw new Error('Please set SEND_TO in Project Properties (comma-separated emails) or TEST_RECIPIENT for testing');
    var sheetId = getSheetId();
    var ss = SpreadsheetApp.openById(sheetId);

    // We'll build a sections array, one per CONFIG entry.
    var sections = [];

    // Determine date range: previous day only
    var now = new Date();
    // zero time for today
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var prevDayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000); // start of previous day
    var prevDayEnd = today; // exclusive

    // header lookup is done per-sheet inside the CONFIG iteration

    // iterate CONFIG categories; read each CONFIG[i].sheetName tab and collect matching rows
    for (var ci = 0; ci < CONFIG.length; ci++) {
        var cfg = CONFIG[ci];
        var tab = cfg.sheetName || cfg.category;
        var sheet = ss.getSheetByName(tab);
        var sec = { title: cfg.category || tab, items: [] };
        if (!sheet) { sections.push(sec); continue; }
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var rows = sheet.getRange(2, 1, Math.max(0, sheet.getLastRow() - 1), sheet.getLastColumn()).getValues();

        function findHeaderIndex(prefixes) {
            prefixes = prefixes || [];
            for (var i = 0; i < headers.length; i++) {
                var h = (headers[i] || '').toString().toLowerCase();
                for (var j = 0; j < prefixes.length; j++) {
                    if (h.indexOf(prefixes[j]) !== -1) return i;
                }
            }
            return -1;
        }

        var dateCol = findHeaderIndex(['date']);
        var titleCol = findHeaderIndex(['headline', 'title']);
        var linkCol = findHeaderIndex(['link']);
        var sourceCol = findHeaderIndex(['source']);
        var snippetCol = findHeaderIndex(['snippet', 'summary']);
        var commodityCol = findHeaderIndex(['commodity']);
        var priceCol = findHeaderIndex(['price', 'value']);

        // Pre-read formulas for the link column so we can extract actual URLs from HYPERLINK formulas.
        var linkFormulas = null;
        if (linkCol >= 0 && rows.length) {
            try {
                linkFormulas = sheet.getRange(2, linkCol + 1, rows.length, 1).getFormulas();
            } catch (e) {
                linkFormulas = null;
            }
        }

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var dateVal = dateCol >= 0 ? row[dateCol] : null;
            var pubDate = null;
            if (dateVal instanceof Date) pubDate = dateVal;
            else if (dateVal) {
                var d = new Date(dateVal);
                if (!isNaN(d.getTime())) pubDate = d;
            }
            if (!pubDate) continue;
            if (pubDate >= prevDayStart && pubDate < prevDayEnd) {
                // Determine URL: prefer HYPERLINK formula extraction, fall back to cell value
                var rawLinkCell = '';
                if (linkFormulas && linkFormulas[r] && linkFormulas[r][0]) rawLinkCell = linkFormulas[r][0];
                else if (linkCol >= 0) rawLinkCell = row[linkCol] || '';

                var finalUrl = '';
                if (rawLinkCell) {
                    // If it's a HYPERLINK formula, extract the URL inside it
                    var fm = rawLinkCell.toString().match(/(?:^=)?HYPERLINK\(\s*"([^"]+)"/i);
                    if (!fm) fm = rawLinkCell.toString().match(/HYPERLINK\(\s*'([^']+)'/i);
                    if (fm && fm[1]) finalUrl = fm[1];
                    else if (/^https?:\/\//i.test(rawLinkCell.toString())) finalUrl = rawLinkCell.toString();
                    else finalUrl = '';
                }

                sec.items.push({
                    pubDate: pubDate,
                    pubDateStr: Utilities.formatDate(pubDate, Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy HH:mm'),
                    headline: titleCol >= 0 ? row[titleCol] : (row[1] || ''),
                    link: finalUrl || (linkCol >= 0 ? (row[linkCol] || '') : ''),
                    source: sourceCol >= 0 ? (row[sourceCol] || '') : '',
                    snippet: snippetCol >= 0 ? (row[snippetCol] || '') : '',
                    commodity: commodityCol >= 0 ? (row[commodityCol] || '') : '',
                    price: priceCol >= 0 ? (row[priceCol] || '') : ''
                });
            }
        }
        sections.push(sec);
    }

    // Build date range text for header
    var drText = Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');

    // Remove sections that have no items so they don't appear in the newsletter
    var visibleSections = sections.filter(function (s) { return s && s.items && s.items.length; });

    // Render full newsletter HTML for web (keep original links)
    var feedSheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/';
    var nid = 'newsletter-' + Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    var fullHtml = renderNewsletterHtml({ sections: visibleSections, dateRangeText: drText, feedSheetUrl: feedSheetUrl, nid: nid });

    // Drive publishing removed — we don't create Drive files for the newsletter anymore.
    // Keep fullNewsletterUrl empty by default; it can be overridden by WEBAPP_URL below.
    var fullNewsletterUrl = '';

    // If a WEBAPP_URL is configured in script properties, prefer that as the full newsletter link.
    // The URL may include a literal `{date}` placeholder which will be replaced with yyyy-MM-dd,
    // otherwise the date will be appended as ?date=yyyy-MM-dd or &date=yyyy-MM-dd depending on the URL.
    try {
        var webappUrl = (props.getProperty('WEBAPP_URL') || '').toString().trim();
        if (webappUrl) {
            var dateParam = Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
            var webappUrlWithDate = webappUrl.indexOf('{date}') !== -1 ? webappUrl.replace('{date}', dateParam) : (
                webappUrl.indexOf('?') === -1 ? (webappUrl + '?date=' + dateParam) : (webappUrl + '&date=' + dateParam)
            );
            fullNewsletterUrl = webappUrlWithDate;
        }
    } catch (e) { /* ignore errors formatting webapp url */ }

    // Create a truncated preview for the email to avoid clipping in mail clients
    var maxPerSection = parseInt(props.getProperty('MAX_ITEMS_PER_SECTION') || '6', 10);
    var truncatedSections = visibleSections.map(function (sec) {
        var shown = sec.items.slice(0, maxPerSection);
        var remaining = Math.max(0, sec.items.length - shown.length);
        return { title: sec.title, items: shown, more: remaining };
    });

    // Also include a small overall remaining count if useful
    var totalRemaining = visibleSections.reduce(function (acc, s, idx) { return acc + Math.max(0, s.items.length - (truncatedSections[idx] ? truncatedSections[idx].items.length : 0)); }, 0);

    // Build a newsletter id used by analytics (one per newsletter/date)
    var nid = 'newsletter-' + Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');

    // Create deep copies for email rendering so web/fullHtml keeps original links
    var emailTruncatedSections = JSON.parse(JSON.stringify(truncatedSections));
    var emailVisibleSections = JSON.parse(JSON.stringify(visibleSections));
    // Do not overwrite headline hrefs in the email (avoid wrapping primary link). Instead create a separate trackedLink
    try {
        function attachPreviewTrackedLinks(secs) {
            for (var si = 0; si < secs.length; si++) {
                var s = secs[si];
                if (!s || !s.items) continue;
                for (var ii = 0; ii < s.items.length; ii++) {
                    var it = s.items[ii];
                    try {
                        if (it && it.link && /^https?:\/\//i.test(it.link)) {
                            // preview uses empty rid (unsigned) so analytics redirect may be unsigned; best-effort preview
                            try { it.trackedLink = buildAnalyticsRedirectUrl(it.link, nid, '', 'mail', 'mail_headline_click'); } catch (e) { it.trackedLink = it.link; }
                        }
                    } catch (e) { /* ignore per-item errors */ }
                }
            }
        }
        attachPreviewTrackedLinks(emailTruncatedSections);
        attachPreviewTrackedLinks(emailVisibleSections);
    } catch (e) { /* fail-safe: keep original links */ }

    var truncatedHtml = renderNewsletterHtml({ sections: emailTruncatedSections, dateRangeText: drText, fullNewsletterUrl: fullNewsletterUrl });
    // Append a tracking pixel (best-effort). buildAnalyticsPixelUrl requires WEBAPP_URL in script properties.
    try {
        var pixelUrl = buildAnalyticsPixelUrl(nid, '');
        truncatedHtml += '<img src="' + pixelUrl + '" width="1" height="1" alt="" style="display:none;max-height:1px;max-width:1px;">';
    } catch (e) { /* ignore when WEBAPP_URL not configured */ }

    var subject = 'Business Excellence Newsletter - ' + drText;
    var bodyPlain = truncatedSections.map(function (sec) {
        var lines = [sec.title];
        sec.items.forEach(function (it) { lines.push('- ' + (it.headline || '') + ' • ' + (it.pubDateStr || '') + ' • ' + (it.source || '')); });
        if (sec.more) lines.push('(+ ' + sec.more + ' more items in full newsletter)');
        return lines.join('\n');
    }).filter(Boolean).join('\n\n');

    if (fullNewsletterUrl) bodyPlain += '\n\nView full newsletter: ' + fullNewsletterUrl;

    // Send individualized emails so analytics can track per-recipient interactions.
    // Compute a deterministic recipient hash (SHA-256 hex) to use as `rid`.
    function computeRecipientHash(email) {
        if (!email) return '';
        try {
            var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toString().trim().toLowerCase(), Utilities.Charset.UTF_8);
            var hex = '';
            for (var i = 0; i < digest.length; i++) {
                var v = digest[i]; if (v < 0) v += 256;
                hex += ('0' + v.toString(16)).slice(-2);
            }
            return hex;
        } catch (e) { return Utilities.base64Encode(email.toString()); }
    }

    for (var ri = 0; ri < sendTo.length; ri++) {
        var recipient = sendTo[ri];
        var rid = computeRecipientHash(recipient || '');
        // Deep copy sections to avoid cross-recipient mutation
        var perSections = JSON.parse(JSON.stringify(emailTruncatedSections));
        // Rewrite links for this recipient with per-recipient rid and mail-specific event details
        try {
            for (var si = 0; si < perSections.length; si++) {
                var sec = perSections[si]; if (!sec || !sec.items) continue;
                for (var ii = 0; ii < sec.items.length; ii++) {
                    var it = sec.items[ii];
                    if (it && it.link && /^https?:\/\//i.test(it.link)) {
                        try { it.trackedLink = buildAnalyticsRedirectUrl(it.link, nid, rid, 'mail', 'mail_headline_click'); } catch (e) { it.trackedLink = it.link; }
                    }
                }
            }
        } catch (e) { /* ignore rewrite errors per recipient */ }

        // Rewrite per-recipient fullNewsletterUrl (CTA) and feedSheetUrl (sheet link) so clicks are tracked
        var perFullNewsletterUrl = fullNewsletterUrl;
        try {
            if (fullNewsletterUrl && /^https?:\/\//i.test(fullNewsletterUrl)) {
                // Instead of an intermediate analytics redirect, sign the direct webapp URL
                // so the webapp can verify the signature on page load and log the click server-side.
                try {
                    var src = 'mail';
                    var eventDetail = 'mail_web_click';
                    var sigBase = (nid || '') + '|' + (rid || '') + '|' + (fullNewsletterUrl || '') + '|' + (src || '') + '|' + (eventDetail || '');
                    var sig = '';
                    try { sig = computeHmacHex(sigBase); } catch (e) { sig = ''; }
                    var sep2 = fullNewsletterUrl.indexOf('?') === -1 ? '?' : '&';
                    perFullNewsletterUrl = fullNewsletterUrl + sep2 + 'nid=' + encodeURIComponent(nid || '') + '&rid=' + encodeURIComponent(rid) + '&src=' + encodeURIComponent(src) + '&eventDetail=' + encodeURIComponent(eventDetail) + (sig ? '&sig=' + encodeURIComponent(sig) : '');
                } catch (e) { perFullNewsletterUrl = fullNewsletterUrl; }
            }
        } catch (e) { /* keep original */ }
        var perFeedSheetUrl = feedSheetUrl;
        try { if (feedSheetUrl && /^https?:\/\//i.test(feedSheetUrl)) perFeedSheetUrl = buildAnalyticsRedirectUrl(feedSheetUrl, nid, rid, 'mail', 'mail_sheet_click'); } catch (e) { /* keep original */ }

        // Render per-recipient HTML and append pixel
        var perHtml = renderNewsletterHtml({ sections: perSections, dateRangeText: drText, fullNewsletterUrl: perFullNewsletterUrl, feedSheetUrl: perFeedSheetUrl });
        try {
            var perPixel = buildAnalyticsPixelUrl(nid, rid, 'mail', 'email_open');
            perHtml += '<img src="' + perPixel + '" width="1" height="1" alt="" style="display:none;max-height:1px;max-width:1px;">';
        } catch (e) { /* ignore when WEBAPP_URL not set */ }

        try {
            MailApp.sendEmail({ to: recipient, subject: subject, htmlBody: perHtml, body: bodyPlain });
            Logger.log('Sent newsletter to ' + recipient + ' rid=' + rid);
        } catch (e) {
            Logger.log('Failed to send to ' + recipient + ': ' + (e && e.message));
        }
    }

}
