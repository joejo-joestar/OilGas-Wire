/**
 * Analysis.gs
 * Helpers that extract structured information from feed items and provide
 * a TF-IDF relevance score.
 */

function guessCompanyFromText(text) {
    if (!text) return '';
    var lc = text.toLowerCase();
    for (var i = 0; i < KNOWN_COMPANIES.length; i++) {
        var name = KNOWN_COMPANIES[i];
        var re = new RegExp('\\b' + escapeRegExp(name.toLowerCase()) + '\\b');
        if (re.test(lc)) return name;
        if (lc.indexOf(name.toLowerCase().replace(/\s+/g, '')) !== -1) return name;
    }
    var best = { name: '', score: 0 };
    var compactText = normalizeForFuzzy(text);
    for (var j = 0; j < KNOWN_COMPANIES.length; j++) {
        var k = KNOWN_COMPANIES[j];
        var sim = similarity(compactText, normalizeForFuzzy(k));
        if (sim > best.score) { best.score = sim; best.name = k; }
    }
    if (best.score >= FUZZY_THRESHOLD) return best.name;
    return '';
}

function guessRegionFromText(text) {
    if (!text) return '';
    var lc = text.toLowerCase();
    for (var j = 0; j < KNOWN_REGIONS.length; j++) {
        var r = KNOWN_REGIONS[j];
        var re2 = new RegExp('\\b' + escapeRegExp(r.toLowerCase()) + '\\b');
        if (re2.test(lc)) return r;
        var compactR = r.toLowerCase().replace(/\s+/g, '');
        if (compactR.length >= 3 && lc.indexOf(compactR) !== -1) return r;
    }
    var bestR = { name: '', score: 0 };
    var compactText2 = normalizeForFuzzy(text);
    for (var k2 = 0; k2 < KNOWN_REGIONS.length; k2++) {
        var cand = KNOWN_REGIONS[k2];
        var s = similarity(compactText2, normalizeForFuzzy(cand));
        if (s > bestR.score) { bestR.score = s; bestR.name = cand; }
    }
    if (bestR.score >= FUZZY_THRESHOLD) return bestR.name;
    return '';
}

function canonicalizeRegion(region) {
    if (!region) return '';
    var key = region.toString().toLowerCase();
    if (typeof REGION_CANONICALS !== 'undefined' && REGION_CANONICALS[key]) return REGION_CANONICALS[key];
    return region;
}

function identifyCommodity(text) {
    if (!text) return 'Miscellaneous';
    var lc = text.toString().toLowerCase();
    var aliasMap = { 'brent': 'Oil', 'wti': 'Oil', 'west texas intermediate': 'Oil' };
    if (lc.indexOf('brent') !== -1 || lc.indexOf('wti') !== -1 || lc.indexOf('west texas intermediate') !== -1) return 'Oil';
    try {
        if (typeof COMMODITIES !== 'undefined' && COMMODITIES && COMMODITIES.length) {
            for (var i = 0; i < COMMODITIES.length; i++) {
                var c = COMMODITIES[i];
                if (!c) continue;
                var token = c.toString().toLowerCase();
                var re = new RegExp('\\b' + escapeRegExp(token) + '\\b');
                if (re.test(lc)) {
                    if (aliasMap[token]) return aliasMap[token];
                    return c;
                }
                if (lc.indexOf(token.replace(/\s+/g, '')) !== -1) {
                    if (aliasMap[token]) return aliasMap[token];
                    return c;
                }
            }
        }
    } catch (e) { }
    var heur = ['oil', 'gas', 'lng', 'steel', 'pipe', 'chemical', 'valve', 'flange', 'diesel'];
    for (var j = 0; j < heur.length; j++) {
        if (lc.indexOf(heur[j]) !== -1) return heur[j].charAt(0).toUpperCase() + heur[j].slice(1);
    }
    return 'Miscellaneous';
}

function identifyIndustry(text) {
    if (!text) return '';
    var lc = text.toString().toLowerCase();
    try {
        if (typeof INDUSTRIES !== 'undefined' && INDUSTRIES && INDUSTRIES.length) {
            var aliasMap = INDUSTRY_ALIASES || {};
            for (var k = 0; k < INDUSTRIES.length; k++) {
                var canonical = INDUSTRIES[k];
                if (!canonical) continue;
                var key = canonical.toString().toLowerCase();
                var aliases = aliasMap[key] || [key];
                for (var ai = 0; ai < aliases.length; ai++) {
                    var token = aliases[ai];
                    var re = new RegExp('\\b' + escapeRegExp(token) + '\\b');
                    if (re.test(lc)) return canonical;
                }
            }
        }
    } catch (e) { }
    return '';
}

function analyzeItem(item) {
    var text = ((item.title || '') + '\n' + (item.summary || '') + '\n' + (item.content || '')).replace(/\s+/g, ' ');
    var lc = text.toLowerCase();

    var res = {
        company: '', companies: '', dealtype: '', dealvalue: '', region: '',
        commodity: '', industry: '', priceinfo: '',
        relevanceScore: calculateTfIdfRelevance(text)
    };

    var companyRegex = /([A-Z][A-Za-z0-9&\.\-]{2,}(?:\s+[A-Z][A-Za-z0-9&\.\-]{2,})*)(?:\s+(?:to acquire|acquires|buys|buys out|acquired|acquired by|and)\s+([A-Z][A-Za-z0-9&\.\-]{2,}))/;
    var m = text.match(companyRegex);
    if (m) {
        var c1 = guessCompanyFromText(m[1]);
        var c2 = m[2] ? guessCompanyFromText(m[2]) : '';
        if (c1 || c2) {
            res.company = [c1, c2].filter(Boolean).join(' / ');
            res.companies = res.company;
        }
    }
    if (!res.company) {
        var compGuess = guessCompanyFromText(text);
        if (compGuess) {
            res.company = compGuess;
            res.companies = compGuess;
        }
    }

    if (lc.includes('joint venture')) res.dealtype = 'Joint Venture';
    else if (lc.includes('acquire') || lc.includes('acquisition')) res.dealtype = 'Acquisition';
    else if (lc.includes('merger')) res.dealtype = 'Merger';

    var regGuess = guessRegionFromText(text);
    if (regGuess) res.region = canonicalizeRegion(regGuess) || regGuess;

    res.industry = identifyIndustry(text) || '';
    res.commodity = identifyCommodity(text) || '';

    var priceRegex = /(\$|€|£|₹|USD|EUR|GBP|INR)\s*[\d,.]+[kKmMbB]?(\s*billion|\s*million|\s*crore|\s*lakh)?/i;
    var p = text.match(priceRegex);
    if (p) res.priceinfo = p[0].trim();

    // --- Normalize field names expected by sheet builder / other code ---
    // SheetUtils and other consumers expect camelCase names like priceInfo,
    // dealValue, dealValueNumeric, dealValueCurrency, dealValueRaw, dealType.
    try {
        // Company
        if (!res.company && res.companies) res.company = res.companies;
        // dealType
        if (res.dealtype && !res.dealType) res.dealType = res.dealtype;
        // dealValue raw token: prefer any explicitly-detected dealvalue, else priceinfo
        res.dealValue = res.dealvalue || res.dealValue || '';
        if (!res.dealValue && res.priceinfo) res.dealValue = res.priceinfo;
        // Expose raw and numeric forms
        if (res.dealValue) {
            res.dealValueRaw = res.dealValue;
            try {
                var parsed = parseMonetaryValue(res.dealValue);
                if (parsed && typeof parsed.amount === 'number') res.dealValueNumeric = parsed.amount;
                if (parsed && parsed.currency) res.dealValueCurrency = parsed.currency;
            } catch (e) { /* ignore parsing errors */ }
        }
        // priceInfo camelCase
        if (res.priceinfo && !res.priceInfo) res.priceInfo = res.priceinfo;
    } catch (e) {
        // non-fatal normalization errors should not block analysis
    }

    return res;
}

function parseMonetaryValue(raw) {
    if (!raw) return { raw: raw };
    var s = raw.toString().trim().replace(/^[\s"'\(]+|[\s\)"'\.;,:]+$/g, '');
    var currency = '';
    if (/^\$/.test(s) || /\b(us\$|usd)\b/i.test(s)) currency = 'USD';
    else if (/€/.test(s) || /\b(eur)\b/i.test(s)) currency = 'EUR';
    else if (/£/.test(s) || /\b(gbp)\b/i.test(s)) currency = 'GBP';
    else if (/₹/.test(s) || /\b(rs\.?|inr)\b/i.test(s)) currency = 'INR';
    var m = s.match(/(?:US\$|USD|EUR|€|GBP|£|Rs\.?|INR|₹|\$)\s*([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)([a-zA-Z]{0,3})?/i) || s.match(/([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)\s*(bn|billion|mm|m|million|k|thousand|crore|lakh)\b/i) || s.match(/([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)/);
    if (!m) return { raw: raw, currency: currency || null };
    var n = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(n)) return { raw: raw, currency: currency || null };
    var lower = s.toLowerCase();
    var scale = 1;
    if (/\b(bn|billion)\b/.test(lower)) scale = 1e9;
    else if (/\b(m|million|mm)\b/.test(lower)) scale = 1e6;
    else if (/\b(k|thousand)\b/.test(lower)) scale = 1e3;
    else if (/\bcrore\b/.test(lower)) scale = 1e7;
    else if (/\b(lakh|lac)\b/.test(lower)) scale = 1e5;
    return { raw: raw, amount: n * scale, currency: currency || null, scale: scale };
}

function doesItemMatchCategory(item, categoryConfig) {
    if (!item || !categoryConfig) return false;
    var text = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
    if (!text) return false;
    var primary = categoryConfig.primaryKeywords || [];
    var secondary = categoryConfig.secondaryKeywords || [];
    if (primary.length === 0 || secondary.length === 0) return false;
    var primaryMatch = primary.some(function (kw) { return new RegExp('\\b' + escapeRegExp(kw.toLowerCase()) + '\\b').test(text); });
    if (!primaryMatch) return false;
    var secondaryMatch = secondary.some(function (kw) { return new RegExp('\\b' + escapeRegExp(kw.toLowerCase()) + '\\b').test(text); });
    return primaryMatch && secondaryMatch;
}

/**
 * Calculates a relevance score for a given text using a TF-IDF like approach.
 * @param {string} text The text of the article (headline + snippet).
 * @return {number} The calculated relevance score.
 */
function calculateTfIdfRelevance(text) {
    var totalScore = 0;
    var lcText = (text || '').toLowerCase();
    if (!lcText) return 0;

    for (var keyword in KEYWORD_IDF_SCORES) {
        if (KEYWORD_IDF_SCORES.hasOwnProperty(keyword)) {
            var idf = KEYWORD_IDF_SCORES[keyword];
            var re = new RegExp(escapeRegExp(keyword.toLowerCase()), 'gi');

            var matches = lcText.match(re);
            var tf = matches ? matches.length : 0;

            if (tf > 0) {
                totalScore += tf * idf;
            }
        }
    }
    // Multiply by 10 and round to get a more intuitive score range (no upper limit)
    return Math.round(totalScore * 10);
}
