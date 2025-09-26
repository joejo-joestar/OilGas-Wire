/**
 * Debug.gs
 *
 * Debug and diagnostic helpers for the Feed fetcher.
 * These functions are not called by the main flow, but can be run manually
 * from the Apps Script editor to help diagnose issues with authorization,
 * feed fetching, or sheet access.
 *
 * Note: these functions may require additional permissions when run manually.
 * They are not included in the main flow to avoid unnecessary permission prompts.
 *
 */

/**
 * Run a full fetch cycle (manual test helper).
 * Calls `fetchAndStoreAll()` from `Feed.gs`.
 * Run manually in the Apps Script editor to trigger authorization flows.
 */
function testRun() {
    try {
        var id = getSheetId();
        var masked = (id && id.length > 10) ? (id.substring(0, 4) + '...' + id.substring(id.length - 4)) : id;
        Logger.log('TESTRUN: clearing sheets in spreadsheet (masked id): %s', masked);
        var ss = SpreadsheetApp.openById(id);
        CONFIG.forEach(function (cat) {
            var sheet = ss.getSheetByName(cat.sheetName);
            if (!sheet) {
                sheet = ss.insertSheet(cat.sheetName);
                ensureHeaders(sheet, cat.headers);
                return;
            }
            var lastRow = sheet.getLastRow();
            var lastCol = Math.max(sheet.getLastColumn(), cat.headers.length || 1);
            if (lastRow > 1) {
                try {
                    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
                } catch (e) {
                    try {
                        sheet.deleteRows(2, Math.max(0, lastRow - 1));
                        // ensure at least one empty row exists after header
                        if (sheet.getMaxRows() < 2) sheet.insertRows(2);
                    } catch (ex) {
                        Logger.log('TESTRUN: unable to clear rows for %s: %s', cat.sheetName, ex.toString());
                    }
                }
            }
            ensureHeaders(sheet, cat.headers);
        });
    } catch (e) {
        Logger.log('TESTRUN error while preparing sheets: %s', e.toString());
    }

    fetchAndStoreAll();
}

/**
 * Fetch each configured feed and log response metadata + sample content.
 * Useful to debug unreachable feeds, HTTP errors, or feeds returning HTML.
 * This mirrors the previous helper that lived in `Feed.gs`.
 */
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

/**
 * Open the configured sheet id and log summary info.
 * Useful for diagnosing permission / invalid id issues.
 */
function debugOpenSheet() {
    try {
        var id = getSheetId();
        var masked = (id && id.length > 10) ? (id.substring(0, 4) + '...' + id.substring(id.length - 4)) : id;
        Logger.log('DEBUG: attempting open with SHEET_ID (masked): %s', masked);
        var ss = SpreadsheetApp.openById(id);
        Logger.log('DEBUG: opened spreadsheet name: %s; sheets: %s', ss.getName(), ss.getSheets().length);
    } catch (e) {
        Logger.log('DEBUG openById error: %s', e.toString());
        if (e.stack) Logger.log(e.stack);
        throw e;
    }
}

/**
 * Test helper: send a sample analytics event to the configured ANALYTICS_ENDPOINT
 * Run this from the Apps Script editor to verify your analytics endpoint is reachable
 * and that the sendAnalyticsEvent normalization works as expected.
 */
function testSendAnalyticsEvent() {
    try {
        var ep = PropertiesService.getScriptProperties().getProperty('ANALYTICS_ENDPOINT') || '';
        Logger.log('TEST: ANALYTICS_ENDPOINT=%s', ep ? ep : '(not set)');
        var payload = {
            src: 'debug-runner',
            eventType: 'gui-test',
            eventDetail: 'debug_send_test',
            nid: 'test-newsletter-2025-09-26',
            rid: 'test-recipient-hash',
            url: 'https://example.com/test',
            ua: 'DebugClient/1.0',
            extra: { debug: true }
        };
        try {
            sendAnalyticsEvent(payload);
            Logger.log('TEST: sendAnalyticsEvent() called — check your analytics endpoint logs.');
        } catch (e) { Logger.log('TEST ERROR calling sendAnalyticsEvent: %s', e && e.message); }

        // Also test the recipient mapping POST (storeRecipientMapping)
        try {
            storeRecipientMapping('test-recipient-hash', 'test@example.com', payload.nid);
            Logger.log('TEST: storeRecipientMapping() called — check your analytics endpoint logs.');
        } catch (e) { Logger.log('TEST ERROR calling storeRecipientMapping: %s', e && e.message); }
    } catch (e) {
        Logger.log('testSendAnalyticsEvent error: %s', e && e.message);
    }
}

/**
 * Bootstrap recipient mappings from the configured SEND_TO / TEST_RECIPIENT script properties.
 * This is a convenience helper for users who do not have an existing sheet of mappings.
 * It computes the same `rid` used by the mailer (SHA-256 hex of lowercased email)
 * and calls `storeRecipientMapping(rid, email, newsletterId)` for each recipient.
 * Run this manually in the Apps Script editor to populate your analytics backend's mapping table.
 */
function bootstrapRecipientMappingsFromSendList() {
    try {
        var props = PropertiesService.getScriptProperties();
        var ep = props.getProperty('ANALYTICS_ENDPOINT') || '';
        if (!ep) {
            Logger.log('bootstrapRecipientMappingsFromSendList: ANALYTICS_ENDPOINT is not set. Set it before running.');
            return;
        }

        var testRecipient = (props.getProperty('TEST_RECIPIENT') || '').trim();
        var sendTo = (props.getProperty('SEND_TO') || '').split(',').map(function (s) { return (s || '').trim(); }).filter(Boolean);
        if (testRecipient) sendTo = [testRecipient];

        if (!sendTo || !sendTo.length) {
            Logger.log('bootstrapRecipientMappingsFromSendList: No recipients found in SEND_TO or TEST_RECIPIENT.');
            return;
        }

        var nid = 'bootstrap-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'UTC', "yyyy-MM-dd'T'HH:mm:ss");

        sendTo.forEach(function (recipient) {
            try {
                var rid = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, recipient.trim().toLowerCase()).map(function (b) {
                    return ('0' + (b & 0xFF).toString(16)).slice(-2);
                }).join('');
                storeRecipientMapping(rid, recipient, nid);
                Logger.log('bootstrapRecipientMappingsFromSendList: posted mapping for %s -> %s', rid, recipient);
            } catch (e) {
                Logger.log('bootstrapRecipientMappingsFromSendList: failed for %s: %s', recipient, e && e.message);
            }
        });
    } catch (e) {
        Logger.log('bootstrapRecipientMappingsFromSendList error: %s', e && e.message);
    }
}
