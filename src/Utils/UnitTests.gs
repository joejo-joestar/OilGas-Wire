/**
 * UnitTests.gs
 * Small, fast unit tests for pure helper functions. These tests are intended
 * to be run manually from the Apps Script editor (select function `runAllTests`).
 * They exercise normalization, similarity, commodity/industry identification,
 * and the row builder behavior.
 */

function _assertEquals(actual, expected, msg) {
    if (actual === expected) return true;
    throw new Error((msg || 'assertEquals') + ' -> expected: ' + expected + ' got: ' + actual);
}

function _assert(cond, msg) {
    if (cond) return true;
    throw new Error(msg || 'assert failed');
}

function test_normalizeForFuzzy() {
    var out = normalizeForFuzzy('Hello, World!');
    _assertEquals(out, 'helloworld', 'normalizeForFuzzy should strip punctuation and lowercase');
}

function test_levenshtein_and_similarity() {
    var d = levenshtein('kitten', 'sitting');
    _assertEquals(d, 3, 'levenshtein kitten vs sitting');
    _assertEquals(similarity('oil price', 'oil price'), 1, 'similarity identical');
    _assert(similarity('oil', 'gas') < 0.5, 'similarity oil vs gas should be low');
}

function test_normalizeTitle_and_truncate() {
    var t = normalizeTitle('  Hello — World: Example (Test) ');
    _assertEquals(t, 'hello world example test', 'normalizeTitle removes punctuation and collapses spaces');
    var tr = truncateText('abcdef', 4);
    _assertEquals(tr.length <= 4, true, 'truncateText should shorten strings');
}

function test_identifyCommodity_and_industry() {
    var c = identifyCommodity('Brent crude prices rose today');
    _assertEquals(c.toLowerCase(), 'oil', 'identifyCommodity should detect oil from brent');
    var ind = identifyIndustry('New hydrogen project announced');
    _assertEquals(ind.toLowerCase(), 'hydrogen', 'identifyIndustry should detect hydrogen');
}

function test_buildRowForCategory_basic() {
    var sampleItem = {
        title: 'Test headline',
        link: 'https://example.com/article',
        pubDate: new Date().toString(),
        summary: 'A short summary of the article content',
        content: '',
        source: 'Example',
        feedUrl: 'https://example.com/feed',
        analysis: { company: 'Acme', industry: 'Oil & Gas', region: 'USA', commodity: 'Oil', priceInfo: '' }
    };
    var cat = { headers: ['Date', 'Headline', 'Company', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'] };
    var row = buildRowForCategory(sampleItem, cat);
    _assert(Array.isArray(row), 'row should be an array');
    _assertEquals(row.length, cat.headers.length, 'row length should match headers');
    // Link column is the last; expect =HYPERLINK(...)
    var last = row[row.length - 1] || '';
    _assert(last.indexOf('HYPERLINK(') !== -1, 'link cell should contain HYPERLINK formula');
}

/**
 * Run all tests and log a summary. Run this from the Apps Script editor.
 */
function runAllTests() {
    var tests = [
        test_normalizeForFuzzy,
        test_levenshtein_and_similarity,
        test_normalizeTitle_and_truncate,
        test_identifyCommodity_and_industry,
        test_buildRowForCategory_basic
    ];
    // Additional tests appended below will be added to the runner dynamically
    var extra = [
        test_similarity_edge_cases,
        test_identifyCommodity_aliases,
        test_identifyIndustry_aliases,
        test_guessCompanyFromText,
        test_normalizeItemHtmlFields,
        test_parseGoogleTitle
    ];
    for (var j = 0; j < extra.length; j++) tests.push(extra[j]);
    var failures = [];
    for (var i = 0; i < tests.length; i++) {
        var fn = tests[i];
        try {
            fn();
            Logger.log('PASS %s', fn.name);
        } catch (e) {
            Logger.log('FAIL %s: %s', fn.name, e.toString());
            failures.push({ test: fn.name, error: e.toString() });
        }
    }
    if (failures.length === 0) {
        Logger.log('All %s tests passed.', tests.length);
    } else {
        Logger.log('%s tests failed.', failures.length);
    }
    return { total: tests.length, failures: failures };
}

// --- Extra tests ---
function test_similarity_edge_cases() {
    // near identical with small typo
    _assert(similarity('Sinopec', 'Sinopec') > 0.95, 'identical high sim');
    _assert(similarity('Sinopec', 'Sinopec ') > 0.95, 'trailing space ignored');
    // Accept a lower threshold for short/abbreviated company names vs long forms
    _assert(similarity('Acme Corp', 'Acme Corporation') > 0.45, 'company fuzzy match');
}

function test_identifyCommodity_aliases() {
    _assertEquals(identifyCommodity('WTI crude fell'), 'Oil', 'WTI maps to Oil');
    _assertEquals(identifyCommodity('Brent futures up'), 'Oil', 'Brent maps to Oil');
    _assertEquals(identifyCommodity('LNG shipments delayed').toLowerCase(), 'lng', 'LNG detected');
}

function test_identifyIndustry_aliases() {
    _assertEquals(identifyIndustry('New desalination water treatment plant'), 'Water Treatment', 'water treatment detected');
    _assertEquals(identifyIndustry('Offshore oil drilling project'), 'Oil & Gas', 'oil & gas detected');
}

function test_guessCompanyFromText() {
    var g = guessCompanyFromText('A new contract was awarded to Saudi Aramco for pipeline work');
    _assertEquals(g, 'Saudi Aramco', 'should detect Saudi Aramco');
}

function test_normalizeItemHtmlFields() {
    var raw = { title: '<b>Big</b> News', summary: 'Line&nbsp;1<br/>Line2', content: '<p>Content</p>', source: 'Site &amp; Co', link: 'http://x' };
    var out = normalizeItemHtmlFields(raw);
    _assertEquals(out.title, 'Big News', 'HTML tags stripped from title');
    _assert(out.summary.indexOf('Line 1') !== -1, 'HTML entities decoded in summary');
}

function test_parseGoogleTitle() {
    var it = { title: 'Headline - Publisher', source: 'Google News' };
    parseGoogleTitle(it);
    _assertEquals(it.title, 'Headline', 'parseGoogleTitle should split headline');
    _assertEquals(it.source, 'Publisher', 'parseGoogleTitle should extract source when placeholder');
}

