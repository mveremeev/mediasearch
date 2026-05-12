const apiKey = '73a984aef9561f5dc7dfedfe90ebf898';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const RATING_PATH = 'M50 2 H95 A3 3 0 0 1 98 5 V19 A3 3 0 0 1 95 22 H5 A3 3 0 0 1 2 19 V5 A3 3 0 0 1 5 2 Z';

// TMDB genre ID -> name (movies and TV have different IDs for some genres)
const GENRE_MOVIE = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western' };
const GENRE_TV = { 10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western' };

function getGenreLabel(genreIds, mediaType) {
  if (!genreIds?.length) return '';
  const map = mediaType === 'movie' ? GENRE_MOVIE : GENRE_TV;
  return genreIds.map(id => map[id]).filter(Boolean).slice(0, 3).join(', ');
}

// Streaming services for filter (value, name, optional providers array)
const services = [
  { v: '8', name: 'Netflix' },
  { v: '9', name: 'Prime Video' },
  { v: '337', name: 'Disney+' },
  { v: '384', name: 'HBO / Max', p: '49|384|1899' },
  { v: '15', name: 'Hulu' },
  { v: '350', name: 'Apple TV+' },
  { v: '531', name: 'Paramount+', p: '531|582|1770' },
  { v: '386', name: 'Peacock', p: '386|387' },
  { v: '283', name: 'Crunchyroll' },
  { v: '43', name: 'Starz' },
  { v: '37', name: 'Showtime' },
  { v: '526', name: 'AMC+', p: '526|528' },
  { v: '584', name: 'Discovery+', p: '584|1771' },
  { v: '73', name: 'Tubi', p: '73|1875' },
  { v: '300', name: 'Pluto TV' },
  { v: '207', name: 'Roku' },
];

// Direct links to streaming services by provider_id
const providerUrls = {
  8: 'https://www.netflix.com/',           // Netflix
  9: 'https://www.amazon.com/gp/video/',   // Amazon Prime Video
  10: 'https://www.amazon.com/gp/video/',  // Amazon Video
  15: 'https://www.hulu.com/',             // Hulu
  37: 'https://www.showtime.com/',         // Showtime
  43: 'https://www.starz.com/',            // Starz
  78: 'https://www.paramountplus.com/',    // Paramount+
  79: 'https://www.amcplus.com/',          // AMC+ (old)
  526: 'https://www.amcplus.com/',         // AMC+
  528: 'https://www.amcplus.com/',         // AMC+ Roku Channel
  119: 'https://www.amazon.com/gp/video/', // Amazon Prime Video
  175: 'https://www.netflix.com/',         // Netflix Kids
  283: 'https://www.crunchyroll.com/',     // Crunchyroll
  337: 'https://www.disneyplus.com/',      // Disney+
  350: 'https://tv.apple.com/',            // Apple TV+
  384: 'https://www.max.com/',             // HBO Max (old)
  386: 'https://www.peacocktv.com/',       // Peacock
  387: 'https://www.peacocktv.com/',       // Peacock Premium
  531: 'https://www.paramountplus.com/',   // Paramount+ with Showtime
  582: 'https://www.paramountplus.com/',   // Paramount+
  1770: 'https://www.paramountplus.com/',  // Paramount+ Amazon Channel
  1796: 'https://www.netflix.com/',        // Netflix with ads
  1899: 'https://www.max.com/',            // Max
  49: 'https://www.max.com/',              // Max
  2: 'https://tv.apple.com/',              // Apple TV
  3: 'https://play.google.com/store/movies', // Google Play Movies
  192: 'https://www.youtube.com/',         // YouTube
  188: 'https://www.youtube.com/feed/storefront', // YouTube Premium
  7: 'https://www.vudu.com/',              // Vudu
  68: 'https://www.microsoft.com/en-us/store/movies-and-tv', // Microsoft Store
  352: 'https://www.amcplus.com/',         // AMC+ Amazon Channel
  1875: 'https://tubitv.com/',             // Tubi
  73: 'https://tubitv.com/',               // Tubi TV
  300: 'https://pluto.tv/',                // Pluto TV
  257: 'https://www.fubo.tv/',             // fuboTV
  1771: 'https://www.discoveryplus.com/',  // Discovery+
  584: 'https://www.discoveryplus.com/',   // Discovery+
  207: 'https://www.roku.com/whats-on/the-roku-channel', // Roku Channel
  538: 'https://www.plex.tv/',             // Plex
};

let page = 1;

// Smooth color interpolation for rating bar
function getRatingColor(percent) {
  const isLight = isLightTheme();
  
  // 35% or below = solid red (especially visible in dark mode)
  // Dark mode: vibrant red for low ratings; light: deep red
  const colors = isLight ? [
    { stop: 0, color: [200, 20, 20] },     // Red
    { stop: 35, color: [200, 20, 20] },   // Red (35% or below = red)
    { stop: 55, color: [255, 140, 0] },   // Orange
    { stop: 75, color: [0, 160, 80] },    // Emerald
    { stop: 90, color: [0, 180, 100] },   // Green
    { stop: 100, color: [0, 180, 100] }   // Green
  ] : [
    { stop: 0, color: [255, 60, 60] },    // Bright red
    { stop: 35, color: [255, 60, 60] },   // Bright red (35% or below = red)
    { stop: 55, color: [255, 220, 0] },   // Yellow
    { stop: 75, color: [0, 130, 60] },    // Forest Green
    { stop: 90, color: [50, 255, 80] },   // Bright Green
    { stop: 100, color: [50, 255, 80] }   // Bright Green
  ];
  
  let lower = colors[0];
  let upper = colors[colors.length - 1];
  
  for (let i = 0; i < colors.length - 1; i++) {
    if (percent >= colors[i].stop && percent <= colors[i + 1].stop) {
      lower = colors[i];
      upper = colors[i + 1];
      break;
    }
  }
  
  const range = upper.stop - lower.stop;
  const t = range === 0 ? 0 : (percent - lower.stop) / range;
  
  const r = Math.round(lower.color[0] + t * (upper.color[0] - lower.color[0]));
  const g = Math.round(lower.color[1] + t * (upper.color[1] - lower.color[1]));
  const b = Math.round(lower.color[2] + t * (upper.color[2] - lower.color[2]));
  
  return `rgb(${r}, ${g}, ${b})`;
}
let currentQuery = '';

const resultsContainer = document.getElementById('results');
const loadMoreBtn = document.getElementById('load-more');
const allRadio = document.getElementById('service-all');
const locationCheck = document.getElementById('locationOnly');
const adultCheck = document.getElementById('adultOnly');
const pillsContainer = document.getElementById('selected-pills');
const searchInput = document.querySelector('.search');
const searchBtn = document.querySelector('.send');
const clearSearchBtn = document.querySelector('.clear-search');
const mediaTypeRadios = document.querySelectorAll('input[name="media-type"]');
const sortByRadios = document.querySelectorAll('input[name="sort-by"]');
const overlay = document.getElementById('overlay');
const closeBtn = document.getElementById('detail-close');

// Range filter elements
const yearMinInput = document.getElementById('year-min');
const yearMaxInput = document.getElementById('year-max');
const yearMinVal = document.getElementById('year-min-val');
const yearMaxVal = document.getElementById('year-max-val');
const yearReset = document.getElementById('year-reset');
const ratingMinInput = document.getElementById('rating-min');
const ratingMaxInput = document.getElementById('rating-max');
const ratingMinVal = document.getElementById('rating-min-val');
const ratingMaxVal = document.getElementById('rating-max-val');
const ratingReset = document.getElementById('rating-reset');

// Scroll arrows
const filterScroll = document.getElementById('filter-scroll');
const scrollLeftBtn = document.getElementById('scroll-left');
const scrollRightBtn = document.getElementById('scroll-right');

let userRegion = '';
let allRegions = [];
let mediaCache = [];
let lastRequestTime = 0;
let pendingTimer = null;

// --- LocalStorage Preferences ---
const STORAGE_KEY = 'msearch-prefs';

function savePrefs() {
  const yearRange = getYearRange();
  const ratingRange = getRatingRange();
  const prefs = {
    theme: document.documentElement.getAttribute('data-theme') || 'dark',
    location: locationCheck.checked,
    services: Array.from(serviceChecks).filter(cb => cb.checked).map(cb => cb.value),
    yearMin: yearRange ? yearRange.min : 0,
    yearMax: yearRange ? yearRange.max : new Date().getFullYear(),
    ratingMin: ratingRange ? ratingRange.min : 0,
    ratingMax: ratingRange ? ratingRange.max : 10
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function loadPrefs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

const isLightTheme = () => document.documentElement.getAttribute('data-theme') === 'light';
const $ = id => document.getElementById(id);

const SORT_LABELS = { 'vote_average.desc': 'Top Rated', 'primary_release_date.desc': 'Newest', 'primary_release_date.asc': 'Oldest', 'revenue.desc': 'Revenue' };
const VPN_URL = 'https://www.google.com/search?q=VPN';
const DEFAULT_SORT = 'popularity.desc';

const VPN_LIST = [
  { name: 'Nord VPN', url: 'https://nordvpn.com/' },
  { name: 'Windscribe', url: 'https://windscribe.com/' },
  { name: 'CyberGhost', url: 'https://www.cyberghostvpn.com/' },
  { name: 'PIA VPN', url: 'https://www.privateinternetaccess.com/' },
  { name: 'ExpressVPN', url: 'https://www.expressvpn.com/' },
  { name: 'Surfshark', url: 'https://surfshark.com/' },
  { name: 'Proton VPN', url: 'https://protonvpn.com/' },
  { name: 'Mullvad', url: 'https://mullvad.net/' },
  { name: 'IPVanish', url: 'https://www.ipvanish.com/' },
  { name: 'TunnelBear', url: 'https://www.tunnelbear.com/' },
  { name: 'Atlas VPN', url: 'https://atlasvpn.com/' },
  { name: 'Hide.me', url: 'https://hide.me/' },
  { name: 'Norton Secure VPN', url: 'https://us.norton.com/secure-vpn' },
  { name: 'Hotspot Shield', url: 'https://www.hotspotshield.com/' }
];

function showMoreInfoPopup(regions) {
  const overlayEl = $('more-info-overlay');
  const contentEl = $('more-info-content');
  if (!overlayEl || !contentEl) return;
  const regionsList = Array.isArray(regions) && regions.length ? regions.sort().join(', ') : '—';
  const vpnListHtml = VPN_LIST.map(v => `<a href="${v.url}" target="_blank" rel="noopener" class="more-info-vpn-link">${v.name}</a>`).join(', ');
  contentEl.innerHTML = `
    <p class="more-info-heading">Available in</p>
    <p class="more-info-regions">${regionsList}</p>
    <p class="more-info-disclaimer">Streaming service options may vary country to country.</p>
    <p class="more-info-heading">Top VPNs</p>
    <p class="more-info-vpns">${vpnListHtml}</p>
  `;
  overlayEl.classList.add('active');
}

function hideMoreInfoPopup() {
  const overlayEl = $('more-info-overlay');
  if (overlayEl) overlayEl.classList.remove('active');
}

// --- Actors More popup (full cast/people list, same pattern as more-info) ---
const ACTORS_DISPLAY_MAX = 6;
const actorsMoreOverlay = $('actors-more-overlay');
const actorsMoreContent = $('actors-more-content');
const actorsMoreClose = document.querySelector('.actors-more-close');

function showCastMorePopup(actors) {
  if (!actorsMoreContent || !actors || actors.length === 0) return;
  const showRole = actors[0].character != null;
  const heading = showRole ? 'Cast &amp; crew' : 'People';
  actorsMoreContent.innerHTML = `
    <p class="actors-more-heading">${heading}</p>
    <div class="actors-more-grid">${actors.map(a => renderActorCard(a, showRole)).join('')}</div>
  `;
  attachImageLoadListeners(actorsMoreContent);
  actorsMoreContent.querySelectorAll('.actor-card').forEach(card => {
    card.addEventListener('click', () => {
      hideCastMorePopup();
      showActor(Number(card.dataset.id));
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        hideCastMorePopup();
        showActor(Number(card.dataset.id));
      }
    });
  });
  if (actorsMoreOverlay) actorsMoreOverlay.classList.add('active');
}

function hideCastMorePopup() {
  if (actorsMoreOverlay) actorsMoreOverlay.classList.remove('active');
}

if (actorsMoreOverlay) actorsMoreOverlay.addEventListener('click', (e) => { if (e.target === actorsMoreOverlay) hideCastMorePopup(); });
if (actorsMoreClose) actorsMoreClose.addEventListener('click', hideCastMorePopup);

function getCheckedValue(radios) {
  return Array.from(radios).find(r => r.checked)?.value;
}
function getMediaType() {
  return getCheckedValue(mediaTypeRadios);
}
function getSortBy() {
  return getCheckedValue(sortByRadios) || DEFAULT_SORT;
}
function pill(text) {
  return `<span class="pill">${text}</span>`;
}
function onFilterChange() {
  savePrefs();
  updatePills();
  resetAndFetch();
}
function getOpenFilterChips() {
  return document.querySelectorAll('.filter-chip[open]');
}

// --- Helpers ---

function formatVotes(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return n.toString();
}

function getRatingData(rating, voteCount) {
  const isUnavailable = voteCount <= 15 || rating === 0;
  const percent = rating * 10;
  return {
    isUnavailable,
    strokeColor: isUnavailable ? '#666' : getRatingColor(percent),
    dashOffset: isUnavailable ? 0 : (100 - percent),
    display: isUnavailable ? '?' : rating.toFixed(1)
  };
}

function renderRatingBar(rating, voteCount, showVotes = false) {
  const r = getRatingData(rating, voteCount);
  const votes = showVotes && !r.isUnavailable ? ` • ${voteCount.toLocaleString()} votes` : 
                !showVotes && !r.isUnavailable ? ` • ${formatVotes(voteCount)}` : '';
  return `
    <div class="rating-bar">
      <svg class="rating-svg" viewBox="0 0 100 24" preserveAspectRatio="none">
        <path class="rating-bg" d="${RATING_PATH}" pathLength="100"/>
        <path class="rating-progress" d="${RATING_PATH}" pathLength="100" style="stroke: ${r.strokeColor}; stroke-dashoffset: ${r.dashOffset}"/>
      </svg>
      <span class="rating-text">★ ${r.display}${votes}</span>
    </div>
  `;
}

function fetchCountry() {
  // Method 1: api.country.is
  const t1 = () => fetch('https://api.country.is/').then(r => r.json()).then(d => d.country);
  // Method 2: ipwho.is (Free, robust)
  const t2 = () => fetch('https://ipwho.is/').then(r => r.json()).then(d => d.country_code);
  // Method 3: Cloudflare Trace (Very reliable, text-based)
  const t3 = () => fetch('https://www.cloudflare.com/cdn-cgi/trace').then(r => r.text()).then(t => t.match(/loc=([A-Z]{2})/)?.[1]);

  return t1()
    .catch(() => t2())
    .catch(() => t3())
    .then(res => {
      if (!res) throw new Error('No country data');
      return String(res).trim().toUpperCase();
    })
    .catch(e => {
      console.warn('Location detection failed:', e);
      return 'US';
    });
}

function fetchRegions() {
  if (allRegions.length > 0) return Promise.resolve(allRegions);
  return fetch(`${TMDB_BASE}/watch/providers/regions?api_key=${apiKey}`)
    .then(r => r.json())
    .then(data => {
      allRegions = data.results || [];
      return allRegions;
    })
    .catch(() => []);
}

function updatePills() {
  const pills = [];
  const type = getMediaType();
  if (type !== 'all') pills.push(pill(`Type: ${type === 'movie' ? 'Movies' : 'TV Shows'}`));
  if (!allRadio.checked) {
    Array.from(serviceChecks).filter(cb => cb.checked).forEach(cb => pills.push(pill(cb.parentElement.textContent.trim())));
  }
  const yearRange = getYearRange();
  if (yearRange) pills.push(pill(`Year: ${yearRange.min === 0 ? 'All' : yearRange.min}-${yearRange.max}`));
  if (!currentQuery) {
    const ratingRange = getRatingRange();
    if (ratingRange) pills.push(pill(`Rating: ${ratingRange.min}-${ratingRange.max}`));
    const sortBy = getSortBy();
    if (sortBy !== DEFAULT_SORT) pills.push(pill(`Sort: ${SORT_LABELS[sortBy] || sortBy}`));
  }
  pillsContainer.innerHTML = pills.join('');
}

function getSelectedProviders() {
  if (allRadio.checked) return '';
  const providers = Array.from(serviceChecks)
    .filter(cb => cb.checked)
    .flatMap(cb => {
      const raw = cb.dataset.providers || cb.value || '';
      return raw.split('|').map(p => p.trim()).filter(Boolean);
    });
  return Array.from(new Set(providers)).join('|');
}

// Year slider: 4 segments (All–1800, 1800–1900, 1900–2000, 2000–current); slider 0–100
function yearSliderToYear(v) {
  v = parseInt(v, 10);
  const currentYear = new Date().getFullYear();
  if (v <= 0) return 0;
  if (v <= 25) return Math.round((v / 25) * 1800);
  if (v <= 50) return 1800 + Math.round(((v - 25) / 25) * 100);
  if (v <= 75) return 1900 + Math.round(((v - 50) / 25) * 100);
  const span = Math.max(1, currentYear - 2000);
  return Math.min(currentYear, 2000 + Math.round(((v - 75) / 25) * span));
}

function yearToSliderValue(y) {
  y = parseInt(y, 10);
  const currentYear = new Date().getFullYear();
  if (y <= 0) return 0;
  if (y <= 1800) return Math.round((y / 1800) * 25);
  if (y <= 1900) return 25 + Math.round(((y - 1800) / 100) * 25);
  if (y <= 2000) return 50 + Math.round(((y - 1900) / 100) * 25);
  const span = Math.max(1, currentYear - 2000);
  return Math.min(100, 75 + Math.round(((y - 2000) / span) * 25));
}

function getYearRange() {
  const min = yearSliderToYear(yearMinInput.value);
  const max = yearSliderToYear(yearMaxInput.value);
  const currentYear = new Date().getFullYear();
  if (min === 0 && max >= currentYear) return null;
  return { min, max };
}

function getRatingRange() {
  const min = parseFloat(ratingMinInput.value);
  const max = parseFloat(ratingMaxInput.value);
  // Only return if not default values
  if (min === 0 && max === 10) return null;
  return { min, max };
}

function getCommonParams(type) {
  const includeAdult = adultCheck.checked;
  const region = (locationCheck.checked && userRegion) ? userRegion : 'US';
  let params = `api_key=${apiKey}&page=${page}&include_adult=${includeAdult}`;
  
  const yearRange = getYearRange();
  
  if (currentQuery) {
    // Search mode: API only supports query, region, year, include_adult (no sort_by or vote_average)
    if (locationCheck.checked && userRegion) {
      params += `&region=${userRegion}`;
    }
    if (yearRange) {
      params += `&year=${yearRange.max}`;
    }
  } else {
    // Discovery Filters - full support
    const sortBy = getSortBy();
    params += `&sort_by=${sortBy}`;
    const monetizationTypes = 'flatrate|free|ads|rent|buy';
    
    // Rating range (discovery only)
    const ratingRange = getRatingRange();
    if (ratingRange) {
      params += `&vote_average.gte=${ratingRange.min}&vote_average.lte=${ratingRange.max}`;
    }
    
    // Year range (discovery); min 0 = "All" (no gte)
    if (yearRange) {
      const gte = yearRange.min > 0 ? `${yearRange.min}-01-01` : null;
      const lte = `${yearRange.max}-12-31`;
      if (type === 'movie') {
        if (gte) params += `&primary_release_date.gte=${gte}`;
        params += `&primary_release_date.lte=${lte}`;
      } else if (type === 'tv') {
        if (gte) params += `&first_air_date.gte=${gte}`;
        params += `&first_air_date.lte=${lte}`;
      }
    }
    
    // Providers
    const providers = getSelectedProviders();
    if (providers) {
      params += `&watch_region=${region}&with_watch_providers=${providers}&with_watch_monetization_types=${monetizationTypes}`;
    } else if (locationCheck.checked && userRegion) {
      params += `&watch_region=${userRegion}&with_watch_monetization_types=${monetizationTypes}`;
    }
    
    if (sortBy.includes('vote_average')) {
      params += `&vote_count.gte=50`;
    }
  }
  return params;
}

// --- Fetching ---

function runFetch(append = false) {
  if (page > 500) {
    loadMoreBtn.style.display = 'none';
    return;
  }

  if (!append) {
    resultsContainer.innerHTML = RESULTS_LOADING_HTML;
  }

  const query = currentQuery ? encodeURIComponent(currentQuery) : '';
  const type = getMediaType();
  const params = getCommonParams();

  function processMedia(media) {
    const yearRange = getYearRange();
    if (yearRange) {
      const yMin = yearRange.min;
      const yMax = yearRange.max;
      media = media.filter(item => {
        const dateStr = item.release_date || item.first_air_date || '';
        const y = dateStr.length >= 4 ? parseInt(dateStr.slice(0, 4), 10) : 0;
        return !Number.isNaN(y) && y >= yMin && y <= yMax;
      });
    }
    const ratingRange = getRatingRange();
    if (ratingRange) {
      const rMin = ratingRange.min;
      const rMax = ratingRange.max;
      media = media.filter(item => {
        const v = item.vote_average ?? 0;
        return v >= rMin && v <= rMax;
      });
    }
    const sortBy = getSortBy();
    if (sortBy === 'vote_average.desc') {
      media.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    } else if (sortBy === 'primary_release_date.desc') {
      media.sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));
    } else if (sortBy === 'primary_release_date.asc') {
      media.sort((a, b) => (a.release_date || a.first_air_date || '').localeCompare(b.release_date || b.first_air_date || ''));
    } else if (sortBy === 'revenue.desc') {
      media.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    } else {
      media.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }
    return media;
  }

  if (currentQuery && !append) {
    // Search: fetch people (page 1) + media (page 1)
    const personPromise = fetch(`${TMDB_BASE}/search/person?query=${query}&api_key=${apiKey}&page=1`)
      .then(r => r.json())
      .then(d => d.results || []);
    let mediaPromise;
    if (type === 'movie') {
      mediaPromise = fetch(`${TMDB_BASE}/search/movie?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).map(m => ({ ...m, media_type: 'movie' })));
    } else if (type === 'tv') {
      mediaPromise = fetch(`${TMDB_BASE}/search/tv?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).map(m => ({ ...m, media_type: 'tv' })));
    } else {
      mediaPromise = fetch(`${TMDB_BASE}/search/multi?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).filter(item => item.media_type !== 'person'));
    }
    Promise.all([personPromise, mediaPromise])
      .then(([people, media]) => {
        media = processMedia(media);
        personCache = people;
        mediaCache = media;
        renderMedia(people, media, false);
        loadMoreBtn.style.display = media.length > 0 ? 'block' : 'none';
        if (people.length === 0 && media.length === 0) {
          const regionHint = (locationCheck.checked && userRegion)
            ? ` <span class="no-results-hint">If "My location" is on, your region (${userRegion}) or chosen services may have nothing for this combination.</span>`
            : '';
          resultsContainer.innerHTML = `<p class="no-results">No results found.${regionHint}</p>`;
        }
      })
      .catch(err => console.error(err));
    return;
  }

  if (currentQuery && append) {
    // Search load more: fetch next page of media only
    let mediaPromise;
    if (type === 'movie') {
      mediaPromise = fetch(`${TMDB_BASE}/search/movie?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).map(m => ({ ...m, media_type: 'movie' })));
    } else if (type === 'tv') {
      mediaPromise = fetch(`${TMDB_BASE}/search/tv?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).map(m => ({ ...m, media_type: 'tv' })));
    } else {
      mediaPromise = fetch(`${TMDB_BASE}/search/multi?query=${query}&${params}`).then(r => r.json()).then(d => (d.results || []).filter(item => item.media_type !== 'person'));
    }
    mediaPromise
      .then(media => {
        media = processMedia(media);
        mediaCache = mediaCache.concat(media);
        renderMedia([], media, true);
        loadMoreBtn.style.display = 'block';
      })
      .catch(err => console.error(err));
    return;
  }

  // Discovery: no person search
  let requests = [];
  if (type === 'all' || type === 'movie') {
    requests.push(fetch(`${TMDB_BASE}/discover/movie?${getCommonParams('movie')}`).then(r => r.json()).then(d => d.results || []));
  }
  if (type === 'all' || type === 'tv') {
    requests.push(fetch(`${TMDB_BASE}/discover/tv?${getCommonParams('tv')}`).then(r => r.json()).then(d => d.results || []));
  }
  Promise.all(requests)
    .then(results => {
      let media = results.flat();
      media = processMedia(media);
      if (append) {
        mediaCache = mediaCache.concat(media);
      } else {
        mediaCache = media;
        personCache = [];
      }
      renderMedia([], media, append);
      loadMoreBtn.style.display = media.length > 0 ? 'block' : 'none';
      if (media.length === 0 && !append) {
        const regionHint = (locationCheck.checked && userRegion)
          ? ` <span class="no-results-hint">If "My location" is on, your region (${userRegion}) or chosen services may have nothing for this combination.</span>`
          : '';
        resultsContainer.innerHTML = `<p class="no-results">No results found.${regionHint}</p>`;
      }
    })
    .catch(err => console.error(err));
}

function fetchMedia(append = false) {
  const now = Date.now();
  const delay = Math.max(0, 500 - (now - lastRequestTime));

  if (pendingTimer) clearTimeout(pendingTimer);

  pendingTimer = setTimeout(() => {
    lastRequestTime = Date.now();
    pendingTimer = null;
    runFetch(append);
  }, delay);
}

const NO_POSTER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMzAwIiB2aWV3Qm94PSIwIDAgMjAwIDMwMCI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmaWxsPSIjNTU1IiBmb250LXNpemU9IjIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
const NO_PROFILE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="60" fill="#333"/><circle cx="60" cy="48" r="18" fill="#555"/><path d="M30 120c0-22 18-40 30-40s30 18 30 40" fill="#555"/></svg>');

const RESULTS_LOADING_HTML = '<div class="results-loading"><span class="spinner" aria-hidden="true"></span><p>Loading…</p></div>';

let personCache = [];

function attachImageLoadListeners(container) {
  if (!container) return;
  container.querySelectorAll('.poster-wrap img, .img-wrap img').forEach(img => {
    const wrap = img.closest('.poster-wrap, .img-wrap');
    if (!wrap) return;
    if (img.complete && img.src) {
      wrap.classList.add('loaded');
    } else {
      img.onload = () => wrap.classList.add('loaded');
      img.onerror = () => wrap.classList.add('loaded');
    }
  });
}

function renderActorCard(person, showRole = false) {
  const name = person.name || 'Unknown';
  const profileUrl = person.profile_path ? `${TMDB_IMG}/w185${person.profile_path}` : NO_PROFILE;
  const role = showRole && person.character ? person.character : '';
  return `
    <div class="actor-card" data-id="${person.id}" tabindex="0" role="button">
      <div class="actor-photo-wrap img-wrap"><span class="spinner spinner--sm" aria-hidden="true"></span><img src="${profileUrl}" alt="${name}" loading="lazy"></div>
      <span class="actor-name">${escapeHtml(name)}</span>
      ${role ? `<span class="actor-role">${escapeHtml(role)}</span>` : ''}
    </div>
  `;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMedia(people, items, append = false) {
  const mediaHtml = items.map(item => {
    const title = item.title || item.name;
    const date = item.release_date || item.first_air_date || '';
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    const typeLabel = mediaType === 'movie' ? 'Movie' : 'Show';
    const posterUrl = item.poster_path ? `${TMDB_IMG}/w200${item.poster_path}` : NO_POSTER;
    const genreLabel = getGenreLabel(item.genre_ids, mediaType);
    return `
      <div class="movie-card" data-id="${item.id}" data-type="${mediaType}">
        <div class="poster-wrap"><span class="spinner spinner--sm" aria-hidden="true"></span><img src="${posterUrl}" alt="${title}" loading="lazy"></div>
        <div class="movie-info">
          <h3>${title}</h3>
          <p>${date.slice(0, 4)} • ${typeLabel}${genreLabel ? ' • ' + genreLabel : ''}${item.adult ? ' <span class="adult">18+</span>' : ''}</p>
          ${renderRatingBar(item.vote_average || 0, item.vote_count || 0)}
        </div>
      </div>
    `;
  }).join('');

  if (append) {
    const mediaEl = resultsContainer.querySelector('.results-media');
    if (mediaEl) {
      mediaEl.innerHTML += mediaHtml;
      attachImageLoadListeners(mediaEl);
    }
    return;
  }

  const hasPeople = people && people.length > 0;
  const hasMedia = items.length > 0;

  if (!hasPeople && !hasMedia) {
    resultsContainer.innerHTML = '';
    return;
  }

  const displayPeople = hasPeople ? people.slice(0, ACTORS_DISPLAY_MAX) : [];
  const actorsHtml = displayPeople.map(p => renderActorCard(p)).join('');
  const seeMorePeopleHtml = hasPeople && people.length > ACTORS_DISPLAY_MAX
    ? '<button type="button" class="see-more-cast">See more</button>'
    : '';
  const actorsSection = hasPeople ? `<div class="results-actors"><h3 class="results-section-label">People</h3>${actorsHtml}${seeMorePeopleHtml}</div>` : '';
  const mediaLabel = hasPeople && hasMedia ? '<h3 class="results-section-label">Movies &amp; Shows</h3>' : '';
  const mediaSection = `<div class="results-media reveal">${mediaLabel}${mediaHtml}</div>`;
  resultsContainer.innerHTML = actorsSection + mediaSection;
  attachImageLoadListeners(resultsContainer);

  if (items.length > 0) {
    resultsContainer.offsetHeight;
    const mediaEl = resultsContainer.querySelector('.results-media');
    if (mediaEl) mediaEl.classList.add('reveal');
    const maxDelay = 0.34 + 0.45;
    window.setTimeout(() => {
      const el = resultsContainer.querySelector('.results-media');
      if (el) el.classList.remove('reveal');
    }, maxDelay * 1000);
  }
}

// --- State Management ---

function resetAndFetch() {
  page = 1;
  // If we are in search mode, don't reset unless query changed, but this func is called by filters
  // Filters generally don't apply to search/multi endpoint effectively in this simple setup
  // So if searching, we might just re-run search. 
  // If not searching, re-run discovery.
  fetchMedia(false);
}

function loadMore() {
  if (page >= 500) return;
  page++;
  fetchMedia(true);
}

function performSearch() {
  const query = searchInput.value.trim();
  if (query === currentQuery) return; // No change
  
  currentQuery = query;
  page = 1;
  fetchMedia(false);
}

// --- Event Listeners ---

locationCheck.addEventListener('change', () => {
  savePrefs();
  if (locationCheck.checked && !userRegion) {
    fetchCountry().then(c => { userRegion = c; resetAndFetch(); });
  } else {
    resetAndFetch();
  }
});

adultCheck.addEventListener('change', resetAndFetch);


loadMoreBtn.addEventListener('click', loadMore);

// Search Inputs
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') performSearch();
});
function clearSearchAndRefetch() {
  if (currentQuery === '') return;
  currentQuery = '';
  page = 1;
  fetchMedia(false);
}
searchInput.addEventListener('input', (e) => {
  clearSearchBtn.classList.toggle('visible', e.target.value.length > 0);
  if (e.target.value.trim() === '') clearSearchAndRefetch();
});
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('visible');
  clearSearchAndRefetch();
  searchInput.focus();
});

mediaTypeRadios.forEach(r => r.addEventListener('change', onFilterChange));

const sortReset = document.getElementById('sort-reset');
sortByRadios.forEach(r => r.addEventListener('change', onFilterChange));
if (sortReset) {
  sortReset.addEventListener('click', () => {
    const defaultSort = document.querySelector(`input[name="sort-by"][value="${DEFAULT_SORT}"]`);
    if (defaultSort) { defaultSort.checked = true; onFilterChange(); }
  });
}

function syncRangeDisplay(minInput, maxInput, minValEl, maxValEl, isFloat = false) {
  const parse = isFloat ? parseFloat : parseInt;
  minValEl.textContent = minInput.value;
  maxValEl.textContent = maxInput.value;
  if (parse(minInput.value) > parse(maxInput.value)) {
    maxInput.value = minInput.value;
    maxValEl.textContent = maxInput.value;
  }
}

function updateYearDisplay() {
  let minV = parseInt(yearMinInput.value, 10);
  let maxV = parseInt(yearMaxInput.value, 10);
  if (minV > maxV) {
    yearMaxInput.value = minV;
    maxV = minV;
  }
  const minY = yearSliderToYear(yearMinInput.value);
  const maxY = yearSliderToYear(yearMaxInput.value);
  yearMinVal.textContent = minY === 0 ? 'All' : String(minY);
  yearMaxVal.textContent = String(maxY);
}
function updateRatingDisplay() { syncRangeDisplay(ratingMinInput, ratingMaxInput, ratingMinVal, ratingMaxVal, true); }

function bindRangePair(minInput, maxInput, minValEl, maxValEl, updateDisplay, onFilterChangeFn) {
  minInput.addEventListener('input', updateDisplay);
  maxInput.addEventListener('input', updateDisplay);
  minInput.addEventListener('change', onFilterChangeFn);
  maxInput.addEventListener('change', onFilterChangeFn);
}

yearReset.addEventListener('click', () => {
  yearMinInput.value = 0;
  yearMaxInput.value = 100;
  updateYearDisplay();
  onFilterChange();
});
ratingReset.addEventListener('click', () => {
  ratingMinInput.value = 0;
  ratingMaxInput.value = 10;
  updateRatingDisplay();
  onFilterChange();
});
bindRangePair(yearMinInput, yearMaxInput, yearMinVal, yearMaxVal, updateYearDisplay, onFilterChange);
bindRangePair(ratingMinInput, ratingMaxInput, ratingMinVal, ratingMaxVal, updateRatingDisplay, onFilterChange);

// Scroll arrows: hide when everything fits, enable/disable by position when overflow
function updateScrollArrows() {
    const { scrollLeft, scrollWidth, clientWidth } = filterScroll;
    const noOverflow = scrollWidth <= clientWidth + 1;
    filterScroll.parentElement.classList.toggle('no-overflow', noOverflow);
    if (!noOverflow) {
        scrollLeftBtn.disabled = scrollLeft <= 1;
        scrollRightBtn.disabled = scrollLeft >= scrollWidth - clientWidth - 1;
    }
}

filterScroll.addEventListener('scroll', updateScrollArrows);
filterScroll.addEventListener('scroll', closeFilterDropdowns);
window.addEventListener('resize', updateScrollArrows);

function closeFilterDropdowns() {
    getOpenFilterChips().forEach(d => d.removeAttribute('open'));
}

scrollLeftBtn.addEventListener('click', () => {
    closeFilterDropdowns();
    filterScroll.scrollBy({ left: -150, behavior: 'smooth' });
});

scrollRightBtn.addEventListener('click', () => {
    closeFilterDropdowns();
    filterScroll.scrollBy({ left: 150, behavior: 'smooth' });
});

// Position filter dropdown so it stays attached to its chip and never off-screen (used on open + scroll/resize)
function positionFilterDropdown(details) {
    if (!details || !details.open) return;
    const chip = details.closest('.filter-chip');
    const dropdown = details.querySelector('.filter-dropdown');
    if (!chip || !dropdown) return;
    const rect = chip.getBoundingClientRect();
    const pad = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = 'auto';
    dropdown.style.right = '';
    const dr = dropdown.getBoundingClientRect();

    // Horizontal: clamp so dropdown stays within viewport
    let left = rect.left;
    if (left + dr.width > vw - pad) left = vw - dr.width - pad;
    if (left < pad) left = pad;
    dropdown.style.left = `${left}px`;
    dropdown.style.right = '';

    // Vertical: clamp so dropdown never goes off top or bottom
    let top = rect.bottom + 4;
    if (top + dr.height > vh - pad) {
        const topAbove = rect.top - dr.height - 4;
        if (topAbove >= pad) {
            top = topAbove;
        } else {
            top = vh - dr.height - pad;
        }
    }
    if (top < pad) top = pad;
    dropdown.style.top = `${top}px`;
}

// Re-attach any open dropdown when page scrolls or resizes
let dropdownRepositionTimer = null;
function scheduleDropdownReposition() {
  if (dropdownRepositionTimer) return;
  dropdownRepositionTimer = requestAnimationFrame(() => {
    dropdownRepositionTimer = null;
    getOpenFilterChips().forEach(details => positionFilterDropdown(details));
  });
}
window.addEventListener('scroll', scheduleDropdownReposition, true);
window.addEventListener('resize', scheduleDropdownReposition);

// Handle custom dropdown behavior for overflow containers
document.addEventListener('click', (e) => {
    const isSummary = e.target.tagName === 'SUMMARY' || e.target.closest('summary');
    if (isSummary) {
        const details = e.target.closest('details');
        const chip = details.closest('.filter-chip');
        
        getOpenFilterChips().forEach(el => { if (el !== details) el.removeAttribute('open'); });

        requestAnimationFrame(() => {
            if (details.open) {
                positionFilterDropdown(details);
            }
        });
    }
});
// Prevent closing when clicking inside the dropdown
document.querySelectorAll('.filter-dropdown').forEach(dd => {
    dd.addEventListener('click', (e) => e.stopPropagation());
});


// Initialize scroll arrows
updateScrollArrows();

// Detail overlay
function fetchAndRenderProviders(mediaType, id, title, date, regionCode) {
  const providersEl = $('detail-providers');
  providersEl.innerHTML = '<div class="loading-with-spinner"><span class="spinner spinner--sm" aria-hidden="true"></span><span class="providers-loading">Loading streaming info…</span></div>';
  
  const region = regionCode === 'global' ? 'US' : regionCode;
  
  fetch(`${TMDB_BASE}/${mediaType}/${id}/watch/providers?api_key=${apiKey}`)
    .then(r => r.json())
    .then(data => {
      // Build JustWatch URL - remove apostrophes before slugifying
      const slug = title.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const jwType = mediaType === 'movie' ? 'movie' : 'tv-show';
      const jwRegion = region.toLowerCase();
      const jwUrl = `https://www.justwatch.com/${jwRegion}/${jwType}/${slug}`;
      const jwIcon = '<img src="justwatch.png" alt="JustWatch" class="jw-icon">';
      const gIcon = '<img src="Google.png" alt="Google" class="g-icon">';
      const gType = mediaType === 'movie' ? 'movie' : 'TV show';
      const gUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${date.slice(0, 4)} ${gType} where to watch`)}`;
      const jwLink = `<a href="${jwUrl}" target="_blank" rel="noopener" class="justwatch-link">${jwIcon} Check JustWatch →</a>`;
      const gLink = `<a href="${gUrl}" target="_blank" rel="noopener" class="google-link">${gIcon} Google →</a>`;
      const noResultsMsg = `<span style="color:#666;font-size:12px;">No streaming options found<br><br></span>${jwLink}<br>${gLink}<br><span style="color:#555;font-size:11px;">(may also have no results)</span>`;
      
      let regionData = null;
      if (regionCode === 'global') {
          // "Other" -> fallback behavior (try US)
          regionData = data.results?.US;
      } else {
          // Specific region -> strict check
          regionData = data.results?.[regionCode];
      }

      if (!regionData) {
        if (regionCode !== 'global') {
             const rName = allRegions.find(r => r.iso_3166_1 === regionCode)?.native_name || regionCode;
             
             // Find regions where it IS available
             const availableRegions = Object.keys(data.results || {}).filter(code => {
                 const d = data.results[code];
                 return d && (d.flatrate?.length || d.ads?.length || d.rent?.length || d.buy?.length);
             }).map(code => allRegions.find(r => r.iso_3166_1 === code)?.native_name || code);
             
             const noStreamingMsg = availableRegions.length === 0
                 ? `No streaming options found in your region (${rName}), or anywhere else.`
                 : `No streaming options found in ${rName}.`;
             const noStreamingHtml = `<h4>Streaming</h4><p style="color:#888;font-size:13px;margin-bottom:8px;">${noStreamingMsg}</p>`;
             if (availableRegions.length > 0) {
                 const topRegions = availableRegions.slice().sort().slice(0, 5);
                 const availMsg = `<span class="available-in">Available in: ${topRegions.join(', ')}${availableRegions.length > 5 ? ', ...' : ''}</span>`;
                 const regionsJson = JSON.stringify(availableRegions.slice().sort());
                 const vpnBox = `<div class="vpn-hint"><div class="vpn-hint-content">${availMsg}<span class="vpn-text"><a href="${VPN_URL}" target="_blank" rel="noopener">You can enable a VPN to these areas</a> to watch this in your area.</span></div><button type="button" class="vpn-more-info" data-regions="${encodeURIComponent(regionsJson)}">More Info</button></div>`;
                 providersEl.innerHTML = `${noStreamingHtml}${vpnBox}${jwLink}<br>${gLink}`;
                 const moreBtn = providersEl.querySelector('.vpn-more-info');
                 if (moreBtn) moreBtn.addEventListener('click', (e) => { e.stopPropagation(); showMoreInfoPopup(JSON.parse(decodeURIComponent(moreBtn.dataset.regions || '[]'))); });
             } else {
                 providersEl.innerHTML = `${noStreamingHtml}${jwLink}<br>${gLink}`;
             }
        } else {
             providersEl.innerHTML = `<h4>Streaming</h4>${noResultsMsg}`;
        }
        return;
      }
      
      const makeLogos = (providers) => providers.map(p => `
        <a href="${providerUrls[p.provider_id] || jwUrl}" target="_blank" rel="noopener" class="provider-logo" title="${p.provider_name}">
          <span class="img-wrap"><span class="spinner spinner--sm" aria-hidden="true"></span><img src="${TMDB_IMG}/w45${p.logo_path}" alt="${p.provider_name}"></span>
        </a>
      `).join('');

      const flatrate = regionData.flatrate || [];
      const ads = regionData.ads || [];
      const rent = regionData.rent || [];
      const buy = regionData.buy || [];
      const rentBuy = rent.length || buy.length ? [...new Map([...rent, ...buy].map(p => [p.provider_id, p])).values()] : [];
      const sections = [
        { title: 'Stream', list: flatrate },
        { title: 'Free with Ads', list: ads },
        { title: 'Rent / Buy', list: rentBuy },
      ];
      let html = '';
      sections.forEach(({ title, list }) => {
        if (list.length) html += `<h4>${title}</h4><div class="provider-list">${makeLogos(list)}</div>`;
      });
      
      if (html === '') {
        const releaseDate = date ? new Date(date) : null;
        const isUnreleased = releaseDate && releaseDate > new Date();
        if (isUnreleased) {
          providersEl.innerHTML = `<h4>Availability</h4><span style="color:#666;font-size:12px;">Not yet released — check back after ${date.slice(0, 10)}</span>`;
        } else {
          providersEl.innerHTML = `<h4>Streaming</h4>${noResultsMsg}`;
        }
        return;
      }
      
      html += `${jwLink}<br>${gLink}`;
      providersEl.innerHTML = html;
      attachImageLoadListeners(providersEl);
    })
    .catch(() => {
      providersEl.innerHTML = '<h4>Streaming</h4><span style="color:#666;font-size:12px;">Could not load providers</span>';
    });
}

function showDetail(id) {
  const item = mediaCache.find(m => m.id === id);
  if (!item) return;
  
  const title = item.title || item.name;
  const date = item.release_date || item.first_air_date || '';
  const rating = item.vote_average || 0;
  const voteCount = item.vote_count || 0;
  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const typeLabel = mediaType === 'movie' ? 'Movie' : 'Show';
  
  const posterWrap = document.getElementById('detail-poster-wrap');
  const posterImg = document.getElementById('detail-poster');
  if (posterWrap) posterWrap.classList.remove('loaded');
  if (posterImg) {
    posterImg.src = item.poster_path ? `${TMDB_IMG}/w500${item.poster_path}` : NO_POSTER;
    if (posterImg.complete && posterImg.src) posterWrap && posterWrap.classList.add('loaded');
    else { posterImg.onload = () => posterWrap && posterWrap.classList.add('loaded'); posterImg.onerror = () => posterWrap && posterWrap.classList.add('loaded'); }
  }
  $('detail-title').textContent = title;
  $('detail-meta').textContent = `${date.slice(0, 4)} • ${typeLabel}${item.adult ? ' • 18+' : ''} • Loading...`;
  $('detail-overview').textContent = item.overview || 'No description available.';
  $('detail-rating').innerHTML = renderRatingBar(rating, voteCount, true);
  
  // Fetch full details for runtime/seasons/episodes + videos
  function setDetailMeta(parts) {
    $('detail-meta').textContent = parts.filter(Boolean).join(' • ');
  }
  function buildDetailMetaFromDetails(details) {
    const parts = [date.slice(0, 4), typeLabel];
    if (details.genres?.length) parts.push(details.genres.map(g => g.name).join(', '));
    if (mediaType === 'movie' && details.runtime) {
      const m = details.runtime % 60;
      const h = Math.floor(details.runtime / 60);
      parts.push(h ? `${h}h ${m}m` : `${m}m`);
    } else if (mediaType === 'tv') {
      const p = [];
      if (details.number_of_seasons) p.push(details.number_of_seasons === 1 ? '1 Season' : `${details.number_of_seasons} Seasons`);
      if (details.number_of_episodes) p.push(`${details.number_of_episodes} Eps`);
      if (p.length) parts.push(p.join(', '));
    }
    if (item.adult) parts.push('18+');
    return parts;
  }

  fetch(`${TMDB_BASE}/${mediaType}/${id}?api_key=${apiKey}&append_to_response=videos`)
    .then(r => r.json())
    .then(details => {
      setDetailMeta(buildDetailMetaFromDetails(details));
      const videos = details.videos?.results || [];
      const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
        || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
        || videos.find(v => v.site === 'YouTube' && v.type === 'Teaser');
      $('detail-trailer').innerHTML = trailer
        ? `<a href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank" rel="noopener" class="trailer-link">▶ Watch Trailer</a>`
        : '';
    })
    .catch(() => {
      const fallback = [date.slice(0, 4), typeLabel];
      const genreLabel = getGenreLabel(item.genre_ids, mediaType);
      if (genreLabel) fallback.push(genreLabel);
      if (item.adult) fallback.push('18+');
      setDetailMeta(fallback);
      $('detail-trailer').innerHTML = '';
    });
  
  // Fetch and display cast (TMDB: GET /movie/{id}/credits or /tv/{id}/credits)
  const castEl = $('detail-cast');
  castEl.innerHTML = '<div class="loading-with-spinner"><span class="spinner spinner--sm" aria-hidden="true"></span><span class="cast-loading">Loading cast…</span></div>';
  fetch(`${TMDB_BASE}/${mediaType}/${id}/credits?api_key=${apiKey}`)
    .then(r => r.json())
    .then(data => {
      const fullCast = data.cast || [];
      if (fullCast.length === 0) {
        castEl.innerHTML = '';
        return;
      }
      const displayCast = fullCast.slice(0, ACTORS_DISPLAY_MAX);
      const seeMoreHtml = fullCast.length > ACTORS_DISPLAY_MAX
        ? `<button type="button" class="see-more-cast">See more</button>`
        : '';
      castEl.innerHTML = `
        <h4>Cast</h4>
        <div class="cast-list">${displayCast.map(c => renderActorCard(c, true)).join('')}</div>
        ${seeMoreHtml}
      `;
      attachImageLoadListeners(castEl);
      castEl.querySelectorAll('.actor-card').forEach(card => {
        card.addEventListener('click', () => showActor(Number(card.dataset.id)));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showActor(Number(card.dataset.id)); } });
      });
      const seeMoreBtn = castEl.querySelector('.see-more-cast');
      if (seeMoreBtn) seeMoreBtn.addEventListener('click', () => showCastMorePopup(fullCast));
    })
    .catch(() => { castEl.innerHTML = ''; });

  // Fetch and display providers
  const regionContainer = $('region-selector-container');
  regionContainer.innerHTML = '';
  
  fetchRegions().then(() => {
      const select = document.createElement('select');
      select.className = 'region-select';

      // Add "Other" (Global) option
      const otherOpt = document.createElement('option');
      otherOpt.value = 'global';
      otherOpt.textContent = 'Other (Global)';
      select.appendChild(otherOpt);
      
      // Add regions
      allRegions.sort((a, b) => a.native_name.localeCompare(b.native_name)).forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.iso_3166_1;
          opt.textContent = r.native_name;
          select.appendChild(opt);
      });
      
      // Set initial value
      if (userRegion && allRegions.some(r => r.iso_3166_1 === userRegion)) {
          select.value = userRegion;
      } else {
          select.value = 'global';
      }
      
      select.addEventListener('change', () => {
          fetchAndRenderProviders(mediaType, id, title, date, select.value);
      });
      
      const label = document.createElement('span');
      label.className = 'region-label';
      label.textContent = 'My Region';
      regionContainer.appendChild(label);
      regionContainer.appendChild(select);
      
      // Initial Load
      fetchAndRenderProviders(mediaType, id, title, date, select.value);
  });
  
  overlay.classList.add('active');
}

function hideDetail() {
  overlay.classList.remove('active');
}

// --- Actor overlay (TMDB: person details + movie_credits + tv_credits) ---
const actorOverlay = $('actor-overlay');
const actorOverlayContent = $('actor-overlay-content');
const actorOverlayClose = document.querySelector('.actor-overlay-close');

function showActor(personId) {
  actorOverlayContent.innerHTML = '<div class="loading-with-spinner"><span class="spinner spinner--sm" aria-hidden="true"></span><span>Loading…</span></div>';
  actorOverlay.classList.add('active');

  Promise.all([
    fetch(`${TMDB_BASE}/person/${personId}?api_key=${apiKey}`).then(r => r.json()),
    fetch(`${TMDB_BASE}/person/${personId}/movie_credits?api_key=${apiKey}`).then(r => r.json()),
    fetch(`${TMDB_BASE}/person/${personId}/tv_credits?api_key=${apiKey}`).then(r => r.json())
  ])
    .then(([person, movieCredits, tvCredits]) => {
      const name = person.name || 'Unknown';
      const profileUrl = person.profile_path ? `${TMDB_IMG}/w185${person.profile_path}` : NO_PROFILE;
      const knownFor = person.known_for_department ? `Known for ${person.known_for_department}` : '';

      const movies = (movieCredits.cast || []).slice(0, 15).map(c => ({
        title: c.title,
        role: c.character,
        date: c.release_date ? c.release_date.slice(0, 4) : ''
      }));
      const tvs = (tvCredits.cast || []).slice(0, 15).map(c => ({
        title: c.name,
        role: c.character,
        date: c.first_air_date ? c.first_air_date.slice(0, 4) : ''
      }));

      const filmItem = (f) => `<li><a href="#" class="film-title-link" data-title="${escapeAttr(f.title)}">${escapeHtml(f.title)}${f.date ? ` (${f.date})` : ''}</a>${f.role ? `<span class="film-role">${escapeHtml(f.role)}</span>` : ''}</li>`;
      const moviesHtml = movies.length ? `<div class="actor-overlay-section"><h4>Movies</h4><ul class="actor-overlay-film-list">${movies.map(filmItem).join('')}</ul></div>` : '';
      const tvsHtml = tvs.length ? `<div class="actor-overlay-section"><h4>TV</h4><ul class="actor-overlay-film-list">${tvs.map(filmItem).join('')}</ul></div>` : '';

      actorOverlayContent.innerHTML = `
        <div class="actor-overlay-header">
          <div class="actor-overlay-photo img-wrap"><span class="spinner" aria-hidden="true"></span><img src="${profileUrl}" alt="${escapeHtml(name)}"></div>
          <h2 class="actor-overlay-name">${escapeHtml(name)}</h2>
          ${knownFor ? `<p class="actor-overlay-meta">${escapeHtml(knownFor)}</p>` : ''}
        </div>
        ${moviesHtml}
        ${tvsHtml}
      `;
      attachImageLoadListeners(actorOverlayContent);
    })
    .catch(() => {
      actorOverlayContent.innerHTML = '<p class="cast-loading">Could not load person.</p>';
    });
}

function searchForTitle(title) {
  if (!title || !searchInput) return;
  hideActorOverlay();
  hideDetail();
  searchInput.value = title;
  currentQuery = title;
  page = 1;
  fetchMedia(false);
  searchInput.focus();
}

function hideActorOverlay() {
  actorOverlay.classList.remove('active');
}

if (actorOverlayClose) actorOverlayClose.addEventListener('click', hideActorOverlay);
if (actorOverlay) actorOverlay.addEventListener('click', (e) => { if (e.target === actorOverlay) hideActorOverlay(); });
if (actorOverlayContent) {
  actorOverlayContent.addEventListener('click', (e) => {
    const link = e.target.closest('.film-title-link');
    if (link) {
      e.preventDefault();
      const title = link.getAttribute('data-title');
      if (title) searchForTitle(title);
    }
  });
}

resultsContainer.addEventListener('click', (e) => {
  const seeMoreBtn = e.target.closest('.see-more-cast');
  if (seeMoreBtn && seeMoreBtn.closest('.results-actors')) {
    showCastMorePopup(personCache);
    return;
  }
  const actorCard = e.target.closest('.actor-card');
  if (actorCard && actorCard.dataset.id) {
    showActor(Number(actorCard.dataset.id));
    return;
  }
  const card = e.target.closest('.movie-card');
  if (card) showDetail(Number(card.dataset.id));
});

resultsContainer.addEventListener('keydown', (e) => {
  const actorCard = e.target.closest('.actor-card');
  if (actorCard && actorCard.dataset.id && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    showActor(Number(actorCard.dataset.id));
  }
});

if (closeBtn) closeBtn.addEventListener('click', hideDetail);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) hideDetail();
});

const moreInfoOverlay = $('more-info-overlay');
const moreInfoClose = document.querySelector('.more-info-close');
if (moreInfoOverlay) {
  moreInfoOverlay.addEventListener('click', (e) => { if (e.target === moreInfoOverlay) hideMoreInfoPopup(); });
}
if (moreInfoClose) moreInfoClose.addEventListener('click', hideMoreInfoPopup);

// Theme toggle
const themeToggle = $('theme-toggle');

function updateThemeButton() {
  themeToggle.textContent = isLightTheme() ? 'Dark mode' : 'Light mode';
}

themeToggle.addEventListener('click', () => {
  if (isLightTheme()) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  updateThemeButton();
  savePrefs();
  if (mediaCache.length > 0) renderMedia(personCache, mediaCache, false);
});

// Generate service checkboxes from data
const serviceOptionsContainer = $('service-options');
services.forEach(s => {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = s.v;
  input.className = 'service-check';
  if (s.p) input.dataset.providers = s.p;
  label.appendChild(input);
  label.appendChild(document.createTextNode(' ' + s.name));
  serviceOptionsContainer.appendChild(label);
});

const serviceChecks = document.querySelectorAll('.service-check');

// Attach service filter event listeners
serviceChecks.forEach(cb => {
  cb.addEventListener('change', () => {
    if (cb.checked) allRadio.checked = false;
    else if (!Array.from(serviceChecks).some(c => c.checked)) allRadio.checked = true;
    savePrefs();
    onFilterChange();
  });
});
allRadio.addEventListener('change', () => {
  if (allRadio.checked) {
    serviceChecks.forEach(cb => cb.checked = false);
    savePrefs();
    onFilterChange();
  }
});

// Load saved preferences
const savedPrefs = loadPrefs();
if (savedPrefs) {
  if (savedPrefs.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  if (savedPrefs.location) {
    locationCheck.checked = true;
    fetchCountry().then(c => {
      userRegion = c;
      if (locationCheck.checked) resetAndFetch();
    });
  }
  if (savedPrefs.services?.length > 0) {
    allRadio.checked = false;
    serviceChecks.forEach(cb => { cb.checked = savedPrefs.services.includes(cb.value); });
  }
  if (savedPrefs.yearMin != null && savedPrefs.yearMax != null) {
    const cy = new Date().getFullYear();
    const min = Math.max(0, Math.min(savedPrefs.yearMin, cy));
    const max = Math.max(0, Math.min(savedPrefs.yearMax, cy));
    yearMinInput.value = yearToSliderValue(min);
    yearMaxInput.value = yearToSliderValue(max);
  }
  if (savedPrefs.ratingMin != null && savedPrefs.ratingMax != null) {
    const rMin = Math.max(0, Math.min(10, parseFloat(savedPrefs.ratingMin)));
    const rMax = Math.max(0, Math.min(10, parseFloat(savedPrefs.ratingMax)));
    if (rMin <= rMax) {
      ratingMinInput.value = rMin;
      ratingMaxInput.value = rMax;
    }
  }
}

updateThemeButton();
updatePills();
updateYearDisplay();
updateRatingDisplay();

// Always try to fetch user region on load for better defaults
if (!userRegion) {
  fetchCountry().then(c => { 
      userRegion = c;
      // If location filter is checked, we might need to refresh search results,
      // but if not, this just silently sets the preference for Detail View
      if (locationCheck.checked) resetAndFetch();
  });
}

fetchMedia();
