/**
 * AutoMailer.gs
 * Utilities to build and send a daily newsletter from the sheet.
 */

/**
 * Build the newsletter HTML for a given date range and list of items.
 * Uses `Newsletter_Template.html` as the template in the project.
 * @param {{items: Array, dateRangeText: string}} data
 * @return {string} rendered HTML
 */
function renderNewsletterHtml(data) {
    var tpl = HtmlService.createTemplateFromFile('Newsletter_Template');
    tpl.items = data.items || [];
    tpl.sections = data.sections || [];
    tpl.dateRangeText = data.dateRangeText || '';
    tpl.fullNewsletterUrl = data.fullNewsletterUrl || '';
    return tpl.evaluate().getContent();
}

/**
 * Render web-specific newsletter HTML (separate template with search & web-friendly layout)
 */
function renderNewsletterWebHtml(data) {
    var tpl = HtmlService.createTemplateFromFile('Newsletter_Web');
    tpl.sections = data.sections || [];
    tpl.dateRangeText = data.dateRangeText || '';
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
    // If preview UI requested, serve the small preview page (date picker + preview area)
    var isPreview = e && e.parameter && (e.parameter.preview === '1' || e.parameter.preview === 'true');
    if (isPreview) {
        return HtmlService.createHtmlOutputFromFile('Web_Preview').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    var dateParam = (e && e.parameter && e.parameter.date) ? e.parameter.date : null;
    var sections = [];
    try { sections = buildVisibleSectionsForDate(dateParam); } catch (err) {
        var tplErr = HtmlService.createHtmlOutput('<p>Error building newsletter preview: ' + (err && err.message) + '</p>');
        return tplErr;
    }
    var targetDate = dateParam || Utilities.formatDate(new Date(new Date().getTime() - 24 * 60 * 60 * 1000), Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    var drText = Utilities.formatDate(new Date(targetDate), Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');
    // For web requests, render the web-specific template (includes search UI)
    var html = renderNewsletterWebHtml({ sections: sections, dateRangeText: drText });
    return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

    // Render full newsletter HTML (will be published to Drive and linked from the email)
    var fullHtml = renderNewsletterHtml({ sections: visibleSections, dateRangeText: drText });

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

    var truncatedHtml = renderNewsletterHtml({ sections: truncatedSections, dateRangeText: drText, fullNewsletterUrl: fullNewsletterUrl });

    var subject = 'Business Excellence Newsletter - ' + drText;
    var bodyPlain = truncatedSections.map(function (sec) {
        var lines = [sec.title];
        sec.items.forEach(function (it) { lines.push('- ' + (it.headline || '') + ' • ' + (it.pubDateStr || '') + ' • ' + (it.source || '')); });
        if (sec.more) lines.push('(+ ' + sec.more + ' more items in full newsletter)');
        return lines.join('\n');
    }).filter(Boolean).join('\n\n');

    if (fullNewsletterUrl) bodyPlain += '\n\nView full newsletter: ' + fullNewsletterUrl;

    // Send truncated HTML as the email body (full HTML is available via the Drive link)
    MailApp.sendEmail({
        to: sendTo.join(','),
        subject: subject,
        htmlBody: truncatedHtml,
        body: bodyPlain
    });

}
