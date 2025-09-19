function generateKeywordIdfScores() {
    // --- CONFIGURATION ---
    var sheetName = 'Oil & Gas News';
    var textColumns = ['Headline', 'Snippet'];
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
        'well completion', 'epc contract', 'feed', 'front-end engineering design', 'contract', 'project', 'oil', 'gas'
    ];
    // --- END CONFIGURATION ---

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
        Logger.log('Error: Sheet "%s" not found.', sheetName);
        return;
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colIndices = textColumns.map(function (colName) {
        var index = headers.indexOf(colName);
        if (index === -1) Logger.log('Warning: Column "%s" not found.', colName);
        return index;
    }).filter(function (index) { return index !== -1; });

    var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
    var values = range.getValues();
    var totalDocuments = values.length;
    var docFrequencies = {};

    keywordList.forEach(function (keyword) {
        docFrequencies[keyword] = 0;
    });

    values.forEach(function (row) {
        var combinedText = colIndices.map(function (index) {
            return row[index];
        }).join(' ').toLowerCase();

        keywordList.forEach(function (keyword) {
            if (combinedText.includes(keyword.toLowerCase())) {
                docFrequencies[keyword]++;
            }
        });
    });

    var idfScores = {};
    keywordList.forEach(function (keyword) {
        var freq = docFrequencies[keyword];
        // Add 1 to avoid division by zero for keywords not found in the corpus
        idfScores[keyword] = Math.log(totalDocuments / (1 + freq));
    });

    // Log the result as a JSON string to copy/paste
    Logger.log('Copy the object below and paste it into Config.gs as KEYWORD_IDF_SCORES');
    Logger.log(JSON.stringify(idfScores, null, 2));
}