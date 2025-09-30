function generateKeywordIdfScores() {
    // --- CONFIGURATION ---
    // Use all configured category sheets from CONFIG and the common text columns
    var textColumns = ['Headline', 'Snippet'];
    var sheetNames = [];
    try {
        if (typeof CONFIG !== 'undefined' && Array.isArray(CONFIG)) {
            CONFIG.forEach(function (c) { if (c && c.sheetName) sheetNames.push(c.sheetName); });
        }
        // ensure unique
        sheetNames = sheetNames.filter(function (v, i, a) { return a.indexOf(v) === i; });
    } catch (e) {
        // fallback to the original single sheet if CONFIG isn't available
        sheetNames = ['Oil & Gas News'];
    }
    var keywordList = [
        'al shirawi equipment', 'al shirawi', 'adnoc', 'abu dhabi national oil company', 'saudi aramco', 'aramco', 'qatarEnergy',
        'koc', 'kuwait oil company', 'enoc', 'emirates national oil company', 'dragon oil', 'petroleum development oman', 'pdo',
        'totalenergies', 'total', 'bp', 'shell', 'exxonmobil', 'chevron', 'eni', 'occidental petroleum', 'oxy', 'petrofac',
        'saipem', 'technipfmc', 'mcdermott', 'l&t', 'larsen & toubro', 'worley', 'kbr', 'schlumberger', 'slb',
        'halliburton', 'baker hughes', 'weatherford', 'nov', 'national oilwell varco', 'ades holding', 'subsea7',
        'uae', 'united arab emirates', 'abu dhabi', 'dubai', 'sharjah', 'saudi arabia', 'ksa', 'qatar', 'oman',
        'kuwait', 'bahrain', 'middle east', 'gcc', 'gulf cooperation council', 'mena', 'drilling rig', 'jack-up rig',
        'wellhead', 'pipeline', 'piping', 'octg', 'oil country tubular goods', 'storage tanks', 'vessels', 'compressor',
        'pump', 'valve', 'fpso', 'lng terminal', 'gas plant', 'upstream', 'midstream', 'downstream', 'onshore',
        'offshore', 'exploration', 'drilling', 'production', 'refinery', 'petrochemical', 'well services',
        'well completion', 'epc contract', 'feed', 'contract', 'project', 'oil', 'gas',

        // Keywords from alshirawiequipment.com (Oil & Gas only)
        'cameron', 'woodserv', 'emerson', 'kaeser', 'nps', 'peerless', // Partners & Brands in O&G
        'well testing', 'early production facility', 'epf', 'process packages', // Services
        'cementing equipments', 'fracturing equipments', 'coil tubing', 'pressure pumping', // Well Services Equipment
        'liquid mud plant', 'lmp', 'water treatment', 'metering skid', // Products & Facilities

        // Broader Energy Sector & Energy Transition Keywords
        'plugpower', 'hydrogen', 'fuel cell', 'green hydrogen', 'blue hydrogen', 'electrolyzer',
        'energy sector', 'energy transition', 'renewable energy', 'decarbonization', 'sustainability'
    ];
    // --- END CONFIGURATION ---
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var docs = []; // one document per row across all chosen sheets
    var docFrequencies = {};

    // initialize frequencies
    keywordList.forEach(function (keyword) { docFrequencies[keyword] = 0; });

    sheetNames.forEach(function (sName) {
        try {
            var sheet = ss.getSheetByName(sName);
            if (!sheet) {
                Logger.log('Warning: sheet "%s" not found, skipping.', sName);
                return;
            }
            var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
            var colIndices = textColumns.map(function (colName) {
                var index = headers.indexOf(colName);
                if (index === -1) {
                    Logger.log('Warning: Column "%s" not found in sheet "%s".', colName, sName);
                }
                return index;
            }).filter(function (index) { return index !== -1; });
            if (colIndices.length === 0) return;

            var lastRow = sheet.getLastRow();
            if (lastRow <= 1) return;

            var range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
            var values = range.getValues();
            values.forEach(function (row) {
                var combinedText = colIndices.map(function (index) {
                    var v = row[index];
                    return (v === null || typeof v === 'undefined') ? '' : v.toString();
                }).join(' ').toLowerCase();
                // consider empty rows as non-documents
                if (!combinedText || combinedText.trim().length === 0) return;
                docs.push(combinedText);
            });
        } catch (e) {
            Logger.log('Error reading sheet "%s": %s', sName, e && e.message);
        }
    });

    var totalDocuments = docs.length || 0;
    if (totalDocuments === 0) {
        Logger.log('No documents found across sheets: %s', sheetNames.join(', '));
        return;
    }

    // Count document frequencies: number of docs that mention the keyword at least once
    docs.forEach(function (doc) {
        keywordList.forEach(function (keyword) {
            if (doc.indexOf(keyword.toLowerCase()) !== -1) {
                docFrequencies[keyword]++;
            }
        });
    });

    var idfScores = {};
    keywordList.forEach(function (keyword) {
        var freq = docFrequencies[keyword] || 0;
        idfScores[keyword] = Math.log(totalDocuments / (1 + freq));
    });

    Logger.log('Computed IDF scores from %s documents across sheets: %s', totalDocuments, sheetNames.join(', '));
    Logger.log('Copy the object below and paste it into Config.gs as KEYWORD_IDF_SCORES');
    Logger.log(JSON.stringify(idfScores, null, 2));
}