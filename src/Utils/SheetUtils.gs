/**
 * SheetUtils.gs
 * Utilities for reading/writing Google Sheets: managing SHEET_ID, ensuring
 * headers, sorting, deduplication key extraction, and building rows for
 * categories.
 */

/**
 * Read SHEET_ID from Project Script Properties. Throws if missing.
 * @return {string}
 */
function getSheetId() {
    var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) {
        throw new Error('Please set SHEET_ID in Project Properties (File \u2192 Project properties \u2192 Script properties)');
    }
    return id;
}

/**
 * Persist SHEET_ID into Project Script Properties.
 * @param {string} id
 */
function setSheetId(id) {
    if (!id) throw new Error('setSheetId requires a non-empty id');
    PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
}

// Ensure header row exists and matches provided headers
/**
 * Ensure the first row of the sheet contains the provided headers. If mismatched,
 * the sheet is cleared and headers are written.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<string>} headers
 * @return {void}
 */
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

// Sort the sheet by the Date column (newest first). Expects headers array so we can
// determine which column contains the date. If no Date column is present, no-op.
/**
 * Sort sheet rows (excluding header) by the first column that contains 'date' in headers.
 * Newest-first.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<string>} headers
 * @return {void}
 */
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

// Read existing link and title keys for deduplication. Assumes link is last column and title is second.
/**
 * Read existing link and title keys for deduplication.
 * Assumes the link is the last header column and title is the 2nd column.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<string>} headers
 * @return {{links: Object.<string,boolean>, titles: Array.<string>}}
 */
function getExistingKeys(sheet, headers) {
    var res = { links: {}, titles: [] };
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
        if (t) res.titles.push(normalizeTitle(t));
    }
    return res;
}

/**
 * Normalize a title string for deduplication (lowercase, remove punctuation).
 * @param {string} t
 * @return {string}
 */
function normalizeTitle(t) {
    // Remove punctuation first, then collapse whitespace so tokens like em-dashes
    // don't leave double spaces after removal.
    return (t || '').toString().trim().toLowerCase().replace(/["'’`\-–—:;,.()]/g, '').replace(/\s+/g, ' ');
}

/**
 * Extract a four-digit year from item.pubDate or parsed Date.
 * @param {FeedItem|Object} item
 * @return {number|null}
 */
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

// Infer fields for unknown columns using lightweight heuristics. Kept here because it is
// used by row-building and relates to sheet population logic.
/**
 * Heuristic to infer a column value for unknown columns from item text.
 * @param {string} col Lowercased column name
 * @param {FeedItem} item
 * @return {string}
 */
function inferFieldFromItem(col, item) {
    var text = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
    if (col.indexOf('company') !== -1 || col.indexOf('companies') !== -1) {
        return '';
    }
    if (col.indexOf('region') !== -1) {
        var regions = ['asia', 'europe', 'africa', 'middle east', 'usa', 'united states', 'china', 'india'];
        for (var i = 0; i < regions.length; i++) {
            if (text.indexOf(regions[i]) !== -1) {
                try {
                    var canon = canonicalizeRegion(regions[i]);
                    if (canon) return canon;
                } catch (e) { }
                return regions[i].charAt(0).toUpperCase() + regions[i].slice(1);
            }
        }
        return '';
    }
    if (col.indexOf('deal') !== -1 || col.indexOf('value') !== -1) return '';
    if (col.indexOf('industry') !== -1) return 'Oil & Gas';
    if (col.indexOf('commodity') !== -1) {
        try {
            return identifyCommodity(text) || '';
        } catch (e) {
            return '';
        }
    }
    return '';
}

/**
 * Format a numeric monetary amount into a human-readable string for the sheet.
 * Uses crore/lakh for INR and B/M/k for other currencies.
 * @param {number} amount
 * @param {string=} currency (ISO-like: USD, INR, EUR, GBP)
 * @return {string}
 */
function formatMonetaryForSheet(amount, currency) {
    if (amount === null || typeof amount === 'undefined' || isNaN(amount)) return '';
    currency = currency || '';
    // INR: prefer crore/lakh
    if (currency && currency.toUpperCase() === 'INR') {
        if (amount >= 1e7) {
            var cr = Math.round((amount / 1e7) * 100) / 100;
            return cr + ' crore' + (currency ? ' ' + currency : '');
        }
        if (amount >= 1e5) {
            var lk = Math.round((amount / 1e5) * 100) / 100;
            return lk + ' lakh' + (currency ? ' ' + currency : '');
        }
        if (amount >= 1000) return (Math.round((amount / 1000) * 100) / 100) + 'k' + (currency ? ' ' + currency : '');
        return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (currency ? ' ' + currency : '');
    }
    // Default: B / M / k
    if (amount >= 1e9) return (Math.round((amount / 1e9) * 100) / 100) + 'B' + (currency ? ' ' + currency : '');
    if (amount >= 1e6) return (Math.round((amount / 1e6) * 100) / 100) + 'M' + (currency ? ' ' + currency : '');
    if (amount >= 1000) return (Math.round((amount / 1000) * 100) / 100) + 'k' + (currency ? ' ' + currency : '');
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (currency ? ' ' + currency : '');
}

// Build a row matching category headers. Basic mapping; fields not available are left blank.
/**
 * Build a row array for the provided category definition and item. The category
 * is expected to provide a `headers` array describing columns.
 * @param {FeedItem} item
 * @param {CategoryConfig} cat
 * @return {Array} row values
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
        } else if (col.indexOf('relevance score') !== -1) { // *** NEW: Handle the score column ***
            row.push(item.analysis.relevanceScore || 0);
        } else if (col.indexOf('snippet') !== -1 || col === 'snippet' || col.indexOf('summary') !== -1) {
            var raw = item.summary || item.content || '';
            var clean = (raw || '').toString().replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            row.push(truncateText(clean, ARTICLE_SNIPPET_MAX));
        } else if (col === 'link') {
            var rawLink = item.link || '';
            if (rawLink) {
                var safe = rawLink.toString().replace(/"/g, '""');
                row.push('=HYPERLINK("' + safe + '", "LINK")');
            } else {
                row.push('');
            }
        } else if (col === 'source') {
            row.push(item.source || '');
        } else {
            var val = '';
            if (item.analysis) {
                if (col.indexOf('company') !== -1 || col.indexOf('companies') !== -1) val = item.analysis.company || '';
                else if (col.indexOf('industry') !== -1) val = item.analysis.industry || '';
                else if (col.indexOf('deal') !== -1 || col.indexOf('type') !== -1) val = item.analysis.dealType || '';
                else if (col.indexOf('value') !== -1) val = item.analysis.dealValue || '';
                else if (col.indexOf('region') !== -1) val = item.analysis.region || '';
                else if (col.indexOf('commodity') !== -1) val = item.analysis.commodity || '';
                else if (col.toLowerCase().indexOf('price') !== -1) {
                    if (item.analysis) {
                        var numeric = item.analysis.dealValueNumeric;
                        var cur = item.analysis.dealValueCurrency || '';
                        if (typeof numeric === 'number' && !isNaN(numeric)) {
                            val = formatMonetaryForSheet(numeric, cur);
                        } else {
                            val = item.analysis.priceInfo || item.analysis.dealValue || '';
                        }
                    } else {
                        val = '';
                    }
                }
            }
            if (!val) val = inferFieldFromItem(col, item);
            row.push(val);
        }
    }
    return row;
}