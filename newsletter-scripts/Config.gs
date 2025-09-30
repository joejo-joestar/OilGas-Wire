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
    'https://oilprice.com/rss.xml',
    'https://naturalgasintel.com/feed',
    'https://www.offshore-technology.com/feed/',
    'https://www.energynewsbulletin.net/.rss',
    'https://www.ttnews.com/rss.xml/',
    'https://hydrogen-central.com/feed/',
    'https://www.accessnewswire.com/feed/rss2',
    'https://www.manufacturingdive.com/feeds/news/',
    'https://fuelcellsworks.com/feed',
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
        primaryKeywords: ["appointed", "appoints", "named", "names", "joins", "joined", "promoted", "promotes", "resigns", "resigned", "steps down", "retires", "transition"],
        secondaryKeywords: ["ceo", "cfo", "chairman", "board", "executive", "leadership", "managing director", "president", "vp"]
    },
    {
        category: 'Mergers, Acquisitions, and Joint Ventures',
        sheetName: 'Mergers, Acquisitions, and Joint Ventures',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Companies', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
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
        primaryKeywords: ["merger", "acquisition", "acquires", "buyout", "joint venture", "jv", "strategic partnership", "collaboration", "alliance", "partnership"],
        secondaryKeywords: ["oil", "gas", "energy", "petroleum", "hydrogen", "water treatment", "pipeline", "refinery"]
    },
    {
        category: 'Events and Conferences',
        sheetName: 'Events and Conferences',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
        googleNewsQueries: [
            "oil and gas conference",
            "oil and gas event",
            "oil and gas summit",
            "oil and gas forum",
            "oil and gas exhibition",
            "oil and gas expo",
            "hydrogen conference",
            "hydrogen event",
            "hydrogen summit",
            "hydrogen forum",
            "hydrogen exhibition",
            "hydrogen expo",
            "water treatment conference",
            "water treatment event",
            "water treatment summit",
            "water treatment forum",
            "water treatment exhibition",
            "water treatment expo"
        ],
        primaryKeywords: ["conference", "event", "summit", "forum", "exhibition", "expo", "trade show", "webinar", "workshop", "symposium", "meeting", "convention", "networking", "seminar", "panel"],
        secondaryKeywords: ["oil", "gas", "hydrogen", "water", "petroleum", "adipec", "abu dhabi international petroleum exhibition and conference", "wtc", "offshore technology conference", "otc", "spe", "society of petroleum engineers", "world gas conference", "wgc"]
    },
    {
        category: 'Commodity and Raw Material Prices',
        sheetName: 'Commodity and Raw Material Prices',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Commodity', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
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
        primaryKeywords: ["price", "prices", "pricing", "cost", "market", "futures"],
        secondaryKeywords: ["oil", "gas", "lng", "steel", "crude", "brent", "wti", "diesel", "pipe", "chemical"]
    },
    {
        category: 'Oil & Gas News',
        sheetName: 'Oil & Gas News',
        industry: 'any',
        headers: ['Date', 'Headline', 'Relevance Score', 'Company', 'Price Info.', 'Region', 'Snippet', 'Source', 'Link'],
        feeds: COMMON_FEEDS,
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
            "oil and gas contract announcement",
        ],
        primaryKeywords: ["contract", "awarded", "procurement", "tender", "agreement", "mou", "epc", "feed", "fid", "sanctioned", "approval", "project", "commissioning", "startup", "operations"],
        secondaryKeywords: ["pipeline", "refinery", "well", "drilling", "offshore", "onshore", "lng", "gas", "oil", "petroleum", "field", "platform", "storage tank", "chemical"]
    }
];

/**
 * Optional display order for sections in the mail/web UI. If provided,
 * this array controls the sequence in which sections are rendered without
 * changing the CONFIG array itself. Use exact category titles as defined
 * in the CONFIG entries.
 */
var DISPLAY_ORDER = [
    'Events and Conferences',
    'Oil & Gas News',
    'Commodity and Raw Material Prices',
    'Leadership Changes',
    'Mergers, Acquisitions, and Joint Ventures'
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

/**
 * Pre-calculated Inverse Document Frequency (IDF) scores for keywords.
 * Higher scores mean the keyword is rarer and more significant.
 * Generated by the one-time `generateKeywordIdfScores` utility function.
 */
var KEYWORD_IDF_SCORES = {
  "al shirawi equipment": 7.699842407396986,
  "al shirawi": 7.699842407396986,
  "adnoc": 4.441745869375504,
  "abu dhabi national oil company": 6.601230118728877,
  "saudi aramco": 6.313548046277095,
  "aramco": 5.060785077781727,
  "qatarEnergy": 6.090404494962885,
  "koc": 6.090404494962885,
  "kuwait oil company": 5.908082938168931,
  "enoc": 7.699842407396986,
  "emirates national oil company": 7.699842407396986,
  "dragon oil": 7.00669522683704,
  "petroleum development oman": 7.699842407396986,
  "pdo": 7.699842407396986,
  "totalenergies": 4.203334845930506,
  "total": 4.0622562476706,
  "bp": 3.3691090671106547,
  "shell": 3.76801677467266,
  "exxonmobil": 4.7554034282305455,
  "chevron": 4.7554034282305455,
  "eni": 3.525455137501349,
  "occidental petroleum": 6.601230118728877,
  "oxy": 7.699842407396986,
  "petrofac": 6.090404494962885,
  "saipem": 5.62040086571715,
  "technipfmc": 5.908082938168931,
  "mcdermott": 5.908082938168931,
  "l&t": 6.601230118728877,
  "larsen & toubro": 7.699842407396986,
  "worley": 6.313548046277095,
  "kbr": 5.39725731440294,
  "schlumberger": 7.00669522683704,
  "slb": 5.060785077781727,
  "halliburton": 5.39725731440294,
  "baker hughes": 5.060785077781727,
  "weatherford": 6.313548046277095,
  "nov": 4.23410650459726,
  "national oilwell varco": 7.699842407396986,
  "ades holding": 7.00669522683704,
  "subsea7": 5.1348930499354495,
  "uae": 5.753932258341672,
  "united arab emirates": 7.699842407396986,
  "abu dhabi": 5.753932258341672,
  "dubai": 5.753932258341672,
  "sharjah": 7.699842407396986,
  "saudi arabia": 5.214935757608986,
  "ksa": 7.699842407396986,
  "qatar": 5.753932258341672,
  "oman": 5.060785077781727,
  "kuwait": 5.39725731440294,
  "bahrain": 7.00669522683704,
  "middle east": 4.23410650459726,
  "gcc": 6.313548046277095,
  "gulf cooperation council": 7.699842407396986,
  "mena": 6.313548046277095,
  "drilling rig": 6.601230118728877,
  "jack-up rig": 7.699842407396986,
  "wellhead": 7.699842407396986,
  "pipeline": 3.7295504938448643,
  "piping": 7.699842407396986,
  "octg": 5.908082938168931,
  "oil country tubular goods": 7.00669522683704,
  "storage tanks": 7.699842407396986,
  "vessels": 6.601230118728877,
  "compressor": 7.699842407396986,
  "pump": 6.090404494962885,
  "valve": 7.699842407396986,
  "fpso": 5.502617830060767,
  "lng terminal": 5.753932258341672,
  "gas plant": 6.090404494962885,
  "upstream": 4.298645025734831,
  "midstream": 5.753932258341672,
  "downstream": 7.699842407396986,
  "onshore": 5.060785077781727,
  "offshore": 2.401525040848949,
  "exploration": 4.2658552029118395,
  "drilling": 4.2658552029118395,
  "production": 3.9386422917034234,
  "refinery": 4.991792206294776,
  "petrochemical": 6.313548046277095,
  "well services": 6.601230118728877,
  "well completion": 7.00669522683704,
  "epc contract": 4.86662906334077,
  "feed": 4.7554034282305455,
  "contract": 2.324563999712821,
  "project": 1.8827312474337816,
  "oil": 1.0065187391270372,
  "gas": 0.9676317009297798,
  "cameron": 7.699842407396986,
  "woodserv": 7.699842407396986,
  "emerson": 7.699842407396986,
  "kaeser": 7.699842407396986,
  "nps": 7.699842407396986,
  "peerless": 7.699842407396986,
  "well testing": 7.00669522683704,
  "early production facility": 7.699842407396986,
  "epf": 7.699842407396986,
  "process packages": 7.699842407396986,
  "cementing equipments": 7.699842407396986,
  "fracturing equipments": 7.699842407396986,
  "coil tubing": 7.699842407396986,
  "pressure pumping": 7.699842407396986,
  "liquid mud plant": 7.699842407396986,
  "lmp": 7.699842407396986,
  "water treatment": 4.0362807612673395,
  "metering skid": 7.699842407396986,
  "plugpower": 7.699842407396986,
  "hydrogen": 1.9828147059907644,
  "fuel cell": 3.6393993968505667,
  "green hydrogen": 3.245495111143478,
  "blue hydrogen": 5.502617830060767,
  "electrolyzer": 6.313548046277095,
  "energy sector": 5.62040086571715,
  "energy transition": 5.39725731440294,
  "renewable energy": 4.991792206294776,
  "decarbonization": 7.699842407396986,
  "sustainability": 5.62040086571715
}