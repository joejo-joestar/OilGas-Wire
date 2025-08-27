/**
 * @file Config.gs
 * Top-level configuration used by the feed fetcher and sheet writer.
 *
 * Purpose:
 * - `CONFIG` defines categories (tabs), their headers, and the feed URLs and
 *   Google News query seeds to collect items for each category.
 * - The other exported variables (e.g. `FETCH_OPTIONS`, `KNOWN_COMPANIES`,
 *   `REGION_CANONICALS`, `COMMODITIES`, `INDUSTRIES`, `INDUSTRY_ALIASES`)
 *   provide tunable heuristics for content analysis, classification, and
 *   de-duplication used throughout the helpers in `src/Utils`.
 *
 * Editing guidance:
 * - To add/remove a feed or category, update the `CONFIG` array while
 *   preserving its objects' shape: {category, sheetName, headers, feeds, googleNewsQueries}.
 * - Change fuzzy thresholds or snippet length via `FUZZY_THRESHOLD` and
 *   `ARTICLE_SNIPPET_MAX`.
 */

/**
 * Spreadsheet ID to use. If null, the script property `SHEET_ID` will be used.
 * Set this to a specific Google Sheet ID string to avoid needing to set the
 * script property. Example: '1AbCdeFGhIJKlmNoPqRstUVwXyZ1234567890abcdefg'
 */

var SHEET_ID = null;

/**
 * @typedef {Object} FeedItem
 * @property {string} title
 * @property {string} link
 * @property {string|Date} pubDate
 * @property {string} summary
 * @property {string} content
 * @property {string} source
 * @property {string} feedUrl
 * @property {FeedAnalysis=} analysis  Optional richer analysis produced by `analyzeItem()`
 */

/**
 * @typedef {Object} FeedAnalysis
 * @property {string} company
 * @property {string} dealType
 * @property {string} dealValue
 * @property {string} region
 * @property {string} commodity
 * @property {string} industry
 * @property {string} priceInfo
 */

/**
 * @typedef {Object} CategoryConfig
 * @property {string} category
 * @property {string} sheetName
 * @property {Array<string>} headers
 * @property {Array<string>} feeds
 * @property {Array<string>=} googleNewsQueries
 * @property {Array<string>=} queries  Optional alternate queries array used by matching logic
 */

/**
 * Configuration for categories, their associated RSS/Atom feeds, and sheet headers.
 * Each category will be a separate tab in the configured Google Sheet.
 * Modify this configuration to add/remove categories or change feed URLs.
 */
var CONFIG = [
    {
        category: 'Unified News',
        sheetName: 'Unified News',
        headers: ['Date', 'Headline', 'Company', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: [
            'https://oilprice.com/rss/main',
            'https://www.saudigulfprojects.com/feed/',
            'https://www.offshore-technology.com/feed/',
            'https://www.rigzone.com/news/rss/rigzone_original.aspx',
            'https://www.offshore-energy.biz/feed/',
            'https://www.naturalgasworld.com/rss'
        ],
        googleNewsQueries: [
            "oil and gas contract awarded",
            "oil and gas downstream contract awarded",
            "oil and gas upstream contract awarded",
            "oil and gas midstream contract awarded",
            "oil and gas flng",
            "oil and gas drilling",
            "oil and gas production",
            "oil and gas refinery",
            "oil and gas water and waste water treatment",
            "oil and gas water and waste watersolutions",
            "oil and gas chemicals",
            "oil and gas liquid mud plant",
            "oil and gas vessel",
            "opec oil decision"
        ]
    },
    {
        category: 'Oil, Gas, and Raw Materials',
        sheetName: 'Oil, Gas, and Raw Materials',
        headers: ['Date', 'Headline', 'Commodity', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: [
            'https://oilprice.com/rss/main',
            'https://www.investing.com/rss/news_11.rss',
            'https://www.investing.com/rss/news_25.rss',
            'https://www.naturalgasworld.com/rss'
        ],
        googleNewsQueries: [
            "crude oil price",
            "brent oil price",
            "wti oil price",
            "natural gas price",
            "lng price",
            "steel pipe price",
            "carbon steel price",
            "seamless pipe price",
            "drill pipe price",
            "diesel fuel price",
            "oil and gas chemical price"
        ]
    },
    {
        category: 'Leadership Changes',
        sheetName: 'Leadership Changes',
        headers: ['Date', 'Headline', 'Industry', 'Company / Individual', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: [
            'https://www.offshore-technology.com/feed/',
        ],
        googleNewsQueries: [
            "ceo appointed oil and gas",
            "new executive hire oil and gas",
            "named ceo oil and gas",
            "appointed ceo oil and gas",
            "appointed cfo oil and gas",
            "appointed chairman oil and gas",
            "board appointment oil and gas",
            "executive appointment oil and gas",
            "leadership change energy sector",
            "leadership reshuffle energy sector",
            "ceo resigns oil and gas",
            "ceo steps down oil and gas",
            "joins board oil and gas",
            "promoted to ceo oil and gas",
            "managing director appointed oil and gas",
            "hydrogen industry leadership transition",
            "appointed ceo hydrogen",
            "hydrogen executive appointment",
            "hydrogen startup leadership news",
            "water treatment company ceo change",
            "water sector board reshuffle",
            "appointed ceo water treatment",
            "water treatment executive appointment"
        ],
    },
    {
        category: 'Mergers, Acquisitions, and Joint Ventures',
        sheetName: 'Mergers, Acquisitions, and Joint Ventures',
        headers: ['Date', 'Headline', 'Companies', 'Region', 'Article', 'Source', 'Link'],
        feeds: [
            'https://www.ft.com/?format=rss',
        ],
        googleNewsQueries: [
            "oil and gas merger",
            "oil and gas acquisition",
            "oil and gas acquires",
            "oil and gas joint venture",
            "oil and gas jv",
            "oil and gas buyout"
        ],
    }
];

var FETCH_OPTIONS = {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36'
    }
};

var MIN_YEAR = 2025;

var KNOWN_COMPANIES = [
    // National oil companies & majors
    'Saudi Aramco', 'Aramco', 'ADNOC', 'Abu Dhabi National Oil Company', 'QatarEnergy', 'Qatar Petroleum', 'Kuwait Oil Company', 'KOC', 'ENOC',
    'BP', 'Royal Dutch Shell', 'Shell', 'ExxonMobil', 'Chevron', 'TotalEnergies', 'Total', 'Equinor', 'Petronas', 'ConocoPhillips', 'Eni', 'OMV', 'Pemex',
    'Sinopec', 'CNPC', 'CNOOC', 'PetroChina', 'Lukoil', 'Rosneft', 'Gazprom', 'Repsol', 'Pertamina', 'PTT', 'YPF',

    // Oilfield services & contractors
    'Halliburton', 'Schlumberger', 'Baker Hughes', 'Weatherford', 'Technip', 'TechnipFMC', 'Saipem', 'Petrofac', 'Technomak', 'Subsea7', 'McDermott', 'KBR', 'Worley', 'Jacobs', 'Fluor', 'Bechtel', 'Aker Solutions',

    // Energy / LNG / midstream
    'Sapura Energy', 'Golar', 'Mitsui', 'JGC', 'Chiyoda', 'KBR', 'Wood', 'McDermott International', 'Bloom Energy',

    // Water / environmental / energy transition & other requested firms
    'Veolia', 'GE Water', 'Xylem', 'Suez', 'NEL'
];

var KNOWN_REGIONS = [
    'UAE', 'United Arab Emirates', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Saudi Arabia', 'KSA', 'Riyadh', 'Jeddah', 'Qatar', 'Doha', 'Kuwait', 'Oman', 'Bahrain', 'Iraq', 'Iran',
    'Gulf', 'GCC', 'Middle East', 'North Sea', 'Norway', 'UK', 'Scotland', 'West Africa', 'Nigeria', 'Angola', 'Gabon', 'East Africa', 'Mozambique',
    'Asia', 'Southeast Asia', 'Indonesia', 'Malaysia', 'Brunei', 'Vietnam', 'China', 'India', 'Pakistan',
    'USA', 'United States', 'United States of America', 'US', 'U.S.', 'America', 'Canada', 'Mexico', 'Latin America', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Venezuela',
    'Ukraine', 'Russia', 'Europe', 'Mediterranean', 'Caspian', 'Kazakhstan', 'Azerbaijan', 'Turkmenistan', 'Russia', 'Siberia', 'Australia', 'New Zealand'
];

var REGION_CANONICALS = {
    'middle east': 'Middle East', 'me': 'Middle East', 'mena': 'Middle East',
    'gulf': 'Gulf', 'gcc': 'GCC',
    'europe': 'Europe',
    'asia': 'Asia',
    'india': 'India',
    'africa': 'Africa',
    'usa': 'USA', 'us': 'USA', 'u.s.': 'USA', 'united states': 'USA', 'united states of america': 'USA', 'america': 'USA',
    'uk': 'UK', 'united kingdom': 'UK', 'great britain': 'UK', 'britain': 'UK',
    'uae': 'UAE', 'united arab emirates': 'UAE',
    'russia': 'Russia', 'russian federation': 'Russia',
    'china': 'China', 'peoples republic of china': 'China',
    'qatar': 'Qatar',
    'saudi arabia': 'Saudi Arabia', 'ksa': 'Saudi Arabia',
    'ukraine': 'Ukraine',
    'iran': 'Iran', 'islamic republic of iran': 'Iran',
    'iraq': 'Iraq', 'republic of iraq': 'Iraq',
    'australia': 'Australia', 'new zealand': 'New Zealand',
};

var COMMODITIES = ["Oil", "Gas", "LNG", "Steel", "Pipe", "Chemical", "Valve", "Flange", "Diesel"];

var INDUSTRIES = ['Oil & Gas', 'Hydrogen', 'Water Treatment'];

var INDUSTRY_ALIASES = {
    'oil & gas': ['oil', 'gas', 'petrol', 'petroleum', 'crude', 'upstream', 'midstream', 'downstream', 'refinery', 'rig', 'drill', 'well', 'platform'],
    'hydrogen': ['hydrogen', 'h2', 'fuel cell', 'green hydrogen', 'blue hydrogen'],
    'water treatment': ['water treatment', 'water', 'wastewater', 'sewage', 'desalination', 'water sector', 'water services']
};

var ARTICLE_SNIPPET_MAX = 100;

// Fuzzy matching threshold (0..1). Higher is stricter.
var FUZZY_THRESHOLD = 0.80;


