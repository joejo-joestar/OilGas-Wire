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
        test_parseGoogleTitle,
        test_parseMonetaryValue_and_numeric,
        test_analyzeItem_numeric_fields
    ];
    // include noisy-headline test
    extra.push(test_noisy_real_world_headlines);
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

function test_value_parsing_formats() {
    var samples = [
        { text: 'The deal was worth US$1,200 million, announced today', expect: 'US$1,200 million' },
        { text: 'Company agreed $1.2bn in financing.', expect: '$1.2bn' },
        { text: 'An investment of Rs 5,00,000 was made', expect: 'Rs 5,00,000' },
        { text: 'A Rs. 12 crore project', expect: 'Rs. 12 crore' },
        { text: 'They signed for 50 lakh rupees', expect: '50 lakh' },
        { text: 'EUR 500,000;', expect: 'EUR 500,000' },
        { text: '(US$1.2bn)', expect: 'US$1.2bn' },
        { text: 'approx 1,200,000', expect: '1,200,000' },
        { text: 'value: 1.5 million.', expect: '1.5 million' },
        { text: 'the price was $500,000,', expect: '$500,000' },
        { text: 'Morgan Stanley Sees Slower Oil Stockpile Build and Keeps Brent Outlook at $65', expect: '$65' }
    ];
    for (var i = 0; i < samples.length; i++) {
        var s = samples[i];
        var out = analyzeItem({ title: s.text, summary: '', content: '' }).dealValue || '';
        _assertEquals(out, s.expect, 'value parsing for: ' + s.text);
    }
}

function test_noisy_real_world_headlines() {
    var headlines = [
        { h: 'BP to buy rival for $3.5bn as oil prices surge', v: '$3.5bn' },
        { h: 'Reliance signs MoU for 2 lakh tonne LPG plant worth Rs 120 crore', v: 'Rs 120 crore' },
        { h: 'Shell reports Q2 profit of €500,000; shares up', v: '€500,000' },
        { h: 'Company X raises $1,200,000 in Series A (approx.)', v: '$1,200,000' },
        { h: 'Govt approves ₹5,00,000 funding for rural water projects', v: '₹5,00,000' },
        { h: 'Deal reportedly ~ $750k — details TBC', v: '$750k' },
        { h: 'Acme Corp signs contract worth 25 crore rupees', v: '25 crore' },
        { h: 'Minority stake sold for USD 2.2 million.', v: 'USD 2.2 million' },
        { h: 'Oil price update: Brent $78.45/bbl', v: '$78.45' },
        { h: 'JV created in a $500,000,000 deal', v: '$500,000,000' }
    ];
    for (var i = 0; i < headlines.length; i++) {
        var out = analyzeItem({ title: headlines[i].h, summary: '', content: '' }).dealValue || '';
        _assertEquals(out, headlines[i].v, 'noisy headline value parse: ' + headlines[i].h);
    }
}

function test_parseMonetaryValue_and_numeric() {
    var samples = [
        { raw: '$1.4 billion', expectAmount: 1400000000, expectCurrency: 'USD' },
        { raw: 'Rs 120 crore', expectAmount: 120 * 1e7, expectCurrency: 'INR' },
        { raw: '₹5,00,000', expectAmount: 500000, expectCurrency: 'INR' },
        { raw: 'EUR 500,000', expectAmount: 500000, expectCurrency: 'EUR' },
        { raw: '25 crore', expectAmount: 25 * 1e7, expectCurrency: null }
    ];
    for (var i = 0; i < samples.length; i++) {
        var s = samples[i];
        var p = parseMonetaryValue(s.raw);
        _assert(p && typeof p.amount === 'number', 'parsed amount for ' + s.raw);
        _assertEquals(p.amount, s.expectAmount, 'amount for ' + s.raw);
        _assertEquals(p.currency || null, s.expectCurrency || null, 'currency for ' + s.raw);
    }
}

function test_analyzeItem_numeric_fields() {
    var it = { title: 'Market to hit $1.4 billion by 2031', summary: '', content: '' };
    var a = analyzeItem(it);
    _assertEquals(a.dealValueRaw, '$1.4 billion', 'dealValueRaw should be set');
    _assertEquals(a.dealValueCurrency, 'USD', 'dealValueCurrency should be USD');
    _assertEquals(a.dealValueNumeric, 1400000000, 'dealValueNumeric should be numeric 1.4e9');
}

