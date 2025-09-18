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
    } catch (e) { }
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
    // Parse dateStr (yyyy-MM-dd) into a Date range (dayStart inclusive, dayEnd exclusive).
    var target;
    if (dateStr) {
        var parts = (dateStr || '').toString().split('-');
        if (parts.length === 3) target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    if (!target) {
        var now = new Date();
        target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); // previous day
    }
    var dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    var dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    return getItemsInDateRange(dayStart, dayEnd);
}


/**
 * Gathers all news items from all configured sheets that fall within a specific date range.
 * @param {Date} startDate The start of the date range (inclusive).
 * @param {Date} endDate The end of the date range (exclusive).
 * @return {Array} An array of section objects, each containing a title and a list of items.
 */
function getItemsInDateRange(startDate, endDate) {
    var sheetId = getSheetId();
    var ss = SpreadsheetApp.openById(sheetId);
    var sections = [];

    CONFIG.forEach(function (cfg) {
        var sheet = ss.getSheetByName(cfg.sheetName);
        if (!sheet || sheet.getLastRow() < 2) return;

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
            return (h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); // Normalize header names
        });
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
        var formulas = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getFormulas();

        var dateColIdx = headers.indexOf('date');
        var relevanceColIdx = headers.indexOf('relevancescore');
        if (dateColIdx === -1) return;

        var itemsForDate = [];
        rows.forEach(function (row, rowIndex) {
            var dateVal = row[dateColIdx];
            var pubDate = dateVal instanceof Date ? dateVal : (dateVal ? new Date(dateVal) : null);

            if (pubDate && pubDate >= startDate && pubDate < endDate) {
                var item = {};
                headers.forEach(function (header, colIndex) {
                    // Use a simple property name for the item object
                    var propName = header.replace(/\s+/g, '');
                    var cellFormula = formulas[rowIndex][colIndex];
                    if (cellFormula && cellFormula.toUpperCase().startsWith('=HYPERLINK(')) {
                        var urlMatch = cellFormula.match(/HYPERLINK\("([^"]+)"/i);
                        item[propName] = urlMatch ? urlMatch[1] : row[colIndex];
                    } else {
                        item[propName] = row[colIndex];
                    }
                });
                // Ensure relevance score is a number for sorting
                item.relevanceScore = (relevanceColIdx !== -1) ? Number(row[relevanceColIdx]) || 0 : 0;
                itemsForDate.push(item);
            }
        });

        if (itemsForDate.length > 0) {
            itemsForDate.sort(function (a, b) {
                return (b.relevanceScore || 0) - (a.relevanceScore || 0);
            });
            sections.push({
                title: cfg.category,
                items: itemsForDate
            });
        }
    });
    return sections;
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
    var testRecipient = (props.getProperty('TEST_RECIPIENT') || '').trim();

    if (testRecipient) {
        sendTo = [testRecipient];
        Logger.log('TEST_RECIPIENT set — sending only to: ' + testRecipient);
    }
    if (!sendTo.length) throw new Error('Set SEND_TO in Project Properties');

    var sheetId = getSheetId();
    var ss = SpreadsheetApp.openById(sheetId);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var prevDayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    var prevDayEnd = today;

    var sections = getItemsInDateRange(prevDayStart, prevDayEnd); // Reuse the corrected function
    var visibleSections = sections.filter(function (s) { return s && s.items && s.items.length; });

    if (visibleSections.length === 0) {
        Logger.log('No new articles for ' + Utilities.formatDate(prevDayStart, Session.getScriptTimeZone(), 'yyyy-MM-dd') + '. Skipping newsletter.');
        return;
    }

    var drText = Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'MMM d, yyyy');
    var nid = 'newsletter-' + Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
    var feedSheetUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/';
    var webappUrl = (props.getProperty('WEBAPP_URL') || '').trim();
    var fullNewsletterUrl = '';

    if (webappUrl) {
        var dateParam = Utilities.formatDate(prevDayStart, Session.getScriptTimeZone() || 'UTC', 'yyyy-MM-dd');
        fullNewsletterUrl = webappUrl.includes('{date}') ? webappUrl.replace('{date}', dateParam) :
            (webappUrl.includes('?') ? webappUrl + '&date=' + dateParam : webappUrl + '?date=' + dateParam);
    }

    var maxPerSection = parseInt(props.getProperty('MAX_ITEMS_PER_SECTION') || '6', 10);
    var truncatedSections = visibleSections.map(function (sec) {
        return {
            title: sec.title,
            items: sec.items.slice(0, maxPerSection),
            more: Math.max(0, sec.items.length - maxPerSection)
        };
    });

    var bodyPlain = truncatedSections.map(function (sec) {
        var lines = [sec.title];
        sec.items.forEach(function (it) { lines.push('- ' + (it.headline || '') + ' • ' + (it.source || '')); });
        if (sec.more) lines.push('(+ ' + sec.more + ' more items in full newsletter)');
        return lines.join('\n');
    }).filter(Boolean).join('\n\n') + (fullNewsletterUrl ? '\n\nView full newsletter: ' + fullNewsletterUrl : '');


    sendTo.forEach(function (recipient) {
        var rid = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, recipient.trim().toLowerCase()).map(function (b) {
            return ('0' + (b & 0xFF).toString(16)).slice(-2);
        }).join('');

        var perSections = JSON.parse(JSON.stringify(truncatedSections));
        perSections.forEach(function (sec) {
            sec.items.forEach(function (it) {
                if (it.link) it.trackedLink = buildAnalyticsRedirectUrl(it.link, nid, rid, 'mail', 'mail_headline_click');
            });
        });

        var perFullNewsletterUrl = fullNewsletterUrl ? buildAnalyticsRedirectUrl(fullNewsletterUrl, nid, rid, 'mail', 'mail_web_click') : '';
        var perFeedSheetUrl = buildAnalyticsRedirectUrl(feedSheetUrl, nid, rid, 'mail', 'mail_sheet_click');
        var perPixel = buildAnalyticsPixelUrl(nid, rid, 'mail', 'email_open');

        var perHtml = renderNewsletterHtml({
            sections: perSections,
            dateRangeText: drText,
            fullNewsletterUrl: perFullNewsletterUrl,
            feedSheetUrl: perFeedSheetUrl
        }) + '<img src="' + perPixel + '" width="1" height="1" alt="">';

        try {
            MailApp.sendEmail({ to: recipient, subject: 'Business Excellence Newsletter - ' + drText, htmlBody: perHtml, body: bodyPlain, name: 'Business Excellence Newsletter' });
            Logger.log('Successfully sent newsletter to %s', recipient);
            var analyticsTarget = resolveAnalyticsTarget(nid);
            recordRecipientHash(analyticsTarget.spreadsheetId, rid, recipient);
        } catch (e) {
            Logger.log('Failed to send newsletter to %s. Error: %s', recipient, e.message);
        }
    });
}
