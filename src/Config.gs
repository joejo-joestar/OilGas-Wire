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
 * @typedef {Array<string>} FeedLinks
 */
var COMMON_FEEDS = [
    'https://www.oilandgas360.com/feed/',
    'https://www.okenergytoday.com/feed/',
    'https://www.gasworld.com/feed',
    'https://www.saudigulfprojects.com/feed/',
    'https://www.rigzone.com/news/rss/rigzone_original.aspx',
    'https://www.offshore-energy.biz/feed/',
    'https://www.naturalgasworld.com/rss',
    'https://egyptoil-gas.com/feed',
    'https://energetica-india.net/rss.xml',
    'https://economymiddleeast.com/web-stories/feed/',
    'https://www.worldpipelines.com/rss/worldpipelines.xml',
    'https://www.globalcompliancenews.com/feed/',
    'https://oilprice.com/rss/main',
    'https://www.investing.com/rss/news_11.rss',
    'https://www.investing.com/rss/news_25.rss',
    'https://www.fortuneindia.com/feed',
    'https://oilprice.com/rss.xml',
    'https://naturalgasintel.com/feed',
    'https://www.offshore-technology.com/feed/',
    'https://fortworthinc.com/api/rss/content.rss',
    'https://fortune.com/feed/fortune-feeds/?id=3230629',
    'https://www.energynewsbulletin.net/.rss',
    'https://www.ttnews.com/rss.xml/',
    'https://hydrogen-central.com/feed/',
    'https://www.accessnewswire.com/feed/rss2',
    'https://www.manufacturingdive.com/feeds/news/',
    'https://fuelcellsworks.com/feed',
    'https://www.hartenergy.com/rss',
    'https://insideclimatenews.org/feed/',
    'https://www.energy-pedia.com/rss.aspx?newsfeedid=1',
    'https://www.agbi.com/feed',
];


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
        category: 'Leadership Changes',
        sheetName: 'Leadership Changes',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Industry', 'Company / Individual', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: ["oil and gas executive appointment", "named ceo oil and gas", "appointed cfo oil and gas", "board appointment oil and gas", "ceo resigns oil and gas", "hydrogen executive appointment", "water treatment company ceo change"],
        primaryKeywords: ["appointed", "appoints", "named", "names", "joins", "joined", "promoted", "promotes", "resigns", "resigned", "steps down", "retires", "transition"],
        secondaryKeywords: ["ceo", "cfo", "chairman", "board", "executive", "leadership", "managing director", "president", "vp"]
    },
    {
        category: 'Mergers, Acquisitions, and Joint Ventures',
        sheetName: 'Mergers, Acquisitions, and Joint Ventures',
        industry: 'Oil & Gas',
        headers: ['Date', 'Headline', 'Relevance Score', 'Companies', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: ["oil and gas merger", "oil and gas acquisition", "oil and gas acquires", "oil and gas joint venture", "oil and gas strategic partnership"],
        primaryKeywords: ["merger", "acquisition", "acquires", "buyout", "joint venture", "jv", "strategic partnership", "collaboration", "alliance"],
        secondaryKeywords: ["oil", "gas", "energy", "petroleum", "hydrogen", "water treatment", "pipeline", "refinery"]
    },
    {
        category: 'Events and Conferences',
        sheetName: 'Events and Conferences',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: ["oil and gas conference", "energy summit", "hydrogen expo", "water treatment forum"],
        primaryKeywords: ["conference", "event", "summit", "forum", "exhibition", "expo", "trade show", "webinar", "workshop", "symposium"],
        secondaryKeywords: ["oil", "gas", "hydrogen", "water", "petroleum", "adipec", "otc", "wgc"]
    },
    {
        category: 'Commodity and Raw Material Prices',
        sheetName: 'Commodity and Raw Material Prices',
        industry: 'Oil & Gas',
        headers: ['Date', 'Headline', 'Relevance Score', 'Commodity', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: ["crude oil price", "natural gas price", "lng price", "steel pipe price"],
        primaryKeywords: ["price", "prices", "pricing", "cost", "market", "futures"],
        secondaryKeywords: ["oil", "gas", "lng", "steel", "crude", "brent", "wti", "diesel", "pipe", "chemical"]
    },
    {
        category: 'Oil & Gas News',
        sheetName: 'Oil & Gas News',
        industry: 'Oil & Gas',
        headers: ['Date', 'Headline', 'Relevance Score', 'Company', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: ["oil and gas contract awarded", "oil and gas project announced", "oil and gas tender awarded", "oil and gas pipeline contract", "oil and gas refinery maintenance", "oil and gas drilling contract", "oil and gas epc contract", "oil and gas final investment decision", "fid"],
        primaryKeywords: ["contract", "awarded", "procurement", "tender", "agreement", "mou", "epc", "feed", "fid", "sanctioned", "approval", "project", "commissioning", "startup", "operations"],
        secondaryKeywords: ["pipeline", "refinery", "well", "drilling", "offshore", "onshore", "lng", "gas", "oil", "petroleum", "field", "platform", "storage tank", "chemical"]
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
var FUZZY_DEDUPE_THRESHOLD = 0.90;

// (Optional) Default industry key for categories that accept any industry
var DEFAULT_CATEGORY_INDUSTRY = 'any';
var FUZZY_THRESHOLD = 0.80;

// Add this entire block to the end of your Config.gs file.

/**
 * Keywords for relevance sorting, specific to Al Shirawi Equipment.
 * The system will check from score 5 down to 1. The first match determines the article's score.
 */
var RELEVANCE_KEYWORDS = {
    score5: [ // Direct Mentions & High-Priority Partners
        'al shirawi equipment', 'al shirawi',
        'adnoc', 'abu dhabi national oil company', 'saudi aramco', 'aramco', 'qatarEnergy',
        'koc', 'kuwait oil company', 'enoc', 'emirates national oil company', 'dragon oil',
        'petroleum development oman', 'pdo'
    ],
    score4: [ // Major IOCs & EPC Contractors
        'totalenergies', 'total', 'bp', 'shell', 'exxonmobil', 'chevron', 'eni', 'occidental petroleum', 'oxy',
        'petrofac', 'saipem', 'technipfmc', 'mcdermott', 'l&t', 'larsen & toubro', 'worley', 'kbr'
    ],
    score3: [ // Competitors & Service Companies
        'schlumberger', 'slb', 'halliburton', 'baker hughes', 'weatherford', 'nov', 'national oilwell varco',
        'ades holding', 'subsea7'
    ],
    score2: [ // Geographic Focus
        'uae', 'united arab emirates', 'abu dhabi', 'dubai', 'sharjah', 'saudi arabia', 'ksa', 'qatar',
        'oman', 'kuwait', 'bahrain', 'middle east', 'gcc', 'gulf cooperation council', 'mena'
    ],
    score1: [ // Relevant Products, Services & Industry Terms
        'drilling rig', 'jack-up rig', 'wellhead', 'pipeline', 'piping', 'octg', 'oil country tubular goods',
        'storage tanks', 'vessels', 'compressor', 'pump', 'valve', 'fpso', 'lng terminal', 'gas plant',
        'upstream', 'midstream', 'downstream', 'onshore', 'offshore', 'exploration', 'drilling',
        'production', 'refinery', 'petrochemical', 'well services', 'well completion', 'epc contract',
        'feed', 'front-end engineering design'
    ]
};
