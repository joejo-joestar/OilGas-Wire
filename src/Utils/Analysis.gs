/**
 * Analysis.gs
 * Helpers that extract structured information from feed items (company, region,
 * commodity, industry, deal info) and provide lightweight heuristics used by
 * the row builder and deduplication logic.
 */

/**
 * Guess a known company name appearing in the provided text using exact and fuzzy checks.
 * Relies on global KNOWN_COMPANIES and FUZZY_THRESHOLD.
 * @param {string} text
 * @return {string} canonical company name or empty string
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

/**
 * Guess a region name appearing in text using KNOWN_REGIONS and fuzzy matching.
 * @param {string} text
 * @return {string}
 */
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

/**
 * Map a detected region to a canonical form using REGION_CANONICALS if available.
 * @param {string} region
 * @return {string}
 */
function canonicalizeRegion(region) {
    if (!region) return '';
    var key = region.toString().toLowerCase();
    if (typeof REGION_CANONICALS !== 'undefined' && REGION_CANONICALS[key]) return REGION_CANONICALS[key];
    return region;
}

/**
 * Identify a commodity mentioned in text. Uses COMMODITIES and some built-in aliases.
 * Returns a human-readable commodity name or 'Miscellaneous'.
 * @param {string} text
 * @return {string}
 */
function identifyCommodity(text) {
    if (!text) return 'Miscellaneous';
    var lc = text.toString().toLowerCase();
    var aliasMap = { 'brent': 'Oil', 'wti': 'Oil', 'west texas intermediate': 'Oil' };
    // Accept common ticker/short names often used in headlines
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

/**
 * Identify an industry category mentioned in the text using INDUSTRIES and INDUSTRY_ALIASES.
 * Returns a canonical industry or empty string when no confident match.
 * @param {string} text
 * @return {string}
 */
function identifyIndustry(text) {
    if (!text) return '';
    var lc = text.toString().toLowerCase();
    try {
        if (typeof INDUSTRIES !== 'undefined' && INDUSTRIES && INDUSTRIES.length) {
            var aliasMap = {};
            if (typeof INDUSTRY_ALIASES !== 'undefined' && INDUSTRY_ALIASES) aliasMap = INDUSTRY_ALIASES;
            else {
                aliasMap = {
                    'oil & gas': ['oil', 'gas', 'petrol', 'petroleum', 'crude', 'upstream', 'midstream', 'downstream', 'refinery', 'rig', 'drill', 'well', 'platform'],
                    'hydrogen': ['hydrogen', 'h2', 'fuel cell', 'green hydrogen', 'blue hydrogen'],
                    'water treatment': ['water treatment', 'water', 'wastewater', 'sewage', 'desalination', 'water sector', 'water services']
                };
            }
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
            for (var m = 0; m < INDUSTRIES.length; m++) {
                var indName = INDUSTRIES[m];
                if (!indName) continue;
                var primary = indName.toString().toLowerCase().split('&')[0].trim();
                if (primary && lc.indexOf(primary) !== -1) return indName;
            }
            var compactText = normalizeForFuzzy(lc);
            var best = { name: '', score: 0 };
            for (var n = 0; n < INDUSTRIES.length; n++) {
                var cand = INDUSTRIES[n];
                if (!cand) continue;
                var s = similarity(compactText, normalizeForFuzzy(cand));
                if (s > best.score) { best.score = s; best.name = cand; }
            }
            if (best.score >= FUZZY_THRESHOLD) return best.name;
        }
    } catch (e) { }
    return '';
}

/**
 * Analyze a feed item object and extract structured fields.
 * @param {FeedItem} item
 * @return {FeedAnalysis}
 */
function analyzeItem(item) {
    var text = ((item.title || '') + '\n' + (item.summary || '') + '\n' + (item.content || '')).replace(/\s+/g, ' ');
    var lc = text.toLowerCase();
    var res = { company: '', dealType: '', dealValue: '', region: '', commodity: '', industry: '', priceInfo: '' };
    var companyRegex = /([A-Z][A-Za-z0-9&\.\-]{2,}(?:\s+[A-Z][A-Za-z0-9&\.\-]{2,})*)(?:\s+(?:to acquire|acquires|buys|buys out|acquired|acquired by|and)\s+([A-Z][A-Za-z0-9&\.\-]{2,}))/;
    var m = text.match(companyRegex);
    if (m) {
        var c1 = guessCompanyFromText(m[1]);
        var c2 = m[2] ? guessCompanyFromText(m[2]) : '';
        if (c1 || c2) {
            var parts = [];
            if (c1) parts.push(c1);
            if (c2) parts.push(c2);
            res.company = parts.join(' / ');
        }
    }
    if (!res.company) {
        var compGuess = guessCompanyFromText(text);
        if (compGuess) res.company = compGuess;
    }
    if (lc.indexOf('joint venture') !== -1 || lc.indexOf('joint-venture') !== -1) res.dealType = 'Joint Venture';
    else if (lc.indexOf('acquire') !== -1 || lc.indexOf('acquires') !== -1 || lc.indexOf('acquired') !== -1) res.dealType = 'Acquisition';
    else if (lc.indexOf('merger') !== -1 || lc.indexOf('merge') !== -1) res.dealType = 'Merger';
    // Match currency values with optional scale words. Accept common currency
    // prefixes (US$, USD, EUR, €, GBP, £, Rs, INR, ₹) and scale words including
    // international (million/billion/bn/m) and Indian (lakh, lac, crore).
    // Allow numbers with commas in either Western (1,234,567) or Indian
    // grouping (1,23,45,000) and decimals. We preserve internal commas/decimals
    // and strip trailing punctuation after match.
    // Capture currency prefixes (including standalone '$') without requiring a
    // word boundary so symbols like '$' are matched when adjacent to digits.
    // Require currency presence: either a prefix (symbol or code) OR a trailing
    // currency word (dollars, rupees, usd, inr). This avoids matching plain
    // numeric tokens that are not monetary values.
    var valueRegex = new RegExp(
        '(?:' +
        // Prefix currency form: e.g. $1.2bn or USD 1,200 million
        '(?:' + '(?:US\\$|USD|EUR|€|GBP|£|Rs\\.?|INR|₹|\\$)\\s*[0-9][0-9,]*(?:\\.[0-9]+)?(?:[kKmMbB]{1,2})?' +
        '(?:\\s*(?:bn|b\\.?n\\.?|billion|m(?:illion)?|k|thousand|crore|cr|lakh|lac|lacs|lakhs))?' +
        '(?:\\s*(?:dollars|usd|rupees|inr))?' +
        ')' +
        '|' +
        // Suffix currency form: e.g. 25 crore rupees, 50 lakh rupees
        '(?:[0-9][0-9,]*(?:\\.[0-9]+)?' +
        '(?:\\s*(?:bn|b\\.?n\\.?|billion|m(?:illion)?|k|thousand|crore|cr|lakh|lac|lacs|lakhs))\\s*(?:dollars|rupees|usd|inr)' +
        ')' +
        ')', 'i'
    );
    // Find all matches and pick the best candidate based on currency presence and scale
    try {
        // First, look for currency-anchored patterns that include attached suffixes
        var currencyAnchoredRegex = /(?:US\$|USD|EUR|€|GBP|£|Rs\.?|INR|₹|\$)\s*[0-9][0-9,]*(?:\.[0-9]+)?(?:[a-zA-Z]{0,3})?(?:\s*(?:bn|b\.?n\.?|billion|m(?:illion)?|mm|k|thousand|crore|cr|lakh|lac|lacs|lakhs))?(?:\s*(?:dollars|usd|rupees|inr))?/i;
        // Use exec loop to capture match indexes so we can deterministically
        // inspect the characters immediately after each match and extend the
        // token when a recognized suffix appears (B, bn, billion, M, crore, etc.).
        var anchored = currencyAnchoredRegex.exec(text);
        var all = [];
        var vr = new RegExp(valueRegex.source, 'ig');
        var mm;
        while ((mm = vr.exec(text)) !== null) {
            all.push({ raw: mm[0], index: mm.index });
        }
        if (anchored && anchored[0]) {
            // move anchored match to front (avoid exact duplicate)
            var a0 = anchored[0].toString().trim();
            all = all.filter(function (x) { return x.raw.toString().trim() !== a0; });
            all.unshift({ raw: a0, index: anchored.index });
        }
        var best = { raw: '', score: 0, scaleRank: 0 };
        function scaleWeight(token) {
            if (!token) return 0;
            token = token.toString().toLowerCase();
            if (token.indexOf('crore') !== -1) return 1e9; // treat as large for ranking
            if (token.indexOf('lakh') !== -1 || token.indexOf('lac') !== -1) return 1e5;
            if (token.indexOf('bn') !== -1 || token.indexOf('billion') !== -1) return 1e9;
            if (token.indexOf('m') !== -1 || token.indexOf('million') !== -1) return 1e6;
            if (token.indexOf('k') !== -1 || token.indexOf('thousand') !== -1) return 1e3;
            return 1;
        }
        for (var ai = 0; ai < all.length; ai++) {
            var entry = all[ai];
            var cand = (entry.raw || '').toString().trim();
            var pos = (typeof entry.index === 'number') ? entry.index : text.toLowerCase().indexOf(cand.toLowerCase());
            if (pos === -1) pos = 0;
            // Look ahead up to 12 characters to capture attached short suffixes
            // (e.g. "$5.6B", "$5.6bn", "5.6B contract", "5.6 crore").
            var look = text.substr(pos + cand.length, 12);
            var attach = null;
            if (look) {
                // capture common suffix words or short letter suffixes
                var am = look.match(/^[\s\.,:\-]*((?:bn|b\.?n\.?|billion|mm|m|million|k|thousand|crore|cr|lakh|lac|lacs|lakhs|[bBkKmM]{1,2}))\b/i);
                if (am && am[1]) attach = am[1];
                else {
                    // also accept single-letter attached suffixes only when not
                    // followed by other letters (avoid matching start of words like "Brent").
                    var am2 = look.match(/^[\s\.,:\-]*([bBkKmM]{1,2})(?![a-zA-Z])/);
                    if (am2 && am2[1]) attach = am2[1];
                }
            }
            if (attach) {
                cand = cand + attach;
            }
            var candClean = cand.replace(/[\.,;:\)\]]+$/g, '');
            var lower = candClean.toLowerCase();
            var score = 0;
            // currency presence boosts score
            if (/[\$€£₹]|\b(us\$|usd|eur|gbp|rs\.?|inr)\b/i.test(lower)) score += 1000;
            // scale weight
            var sw = scaleWeight(lower);
            score += Math.log(sw + 1);
            // numeric magnitude heuristic: count digits
            var digits = (candClean.match(/[0-9]/g) || []).length;
            score += digits;
            if (score > best.score) {
                best = { raw: candClean, score: score, scaleRank: sw };
            }
        }
        if (best.raw) res.dealValue = best.raw;
    } catch (e) {
        // fallback to first match
        var mv = text.match(valueRegex);
        if (mv) {
            var val = mv[0].toString().trim();
            val = val.replace(/[\.,;:\)\]]+$/g, '');
            res.dealValue = val;
        }
    }
    // parse monetary value into a canonical numeric amount and currency when possible
    try {
        if (res.dealValue) {
            res.dealValueRaw = res.dealValue;
            var _parsedMoney = parseMonetaryValue(res.dealValue);
            if (_parsedMoney && typeof _parsedMoney.amount === 'number') {
                res.dealValueNumeric = _parsedMoney.amount;
            }
            if (_parsedMoney && _parsedMoney.currency) res.dealValueCurrency = _parsedMoney.currency;
        }
    } catch (e) { /* ignore parsing errors */ }
    var regGuess = guessRegionFromText(text);
    if (regGuess) res.region = canonicalizeRegion(regGuess) || regGuess;
    try { res.industry = identifyIndustry(text) || ''; } catch (e) { res.industry = ''; }
    try { res.commodity = identifyCommodity(text) || ''; } catch (e) { res.commodity = ''; }
    var priceRegex = /\$\s?[0-9]+(?:\.[0-9]+)?\s?\/?bbl|\$\s?[0-9,.]+|\b(up|down|rose|fell|declined)\s+[0-9\.]+%/i;
    var p = text.match(priceRegex);
    if (p) res.priceInfo = p[0];
    return res;
}

/**
 * Parse a monetary phrase (e.g. "$1.4 billion", "Rs 120 crore") and return
 * a canonical numeric amount plus currency when detectable.
 * @param {string} raw
 * @return {{raw: string, amount?: number, currency?: string, scale?: number}}
 */
function parseMonetaryValue(raw) {
    if (!raw) return { raw: raw };
    var s = raw.toString().trim();
    // strip surrounding quotes/parentheses and trailing punctuation
    s = s.replace(/^[\s"'\(]+|[\s\)"'\.;,:]+$/g, '');
    var currency = '';
    if (/^\$/.test(s) || /\b(us\$|usd)\b/i.test(s)) currency = 'USD';
    else if (/€/.test(s) || /\b(eur)\b/i.test(s)) currency = 'EUR';
    else if (/£/.test(s) || /\b(gbp)\b/i.test(s)) currency = 'GBP';
    else if (/₹/.test(s) || /\b(rs\.?|inr)\b/i.test(s)) currency = 'INR';
    // Prefer numeric token that is adjacent to a currency symbol/code or a
    // scale token. Fall back to the first numeric token.
    var m = null;
    // 1) currency-anchored: symbol or code followed by number
    m = s.match(/(?:US\$|USD|EUR|€|GBP|£|Rs\.?|INR|₹|\$)\s*([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)([a-zA-Z]{0,3})?/i);
    if (!m) {
        // 2) number followed by scale token and optional currency word
        m = s.match(/([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)\s*(bn|billion|mm|m|million|k|thousand|crore|lakh)\b/i);
    }
    if (!m) {
        // 3) fallback: first numeric token
        m = s.match(/([0-9]{1,3}(?:[0-9,\.]*[0-9])?(?:\.[0-9]+)?)/);
    }
    if (!m) return { raw: raw, currency: currency || null };
    var numStr = m[1].replace(/,/g, '');
    var n = parseFloat(numStr);
    if (isNaN(n)) return { raw: raw, currency: currency || null };
    var lower = s.toLowerCase();
    // Look for scale indicators immediately after the matched numeric token
    var idx = s.indexOf(m[1]);
    var after = '';
    if (idx !== -1) after = s.substring(idx + m[1].length).toLowerCase();
    after = after.replace(/^[\s\.,:-]*/g, '');
    var scale = 1;
    // crore / lakh
    if (/^crore\b/.test(after) || /\bcrore\b/.test(lower)) scale = 1e7;
    else if (/^(lakh|lac|lacs|lakhs)\b/.test(after) || /\b(lakh|lac|lacs|lakhs)\b/.test(lower)) scale = 1e5;
    // million indicators: mm, m, million
    else if (/^(mm|m)\b/.test(after) || /\bmm\b/.test(lower) || /\bmillion\b/.test(lower)) scale = 1e6;
    // billion indicators: bn, b, billion
    else if (/^(bn|b)\b/.test(after) || /\bbn\b/.test(lower) || /\bbillion\b/.test(lower)) scale = 1e9;
    // thousand / k
    else if (/^(thousand|k)\b/.test(after) || /\b(thousand|k)\b/.test(lower)) scale = 1e3;
    // if still unknown, check a short suffix without word boundary (e.g. 4.5MM attached)
    if (scale === 1 && after) {
        var short = after.match(/^([0-9]*\.?[0-9]*)([a-z]{1,2})/i);
        if (short && short[2]) {
            var suf = short[2].toLowerCase();
            if (suf === 'm' || suf === 'mm') scale = 1e6;
            else if (suf === 'b') scale = 1e9;
            else if (suf === 'k') scale = 1e3;
        }
    }
    var amount = n * scale;
    return { raw: raw, amount: amount, currency: currency || null, scale: scale };
}

/**
 * Heuristic: determine if an item is likely about oil & gas based on token matching.
 * @param {FeedItem} item
 * @return {boolean}
 */
function isAboutOilAndGas(item) {
    var text = ((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.content || '')).toLowerCase();
    if (!text) return false;
    var tokens = ['oil', 'gas', 'crude', 'brent', 'wti', 'petrol', 'pipeline', 'rig', 'platform', 'offshore', 'onshore', 'refinery', 'ngl', 'lng', 'liquefied natural gas', 'upstream', 'midstream', 'downstream', 'petro', 'fossil', 'exploration', 'drilling', 'well', 'barrel', 'barrels', 'hydrocarbon', 'psa', 'production'];
    for (var i = 0; i < tokens.length; i++) if (text.indexOf(tokens[i]) !== -1) return true;
    return false;
}

/**
 * Return true if the item matches one of the provided query strings and is about oil & gas.
 * @param {FeedItem} item
 * @param {Array<string>} queries
 * @return {boolean}
 */
function matchesQueries(item, queries) {
    if (!isAboutOilAndGas(item)) return false;
    if (!queries || queries.length === 0) return true;
    var hay = ((item.title || '') + ' ' + (item.summary || '')).toLowerCase();
    return queries.some(function (q) { return hay.indexOf(q.toLowerCase()) !== -1; });
}

/**
 * Debug helper: return monetary regex matches and parsing result for a string.
 * Run from the Apps Script editor to inspect why a headline matched (or not).
 * @param {string} text
 * @return {Object}
 */
function debugMonetaryExtraction(text) {
    if (!text) return { matches: [], parsed: null };
    var valueRegex = new RegExp(
        '(?:' +
        '(?:' + '(?:US\\$|USD|EUR|€|GBP|£|Rs\\.?|INR|₹|\\$)\\s*[0-9][0-9,]*(?:\\.[0-9]+)?' +
        '(?:\\s*(?:bn|b\\.?n\\.?|billion|m(?:illion)?|k|thousand|crore|cr|lakh|lac|lacs|lakhs))?' +
        '(?:\\s*(?:dollars|usd|rupees|inr))?' +
        ')' +
        '|' +
        '(?:[0-9][0-9,]*(?:\\.[0-9]+)?' +
        '(?:\\s*(?:bn|b\\.?n\\.?|billion|m(?:illion)?|k|thousand|crore|cr|lakh|lac|lacs|lakhs))\\s*(?:dollars|rupees|usd|inr)' +
        ')' +
        ')', 'ig'
    );
    // Collect matches with positions and try to extend them like in analyzeItem
    var vr = new RegExp(valueRegex.source, 'ig');
    var m;
    var results = [];
    while ((m = vr.exec(text)) !== null) {
        var token = m[0];
        var idx = m.index;
        var look = text.substr(idx + token.length, 12);
        var attach = null;
        if (look) {
            var am = look.match(/^[\s\.,:\-]*((?:bn|b\.?n\.?|billion|mm|m|million|k|thousand|crore|cr|lakh|lac|lacs|lakhs|[bBkKmM]{1,2}))\b/i);
            if (am && am[1]) attach = am[1];
            else {
                var am2 = look.match(/^[\s\.,:\-]*([bBkKmM]{1,2})(?![a-zA-Z])/);
                if (am2 && am2[1]) attach = am2[1];
            }
        }
        var extended = token;
        if (attach) extended = token + attach;
        results.push({ token: token, index: idx, extended: extended, lookahead: look });
    }
    var chosen = results.length ? results[0].extended : null;
    var parsed = chosen ? parseMonetaryValue(chosen) : null;
    return { matches: results, chosen: chosen, parsed: parsed, text: text };
}
