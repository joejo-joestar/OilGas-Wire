var SHEET_ID = null;
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
            "oil and gas Chemicals",
            "oil and gas Liquid mud plant",
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
            'https://www.rigzone.com/news/rss/rigzone_original.aspx',
            'https://www.offshore-technology.com/feed/',
        ],
        googleNewsQueries: [
            "ceo appointed oil and gas",
            "new executive hire oil and gas",
            "leadership change energy sector",
            "hydrogen industry leadership transition",
            "water treatment company ceo change",
            "hydrogen fuel executive appointment",
            "water sector board reshuffle",
            "oil gas board member resignation",
            "hydrogen startup leadership news"
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
            "oil and gas JV",
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
    'Sapura Energy', 'Golar', 'Mitsui', 'JGC', 'Chiyoda', 'KBR', 'Wood', 'McDermott International'
];

var KNOWN_REGIONS = [
    'UAE', 'United Arab Emirates', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Saudi Arabia', 'KSA', 'Riyadh', 'Jeddah', 'Qatar', 'Doha', 'Kuwait', 'Oman', 'Bahrain', 'Iraq', 'Iran',
    'Gulf', 'GCC', 'Middle East', 'North Sea', 'Norway', 'UK', 'Scotland', 'West Africa', 'Nigeria', 'Angola', 'Gabon', 'East Africa', 'Mozambique',
    'Asia', 'Southeast Asia', 'Indonesia', 'Malaysia', 'Brunei', 'Vietnam', 'China', 'India', 'Pakistan',
    'USA', 'United States', 'United States of America', 'US', 'U.S.', 'America', 'Canada', 'Mexico', 'Latin America', 'Brazil', 'Argentina', 'Chile', 'Peru', 'Venezuela',
    'Ukraine', 'Russia', 'Europe', 'Mediterranean', 'Caspian', 'Kazakhstan', 'Azerbaijan', 'Turkmenistan', 'Russia', 'Siberia', 'Australia', 'New Zealand'
];

var ARTICLE_SNIPPET_MAX = 100;

var COMMODITIES = ["Oil", "Gas", "LNG", "Steel", "Pipe", "Chemical", "Valve", "Flange", "Diesel"];

var INDUSTRIES = ['Oil & Gas', 'Hydrogen', 'Water Treatment'];

// Fuzzy matching threshold (0..1). Higher is stricter.
var FUZZY_THRESHOLD = 0.80;

// Map common region name variants to a standardized canonical name/code.
var REGION_CANONICALS = {
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
    'africa': 'Africa',
};

