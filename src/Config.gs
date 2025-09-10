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
 * @typedef {Object} CategoryConfig
 * @property {string} category
 * @property {string} sheetName
 * @property {Array<string>} headers
 * @property {Array<string>} feeds
 * @property {Array<string>=} googleNewsQueries
 */

/**
 * Configuration for categories, their associated RSS/Atom feeds, and sheet headers.
 * Each category will be a separate tab in the configured Google Sheet.
 * Modify this configuration to add/remove categories or change feed URLs.
 */
var CONFIG = [
    {
        category: 'Oil & Gas General News',
        sheetName: 'Oil & Gas General News',
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
            // general project & contract award patterns
            "oil and gas contract awarded",
            "oil and gas contract win",
            "oil and gas contract signed",
            "oil and gas contract extension signed",
            "oil and gas contract renewal signed",
            "oil and gas agreement signed",
            "oil and gas memorandum of understanding signed",

            // project announcements, tenders, procurement and awards (exclude mergers/JVs)
            "oil and gas project awarded",
            "offshore project awarded",
            "onshore project awarded",
            "oil and gas project announced",
            "oil and gas project launched",
            "oil and gas project commissioned",
            "oil and gas project startup",
            "oil and gas tender awarded",
            "oil and gas tender won",
            "oil and gas procurement awarded",
            "oil and gas order awarded",

            // key contract types and scope-specific awards
            "oil and gas pipeline contract awarded",
            "oil and gas pipeline construction contract awarded",
            "oil and gas pipeline maintenance contract awarded",
            "oil and gas pipeline inspection contract awarded",
            "oil and gas pipeline integrity contract awarded",
            "oil and gas pipeline rehabilitation contract awarded",
            "oil and gas pipeline repair contract awarded",
            "oil and gas pipeline coating contract awarded",
            "oil and gas pipeline welding contract awarded",

            "oil and gas refinery contract awarded",
            "oil and gas refinery maintenance contract awarded",
            "oil and gas refinery turnaround contract awarded",
            "oil and gas refinery upgrade contract awarded",

            "oil and gas well service contract awarded",
            "oil and gas well completion contract awarded",
            "oil and gas well testing contract awarded",
            "oil and gas pressure pumping contract awarded",
            "oil and gas drilling contract awarded",

            "oil and gas liquid mud plant project awarded",
            "oil and gas process packages awarded",
            "oil and gas custom manufacturing contract awarded",

            "oil and gas storage tank contract awarded",
            "oil and gas storage tank maintenance contract awarded",
            "oil and gas storage tank inspection contract awarded",

            "oil and gas chemical supply contract awarded",
            "oil and gas chemical manufacturing contract awarded",
            "oil and gas chemical distribution contract awarded",

            // engineering, procurement, construction, FEED, FID
            "oil and gas epc contract awarded",
            "oil and gas engineering procurement construction contract awarded",
            "oil and gas feed contract awarded",
            "oil and gas final investment decision",
            "oil and gas fid",

            // financing, funding, sanction and approvals for projects
            "oil and gas project finance secured",
            "oil and gas project funding",
            "oil and gas project sanctioned",
            "oil and gas project approval",

            // commissioning/operations keywords
            "oil and gas commissioning",
            "oil and gas commissioned",
            "oil and gas started operations",
            "oil and gas commercial operation date",

            // generic award/search terms and fallbacks
            "oil and gas awarded",
            "oil and gas award",
            "oil and gas contract value",
            "oil and gas procurement",
            "oil and gas contract announcement"
        ],
        keywordInclusions: [
            "contract", "contracts", "contracted", "awarded", "award", "awards", "procurement", "procurements",
            "tender", "tenders", "bid", "bids", "bidder", "bidders", "agreement", "agreements",
            "memorandum of understanding", "mou", "epc", "engineering procurement construction",
            "feed", "final investment decision", "fid", "finance", "funding", "sanctioned", "approval",
            "project", "projects", "offshore", "onshore", "commissioning", "commissioned", "operations", "startup", "started operations",
            "pipeline", "refinery", "well", "drilling", "liquid mud", "process package", "custom manufacturing",
            "storage tank", "chemical"
        ],
    },
    {
        category: 'Commodity and Raw Material Prices',
        sheetName: 'Commodity and Raw Material Prices',
        headers: ['Date', 'Headline', 'Commodity', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: [
            'https://oilprice.com/rss/main',
            'https://www.investing.com/rss/news_11.rss',
            'https://www.investing.com/rss/news_25.rss',
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
        ],
        keywordInclusions: [
            "price", "prices", "pricing", "rise", "rises", "rising", "increase", "increases", "increasing",
            "fall", "falls", "falling", "decrease", "decreases", "decreasing", "gain", "gains", "gaining",
            "drop", "drops", "dropping", "decline", "declines", "declining", "surge", "surges", "surging",
            "plunge", "plunges", "plunging", "slump", "slumps", "slumping"
        ],
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
            "water treatment executive appointment",
            "water sector leadership transition"
        ],
        keywordInclusions: [
            "ceo", "chief executive officer", "cfo", "chief financial officer", "chairman", "board member", "board of directors",
            "executive", "leadership", "managing director", "md", "president", "vice president", "vp",
            "appointed", "appoints", "named", "names", "joins", "joined", "promoted", "promotes",
            "resigns", "resigned", "steps down", "steps aside", "retires", "transition", "transitions", "change", "changes", "reshuffle", "reshuffles"
        ],
    },
    {
        category: 'Mergers, Acquisitions, and Joint Ventures',
        sheetName: 'Mergers, Acquisitions, and Joint Ventures',
        headers: ['Date', 'Headline', 'Companies', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: [],
        googleNewsQueries: [
            "oil and gas merger",
            "oil and gas acquisition",
            "oil and gas acquires",
            "oil and gas joint venture",
            "oil and gas jv",
            "oil and gas buyout",
            "oil and gas strategic partnership",
            "hydrogen industry merger",
            "hydrogen industry acquisition",
            "hydrogen joint venture",
            "hydrogen jv",
            "hydrogen strategic partnership",
            "water treatment merger",
            "water treatment acquisition",
            "water treatment joint venture",
            "water treatment jv",
            "water sector strategic partnership"
        ],
        keywordInclusions: [
            "merger", "mergers", "acquisition", "acquisitions", "acquires", "acquire", "buyout", "buyouts",
            "joint venture", "joint ventures", "jv", "jvs", "strategic partnership", "strategic partnerships", "partnership", "partnerships",
            "collaboration", "collaborations", "alliance", "alliances"
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
    'Halliburton', 'Schlumberger', 'SLB', 'Baker Hughes', 'Weatherford', 'Technip', 'TechnipFMC', 'Saipem', 'Petrofac', 'Technomak', 'Subsea7', 'McDermott', 'KBR', 'Worley', 'Jacobs', 'Fluor', 'Bechtel', 'Aker Solutions', 'Taqa', 'NESR', 'Foster Wheeler', 'Wood', 'Transocean', 'Noble Corporation', 'Valaris', 'Diamond Offshore', 'EnscoRowan', 'Seadrill', 'KCA Deutag', 'National Oilwell Varco', 'NOV', 'Emerson', 'Schneider Electric', 'Sensia', 'ABB', 'Siemens Energy', 'GE Oil & Gas', 'BASF', 'Dow Chemical', 'DuPont', 'Ceco Environmental', 'Ecolab',

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


