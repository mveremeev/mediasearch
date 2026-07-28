import { dateOf } from './fields.js';

/* ---------- 1. CONFIG ---------- */
const API_KEY  = '73a984aef9561f5dc7dfedfe90ebf898';
const TMDB     = 'https://api.themoviedb.org/3';
const IMG      = 'https://image.tmdb.org/t/p';
const ANIME_GENRE_ID = 16; // Animation
const ANIME_LANG     = 'ja';
const MAX_PAGE = 500;
const PEOPLE_PREVIEW_MAX = 6;
const CAST_PREVIEW_MAX   = 8;

/* TMDB's `adult` boolean is only meant for hardcore pornography per their contrib rules.
   NSFW filtering targets sexually explicit content (hentai, softcore, etc.).
   Softcore/explicit anime (Overflow et al.) often slip through with adult=false.
   Defence in depth: (1) without_keywords on discover, (2) client-side text scan on results.
   Extend NSFW_BLOCK_KEYWORDS with more TMDB keyword IDs to broaden filtering.  */
const NSFW_BLOCK_KEYWORDS = '198385'; // hentai (movies + TV)
const ADULT_TEXT_HINTS = ['hentai', 'eroge', 'pornograph', 'softcore', 'erotica', 'eroticism'];
/* TMDB keyword IDs we consider sexually explicit. Used by lazy /keywords enrichment so
   cards like Overflow (TMDB adult=false, but tagged hentai/softcore/etc.) still
   get flagged. Kept conservative: nothing here that has legitimate non-explicit uses. */
const NSFW_KEYWORD_IDS = new Set([
  198385, // hentai
  155477, // softcore
  256466, // erotic
  195669, // ecchi
  280783, // pornography
]);
const nsfwKeywordCache = new Map();  // `${mt}:${id}` → boolean
const nsfwLookupInFlight = new Set();

const SERVICES = [
  { v: '8',   name: 'Netflix' },
  { v: '9',   name: 'Prime Video' },
  { v: '337', name: 'Disney+' },
  { v: '384', name: 'HBO / Max',    p: '49|384|1899' },
  { v: '15',  name: 'Hulu' },
  { v: '350', name: 'Apple TV+' },
  { v: '531', name: 'Paramount+',   p: '531|582|1770' },
  { v: '386', name: 'Peacock',      p: '386|387' },
  { v: '283', name: 'Crunchyroll' },
  { v: '43',  name: 'Starz' },
  { v: '37',  name: 'Showtime' },
  { v: '526', name: 'AMC+',         p: '526|528' },
  { v: '584', name: 'Discovery+',   p: '584|1771' },
  { v: '73',  name: 'Tubi',         p: '73|1875' }, 
  { v: '300', name: 'Pluto TV' },
  { v: '207', name: 'Roku' },
];

const PROVIDER_URLS = {
  8:'https://www.netflix.com/', 9:'https://www.amazon.com/gp/video/', 10:'https://www.amazon.com/gp/video/',
  15:'https://www.hulu.com/', 37:'https://www.showtime.com/', 43:'https://www.starz.com/',
  78:'https://www.paramountplus.com/', 79:'https://www.amcplus.com/', 526:'https://www.amcplus.com/',
  528:'https://www.amcplus.com/', 119:'https://www.amazon.com/gp/video/', 175:'https://www.netflix.com/',
  283:'https://www.crunchyroll.com/', 337:'https://www.disneyplus.com/', 350:'https://tv.apple.com/',
  384:'https://www.max.com/', 386:'https://www.peacocktv.com/', 387:'https://www.peacocktv.com/',
  531:'https://www.paramountplus.com/', 582:'https://www.paramountplus.com/', 1770:'https://www.paramountplus.com/',
  1796:'https://www.netflix.com/', 1899:'https://www.max.com/', 49:'https://www.max.com/',
  2:'https://tv.apple.com/', 3:'https://play.google.com/store/movies', 192:'https://www.youtube.com/',
  188:'https://www.youtube.com/feed/storefront', 7:'https://www.vudu.com/',
  68:'https://www.microsoft.com/en-us/store/movies-and-tv', 352:'https://www.amcplus.com/',
  1875:'https://tubitv.com/', 73:'https://tubitv.com/', 300:'https://pluto.tv/', 257:'https://www.fubo.tv/',
  1771:'https://www.discoveryplus.com/', 584:'https://www.discoveryplus.com/',
  207:'https://www.roku.com/whats-on/the-roku-channel', 538:'https://www.plex.tv/',
};

const VPN_LIST = [
  { name:'NordVPN', url:'https://nordvpn.com/' },
  { name:'Windscribe', url:'https://windscribe.com/' },
  { name:'Mullvad', url:'https://mullvad.net/' },
  { name:'Proton VPN', url:'https://protonvpn.com/' },
  { name:'Surfshark', url:'https://surfshark.com/' },
  { name:'ExpressVPN', url:'https://www.expressvpn.com/' },
  { name:'PIA VPN', url:'https://www.privateinternetaccess.com/' },
  { name:'TunnelBear', url:'https://www.tunnelbear.com/' },
  { name:'Hide.me', url:'https://hide.me/' },
];

/* TMDB discover supports only one `with_original_language` (ISO 639-1).
   Curated list of the most-represented languages on TMDB. Extend as needed -
   the chip panel auto-builds from this. `name` is English; `native` is the
   endonym (language's name in its own language) for future bilingual display. */
const LANGUAGES = [
  { v: 'en', name: 'English',    native: 'English' },
  { v: 'ja', name: 'Japanese',   native: '日本語' },
  { v: 'ko', name: 'Korean',     native: '한국어' },
  { v: 'es', name: 'Spanish',    native: 'Español' },
  { v: 'fr', name: 'French',     native: 'Français' },
  { v: 'de', name: 'German',     native: 'Deutsch' },
  { v: 'it', name: 'Italian',    native: 'Italiano' },
  { v: 'pt', name: 'Portuguese', native: 'Português' },
  { v: 'ru', name: 'Russian',    native: 'Русский' },
  { v: 'zh', name: 'Chinese',    native: '中文' },
  { v: 'cn', name: 'Mandarin',   native: '普通话' },
  { v: 'hi', name: 'Hindi',      native: 'हिन्दी' },
  { v: 'ta', name: 'Tamil',      native: 'தமிழ்' },
  { v: 'te', name: 'Telugu',     native: 'తెలుగు' },
  { v: 'ar', name: 'Arabic',     native: 'العربية' },
  { v: 'tr', name: 'Turkish',    native: 'Türkçe' },
  { v: 'nl', name: 'Dutch',      native: 'Nederlands' },
  { v: 'sv', name: 'Swedish',    native: 'Svenska' },
  { v: 'da', name: 'Danish',     native: 'Dansk' },
  { v: 'no', name: 'Norwegian',  native: 'Norsk' },
  { v: 'fi', name: 'Finnish',    native: 'Suomi' },
  { v: 'pl', name: 'Polish',     native: 'Polski' },
  { v: 'th', name: 'Thai',       native: 'ไทย' },
  { v: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { v: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { v: 'he', name: 'Hebrew',     native: 'עברית' },
  { v: 'el', name: 'Greek',      native: 'Ελληνικά' },
  { v: 'cs', name: 'Czech',      native: 'Čeština' },
  { v: 'hu', name: 'Hungarian',  native: 'Magyar' },
  { v: 'ro', name: 'Romanian',   native: 'Română' },
];
/* Quick lookup for human-readable names from iso codes when rendering detail langs. */
const LANG_NAME_MAP   = LANGUAGES.reduce((m, l) => (m[l.v] = l.name,   m), {});
const LANG_NATIVE_MAP = LANGUAGES.reduce((m, l) => (m[l.v] = l.native, m), {});

const GENRE_MOVIE = {28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western'};
const GENRE_TV    = {10759:'Action & Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',10762:'Kids',9648:'Mystery',10763:'News',10764:'Reality',10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics',37:'Western'};

const SORT_LABELS = {
  'popularity.desc': 'Popularity',
  'vote_average.desc': 'Top Rated',
  'primary_release_date.desc': 'Newest',
  'primary_release_date.asc': 'Oldest',
  'revenue.desc': 'Revenue',
};
const DEFAULT_SORT = 'popularity.desc';
const TYPE_LABELS = { all:'All', movie:'Movies', tv:'Shows', anime:'Anime' };

/* Which discover endpoints each type hits. Anime is a genre+language filter
   applied on top of both endpoints (see buildDiscoverParams), not an endpoint
   of its own. */
const DISCOVER_TYPES = { movie:['movie'], tv:['tv'], all:['movie','tv'], anime:['movie','tv'] };

/* Client-side comparators for the interleaved movie+tv discover results, keyed
   by the same sort_by value we send to TMDB. */
const SORT_COMPARATORS = {
  'vote_average.desc':         (a,b) => (b.vote_average || 0) - (a.vote_average || 0),
  'primary_release_date.desc': (a,b) => dateOf(b).localeCompare(dateOf(a)),
  'primary_release_date.asc':  (a,b) => dateOf(a).localeCompare(dateOf(b)),
  'revenue.desc':              (a,b) => (b.revenue || 0) - (a.revenue || 0),
  'popularity.desc':           (a,b) => (b.popularity || 0) - (a.popularity || 0),
};

const NO_POSTER  = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="100%" height="100%" fill="#1a1c22"/><text x="50%" y="50%" fill="#52525b" font-size="14" text-anchor="middle" font-family="sans-serif">No image</text></svg>');
const NO_PROFILE = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="100%" height="100%" fill="#1a1c22"/><circle cx="60" cy="48" r="18" fill="#3f3f46"/><path d="M30 110c0-22 18-36 30-36s30 14 30 36" fill="#3f3f46"/></svg>');

/* Inline SVG icons reused by detail row, card hover row, and collection overlay. */
const ICONS = {
  favourite: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
  want:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  watching:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>',
  watched:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>',
  liked:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/></svg>',
  disliked:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/></svg>',
  download:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>',
  upload:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"></path></svg>',
};

export {
  API_KEY, TMDB, IMG, ANIME_GENRE_ID, ANIME_LANG, MAX_PAGE, PEOPLE_PREVIEW_MAX,
  CAST_PREVIEW_MAX, NSFW_BLOCK_KEYWORDS, ADULT_TEXT_HINTS, NSFW_KEYWORD_IDS,
  nsfwKeywordCache, nsfwLookupInFlight, SERVICES, PROVIDER_URLS, VPN_LIST, LANGUAGES,
  LANG_NAME_MAP, LANG_NATIVE_MAP, GENRE_MOVIE, GENRE_TV, SORT_LABELS, DEFAULT_SORT,
  TYPE_LABELS, DISCOVER_TYPES, SORT_COMPARATORS, NO_POSTER, NO_PROFILE, ICONS
};
