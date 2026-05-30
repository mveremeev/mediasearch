/* =====================================================================
   MSearch - scripts.js
   Sections (search to jump):
     0. TRUSTED TYPES   - default policy for CSP require-trusted-types-for
     1. CONFIG          - API key, endpoints, services, providerUrls
     2. STATE + REFS    - module-level state, DOM lookups
     3. UTIL            - escape, formatVotes, image URLs, year slider math
     4. PREFS           - localStorage save/load
     4b. COLLECTION     - favourites + want/watching/watched, import/export
     5. GEOLOCATION     - 3-tier country lookup
     6. FETCH DISPATCH  - search vs discover vs anime mode
     7. RENDER          - grid cards, people, ribbon, skeletons
     8. PILLS           - selected-filter chips
     9. CHIPS UI        - open/close, range sliders, sort/type/services, clear
    10. DETAIL OVERLAY  - backdrop + meta + trailer + cast + providers
    11. ACTOR OVERLAY   - filmography popup
    12. CAST GRID       - full cast modal
    13. INFO OVERLAY    - regions + VPN list
    14. INFINITE SCROLL - IntersectionObserver
    15. THEME           - light/dark toggle
    15b. LOW DATA       - skip images, force load-more button
    16. INIT            - wire everything up
   ===================================================================== */


/* ---------- 0. TRUSTED TYPES ----------
   CSP ships with `require-trusted-types-for 'script'`. Define a default
   pass-through policy so existing innerHTML assignments continue to work
   without rewriting every site. Strings we build here are already escaped
   via escapeHtml / escapeAttr at user-data boundaries. */
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: (s) => s,
      createScriptURL: (s) => s,
      createScript: (s) => s,
    });
  } catch { /* policy already exists (HMR / double-load) */ }
}


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


/* ---------- 2. STATE + REFS ---------- */
const state = {
  page: 1,
  query: '',
  type: 'all',           // 'all' | 'movie' | 'tv' | 'anime'
  sort: DEFAULT_SORT,
  yearMin: 0,
  yearMax: new Date().getFullYear(),
  ratingMin: 0,
  ratingMax: 10,
  servicesAll: true,
  serviceVals: [],       // selected provider ids (raw, '|' splits expanded later)
  language: '',          // ISO 639-1 code or '' for any
  locationOnly: false,
  adultOnly: false,
  userRegion: '',
  allRegions: [],
  cache: [],             // current media list
  personCache: [],       // current people (search only)
  loading: false,
  exhausted: false,
  autoLoad: true,        // when off, show a Load More button instead of infinite scroll
  lowData: false,        // when on, no <img> rendered anywhere; cached LowData.svg shown via CSS, autoLoad forced off
  detailOverrides: {},   // {`${mt}:${id}`: minimal item} - lets showDetail open items not in cache (e.g. from collection)
};

const $  = (id) => document.getElementById(id);
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const els = {
  searchForm:    $('search-form'),
  searchInput:   $('search-input'),
  clearBtn:      $('clear-btn'),
  themeToggle:   $('theme-toggle'),
  autoloadToggle:$('autoload-toggle'),
  lowdataToggle: $('lowdata-toggle'),
  loadMoreBtn:   $('load-more'),
  filters:       $('filters'),
  chipRail:      $('chip-rail'),
  scrollL:       $('scroll-l'),
  scrollR:       $('scroll-r'),
  pills:         $('pills'),
  yearMin:       $('year-min'),
  yearMax:       $('year-max'),
  yearMinVal:    $('year-min-val'),
  yearMaxVal:    $('year-max-val'),
  yearReset:     $('year-reset'),
  ratingMin:     $('rating-min'),
  ratingMax:     $('rating-max'),
  ratingMinVal:  $('rating-min-val'),
  ratingMaxVal:  $('rating-max-val'),
  ratingReset:   $('rating-reset'),
  serviceAll:    $('service-all'),
  servicesPanel: $('services-panel'),
  languagePanel: $('language-panel'),
  locationOnly:  $('location-only'),
  adultOnly:     $('adult-only'),
  regionDisplay: $('region-display'),
  sectionTitle:  $('section-title'),
  sectionMeta:   $('section-meta'),
  peopleStrip:   $('people-strip'),
  peopleGrid:    $('people-grid'),
  seeMorePeople: $('see-more-people'),
  gridSubTitle:  $('grid-sub-title'),
  grid:          $('grid'),
  gridStatus:    $('grid-status'),
  sentinel:      $('sentinel'),
  // overlays
  detailOverlay:    $('detail-overlay'),
  detailClose:      $('detail-close'),
  detailBackdropImg:$('detail-backdrop-img'),
  detailBackdropWrap:$('detail-backdrop-wrap'),
  detailPoster:     $('detail-poster'),
  detailPosterWrap: $('detail-poster-wrap'),
  detailTitle:      $('detail-title'),
  detailMeta:       $('detail-meta'),
  detailLangs:      $('detail-langs'),
  detailOverview:   $('detail-overview'),
  detailActions:    $('detail-actions'),
  detailCollectionActions: $('detail-collection-actions'),
  detailCast:       $('detail-cast'),
  seeMoreCast:      $('see-more-cast'),
  regionRow:        $('region-row'),
  detailProviders:  $('detail-providers'),
  actorOverlay:     $('actor-overlay'),
  actorClose:       $('actor-close'),
  actorContent:     $('actor-content'),
  castGridOverlay:  $('cast-grid-overlay'),
  castGridClose:    $('cast-grid-close'),
  castGridContent:  $('cast-grid-content'),
  infoOverlay:      $('info-overlay'),
  infoClose:        $('info-close'),
  infoContent:      $('info-content'),
  copySlugBtn:      $('copy-slug-btn'),
  copyIdBtn:        $('copy-id-btn'),
  adblockOverlay:   $('adblock-overlay'),
  adblockClose:     $('adblock-close'),
  adblockContinue:  $('adblock-continue'),
  adblockDontShow:  $('adblock-dont-show'),
  adblockHaveIt:    $('adblock-have-it'),
  collectionBtn:    $('collection-btn'),
  collectionCount:  $('collection-count'),
  collectionOverlay:$('collection-overlay'),
  collectionClose:  $('collection-close'),
  collectionTabs:   $('collection-tabs'),
  collectionStatus: $('collection-status'),
  collectionBody:   $('collection-body'),
  collectionImport: $('collection-import'),
  collectionExport: $('collection-export'),
  collectionImportInput: $('collection-import-input'),
};


/* ---------- 3. UTIL ---------- */
const escapeHtml = (s) => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const escapeAttr = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

const posterUrl  = (p, size='w342')  => p ? `${IMG}/${size}${p}` : NO_POSTER;
const profileUrl = (p, size='w185')  => p ? `${IMG}/${size}${p}` : NO_PROFILE;
const backdropUrl= (p, size='w1280') => p ? `${IMG}/${size}${p}` : '';

/* posterImg / profileImg / providerImg return either an <img> tag or empty
   string. When state.lowData is on, no <img> is emitted so the browser
   skips all poster network requests; CSS in styles.css paints the cached
   LowData.svg as a background on the wrapping container. The fixed
   width/height attributes match the TMDB size and the CSS aspect-ratio,
   which is the most reliable CLS prevention (Lighthouse 0.89 → 0).
   srcset on posters lets the browser pick w185 on cheap viewports and
   w342 / w500 on retina — saves the 161 KiB Lighthouse flagged. */
function posterImg(path, alt, { eager = false } = {}) {
  if (state.lowData) return '';
  const altA = escapeAttr(alt || '');
  const loading = eager ? 'eager' : 'lazy';
  const fetchprio = eager ? ' fetchpriority="high"' : '';
  if (!path) return `<img src="${NO_POSTER}" alt="${altA}" width="342" height="513" loading="${loading}" decoding="async">`;
  const w185 = `${IMG}/w185${path}`;
  const w342 = `${IMG}/w342${path}`;
  const w500 = `${IMG}/w500${path}`;
  return `<img src="${w342}" srcset="${w185} 185w, ${w342} 342w, ${w500} 500w" sizes="(min-width: 700px) 200px, 50vw" alt="${altA}" width="342" height="513" loading="${loading}"${fetchprio} decoding="async">`;
}
function profileImg(path, alt) {
  if (state.lowData) return '';
  const altA = escapeAttr(alt || '');
  if (!path) return `<img src="${NO_PROFILE}" alt="${altA}" width="185" height="185" loading="lazy" decoding="async">`;
  return `<img src="${IMG}/w185${path}" alt="${altA}" width="185" height="185" loading="lazy" decoding="async">`;
}
function providerImg(path, name) {
  // Provider logos: in low-data, CSS shows data-name text fallback via ::before.
  if (state.lowData) return '';
  if (!path) return '';
  return `<img src="${IMG}/w92${path}" alt="${escapeAttr(name)}" width="92" height="92" loading="lazy" decoding="async">`;
}

const formatVotes = (n) => n >= 1000 ? (n/1000).toFixed(n>=10000 ? 0 : 1)+'k' : String(n||0);
const yearOf = (date) => (date && date.length >= 4) ? date.slice(0,4) : '-';

const getMediaType = (item) => item.media_type || (item.title ? 'movie' : 'tv');
const getTypeLabel = (mt) => mt === 'movie' ? 'Movie' : mt === 'tv' ? 'Show' : '';
const isAnime = (item) => {
  const ids = item.genre_ids || (item.genres ? item.genres.map(g => g.id) : []);
  return ids.includes(ANIME_GENRE_ID) && (item.original_language === ANIME_LANG);
};
/* NSFW = OR of three signals: TMDB's adult flag, our text-hint scan over
   title/overview, and our keyword-tag check against TMDB's /keywords endpoint
   (cached; enriched lazily after render — see enrichNsfwBadges). */
const hasNsfwText = (item) => {
  const text = `${item.title || item.name || ''} ${item.original_title || item.original_name || ''} ${item.overview || ''}`.toLowerCase();
  return ADULT_TEXT_HINTS.some(k => text.includes(k));
};
const hasNsfwKeyword = (item) => nsfwKeywordCache.get(`${getMediaType(item)}:${item.id}`) === true;
const isExplicit = (item) => !!item.adult || hasNsfwText(item) || hasNsfwKeyword(item);
const getGenreLabel = (genreIds, mt) => {
  if (!genreIds?.length) return '';
  const map = mt === 'movie' ? GENRE_MOVIE : GENRE_TV;
  return genreIds.map(id => map[id]).filter(Boolean).slice(0, 2).join(' · ');
};

// Year slider 0–100 → 4 segments: 0=All, 0–25 → 0–1800, 25–50 → 1800–1900, 50–75 → 1900–2000, 75–100 → 2000–now
function sliderToYear(v) {
  v = Number(v);
  const cy = new Date().getFullYear();
  if (v <= 0)  return 0;
  if (v <= 25) return Math.round((v/25) * 1800);
  if (v <= 50) return 1800 + Math.round(((v-25)/25) * 100);
  if (v <= 75) return 1900 + Math.round(((v-50)/25) * 100);
  return Math.min(cy, 2000 + Math.round(((v-75)/25) * Math.max(1, cy-2000)));
}
function yearToSlider(y) {
  const cy = new Date().getFullYear();
  y = Math.max(0, Math.min(cy, y));
  if (y === 0)    return 0;
  if (y <= 1800)  return Math.round((y/1800) * 25);
  if (y <= 1900)  return 25 + Math.round(((y-1800)/100) * 25);
  if (y <= 2000)  return 50 + Math.round(((y-1900)/100) * 25);
  return 75 + Math.round(((y-2000) / Math.max(1, cy-2000)) * 25);
}


/* ---------- 4. PREFS (localStorage) ---------- */
const PREFS_KEY = 'msearch-prefs-v2';
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      type: state.type,
      sort: state.sort,
      yearMin: state.yearMin,
      yearMax: state.yearMax,
      ratingMin: state.ratingMin,
      ratingMax: state.ratingMax,
      servicesAll: state.servicesAll,
      serviceVals: state.serviceVals,
      language: state.language,
      locationOnly: state.locationOnly,
      adultOnly: state.adultOnly,
      autoLoad: state.autoLoad,
      lowData: state.lowData,
    }));
  } catch {}
}
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}


/* ---------- 4b. COLLECTION ----------
   Personal library kept entirely in localStorage. One entry per (mediaType,id).
   - favourite: independent boolean
   - status:    'want' | 'watching' | 'watched' | null  (mutually exclusive)
   When both favourite is false and status is null, the entry is dropped so the
   collection only contains items the user actually cares about. Every mutation
   fires a `collection:change` CustomEvent on document so all UI surfaces (header
   badge, detail row, visible cards, collection overlay) can re-sync without
   knowing about each other. */
const COLLECTION_KEY  = 'msearch-collection-v2';
const COLLECTION_VER  = 2;
const STATUSES        = ['want', 'watching', 'watched'];
const STATUS_LABELS   = { want:'Want to watch', watching:'Watching', watched:'Watched' };
const collectionKey   = (id, mt) => `${mt}:${id}`;

function loadCollection() {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return { version: COLLECTION_VER, items: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.items) return { version: COLLECTION_VER, items: {} };
    return { version: parsed.version || COLLECTION_VER, items: parsed.items };
  } catch { return { version: COLLECTION_VER, items: {} }; }
}
function saveCollection(col) {
  try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(col)); } catch {}
  document.dispatchEvent(new CustomEvent('collection:change'));
}
function getEntry(id, mt) {
  return loadCollection().items[collectionKey(id, mt)] || null;
}
/* Build a stub from a TMDB item (or merge over an existing entry). */
function entryFromItem(item) {
  const mt = getMediaType(item);
  const date = item.release_date || item.first_air_date || '';
  return {
    id: item.id,
    mediaType: mt,
    title: item.title || item.name || '',
    posterPath: item.poster_path || '',
    year: yearOf(date),
    favourite: false,
    status: null,
    rating: null,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };
}
function upsertEntry(item, patch) {
  const col = loadCollection();
  const key = collectionKey(item.id, getMediaType(item));
  const existing = col.items[key];
  const base = existing || entryFromItem(item);
  // Preserve title/poster/year if the incoming item is sparse.
  const enriched = {
    ...base,
    title: base.title || item.title || item.name || '',
    posterPath: base.posterPath || item.poster_path || '',
    year: base.year || yearOf(item.release_date || item.first_air_date || ''),
  };
  const next = { ...enriched, ...patch, updatedAt: Date.now() };
  // If the entry no longer represents anything, drop it.
  if (!next.favourite && !next.status && !next.rating) {
    if (existing) { delete col.items[key]; saveCollection(col); }
    return null;
  }
  col.items[key] = next;
  saveCollection(col);
  return next;
}
/* Renamed from setStatus (which already existed for the grid loading state) so
   function-declaration hoisting doesn't overwrite this one. */
function setEntryStatus(item, status) {
  const cur = getEntry(item.id, getMediaType(item));
  // clicking the same status clears it
  const next = (cur && cur.status === status) ? null : status;
  return upsertEntry(item, { status: next });
}
function setRating(item, rating) {
  const cur = getEntry(item.id, getMediaType(item));
  const next = (cur && cur.rating === rating) ? null : rating;
  const update = { rating: next };
  // favourite/liked/disliked are mutually exclusive: setting a rating clears favourite
  if (next) update.favourite = false;
  return upsertEntry(item, update);
}
function toggleFavourite(item) {
  const cur = getEntry(item.id, getMediaType(item));
  const newFav = !(cur && cur.favourite);
  const update = { favourite: newFav };
  // favourite/liked/disliked are mutually exclusive: turning on favourite clears rating
  if (newFav) update.rating = null;
  return upsertEntry(item, update);
}
function getCounts() {
  const items = Object.values(loadCollection().items);
  const c = { favourite:0, want:0, watching:0, watched:0, liked:0, disliked:0, total: items.length };
  items.forEach(e => {
    if (e.favourite) c.favourite++;
    if (e.status && c[e.status] != null) c[e.status]++;
    if (e.rating && c[e.rating] != null) c[e.rating]++;
  });
  return c;
}
/* Merge an imported collection into the current one. Per-field "newest wins" by
   updatedAt; non-empty title/poster/year overwrite empty ones regardless. */
function mergeImport(incoming) {
  if (!incoming || typeof incoming !== 'object' || !incoming.items) {
    return { ok:false, reason:'Not a valid collection file.' };
  }
  const col = loadCollection();
  let added = 0, updated = 0;
  Object.entries(incoming.items).forEach(([key, inc]) => {
    if (!inc || typeof inc !== 'object' || inc.id == null || !inc.mediaType) return;
    const existing = col.items[key];
    if (!existing) {
      col.items[key] = {
        favourite: false, status: null, rating: null,
        addedAt: inc.addedAt || Date.now(),
        updatedAt: inc.updatedAt || Date.now(),
        ...inc,
      };
      added++;
      return;
    }
    const eUp = existing.updatedAt || 0;
    const iUp = inc.updatedAt || 0;
    const newer = iUp > eUp ? inc : existing;
    const merged = {
      ...existing,
      favourite: newer.favourite ?? existing.favourite,
      status:    newer.status    ?? existing.status,
      rating:    newer.rating    ?? existing.rating,
      title:      inc.title      || existing.title,
      posterPath: inc.posterPath || existing.posterPath,
      year:       inc.year       || existing.year,
      addedAt:   Math.min(existing.addedAt || iUp || Date.now(), inc.addedAt || eUp || Date.now()),
      updatedAt: Math.max(eUp, iUp) || Date.now(),
    };
    if (JSON.stringify(merged) !== JSON.stringify(existing)) updated++;
    col.items[key] = merged;
  });
  saveCollection(col);
  return { ok:true, added, updated, total: Object.keys(incoming.items).length };
}


/* ---------- 5. GEOLOCATION ---------- */
/* IANA timezone → ISO country code, used as a network-free fallback for fetchCountry().
   Not exhaustive - extend as needed. Common timezones for ~50 countries. */
const TZ_TO_COUNTRY = {
  'Asia/Dubai':'AE','Asia/Qatar':'QA','Asia/Riyadh':'SA','Asia/Kuwait':'KW','Asia/Bahrain':'BH',
  'Asia/Tokyo':'JP','Asia/Seoul':'KR','Asia/Hong_Kong':'HK','Asia/Singapore':'SG','Asia/Bangkok':'TH',
  'Asia/Manila':'PH','Asia/Jakarta':'ID','Asia/Kuala_Lumpur':'MY','Asia/Taipei':'TW','Asia/Shanghai':'CN',
  'Asia/Kolkata':'IN','Asia/Karachi':'PK','Asia/Dhaka':'BD','Asia/Tehran':'IR','Asia/Tel_Aviv':'IL','Asia/Jerusalem':'IL',
  'Europe/London':'GB','Europe/Dublin':'IE','Europe/Paris':'FR','Europe/Berlin':'DE','Europe/Madrid':'ES',
  'Europe/Rome':'IT','Europe/Amsterdam':'NL','Europe/Brussels':'BE','Europe/Vienna':'AT','Europe/Zurich':'CH',
  'Europe/Stockholm':'SE','Europe/Oslo':'NO','Europe/Copenhagen':'DK','Europe/Helsinki':'FI','Europe/Warsaw':'PL',
  'Europe/Prague':'CZ','Europe/Budapest':'HU','Europe/Athens':'GR','Europe/Lisbon':'PT','Europe/Bucharest':'RO',
  'Europe/Moscow':'RU','Europe/Istanbul':'TR','Europe/Kiev':'UA','Europe/Kyiv':'UA',
  'America/New_York':'US','America/Detroit':'US','America/Chicago':'US','America/Denver':'US',
  'America/Phoenix':'US','America/Los_Angeles':'US','America/Anchorage':'US','Pacific/Honolulu':'US',
  'America/Toronto':'CA','America/Vancouver':'CA','America/Edmonton':'CA','America/Halifax':'CA',
  'America/Mexico_City':'MX','America/Sao_Paulo':'BR','America/Buenos_Aires':'AR','America/Argentina/Buenos_Aires':'AR',
  'America/Santiago':'CL','America/Bogota':'CO','America/Lima':'PE',
  'Australia/Sydney':'AU','Australia/Melbourne':'AU','Australia/Brisbane':'AU','Australia/Perth':'AU','Australia/Adelaide':'AU',
  'Pacific/Auckland':'NZ',
  'Africa/Cairo':'EG','Africa/Johannesburg':'ZA','Africa/Lagos':'NG','Africa/Nairobi':'KE','Africa/Casablanca':'MA',
};
function timezoneCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ_TO_COUNTRY[tz] || null;
  } catch { return null; }
}
function fetchCountry() {
  const ok = (c) => { if (!c) throw new Error('empty'); return String(c).trim().toUpperCase(); };
  // Cloudflare trace first - worked reliably on Chrome in user testing
  const t1 = () => fetch('https://www.cloudflare.com/cdn-cgi/trace').then(r=>r.text()).then(t=>ok(t.match(/loc=([A-Z]{2})/)?.[1]));
  const t2 = () => fetch('https://ipwho.is/').then(r=>r.json()).then(d=>ok(d.country_code));
  const t3 = () => fetch('https://api.country.is/').then(r=>r.json()).then(d=>ok(d.country));
  // Network-free fallback - Firefox often blocks all three above due to CORS
  const tz = () => Promise.resolve(timezoneCountry()).then(ok);
  return t1().catch(()=>t2()).catch(()=>t3()).catch(()=>tz()).catch(() => 'US');
}
function fetchRegions() {
  if (state.allRegions.length) return Promise.resolve(state.allRegions);
  return fetch(`${TMDB}/watch/providers/regions?api_key=${API_KEY}`)
    .then(r => r.json())
    .then(d => { state.allRegions = d.results || []; return state.allRegions; })
    .catch(() => []);
}


/* ---------- 6. FETCH DISPATCH ---------- */
function buildDiscoverParams(mediaType) {
  const p = new URLSearchParams();
  p.set('api_key', API_KEY);
  p.set('page', state.page);
  p.set('include_adult', state.adultOnly);
  p.set('sort_by', state.sort);

  // NSFW off → block known explicit-content keywords at the API layer.
  if (!state.adultOnly) p.set('without_keywords', NSFW_BLOCK_KEYWORDS);

  // Anime mode injects genres + lang regardless of underlying mediaType
  if (state.type === 'anime') {
    p.set('with_genres', String(ANIME_GENRE_ID));
    p.set('with_original_language', ANIME_LANG);
  }

  // Original-language filter - set/overrides anime's 'ja' default when chosen.
  if (state.language) p.set('with_original_language', state.language);

  // Year range (segment 0 means "All", skip .gte)
  if (state.yearMin > 0) {
    if (mediaType === 'movie') p.set('primary_release_date.gte', `${state.yearMin}-01-01`);
    else                       p.set('first_air_date.gte', `${state.yearMin}-01-01`);
  }
  const cy = new Date().getFullYear();
  if (state.yearMax < cy) {
    if (mediaType === 'movie') p.set('primary_release_date.lte', `${state.yearMax}-12-31`);
    else                       p.set('first_air_date.lte', `${state.yearMax}-12-31`);
  }

  // Rating range
  if (state.ratingMin > 0)  p.set('vote_average.gte', state.ratingMin);
  if (state.ratingMax < 10) p.set('vote_average.lte', state.ratingMax);
  if (state.sort === 'vote_average.desc') p.set('vote_count.gte', '50');

  // Providers + region
  const expandedProviders = state.servicesAll ? '' : expandProviders(state.serviceVals);
  if (expandedProviders) {
    const region = (state.locationOnly && state.userRegion) ? state.userRegion : 'US';
    p.set('watch_region', region);
    p.set('with_watch_providers', expandedProviders);
    p.set('with_watch_monetization_types', 'flatrate|free|ads|rent|buy');
  } else if (state.locationOnly && state.userRegion) {
    p.set('watch_region', state.userRegion);
    p.set('with_watch_monetization_types', 'flatrate|free|ads|rent|buy');
  }

  return p.toString();
}
function expandProviders(vals) {
  const set = new Set();
  vals.forEach(v => {
    const svc = SERVICES.find(s => s.v === v);
    const raw = svc?.p || v;
    raw.split('|').forEach(x => x && set.add(x.trim()));
  });
  return Array.from(set).join('|');
}
function buildSearchParams() {
  const p = new URLSearchParams();
  p.set('api_key', API_KEY);
  p.set('page', state.page);
  p.set('include_adult', state.adultOnly);
  p.set('query', state.query);
  // year (max only, per TMDB search)
  if (state.yearMax < new Date().getFullYear()) p.set('year', state.yearMax);
  if (state.locationOnly && state.userRegion) p.set('region', state.userRegion);
  return p.toString();
}

let lastFetchAt = 0, pendingTimer = null;
function fetchMedia(append=false) {
  // Throttle: at most one request per 400ms
  const now = Date.now();
  const wait = Math.max(0, 400 - (now - lastFetchAt));
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => { lastFetchAt = Date.now(); pendingTimer = null; runFetch(append); }, wait);
}

function runFetch(append) {
  if (state.page > MAX_PAGE) { state.exhausted = true; setStatus(''); return; }
  state.loading = true;
  setStatus('loading');

  if (state.query) runSearch(append);
  else             runDiscover(append);
}

function runSearch(append) {
  const params = buildSearchParams();
  const t = state.type;

  // For anime type: use multi search then post-filter
  let mediaUrl;
  if (t === 'movie')      mediaUrl = `${TMDB}/search/movie?${params}`;
  else if (t === 'tv')    mediaUrl = `${TMDB}/search/tv?${params}`;
  else                    mediaUrl = `${TMDB}/search/multi?${params}`;

  const personPromise = (state.page === 1 && !append)
    ? fetch(`${TMDB}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(state.query)}&page=1`)
        .then(r => r.json())
        .then(d => d.results || [])
        .catch(() => [])
    : Promise.resolve([]);

  const mediaPromise = fetch(mediaUrl).then(r => r.json()).then(d => {
    let arr = (d.results || [])
      .filter(x => x.media_type !== 'person')
      .map(m => ({ ...m, media_type: m.media_type || (t === 'tv' ? 'tv' : 'movie') }));
    if (state.type === 'anime') arr = arr.filter(isAnime);
    if (!state.adultOnly) arr = arr.filter(x => !isExplicit(x));
    return arr;
  }).catch(() => []);

  Promise.all([personPromise, mediaPromise]).then(([people, media]) => {
    if (append) {
      state.cache.push(...media);
    } else {
      state.cache = media;
      state.personCache = people;
    }
    state.exhausted = media.length === 0;
    state.loading = false;
    renderResults({ append });
  });
}

function runDiscover(append) {
  const t = state.type;
  // Anime fetches both movie+tv discover unless type narrows
  let urls = [];
  if (t === 'movie' || (t === 'anime' && false)) urls.push(`${TMDB}/discover/movie?${buildDiscoverParams('movie')}`);
  else if (t === 'tv') urls.push(`${TMDB}/discover/tv?${buildDiscoverParams('tv')}`);
  else if (t === 'all' || t === 'anime') {
    urls.push(`${TMDB}/discover/movie?${buildDiscoverParams('movie')}`);
    urls.push(`${TMDB}/discover/tv?${buildDiscoverParams('tv')}`);
  } else {
    urls.push(`${TMDB}/discover/movie?${buildDiscoverParams('movie')}`);
  }

  Promise.all(urls.map(u => fetch(u).then(r => r.json()).then(d => (d.results || []).map(m => ({
    ...m,
    media_type: u.includes('/discover/movie') ? 'movie' : 'tv'
  }))).catch(() => []))).then(results => {
    let media = results.flat();
    // Sort interleaved results by selected sort to keep a sensible order
    media = sortLocally(media);
    // Belt-and-braces: client-side post-filter even with without_keywords on,
    // since TMDB's keyword tagging is incomplete.
    if (!state.adultOnly) media = media.filter(x => !isExplicit(x));
    if (append) state.cache.push(...media);
    else        { state.cache = media; state.personCache = []; }
    state.exhausted = media.length === 0;
    state.loading = false;
    renderResults({ append });
  });
}

function sortLocally(arr) {
  const s = state.sort;
  const dt = (it) => it.release_date || it.first_air_date || '';
  if (s === 'vote_average.desc')          arr.sort((a,b)=>(b.vote_average||0)-(a.vote_average||0));
  else if (s === 'primary_release_date.desc') arr.sort((a,b)=>dt(b).localeCompare(dt(a)));
  else if (s === 'primary_release_date.asc')  arr.sort((a,b)=>dt(a).localeCompare(dt(b)));
  else if (s === 'revenue.desc')          arr.sort((a,b)=>(b.revenue||0)-(a.revenue||0));
  else                                     arr.sort((a,b)=>(b.popularity||0)-(a.popularity||0));
  return arr;
}


/* ---------- 7. RENDER ---------- */
function setStatus(kind) {
  if (kind === 'loading') {
    els.gridStatus.removeAttribute('data-empty');
    els.gridStatus.innerHTML = '<span class="spinner"></span><span>Loading…</span>';
  } else if (kind === 'empty') {
    els.gridStatus.setAttribute('data-empty','');
    const hint = (state.locationOnly && state.userRegion)
      ? `Try turning off "My location" - your region (${state.userRegion}) may have nothing matching.`
      : 'Try widening filters or clearing them.';
    els.gridStatus.innerHTML = `<strong>No results found</strong><span>${hint}</span>`;
  } else {
    els.gridStatus.removeAttribute('data-empty');
    els.gridStatus.innerHTML = '';
  }
  if (typeof refreshLoadMore === 'function') refreshLoadMore();
}

function renderResults({ append = false } = {}) {
  // Section title + meta
  if (state.query) {
    els.sectionTitle.textContent = `Results for "${state.query}"`;
    els.sectionMeta.textContent = state.cache.length ? `${state.cache.length}+ titles` : '';
  } else {
    const labels = { all:'Discover', movie:'Movies', tv:'Shows', anime:'Anime' };
    els.sectionTitle.textContent = labels[state.type] || 'Discover';
    els.sectionMeta.textContent = state.sort !== DEFAULT_SORT ? SORT_LABELS[state.sort] : '';
  }

  // People strip (search-mode only, on first page)
  if (!append && state.personCache.length > 0) {
    els.peopleStrip.hidden = false;
    const preview = state.personCache.slice(0, PEOPLE_PREVIEW_MAX);
    els.peopleGrid.innerHTML = preview.map((p,i)=>renderPerson(p,'',i)).join('');
    els.seeMorePeople.hidden = state.personCache.length <= PEOPLE_PREVIEW_MAX;
    els.gridSubTitle.hidden = false;
  } else if (!append) {
    els.peopleStrip.hidden = true;
    els.gridSubTitle.hidden = true;
  }

  // Grid
  if (!append) els.grid.innerHTML = '';
  const showRibbon = !state.query && state.sort === 'vote_average.desc';
  const startIdx = append ? els.grid.children.length : 0;
  const newItems = state.cache.slice(startIdx);
  const html = newItems.map((it, i) => renderCard(it, startIdx + i, showRibbon)).join('');
  els.grid.insertAdjacentHTML('beforeend', html);
  attachImageLoaders(els.grid);
  enrichNsfwBadges(newItems);

  if (!append) attachImageLoaders(els.peopleGrid);

  // Status
  if (state.cache.length === 0) setStatus('empty');
  else if (state.exhausted)     setStatus('');
  else                          setStatus('');
}

function renderCard(item, idx, showRibbon) {
  const title = item.title || item.name || '';
  const date  = item.release_date || item.first_air_date || '';
  const mt    = getMediaType(item);
  const typeLabel = getTypeLabel(mt);
  const animeTag  = isAnime(item) ? ' · Anime' : '';
  const genres = getGenreLabel(item.genre_ids, mt);
  const rating = item.vote_average || 0;
  const showRib = showRibbon && idx < 10;
  const rank = String(idx + 1).padStart(2, '0');
  const entry = getEntry(item.id, mt) || {};
  const fav = !!entry.favourite;
  const status = entry.status || '';
  const userRating = entry.rating || '';
  /* Original language only - TMDB's discover/search responses don't include
     `spoken_languages`. Fetching the full list per card would cost N extra
     calls per page. The detail overlay shows the complete list. */
  const lang = (item.original_language || '').toLowerCase();
  const langName = lang ? (LANG_NAME_MAP[lang] || lang.toUpperCase()) : '';
  // NSFW: trust TMDB's adult flag AND our local text-hint heuristic so soft
  // explicit titles (where TMDB never set adult=true) still get flagged.
  const nsfw = isExplicit(item);
  /* aria-label includes the title so axe's "visible text in accessible name"
     check passes when the visible adjacent text is the card title. */
  const quickBtn = (key, label, on) => `
    <button type="button" class="card-quick-btn quick-${key}${on ? ' is-active' : ''}"
      data-coll-action="${key}" aria-label="${escapeAttr(label + ': ' + title)}" aria-pressed="${on ? 'true' : 'false'}" title="${escapeAttr(label)}">${ICONS[key]}</button>`;
  return `
    <article class="card${nsfw ? ' is-nsfw' : ''}" data-id="${item.id}" data-type="${mt}" data-fav="${fav ? '1' : '0'}" data-status="${status}" data-rating="${userRating}" tabindex="0" role="button" aria-label="${escapeAttr(title)}" style="--i:${Math.min(idx, 24)}">
      <div class="card-poster">
        ${showRib ? `<div class="ribbon" aria-hidden="true"><span class="ribbon-tag">Top</span><span class="ribbon-num">${rank}</span></div>` : ''}
        ${posterImg(item.poster_path, title)}
        <div class="card-quick" aria-label="Quick add to collection">
          ${quickBtn('favourite', 'Favourite', fav)}
          ${quickBtn('want', 'Want to watch', status === 'want')}
          ${quickBtn('watching', 'Watching', status === 'watching')}
          ${quickBtn('watched', 'Watched', status === 'watched')}
          ${quickBtn('liked', 'Liked', userRating === 'liked')}
          ${quickBtn('disliked', 'Disliked', userRating === 'disliked')}
        </div>
      </div>
      <div class="card-info">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        <div class="card-meta">
          ${rating > 0 ? `<span class="star">★ ${rating.toFixed(1)}</span><span class="dot">·</span>` : ''}
          <span class="num">${yearOf(date)}</span>
          ${typeLabel ? `<span class="dot">·</span><span>${typeLabel}${animeTag}</span>` : ''}
          ${lang ? `<span class="card-lang" title="${escapeAttr(langName)}">${escapeHtml(lang)}</span>` : ''}
          ${nsfw && state.adultOnly ? `<span class="card-adult">NSFW · 18+</span>` : ''}
          ${genres ? `<span class="genre">${escapeHtml(genres)}</span>` : ''}
        </div>
      </div>
    </article>`;
}

function renderPerson(p, role='', idx=0) {
  const name = p.name || '';
  return `
    <article class="person-card" data-id="${p.id}" tabindex="0" role="button" aria-label="${escapeAttr(name)}" style="--i:${Math.min(idx, 18)}">
      <div class="person-photo">${profileImg(p.profile_path, name)}</div>
      <span class="person-name">${escapeHtml(name)}</span>
      ${role ? `<span class="person-role">${escapeHtml(role)}</span>` : ''}
    </article>`;
}

function attachImageLoaders(root) {
  if (!root) return;
  qsa('img', root).forEach(img => {
    /* Key the bind by the current src, not a boolean - the detail overlay
       reuses the same <img> elements across opens, so a boolean flag would
       prevent re-binding when src changes, leaving the new image stuck at
       opacity 0. Using property handlers (onload/onerror) rather than
       addEventListener means each rebind cleanly replaces the previous
       handler instead of stacking listeners. */
    if (img.dataset.loadBoundFor === img.src) return;
    img.dataset.loadBoundFor = img.src;
    delete img.dataset.errored;

    const done = () => img.classList.add('loaded');
    const onError = () => {
      if (img.dataset.errored) { done(); return; }
      img.dataset.errored = '1';
      const fallback = img.closest('.person-photo') ? NO_PROFILE : NO_POSTER;
      img.src = fallback;
      img.dataset.loadBoundFor = fallback;
      img.onload  = done;
      img.onerror = done;
    };

    /* Browser may have already finished with this src by the time we hook up
       (HTML img tags start loading at parse time, JS runs after). complete
       means "done" - distinguish success from failure via naturalWidth. */
    if (img.complete) {
      img.naturalWidth > 0 ? done() : onError();
    } else {
      img.onload  = done;
      img.onerror = onError;
    }
  });
}

/* Lazy NSFW keyword enrichment. The search/discover responses don't carry
   keywords, so for each new card we fire a /keywords request, cache the verdict,
   and stamp the badge onto the live card if it comes back NSFW. Only runs for
   plausible candidates (anime — Japanese Animation) to keep request volume sane;
   that's the corner of the catalog where soft-NSFW slips through. */
function enrichNsfwBadges(items) {
  if (!Array.isArray(items) || !items.length) return;
  items.forEach(item => {
    if (!item || !item.id) return;
    const mt = getMediaType(item);
    const key = `${mt}:${item.id}`;
    // Already known via text/adult, or already keyword-cached → just paint.
    if (hasNsfwText(item) || item.adult || nsfwKeywordCache.get(key) === true) {
      paintNsfwOnCard(item);
      return;
    }
    if (nsfwKeywordCache.has(key)) return;            // cached as not-NSFW
    if (nsfwLookupInFlight.has(key)) return;
    // Limit fetches to anime: server-side without_keywords filter catches the
    // rest in discover, and search-mode hentai-tagged non-anime is vanishingly rare.
    if (!isAnime(item)) return;
    nsfwLookupInFlight.add(key);
    fetch(`${TMDB}/${mt}/${item.id}/keywords?api_key=${API_KEY}`)
      .then(r => r.json())
      .then(d => {
        const list = (mt === 'movie' ? d.keywords : d.results) || [];
        const flagged = list.some(k => NSFW_KEYWORD_IDS.has(k.id));
        nsfwKeywordCache.set(key, flagged);
        if (flagged) paintNsfwOnCard(item);
      })
      .catch(() => {})
      .finally(() => nsfwLookupInFlight.delete(key));
  });
}

/* Mark card as NSFW (is-nsfw class). Only add the inline label if NSFW filter is on.
   Idempotent so re-renders are safe. Uses createElement / textContent only. */
function paintNsfwOnCard(item) {
  const mt = getMediaType(item);
  qsa(`.card[data-id="${item.id}"][data-type="${mt}"]`).forEach(card => {
    if (card.classList.contains('is-nsfw')) return;
    card.classList.add('is-nsfw');
    // Only show inline label if NSFW filter is enabled
    if (state.adultOnly) {
      const meta = card.querySelector('.card-meta');
      if (meta && !meta.querySelector('.card-adult')) {
        const pill = document.createElement('span');
        pill.className = 'card-adult';
        pill.textContent = 'NSFW · 18+';
        const genre = meta.querySelector('.genre');
        if (genre) meta.insertBefore(pill, genre);
        else meta.appendChild(pill);
      }
    }
  });
}


/* Look up a TMDB-shaped item by id+type from any source: current grid cache,
   detail-override map, or the saved collection (rebuilt as a sparse stub).
   Used by the card-hover quick-add buttons since cards can come from anywhere. */
function findItem(id, mt) {
  const fromCache = state.cache.find(x => x.id === id && getMediaType(x) === mt);
  if (fromCache) return fromCache;
  const fromOverride = state.detailOverrides[`${mt}:${id}`];
  if (fromOverride) return fromOverride;
  const e = getEntry(id, mt);
  if (e) return { id: e.id, media_type: e.mediaType, title: e.title, name: e.title, poster_path: e.posterPath };
  return null;
}

/* Click handler for any .card-quick-btn inside a card. Returns true if it
   handled the event so the caller can skip its own card-click logic. */
function handleCollectionActionClick(e) {
  const btn = e.target.closest('.card-quick-btn');
  if (!btn) return false;
  e.stopPropagation();
  e.preventDefault();
  const card = btn.closest('.card');
  if (!card) return true;
  const id = Number(card.dataset.id);
  const mt = card.dataset.type;
  const item = findItem(id, mt);
  if (!item) return true;
  const action = btn.dataset.collAction;
  if (action === 'favourite') toggleFavourite(item);
  else if (action === 'liked' || action === 'disliked') setRating(item, action);
  else                        setEntryStatus(item, action);
  return true;
}

/* Refresh data-fav / data-status / .is-active on every visible .card after a
   collection mutation. Cheaper than re-rendering the whole grid. */
function refreshCardStates(root = document) {
  qsa('.card', root).forEach(card => {
    const id = Number(card.dataset.id);
    const mt = card.dataset.type;
    const entry = getEntry(id, mt) || {};
    const fav = !!entry.favourite;
    const status = entry.status || '';
    const rating = entry.rating || '';
    card.dataset.fav = fav ? '1' : '0';
    card.dataset.status = status;
    card.dataset.rating = rating;
    qsa('.card-quick-btn', card).forEach(btn => {
      const a = btn.dataset.collAction;
      let on;
      if (a === 'favourite') on = fav;
      else if (a === 'liked' || a === 'disliked') on = rating === a;
      else on = status === a;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
}


/* ---------- 8. PILLS ---------- */
function updatePills() {
  const pills = [];
  if (state.type !== 'all') {
    const labels = { movie:'Movies', tv:'Shows', anime:'Anime' };
    pills.push({ key:'type', label:`Type: ${labels[state.type]}` });
  }
  if (!state.servicesAll && state.serviceVals.length) {
    state.serviceVals.forEach(v => {
      const svc = SERVICES.find(s => s.v === v);
      if (svc) pills.push({ key:`service:${v}`, label:svc.name });
    });
  }
  if (!state.query && state.language) {
    pills.push({ key:'language', label:`Lang: ${LANG_NAME_MAP[state.language] || state.language.toUpperCase()}` });
  }
  const cy = new Date().getFullYear();
  if (state.yearMin > 0 || state.yearMax < cy) {
    const lo = state.yearMin === 0 ? '...' : state.yearMin;
    pills.push({ key:'year', label:`${lo}–${state.yearMax}` });
  }
  if (!state.query && (state.ratingMin > 0 || state.ratingMax < 10)) {
    pills.push({ key:'rating', label:`★ ${state.ratingMin}–${state.ratingMax}` });
  }
  if (!state.query && state.sort !== DEFAULT_SORT) {
    pills.push({ key:'sort', label:SORT_LABELS[state.sort] });
  }
  if (state.locationOnly) pills.push({ key:'location', label:`Region: ${state.userRegion || 'detecting…'}` });
  if (state.adultOnly)    pills.push({ key:'adult', label:'NSFW on' });

  els.pills.innerHTML = pills.map(p => `
    <span class="pill" data-key="${p.key}">
      ${escapeHtml(p.label)}
      <button type="button" aria-label="Remove filter">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
      </button>
    </span>`).join('');

  // Clear-all lives on the pills row, only when there's something to clear
  if (pills.length > 0) {
    els.pills.insertAdjacentHTML('beforeend', `
      <button type="button" class="pill-clear" data-action="clear-all">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        Clear all
      </button>`);
  }
}

function clearOnePill(key) {
  if (key === 'type') setType('all');
  else if (key.startsWith('service:')) {
    const v = key.split(':')[1];
    const cb = qs(`#services-panel input[type="checkbox"][value="${v}"]`);
    if (cb) { cb.checked = false; }
    syncServicesFromUI();
  }
  else if (key === 'year')     { setYearRange(0, new Date().getFullYear()); }
  else if (key === 'rating')   { setRatingRange(0, 10); }
  else if (key === 'sort')     { setSort(DEFAULT_SORT); }
  else if (key === 'language') { setLanguage(''); }
  else if (key === 'location') { els.locationOnly.checked = false; state.locationOnly = false; }
  else if (key === 'adult')    { els.adultOnly.checked = false; state.adultOnly = false; }
  onFilterChange();
}

function setType(t) {
  state.type = t;
  qsa('input[name="media-type"]').forEach(r => { r.checked = (r.value === t); });
  qs('[data-value-for="type"]').textContent = ({all:'All', movie:'Movies', tv:'Shows', anime:'Anime'})[t];
  qs('.chip[data-chip="type"]').classList.toggle('chip-active', t !== 'all');
  document.body.classList.toggle('is-anime', t === 'anime');
}

function setSort(s) {
  state.sort = s;
  qsa('input[name="sort-by"]').forEach(r => { r.checked = (r.value === s); });
  qs('[data-value-for="sort"]').textContent = SORT_LABELS[s] || 'Popularity';
  qs('.chip[data-chip="sort"]').classList.toggle('chip-active', s !== DEFAULT_SORT);
}

function setLanguage(code) {
  state.language = code || '';
  qsa('input[name="lang"]').forEach(r => { r.checked = (r.value === state.language); });
  const label = state.language ? (LANG_NAME_MAP[state.language] || state.language.toUpperCase()) : 'Any';
  qs('[data-value-for="language"]').textContent = label;
  qs('.chip[data-chip="language"]').classList.toggle('chip-active', !!state.language);
}

function setYearRange(min, max) {
  state.yearMin = min; state.yearMax = max;
  els.yearMin.value = yearToSlider(min);
  els.yearMax.value = yearToSlider(max);
  syncYearDisplay();
}
function syncYearDisplay() {
  const cy = new Date().getFullYear();
  els.yearMinVal.textContent = state.yearMin === 0 ? 'All' : state.yearMin;
  els.yearMaxVal.textContent = state.yearMax >= cy ? 'Now' : state.yearMax;
  const txt = (state.yearMin === 0 && state.yearMax >= cy) ? 'Any' :
              `${state.yearMin === 0 ? '...' : state.yearMin}–${state.yearMax >= cy ? 'Now' : state.yearMax}`;
  qs('[data-value-for="year"]').textContent = txt;
  qs('.chip[data-chip="year"]').classList.toggle('chip-active', txt !== 'Any');
}

function setRatingRange(min, max) {
  state.ratingMin = min; state.ratingMax = max;
  els.ratingMin.value = min;
  els.ratingMax.value = max;
  syncRatingDisplay();
}
function syncRatingDisplay() {
  els.ratingMinVal.textContent = state.ratingMin.toFixed(1).replace(/\.0$/,'');
  els.ratingMaxVal.textContent = state.ratingMax.toFixed(1).replace(/\.0$/,'');
  const txt = (state.ratingMin === 0 && state.ratingMax === 10) ? '0–10'
            : `${state.ratingMin}–${state.ratingMax}`;
  qs('[data-value-for="rating"]').textContent = '★ ' + txt;
  qs('.chip[data-chip="rating"]').classList.toggle('chip-active', state.ratingMin > 0 || state.ratingMax < 10);
}

function syncServicesFromUI() {
  const checks = qsa('#services-panel input[type="checkbox"]');
  const checked = checks.filter(c => c.checked);
  state.serviceVals = checked.map(c => c.value);
  state.servicesAll = checked.length === 0;
  els.serviceAll.checked = state.servicesAll;
  // chip value text
  let val = 'All';
  if (!state.servicesAll) val = checked.length === 1
    ? SERVICES.find(s => s.v === state.serviceVals[0])?.name || '1 selected'
    : `${checked.length} selected`;
  qs('[data-value-for="services"]').textContent = val;
  qs('.chip[data-chip="services"]').classList.toggle('chip-active', !state.servicesAll);
}


/* ---------- 9. CHIPS UI + filter wiring ---------- */
function buildServiceCheckboxes() {
  const html = SERVICES.map(s => `
    <label class="opt">
      <input type="checkbox" value="${s.v}"${s.p ? ` data-providers="${s.p}"` : ''}>
      <span>${s.name}</span>
    </label>`).join('');
  els.servicesPanel.insertAdjacentHTML('beforeend', html);
}

function buildLanguageRadios() {
  if (!els.languagePanel) return;
  const html = LANGUAGES.map(l => `
    <label class="opt">
      <input type="radio" name="lang" value="${l.v}">
      <span>${l.name}</span>
      <em class="opt-tag">${l.v.toUpperCase()}</em>
    </label>`).join('');
  els.languagePanel.insertAdjacentHTML('beforeend', html);
}

function wireFilters() {
  // Type radios
  qsa('input[name="media-type"]').forEach(r => r.addEventListener('change', () => {
    setType(r.value);
    onFilterChange();
  }));
  // Sort radios
  qsa('input[name="sort-by"]').forEach(r => r.addEventListener('change', () => {
    setSort(r.value);
    onFilterChange();
  }));
  // Language radios (delegated - radios injected by JS after init)
  if (els.languagePanel) {
    els.languagePanel.addEventListener('change', (e) => {
      if (e.target.matches('input[name="lang"]')) {
        setLanguage(e.target.value);
        onFilterChange();
      }
    });
  }
  // Year range
  els.yearMin.addEventListener('input', () => {
    if (Number(els.yearMin.value) > Number(els.yearMax.value)) els.yearMin.value = els.yearMax.value;
    state.yearMin = sliderToYear(els.yearMin.value);
    state.yearMax = sliderToYear(els.yearMax.value);
    syncYearDisplay();
  });
  els.yearMax.addEventListener('input', () => {
    if (Number(els.yearMax.value) < Number(els.yearMin.value)) els.yearMax.value = els.yearMin.value;
    state.yearMin = sliderToYear(els.yearMin.value);
    state.yearMax = sliderToYear(els.yearMax.value);
    syncYearDisplay();
  });
  els.yearMin.addEventListener('change', onFilterChange);
  els.yearMax.addEventListener('change', onFilterChange);
  els.yearReset.addEventListener('click', (e) => {
    e.preventDefault();
    setYearRange(0, new Date().getFullYear());
    onFilterChange();
  });
  // Rating
  els.ratingMin.addEventListener('input', () => {
    let mn = parseFloat(els.ratingMin.value), mx = parseFloat(els.ratingMax.value);
    if (mn > mx) { mn = mx; els.ratingMin.value = mn; }
    state.ratingMin = mn;
    syncRatingDisplay();
  });
  els.ratingMax.addEventListener('input', () => {
    let mn = parseFloat(els.ratingMin.value), mx = parseFloat(els.ratingMax.value);
    if (mx < mn) { mx = mn; els.ratingMax.value = mx; }
    state.ratingMax = mx;
    syncRatingDisplay();
  });
  els.ratingMin.addEventListener('change', onFilterChange);
  els.ratingMax.addEventListener('change', onFilterChange);
  els.ratingReset.addEventListener('click', (e) => {
    e.preventDefault();
    setRatingRange(0, 10);
    onFilterChange();
  });
  // Services + "All"
  els.serviceAll.addEventListener('change', () => {
    if (els.serviceAll.checked) {
      qsa('#services-panel input[type="checkbox"]').forEach(c => c.checked = false);
      syncServicesFromUI();
      onFilterChange();
    } else {
      els.serviceAll.checked = true; // can't manually uncheck "all" - pick a service to deactivate
    }
  });
  // delegated: service checkboxes
  els.servicesPanel.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
      syncServicesFromUI();
      onFilterChange();
    }
  });
  // Toggle chips
  els.locationOnly.addEventListener('change', () => {
    state.locationOnly = els.locationOnly.checked;
    if (state.locationOnly && !state.userRegion) {
      els.regionDisplay.textContent = '…';
      fetchCountry().then(c => { state.userRegion = c; els.regionDisplay.textContent = c; onFilterChange(); });
    } else {
      els.regionDisplay.textContent = state.userRegion || '-';
      onFilterChange();
    }
  });
  els.adultOnly.addEventListener('change', () => {
    state.adultOnly = els.adultOnly.checked;
    onFilterChange();
  });

  // Clear all filters (pills-row button)
  function doClearAll() {
    setType('all');
    setSort(DEFAULT_SORT);
    setYearRange(0, new Date().getFullYear());
    setRatingRange(0, 10);
    qsa('#services-panel input[type="checkbox"]').forEach(c => c.checked = false);
    syncServicesFromUI();
    setLanguage('');
    els.locationOnly.checked = false; state.locationOnly = false;
    els.adultOnly.checked = false; state.adultOnly = false;
    onFilterChange();
  }

  // Pills click → remove single pill, or clear-all
  els.pills.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-all"]')) { doClearAll(); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    const pill = btn.closest('.pill');
    if (pill) clearOnePill(pill.dataset.key);
  });

  // Only one chip dropdown open at a time; position the (fixed) panel under the summary.
  // Avoid the read-after-write forced reflow Lighthouse logged (149ms): batch
  // all reads (getBoundingClientRect + offsetWidth) BEFORE any style writes.
  const positionPanel = (d) => {
    const summary = d.querySelector('summary');
    const panel = d.querySelector('.chip-panel');
    if (!summary || !panel) return;
    // Reads first (all in one frame, no intermediate writes)
    const r  = summary.getBoundingClientRect();
    const pw = panel.offsetWidth || 240;
    const vw = window.innerWidth;
    let left = r.left;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    // Writes second (single style update)
    panel.style.left = `${left}px`;
    panel.style.top  = `${r.bottom + 8}px`;
  };
  qsa('.chip[data-chip]').forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        qsa('.chip[data-chip]').forEach(o => { if (o !== d) o.open = false; });
        positionPanel(d);
      }
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip[data-chip]') && !e.target.closest('.chip-panel')) {
      qsa('.chip[data-chip][open]').forEach(d => d.open = false);
    }
  });
  // Close on scroll/resize - fixed panels can't move with their trigger otherwise
  const closeAllChips = () => qsa('.chip[data-chip][open]').forEach(d => d.open = false);
  window.addEventListener('scroll', closeAllChips, { passive: true });
  window.addEventListener('resize', closeAllChips);

  // Scroll arrows
  els.scrollL.addEventListener('click', () => els.chipRail.scrollBy({ left: -240, behavior:'smooth' }));
  els.scrollR.addEventListener('click', () => els.chipRail.scrollBy({ left:  240, behavior:'smooth' }));
  const updateArrows = () => {
    const sl = els.chipRail.scrollLeft;
    const max = els.chipRail.scrollWidth - els.chipRail.clientWidth - 4;
    els.scrollL.toggleAttribute('disabled', sl <= 0);
    els.scrollR.toggleAttribute('disabled', sl >= max);
  };
  els.chipRail.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);
  setTimeout(updateArrows, 50);

  // Search input - debounce the clear-button toggle + empty-search-trigger so
  // the input handler returns immediately (was a 686ms INP offender in
  // Lighthouse). Keystroke latency stays sub-frame; the clear-icon and
  // empty-query reset run on idle.
  let searchInputTimer = null;
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (searchInputTimer) { clearTimeout(searchInputTimer); searchInputTimer = null; }
    runQueryChange(els.searchInput.value.trim());
  });
  els.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (searchInputTimer) clearTimeout(searchInputTimer);
    searchInputTimer = setTimeout(() => {
      searchInputTimer = null;
      els.clearBtn.classList.toggle('visible', !!val);
      if (val === '' && state.query !== '') runQueryChange('');
    }, 120);
  });
  els.clearBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.clearBtn.classList.remove('visible');
    runQueryChange('');
    els.searchInput.focus();
  });
}

function runQueryChange(q) {
  if (q === state.query) return;
  state.query = q;
  state.page  = 1;
  state.exhausted = false;
  document.body.classList.toggle('is-searching', !!q);
  // close any open dropdowns
  qsa('.chip[data-chip][open]').forEach(d => d.open = false);
  els.grid.innerHTML = '';
  updatePills();
  fetchMedia(false);
}

function onFilterChange() {
  state.page = 1;
  state.exhausted = false;
  els.grid.innerHTML = '';
  updatePills();
  savePrefs();
  fetchMedia(false);
}


/* ---------- 10. DETAIL OVERLAY ---------- */
let lastSelectedRegion = '';
let currentDetail = null;  // {id, mt, item} - set on open, cleared on close. Used so collection:change can re-render the row.

/* Render the spoken-languages strip beneath the meta row.
   Source of truth: TMDB's `spoken_languages` (each has iso_639_1, english_name,
   and `name` which is the endonym/native). The film's `original_language` is a
   bare ISO code that may or may not appear in spoken_languages - defensive:
   prepend a synthetic entry if it doesn't. Caps visible chips at LANG_VISIBLE_MAX
   to keep the row from wrapping into a paragraph; overflow opens the info overlay. */
const LANG_VISIBLE_MAX = 4;
function renderDetailLangs(d) {
  if (!els.detailLangs) return;
  const spoken = Array.isArray(d.spoken_languages) ? d.spoken_languages.slice() : [];
  const origIso = (d.original_language || '').toLowerCase();

  // Defensive: make sure the original language is represented.
  if (origIso && !spoken.some(l => (l.iso_639_1 || '').toLowerCase() === origIso)) {
    spoken.unshift({
      iso_639_1: origIso,
      english_name: LANG_NAME_MAP[origIso] || origIso.toUpperCase(),
      name: LANG_NATIVE_MAP[origIso] || '',
    });
  }
  if (!spoken.length) { els.detailLangs.hidden = true; els.detailLangs.innerHTML = ''; return; }

  // Sort: original first, then alphabetical.
  spoken.sort((a, b) => {
    const ai = (a.iso_639_1 || '').toLowerCase(), bi = (b.iso_639_1 || '').toLowerCase();
    if (ai === origIso) return -1;
    if (bi === origIso) return 1;
    return (a.english_name || '').localeCompare(b.english_name || '');
  });

  const chipHtml = (l) => {
    const iso = (l.iso_639_1 || '').toLowerCase();
    const isOrig = iso === origIso;
    const enName = l.english_name || LANG_NAME_MAP[iso] || iso.toUpperCase();
    return `<span class="lang-chip${isOrig ? ' is-original' : ''}" title="${escapeAttr(isOrig ? `${enName} (original)` : enName)}">
      <span class="lang-iso">${escapeHtml(iso || '??')}</span>
      <span class="lang-name">${escapeHtml(enName)}</span>
    </span>`;
  };

  const visible = spoken.slice(0, LANG_VISIBLE_MAX);
  const overflow = spoken.length - visible.length;
  const moreBtn = overflow > 0
    ? `<button type="button" class="detail-langs-more" id="lang-more">+${overflow} more</button>`
    : '';

  els.detailLangs.hidden = false;
  els.detailLangs.innerHTML = `
    <span class="detail-langs-label">Spoken</span>
    ${visible.map(chipHtml).join('')}
    ${moreBtn}
  `;
  // "+N more" → info overlay with the full list and native names.
  const more = $('lang-more');
  if (more) more.addEventListener('click', () => showLanguageInfoOverlay(spoken, origIso));
}

function showLanguageInfoOverlay(spoken, origIso) {
  const items = spoken.map(l => {
    const iso = (l.iso_639_1 || '').toLowerCase();
    const isOrig = iso === origIso;
    const en = l.english_name || LANG_NAME_MAP[iso] || iso.toUpperCase();
    // Prefer TMDB's native name; fall back to our endonym map.
    const native = (l.name && l.name !== en) ? l.name : (LANG_NATIVE_MAP[iso] && LANG_NATIVE_MAP[iso] !== en ? LANG_NATIVE_MAP[iso] : '');
    const display = native ? `${escapeHtml(en)} - ${escapeHtml(native)}` : escapeHtml(en);
    return `<li class="${isOrig ? 'is-original' : ''}">
      <span class="lang-iso">${escapeHtml(iso || '??')}</span>
      <span>${display}</span>
      ${isOrig ? '<span class="lang-tag">Original</span>' : ''}
    </li>`;
  }).join('');
  els.infoContent.innerHTML = `
    <h3>Languages</h3>
    <p class="muted">Spoken languages as listed by TMDB. The original language is highlighted.</p>
    <ul class="lang-list">${items}</ul>
  `;
  showOverlay(els.infoOverlay);
}

function renderCollectionActions(item) {
  const entry = getEntry(item.id, getMediaType(item)) || {};
  const fav    = !!entry.favourite;
  const status = entry.status || '';
  const rating = entry.rating || '';
  const btn = (key, label, on) => `
    <button type="button" class="coll-btn coll-${key}${on ? ' is-active' : ''}"
      data-coll-action="${key}" aria-pressed="${on ? 'true' : 'false'}" title="${label}">
      <span class="coll-icon">${ICONS[key]}</span>
      <span class="coll-label">${label}</span>
    </button>`;
  return [
    btn('favourite', 'Favourite',   fav),
    btn('want',      'Want to watch', status === 'want'),
    btn('watching',  'Watching',    status === 'watching'),
    btn('watched',   'Watched',     status === 'watched'),
    btn('liked',     'Liked',       rating === 'liked'),
    btn('disliked',  'Disliked',    rating === 'disliked'),
  ].join('');
}

function showDetail(id, mt) {
  const key = `${mt}:${id}`;
  const item = state.cache.find(x => x.id === id && getMediaType(x) === mt)
            || state.detailOverrides[key];
  if (!item) return;
  currentDetail = { id, mt, item };
  const title = item.title || item.name || '';
  const date  = item.release_date || item.first_air_date || '';

  // Reset poster + backdrop. In low-data mode skip the src entirely so the
  // browser never fetches them; CSS paints LowData.svg on the wrapping
  // container.
  els.detailPoster.classList.remove('loaded');
  els.detailBackdropImg.classList.remove('loaded');
  if (state.lowData) {
    els.detailPoster.removeAttribute('src');
    els.detailBackdropImg.removeAttribute('src');
  } else {
    els.detailPoster.src = posterUrl(item.poster_path, 'w500');
    els.detailBackdropImg.src = backdropUrl(item.backdrop_path, 'w1280') || posterUrl(item.poster_path, 'w780');
  }

  els.detailTitle.textContent = title;
  els.detailOverview.textContent = item.overview || 'No description available.';
  els.detailMeta.innerHTML = renderDetailMetaInitial(item);
  if (els.detailLangs) { els.detailLangs.hidden = true; els.detailLangs.innerHTML = ''; }
  els.detailActions.innerHTML = renderDetailActions(item, '');
  els.detailCollectionActions.innerHTML = renderCollectionActions(item);
  els.detailCast.innerHTML = '<div style="color:var(--text-mid);font-size:13px;display:flex;align-items:center;gap:8px;"><span class="spinner"></span>Loading cast…</div>';
  els.seeMoreCast.hidden = true;
  els.detailProviders.innerHTML = '<div style="color:var(--text-mid);font-size:13px;display:flex;align-items:center;gap:8px;"><span class="spinner"></span>Loading streaming…</div>';
  els.regionRow.innerHTML = '';

  // Reset the Copy ID / Copy slug pills so previous state doesn't carry over.
  if (els.copyIdBtn) {
    if (copyIdResetTimer) { clearTimeout(copyIdResetTimer); copyIdResetTimer = null; }
    els.copyIdBtn.classList.remove('is-copied');
    const label = qs('.copy-id-text', els.copyIdBtn);
    if (label) label.textContent = 'Copy ID';
  }
  if (els.copySlugBtn) {
    if (copySlugResetTimer) { clearTimeout(copySlugResetTimer); copySlugResetTimer = null; }
    els.copySlugBtn.classList.remove('is-copied');
    const label = qs('.copy-id-text', els.copySlugBtn);
    if (label) label.textContent = 'Copy slug';
  }

  showOverlay(els.detailOverlay);
  attachImageLoaders(els.detailOverlay);

  // Fetch details + videos + keywords (keywords drives the NSFW badge for
  // titles like Overflow where TMDB's adult flag is false but the tag is set).
  fetch(`${TMDB}/${mt}/${id}?api_key=${API_KEY}&append_to_response=videos,keywords`)
    .then(r => r.json())
    .then(d => {
      const kwList = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
      const keywordNsfw = kwList.some(k => NSFW_KEYWORD_IDS.has(k.id));
      nsfwKeywordCache.set(`${mt}:${id}`, keywordNsfw);
      els.detailMeta.innerHTML = renderDetailMeta(item, d);
      renderDetailLangs(d);
      const trailer = (d.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                    || (d.videos?.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      els.detailActions.innerHTML = renderDetailActions(item, trailer);
      if (keywordNsfw) paintNsfwOnCard(item);
      // Overview can be richer if we have it
      if (d.overview) els.detailOverview.textContent = d.overview;
    })
    .catch(() => {});

  // Cast
  fetch(`${TMDB}/${mt}/${id}/credits?api_key=${API_KEY}`)
    .then(r => r.json())
    .then(d => {
      const cast = d.cast || [];
      if (!cast.length) { els.detailCast.innerHTML = '<p style="color:var(--text-low);font-size:13px;">No cast info.</p>'; return; }
      const preview = cast.slice(0, CAST_PREVIEW_MAX);
      els.detailCast.innerHTML = preview.map((p,i) => renderPerson(p, p.character || '', i)).join('');
      attachImageLoaders(els.detailCast);
      if (cast.length > CAST_PREVIEW_MAX) {
        els.seeMoreCast.hidden = false;
        els.seeMoreCast.onclick = () => showCastGrid(cast, true);
      }
    })
    .catch(() => { els.detailCast.innerHTML = '<p style="color:var(--text-low);font-size:13px;">Could not load cast.</p>'; });

  // Region selector + providers
  fetchRegions().then(regions => {
    lastSelectedRegion = state.userRegion || 'US';
    const opts = regions.slice().sort((a,b)=>a.english_name.localeCompare(b.english_name))
      .map(r => `<option value="${r.iso_3166_1}"${r.iso_3166_1===lastSelectedRegion?' selected':''}>${escapeHtml(r.english_name)}</option>`).join('');
    els.regionRow.innerHTML = `
      <span>Region:</span>
      <select id="region-select" aria-label="Select region">${opts || '<option value="US">United States</option>'}</select>
    `;
    qs('#region-select').addEventListener('change', (e) => {
      lastSelectedRegion = e.target.value;
      fetchProviders(mt, id, title, date, lastSelectedRegion);
    });
    fetchProviders(mt, id, title, date, lastSelectedRegion);
  });
}

function renderDetailMetaInitial(item) {
  const date = item.release_date || item.first_air_date || '';
  const mt = getMediaType(item);
  const rating = item.vote_average || 0;
  const votes  = item.vote_count || 0;
  return `
    ${rating > 0 ? `<span class="star">★ ${rating.toFixed(1)}</span><span class="vote-count">${formatVotes(votes)} votes</span><span class="dot">·</span>` : ''}
    <span>${yearOf(date)}</span>
    <span class="dot">·</span>
    <span class="badge">${getTypeLabel(mt)}</span>
    ${isAnime(item) ? `<span class="badge">Anime</span>` : ''}
    ${isExplicit(item) ? `<span class="badge adult">NSFW · 18+</span>` : ''}
  `;
}
function renderDetailMeta(item, d) {
  const date = item.release_date || item.first_air_date || '';
  const mt = getMediaType(item);
  const rating = item.vote_average || 0;
  const votes  = item.vote_count || 0;
  const genres = (d.genres || []).map(g => g.name).join(' · ');
  let extra = '';
  if (mt === 'movie' && d.runtime) {
    const m = d.runtime % 60, h = Math.floor(d.runtime/60);
    extra = `<span class="dot">·</span><span>${h ? h+'h ':''}${m}m</span>`;
  } else if (mt === 'tv') {
    const parts = [];
    if (d.number_of_seasons)  parts.push(d.number_of_seasons === 1 ? '1 season' : `${d.number_of_seasons} seasons`);
    if (d.number_of_episodes) parts.push(`${d.number_of_episodes} eps`);
    if (parts.length) extra = `<span class="dot">·</span><span>${parts.join(', ')}</span>`;
  }
  return `
    ${rating > 0 ? `<span class="star">★ ${rating.toFixed(1)}</span><span class="vote-count">${formatVotes(votes)} votes</span><span class="dot">·</span>` : ''}
    <span>${yearOf(date)}</span>
    <span class="dot">·</span>
    <span class="badge">${getTypeLabel(mt)}</span>
    ${isAnime(item) ? `<span class="badge">Anime</span>` : ''}
    ${isExplicit(item) ? `<span class="badge adult">NSFW · 18+</span>` : ''}
    ${genres ? `<span class="dot">·</span><span>${escapeHtml(genres)}</span>` : ''}
    ${extra}
  `;
}
function renderDetailActions(item, trailer) {
  const parts = [];
  const mt = getMediaType(item);
  if (trailer && trailer.key) parts.push(`<a class="btn btn-red" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${trailer.key}">▶ Watch trailer</a>`);
  if (item.id) {
    // Vidking embed in a new tab. TV needs season/episode in the path -
    // default to S1E1; episodeSelector lets the user jump within the player.
    const watchUrl = mt === 'movie'
      ? `https://www.vidking.net/embed/movie/${item.id}?color=dc2626&autoPlay=true`
      : `https://www.vidking.net/embed/tv/${item.id}/1/1?color=dc2626&autoPlay=true&nextEpisode=true&episodeSelector=true`;
    const watchLabel = mt === 'movie' ? 'Watch movie' : 'Watch show';
    const animeMode = isAnime(item);
    const genreIds = item.genre_ids || (item.genres || []).map(g => g.id);
    const animated = !animeMode && genreIds.includes(ANIME_GENRE_ID);
    if (animeMode) {
      parts.push(`<button type="button" class="btn btn-anime"><span class="anime-spark" aria-hidden="true">🏴‍☠️</span> Watch anime</button>`);
    } else if (animated) {
      parts.push(`<button type="button" class="btn btn-anime btn-muted" disabled title="Not detected as anime"><span class="anime-spark" aria-hidden="true">❓</span> Watch anime</button>`);
    }
    // Vidking button: greyed but still clickable when an anime primary is present.
    const pirateClass = animeMode ? 'btn btn-pirate btn-muted' : 'btn btn-pirate';
    parts.push(`<a class="${pirateClass}" target="_blank" rel="noopener" href="${watchUrl}"><span class="pirate-flag" aria-hidden="true">🏴‍☠️</span> ${watchLabel}</a>`);
  }
  return parts.join('');
}

// ISO 3166-1 → JustWatch url_part. Only exceptions listed; all others are just toLowerCase().
const JW_LOCALE_MAP = { GB: 'uk' };
// Full set of JustWatch-supported url_parts (from /content/locales/state).
const JW_SUPPORTED = new Set(['us','de','br','au','nz','ca','uk','za','ie','bs','gf','ba','va','xk','by','dk','bz','cy','cm','gy','ml','ni','cd','mw','tz','pg','zw','az','lv','ec','tw','pk','bg','ru','ch','at','my','sg','fi','hu','gr','co','ua','hn','ee','py','is','pa','uy','do','es','fr','eg','ae','iq','hr','ci','cv','pf','lc','lu','sc','ne','me','mg','mz','ke','ug','tt','tc','zm','sn','jm','lb','ps','mk','cu','ao','ag','sv','dz','ma','ad','al','jo','bh','kw','om','qa','be','jp','kr','sa','ar','it','nl','pt','tr','in','mx','bf','cl','pe','th','se','cz','id','pl','ph','ro','no','bo','bb','cr','td','gh','gq','fj','gg','mt','mu','gt','lt','rs','si','ng','sk','il','ve','md','hk','li','mc','sm','gi','tn','ly','bm','ye']);

function fetchProviders(mt, id, title, date, region) {
  const slug = title.toLowerCase().replace(/[''']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  const jwType = mt === 'movie' ? 'movie' : 'tv-series';
  const jwLocale = (() => { const c = JW_LOCALE_MAP[region] || region.toLowerCase(); return JW_SUPPORTED.has(c) ? c : 'us'; })();
  const jwFallback = `https://www.justwatch.com/${jwLocale}/${jwType}/${slug}`;
  const gUrl    = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${yearOf(date)} ${mt==='movie'?'movie':'TV show'} where to watch`)}`;

  // Low-data: omit the brand <img> tags; CSS already drops them via :root[data-low-data] rule.
  const buildLinks = (jwUrl) => {
    const tmdbImg = state.lowData ? '' : `<img src="TMDB.png" alt="" width="20" height="20" loading="lazy" decoding="async"/>`;
    const jwImg   = state.lowData ? '' : `<img src="justwatch.png" alt="" width="20" height="20" loading="lazy" decoding="async"/>`;
    const gImg    = state.lowData ? '' : `<img src="Google.png" alt="" width="20" height="20" loading="lazy" decoding="async"/> `;
    const bothIcons = state.lowData ? '' : `${tmdbImg} ${jwImg} `;
    return `
      <div class="provider-row">
        <a href="${jwUrl}" target="_blank" rel="noopener">${bothIcons}TMDB (JustWatch) →</a>
        <a href="${gUrl}" target="_blank" rel="noopener">${gImg}Google →</a>
      </div>`;
  };

  els.detailProviders.innerHTML = '<div style="color:var(--text-mid);font-size:13px;display:flex;align-items:center;gap:8px;"><span class="spinner"></span>Loading…</div>';
  fetch(`${TMDB}/${mt}/${id}/watch/providers?api_key=${API_KEY}`)
    .then(r => r.json())
    .then(data => {
      const regionData = data.results?.[region];
      const jwUrl = regionData?.link || jwFallback;
      const links = buildLinks(jwUrl);

      if (!regionData) {
        // Show what regions DO have it (for VPN hint)
        const others = Object.keys(data.results || {}).filter(c => {
          const x = data.results[c]; return x && (x.flatrate?.length || x.ads?.length || x.rent?.length || x.buy?.length);
        });
        const otherNames = others.map(c => state.allRegions.find(r => r.iso_3166_1===c)?.english_name || c).sort();
        let html = `<p class="providers-empty">Not currently available in ${escapeHtml(state.allRegions.find(r => r.iso_3166_1===region)?.english_name || region)}.</p>`;
        if (otherNames.length) {
          const sample = otherNames.slice(0, 5).join(', ');
          const more = otherNames.length > 5 ? `, +${otherNames.length-5} more` : '';
          html += `
            <div class="vpn-hint">
              <div>
                <p>Available in: <strong>${escapeHtml(sample)}${more}</strong></p>
                <p>You can use a <a href="https://www.google.com/search?q=VPN" target="_blank" rel="noopener">VPN</a> to access streaming in those regions.</p>
              </div>
              <button type="button" id="vpn-more">More info</button>
            </div>`;
        }
        html += links;
        els.detailProviders.innerHTML = html;
        const btn = $('vpn-more');
        if (btn) btn.addEventListener('click', () => showInfoOverlay(otherNames));
        return;
      }
      const sections = [
        ['Stream', regionData.flatrate || []],
        ['Free with ads', regionData.ads || []],
      ];
      const rentBuy = [...(regionData.rent || []), ...(regionData.buy || [])];
      const dedup = [...new Map(rentBuy.map(p => [p.provider_id, p])).values()];
      if (dedup.length) sections.push(['Rent / Buy', dedup]);

      const blocks = sections.filter(([_,list]) => list.length).map(([h, list]) => `
        <div class="providers-section">
          <h4>${h}</h4>
          <div class="provider-list">
            ${list.map(p => `
              <a class="provider-tile" data-name="${escapeAttr(p.provider_name)}" href="${PROVIDER_URLS[p.provider_id] || jwUrl}" target="_blank" rel="noopener" title="${escapeAttr(p.provider_name)}" aria-label="${escapeAttr(p.provider_name)}">
                ${providerImg(p.logo_path, p.provider_name)}
              </a>`).join('')}
          </div>
        </div>`).join('');

      if (!blocks) {
        els.detailProviders.innerHTML = `<p class="providers-empty">No streaming options found.</p>${links}`;
      } else {
        els.detailProviders.innerHTML = blocks + links;
      }
    })
    .catch(() => {
      els.detailProviders.innerHTML = `<p class="providers-empty">Could not load providers.</p>${buildLinks(jwFallback)}`;
    });
}


/* ---------- 11. ACTOR OVERLAY ---------- */
function showActor(personId) {
  els.actorContent.innerHTML = '<div style="color:var(--text-mid);font-size:13px;display:flex;align-items:center;gap:8px;padding:14px 0;"><span class="spinner"></span>Loading…</div>';
  showOverlay(els.actorOverlay);
  Promise.all([
    fetch(`${TMDB}/person/${personId}?api_key=${API_KEY}`).then(r=>r.json()),
    fetch(`${TMDB}/person/${personId}/movie_credits?api_key=${API_KEY}`).then(r=>r.json()),
    fetch(`${TMDB}/person/${personId}/tv_credits?api_key=${API_KEY}`).then(r=>r.json()),
  ]).then(([p, mc, tc]) => {
    const movies = (mc.cast || []).slice(0, 18);
    const tvs    = (tc.cast || []).slice(0, 18);
    const creditCard = (c, mt, idx = 0) => {
      const title = (mt === 'movie' ? c.title : c.name) || '';
      const date  = mt === 'movie' ? (c.release_date || '') : (c.first_air_date || '');
      const year  = yearOf(date);
      const posterPath = c.poster_path || '';
      return `
        <article class="credit-card" data-id="${c.id}" data-type="${mt}"
          data-title="${escapeAttr(title)}" data-date="${escapeAttr(date)}" data-poster="${escapeAttr(posterPath)}"
          tabindex="0" role="button" style="--i:${Math.min(idx, 24)}">
          <div class="credit-poster">
            ${posterImg(posterPath, title)}
          </div>
          <div class="credit-info">
            <div class="credit-title" title="${escapeAttr(title)}">${escapeHtml(title)}</div>
            ${year !== '-' ? `<div class="credit-year">${escapeHtml(year)}</div>` : ''}
          </div>
        </article>`;
    };
    els.actorContent.innerHTML = `
      <div class="actor-header">
        <div class="actor-photo-lg">${profileImg(p.profile_path, p.name||'')}</div>
        <div>
          <div class="actor-name">${escapeHtml(p.name||'')}</div>
          ${p.known_for_department ? `<div class="actor-known-for">Known for ${escapeHtml(p.known_for_department)}</div>` : ''}
        </div>
      </div>
      ${movies.length ? `<div class="actor-section"><h4>Movies</h4><div class="credit-grid">${movies.map((c,i)=>creditCard(c,'movie',i)).join('')}</div></div>` : ''}
      ${tvs.length ? `<div class="actor-section"><h4>TV</h4><div class="credit-grid">${tvs.map((c,i)=>creditCard(c,'tv',i)).join('')}</div></div>` : ''}
    `;
    attachImageLoaders(els.actorContent);
  }).catch(() => {
    els.actorContent.innerHTML = '<p style="color:var(--text-low);font-size:13px;padding:14px 0;">Could not load person.</p>';
  });
}


/* ---------- 12. CAST GRID ---------- */
function showCastGrid(list, withRole) {
  const isPeopleSearch = !withRole;
  const heading = isPeopleSearch ? 'People' : 'Cast & crew';
  const html = list.map((p, i) => renderPerson(p, withRole ? p.character : '', i)).join('');
  els.castGridContent.innerHTML = `
    <h3>${heading}</h3>
    <div class="people-grid">${html}</div>
  `;
  attachImageLoaders(els.castGridContent);
  showOverlay(els.castGridOverlay);
}


/* ---------- 13. INFO OVERLAY ---------- */
function showInfoOverlay(regions) {
  const regionsTxt = regions && regions.length ? regions.sort().join(', ') : '-';
  const vpns = VPN_LIST.map(v => `<a href="${v.url}" target="_blank" rel="noopener">${v.name}</a>`).join('');
  els.infoContent.innerHTML = `
    <h3>Available in</h3>
    <p>${escapeHtml(regionsTxt)}</p>
    <p class="muted">Streaming options vary country-to-country.</p>
    <h3>Top VPNs</h3>
    <div class="vpn-list">${vpns}</div>
  `;
  showOverlay(els.infoOverlay);
}


/* ---------- 13b. COLLECTION OVERLAY + IMPORT/EXPORT ---------- */
let collectionTab = 'all';
const COLLECTION_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'want',      label: 'Want to watch' },
  { key: 'favourite', label: 'Favourites' },
  { key: 'watching',  label: 'Watching' },
  { key: 'watched',   label: 'Watched' },
  { key: 'liked',     label: 'Liked' },
  { key: 'disliked',  label: 'Disliked' },
];

function openCollection() {
  collectionTab = 'want';
  renderCollection();
  showOverlay(els.collectionOverlay);
}

/* Seed state.detailOverrides from a collection entry then open the detail
   overlay. The overlay's TMDB fetches will fill in overview/runtime/etc. */
function openDetailFromCollection(id, mt) {
  const e = getEntry(id, mt);
  if (!e) return;
  state.detailOverrides[`${mt}:${id}`] = {
    id: e.id,
    media_type: e.mediaType,
    title: e.title,
    name: e.title,
    poster_path: e.posterPath,
    release_date: e.mediaType === 'movie' && e.year ? `${e.year}-01-01` : '',
    first_air_date: e.mediaType === 'tv' && e.year ? `${e.year}-01-01` : '',
  };
  showDetail(id, mt);
}

/* Split rendering so a tab click only swaps the .is-active class on the
   tabs (cheap) and rebuilds the body. The full rebuild used to be the
   234ms input-delay flagged on button.coll-tab. */
function renderCollectionTabs() {
  const counts = getCounts();
  const countOf = (k) => k === 'all' ? counts.total : counts[k] || 0;
  els.collectionTabs.innerHTML = COLLECTION_TABS.map(t => `
    <button type="button" class="coll-tab${t.key === collectionTab ? ' is-active' : ''}"
      data-tab="${t.key}" role="tab" aria-selected="${t.key === collectionTab ? 'true' : 'false'}">
      <span class="coll-label">${t.label}</span>
      <span class="coll-tab-count" aria-hidden="true">${countOf(t.key)}</span>
    </button>`).join('');
}
function updateCollectionTabActive() {
  qsa('.coll-tab', els.collectionTabs).forEach(t => {
    const active = t.dataset.tab === collectionTab;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
function renderCollectionBody() {
  const items = Object.values(loadCollection().items);
  let filtered;
  if (collectionTab === 'all')             filtered = items;
  else if (collectionTab === 'favourite')  filtered = items.filter(e => e.favourite);
  else if (collectionTab === 'liked' || collectionTab === 'disliked')
                                           filtered = items.filter(e => e.rating === collectionTab);
  else                                     filtered = items.filter(e => e.status === collectionTab);
  filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (filtered.length === 0) {
    const msg = items.length === 0
      ? `<strong>Your collection is empty.</strong><span>Open a movie or show, then tap a heart, bookmark, play or check icon to start collecting.</span>`
      : `<strong>Nothing here yet.</strong><span>Try a different tab - or add something from a movie or show card.</span>`;
    els.collectionBody.innerHTML = `<div class="collection-empty">${msg}</div>`;
    return;
  }

  // Convert each entry to a TMDB-shaped item so renderCard works without changes.
  const html = filtered.map((e, i) => renderCard({
    id: e.id,
    media_type: e.mediaType,
    title: e.title,
    name: e.title,
    poster_path: e.posterPath,
    release_date: e.mediaType === 'movie' && e.year ? `${e.year}-01-01` : '',
    first_air_date: e.mediaType === 'tv' && e.year ? `${e.year}-01-01` : '',
  }, i, false)).join('');
  els.collectionBody.innerHTML = `<div class="grid">${html}</div>`;
  attachImageLoaders(els.collectionBody);
}
function renderCollection() {
  renderCollectionTabs();
  renderCollectionBody();
}

function setCollectionStatus(text, kind = 'info') {
  if (!text) {
    els.collectionStatus.hidden = true;
    els.collectionStatus.removeAttribute('data-kind');
    els.collectionStatus.textContent = '';
    return;
  }
  els.collectionStatus.hidden = false;
  els.collectionStatus.dataset.kind = kind;
  els.collectionStatus.textContent = text;
  // auto-clear after a few seconds for non-error kinds
  if (kind !== 'error') setTimeout(() => {
    if (els.collectionStatus.textContent === text) setCollectionStatus('');
  }, 4000);
}

function exportCollection() {
  const col = loadCollection();
  const payload = { version: COLLECTION_VER, exportedAt: Date.now(), items: col.items };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `msearch-collection-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const n = Object.keys(col.items).length;
  setCollectionStatus(`Exported ${n} item${n === 1 ? '' : 's'}.`);
}

function importCollection(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      const result = mergeImport(data);
      if (!result.ok) { setCollectionStatus(result.reason || 'Could not import.', 'error'); return; }
      const parts = [`Imported ${result.total} item${result.total === 1 ? '' : 's'}`];
      if (result.added)   parts.push(`${result.added} new`);
      if (result.updated) parts.push(`${result.updated} updated`);
      setCollectionStatus(parts.join(' · ') + '.');
    } catch {
      setCollectionStatus('That file is not valid JSON.', 'error');
    }
  };
  reader.onerror = () => setCollectionStatus('Could not read that file.', 'error');
  reader.readAsText(file);
}


/* ---------- 13c. ADBLOCK PROMPT ----------
   Intercepts clicks on the .btn-pirate watch button and suggests uBlock Origin
   first. Suppressed when the user has ticked "Don't show again". The original
   URL is stashed on the continue button so we can window.open it on confirm. */
const ADBLOCK_SKIP_KEY = 'msearch-adblock-skip';
const adblockSkipped = () => {
  try { return localStorage.getItem(ADBLOCK_SKIP_KEY) === '1'; } catch { return false; }
};
function showAdblockPrompt(url) {
  els.adblockContinue.dataset.url = url || '';
  els.adblockDontShow.checked = false;
  showOverlay(els.adblockOverlay);
}


/* ---------- 13d. COPY ID ----------
   Small affordance at the bottom of the detail overlay. Copies the TMDB
   numeric ID; clipboard API with a textarea fallback for non-secure contexts. */
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
const slugify = (str) =>
  (str || '').toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

let copySlugResetTimer = null;
function flashCopySlug(text) {
  const label = qs('.copy-id-text', els.copySlugBtn);
  if (!label) return;
  if (copySlugResetTimer) clearTimeout(copySlugResetTimer);
  els.copySlugBtn.classList.add('is-copied');
  label.textContent = text;
  copySlugResetTimer = setTimeout(() => {
    els.copySlugBtn.classList.remove('is-copied');
    label.textContent = 'Copy slug';
    copySlugResetTimer = null;
  }, 1600);
}

let copyIdResetTimer = null;
function flashCopyId(text) {
  const label = qs('.copy-id-text', els.copyIdBtn);
  if (!label) return;
  if (copyIdResetTimer) clearTimeout(copyIdResetTimer);
  els.copyIdBtn.classList.add('is-copied');
  label.textContent = text;
  copyIdResetTimer = setTimeout(() => {
    els.copyIdBtn.classList.remove('is-copied');
    label.textContent = 'Copy ID';
    copyIdResetTimer = null;
  }, 1600);
}


/* ---------- 14. INFINITE SCROLL ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    if (!state.autoLoad) return;     // gated - Load More button handles it instead
    if (state.loading || state.exhausted) return;
    if (state.cache.length === 0) return; // initial load not done yet
    state.page++;
    fetchMedia(true);
  });
}, { rootMargin: '600px 0px' });


/* ---------- Overlay helpers ---------- */
function showOverlay(el) {
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function hideOverlay(el) {
  el.classList.remove('active');
  el.setAttribute('aria-hidden', 'true');
  // restore scroll only if no overlay still active
  if (!qs('.overlay.active')) document.body.style.overflow = '';
}


/* ---------- 15. THEME ---------- */
const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else                   document.documentElement.removeAttribute('data-theme');
}
function toggleTheme() {
  applyTheme(isLight() ? 'dark' : 'light');
  // Defer the localStorage write off the input handler so the icon swap
  // is the only synchronous work. Lighthouse logged 357ms input delay on
  // svg.icon-sun; this keeps the click handler under a frame.
  setTimeout(savePrefs, 0);
}

/* Auto-load toggle UI: drives the icon swap (CSS reads [data-autoload]) and load-more visibility */
function applyAutoLoadUI() {
  document.documentElement.dataset.autoload = state.autoLoad ? 'on' : 'off';
  refreshLoadMore();
}

/* ---------- 15b. LOW-DATA MODE ----------
   Skip every <img> network request, paint the cached LowData.svg via CSS,
   and force autoLoad off so the user only fetches the next page on click.
   Persisted in PREFS_KEY so it survives reloads. */
function applyLowDataUI() {
  if (state.lowData) document.documentElement.dataset.lowData = 'on';
  else delete document.documentElement.dataset.lowData;
  if (els.lowdataToggle) els.lowdataToggle.setAttribute('aria-pressed', state.lowData ? 'true' : 'false');
  // Reflect on the autoLoad icon state too — low-data forces autoLoad off.
  refreshLoadMore();
}
function toggleLowData() {
  state.lowData = !state.lowData;
  if (state.lowData && state.autoLoad) {
    // Forced off when low-data turns on. Don't restore on toggle off — the
    // user can re-enable it explicitly via the autoload button.
    state.autoLoad = false;
    applyAutoLoadUI();
  }
  applyLowDataUI();
  savePrefs();
  // Re-render the current grid so previously-emitted <img> tags vanish (or
  // reappear when toggling off). Cheaper than per-element src manipulation.
  if (state.cache.length) renderResults({ append: false });
  // Re-render the detail overlay's poster + backdrop if it's open.
  if (currentDetail) {
    if (state.lowData) {
      els.detailPoster.removeAttribute('src');
      els.detailBackdropImg.removeAttribute('src');
    } else {
      els.detailPoster.src = posterUrl(currentDetail.item.poster_path, 'w500');
      els.detailBackdropImg.src = backdropUrl(currentDetail.item.backdrop_path, 'w1280') || posterUrl(currentDetail.item.poster_path, 'w780');
      attachImageLoaders(els.detailOverlay);
    }
  }
}

function refreshLoadMore() {
  if (!els.loadMoreBtn) return;
  const shouldShow = !state.autoLoad && !state.exhausted && !state.loading && state.cache.length > 0;
  els.loadMoreBtn.hidden = !shouldShow;
  els.loadMoreBtn.disabled = state.loading;
}
function toggleAutoLoad() {
  state.autoLoad = !state.autoLoad;
  applyAutoLoadUI();
  savePrefs();
  // If user just turned auto-load ON and the sentinel is in view, kick off a fetch
  if (state.autoLoad && !state.loading && !state.exhausted && state.cache.length > 0) {
    const r = els.sentinel.getBoundingClientRect();
    if (r.top < window.innerHeight + 600) {
      state.page++;
      fetchMedia(true);
    }
  }
}


/* ---------- 16. INIT ---------- */
function init() {
  // Build service options
  buildServiceCheckboxes();
  buildLanguageRadios();

  // Load prefs
  const prefs = loadPrefs();
  if (prefs) {
    if (prefs.theme === 'light') applyTheme('light');
    if (prefs.type)     setType(prefs.type);
    if (prefs.sort)     setSort(prefs.sort);
    if (prefs.yearMin != null && prefs.yearMax != null) setYearRange(prefs.yearMin, prefs.yearMax);
    if (prefs.ratingMin != null && prefs.ratingMax != null) setRatingRange(prefs.ratingMin, prefs.ratingMax);
    if (prefs.adultOnly)    { els.adultOnly.checked = true; state.adultOnly = true; }
    if (prefs.locationOnly) { els.locationOnly.checked = true; state.locationOnly = true; }
    if (prefs.servicesAll === false && Array.isArray(prefs.serviceVals) && prefs.serviceVals.length) {
      qsa('#services-panel input[type="checkbox"]').forEach(c => { c.checked = prefs.serviceVals.includes(c.value); });
      syncServicesFromUI();
    }
    if (typeof prefs.language === 'string' && prefs.language) setLanguage(prefs.language);
    if (prefs.autoLoad === false) state.autoLoad = false;
    if (prefs.lowData === true)   state.lowData  = true;
  } else {
    // Defaults
    setYearRange(0, new Date().getFullYear());
    setRatingRange(0, 10);
  }
  applyAutoLoadUI();
  applyLowDataUI();
  // Low-data forces auto-load off (user opts in to network spending per click).
  if (state.lowData && state.autoLoad) { state.autoLoad = false; applyAutoLoadUI(); }

  // Eagerly detect country (for region selector default + future location toggle)
  fetchCountry().then(c => {
    state.userRegion = c;
    els.regionDisplay.textContent = state.locationOnly ? c : c;
    if (state.locationOnly) onFilterChange();
  });

  // Wire UI
  wireFilters();

  // Theme toggle
  els.themeToggle.addEventListener('click', toggleTheme);
  // Auto-load toggle (next to theme)
  els.autoloadToggle.addEventListener('click', toggleAutoLoad);
  // Low-data toggle
  if (els.lowdataToggle) els.lowdataToggle.addEventListener('click', toggleLowData);
  // Load-more button (used when auto-load is off)
  els.loadMoreBtn.addEventListener('click', () => {
    if (state.loading || state.exhausted) return;
    state.page++;
    fetchMedia(true);
  });

  // Result interactions (delegation)
  els.grid.addEventListener('click', (e) => {
    if (handleCollectionActionClick(e)) return;
    const card = e.target.closest('.card');
    if (card) showDetail(Number(card.dataset.id), card.dataset.type);
  });
  els.grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.card-quick-btn')) return; // let the button handle its own activation
    const card = e.target.closest('.card');
    if (card) { e.preventDefault(); showDetail(Number(card.dataset.id), card.dataset.type); }
  });
  els.peopleGrid.addEventListener('click', (e) => {
    const p = e.target.closest('.person-card');
    if (p) showActor(Number(p.dataset.id));
  });
  els.peopleGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const p = e.target.closest('.person-card');
    if (p) { e.preventDefault(); showActor(Number(p.dataset.id)); }
  });
  els.seeMorePeople.addEventListener('click', () => showCastGrid(state.personCache, false));
  // Cast in detail card
  els.detailCast.addEventListener('click', (e) => {
    const p = e.target.closest('.person-card');
    if (p) showActor(Number(p.dataset.id));
  });
  // Cast grid overlay clicks → actor
  els.castGridContent.addEventListener('click', (e) => {
    const p = e.target.closest('.person-card');
    if (p) {
      hideOverlay(els.castGridOverlay);
      showActor(Number(p.dataset.id));
    }
  });

  // Actor overlay: credit clicks → detail overlay (no modal stacking)
  const openCredit = (card) => {
    const id = Number(card.dataset.id);
    const mt = card.dataset.type;
    if (!id || (mt !== 'movie' && mt !== 'tv')) return;
    const title = card.dataset.title || '';
    const date  = card.dataset.date || '';
    const posterPath = card.dataset.poster || '';
    state.detailOverrides[`${mt}:${id}`] = {
      id,
      media_type: mt,
      title,
      name: title,
      poster_path: posterPath,
      release_date: mt === 'movie' ? date : '',
      first_air_date: mt === 'tv' ? date : '',
    };
    hideOverlay(els.actorOverlay);
    showDetail(id, mt);
  };
  els.actorContent.addEventListener('click', (e) => {
    const card = e.target.closest('.credit-card');
    if (card) openCredit(card);
  });
  els.actorContent.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.credit-card');
    if (card) { e.preventDefault(); openCredit(card); }
  });

  // Overlay close handlers
  const closeDetail = () => { hideOverlay(els.detailOverlay); currentDetail = null; };
  els.detailClose.addEventListener('click', closeDetail);
  els.detailOverlay.addEventListener('click', (e) => { if (e.target === els.detailOverlay) closeDetail(); });
  els.actorClose.addEventListener('click', () => hideOverlay(els.actorOverlay));
  els.actorOverlay.addEventListener('click', (e) => { if (e.target === els.actorOverlay) hideOverlay(els.actorOverlay); });
  els.castGridClose.addEventListener('click', () => hideOverlay(els.castGridOverlay));
  els.castGridOverlay.addEventListener('click', (e) => { if (e.target === els.castGridOverlay) hideOverlay(els.castGridOverlay); });
  els.infoClose.addEventListener('click', () => hideOverlay(els.infoOverlay));
  els.infoOverlay.addEventListener('click', (e) => { if (e.target === els.infoOverlay) hideOverlay(els.infoOverlay); });

  // Watch buttons: anime variant routes to miruro's search by slugified title;
  // both then route through the adblock prompt unless the user has dismissed it.
  els.detailActions.addEventListener('click', (e) => {
    const animeBtn = e.target.closest('button.btn-anime');
    if (animeBtn) {
      if (!currentDetail) return;
      const title = currentDetail.item.title || currentDetail.item.name || '';
      const slug = slugify(title);
      if (!slug) return;
      const url = `https://www.miruro.to/search?query=${encodeURIComponent(slug)}&type=ANIME&sort=POPULARITY_DESC`;
      if (adblockSkipped()) window.open(url, '_blank', 'noopener,noreferrer');
      else                  showAdblockPrompt(url);
      return;
    }

    const link = e.target.closest('a.btn-pirate');
    if (!link) return;
    if (adblockSkipped()) return;
    // Let modified-click (new tab, save, etc.) fall through to the browser.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    showAdblockPrompt(link.href);
  });
  els.adblockClose.addEventListener('click', () => hideOverlay(els.adblockOverlay));
  els.adblockOverlay.addEventListener('click', (e) => { if (e.target === els.adblockOverlay) hideOverlay(els.adblockOverlay); });
  els.adblockContinue.addEventListener('click', () => {
    if (els.adblockDontShow.checked) {
      try { localStorage.setItem(ADBLOCK_SKIP_KEY, '1'); } catch {}
    }
    const url = els.adblockContinue.dataset.url || '';
    hideOverlay(els.adblockOverlay);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });
  // "I already have an adblocker" — trust the user, persist the skip flag,
  // and continue to the site in one click.
  els.adblockHaveIt.addEventListener('click', () => {
    try { localStorage.setItem(ADBLOCK_SKIP_KEY, '1'); } catch {}
    const url = els.adblockContinue.dataset.url || '';
    hideOverlay(els.adblockOverlay);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Copy slug button
  els.copySlugBtn.addEventListener('click', async () => {
    if (!currentDetail) return;
    const title = currentDetail.item.title || currentDetail.item.name || '';
    const slug = slugify(title);
    const ok = await copyTextToClipboard(slug);
    flashCopySlug(ok ? 'Copied' : 'Copy failed');
  });

  // Copy ID button (bottom of detail overlay)
  els.copyIdBtn.addEventListener('click', async () => {
    if (!currentDetail) return;
    const ok = await copyTextToClipboard(String(currentDetail.id));
    flashCopyId(ok ? `Copied ${currentDetail.id}` : 'Copy failed');
  });

  // Collection: open from header, close, outside-click, import/export, tabs, card clicks
  els.collectionBtn.addEventListener('click', openCollection);
  els.collectionClose.addEventListener('click', () => hideOverlay(els.collectionOverlay));
  els.collectionOverlay.addEventListener('click', (e) => { if (e.target === els.collectionOverlay) hideOverlay(els.collectionOverlay); });
  els.collectionExport.addEventListener('click', exportCollection);
  els.collectionImport.addEventListener('click', () => els.collectionImportInput.click());
  els.collectionImportInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    importCollection(file);
    e.target.value = ''; // allow re-importing the same file
  });
  els.collectionTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    if (tab.dataset.tab === collectionTab) return; // no-op click
    collectionTab = tab.dataset.tab;
    updateCollectionTabActive();   // cheap: class swap only
    renderCollectionBody();        // body content needs new filter
  });
  els.collectionBody.addEventListener('click', (e) => {
    if (handleCollectionActionClick(e)) return;
    const card = e.target.closest('.card');
    if (card) openDetailFromCollection(Number(card.dataset.id), card.dataset.type);
  });
  els.collectionBody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.card-quick-btn')) return;
    const card = e.target.closest('.card');
    if (card) { e.preventDefault(); openDetailFromCollection(Number(card.dataset.id), card.dataset.type); }
  });

  // Detail-overlay collection-actions row
  els.detailCollectionActions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-coll-action]');
    if (!btn || !currentDetail) return;
    const action = btn.dataset.collAction;
    if (action === 'favourite') toggleFavourite(currentDetail.item);
    else if (action === 'liked' || action === 'disliked') setRating(currentDetail.item, action);
    else                        setEntryStatus(currentDetail.item, action);
  });

  // collection:change → re-sync every surface that shows collection state
  document.addEventListener('collection:change', () => {
    const c = getCounts();
    if (c.total > 0) {
      els.collectionCount.hidden = false;
      els.collectionCount.textContent = c.total > 99 ? '99+' : String(c.total);
    } else {
      els.collectionCount.hidden = true;
    }
    refreshCardStates(els.grid);
    refreshCardStates(els.collectionBody);
    if (currentDetail) els.detailCollectionActions.innerHTML = renderCollectionActions(currentDetail.item);
    if (els.collectionOverlay.classList.contains('active')) {
      // Re-render counts in the tabs strip; if the active filter would now hide
      // an item that just changed, the body needs to update too.
      renderCollection();
    }
  });

  // Initial badge from saved data
  document.dispatchEvent(new CustomEvent('collection:change'));

  // Infinite scroll observer
  io.observe(els.sentinel);

  // Initial paint
  updatePills();
  fetchMedia(false);

  // First-visit popup (only shows when no interface preference has been stored yet)

}

document.addEventListener('DOMContentLoaded', init);
