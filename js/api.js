import {
  ANIME_GENRE_ID, ANIME_LANG, API_KEY, DEFAULT_SORT, DISCOVER_TYPES, MAX_PAGE,
  NSFW_BLOCK_KEYWORDS, SERVICES, SORT_COMPARATORS, TMDB
} from './config.js';
import { renderResults, setStatus } from './render.js';
import { state } from './state.js';
import { dateOf, yearOf } from './fields.js';
import { isAnime, isExplicit, tmdbJson } from './util.js';

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
function buildSearchParams(page = state.page) {
  const p = new URLSearchParams();
  p.set('api_key', API_KEY);
  p.set('page', page);
  p.set('include_adult', state.adultOnly);
  p.set('query', state.query);
  /* No year param. TMDB's search endpoints cannot express a range: `year` is an
     exact match (search/movie?query=freefall&year=1994 returns only the 1994
     title, not everything up to it), and /search/multi — what Type:All uses —
     ignores it outright. The range is applied client-side in applySearchFilters
     instead. The old code sent `year=yearMax` only when yearMax < the current
     year, so "2025-Now" sent nothing and yearMin was never sent at all. */
  if (state.locationOnly && state.userRegion) p.set('region', state.userRegion);
  return p.toString();
}

const currentYear = () => new Date().getFullYear();
/* A range covering everything is not a filter — skip the work and keep
   undated titles visible. */
const yearFilterActive = () => state.yearMin > 0 || state.yearMax < currentYear();
function inYearRange(item) {
  const y = Number(yearOf(dateOf(item)));
  /* yearOf returns '-' for a missing date, so this is NaN. Drop undated titles
     while a range is active, matching discover: TMDB's date.gte/lte exclude
     null-dated records server-side too. */
  if (!Number.isFinite(y)) return false;
  return y >= state.yearMin && y <= state.yearMax;
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

// For anime type: use multi search then post-filter
function searchUrl(t, page) {
  const params = buildSearchParams(page);
  if (t === 'movie') return `${TMDB}/search/movie?${params}`;
  if (t === 'tv')    return `${TMDB}/search/tv?${params}`;
  return `${TMDB}/search/multi?${params}`;
}

/* Everything TMDB's search endpoints can't do for us. */
function applySearchFilters(results, t) {
  let arr = results
    .filter(x => x.media_type !== 'person')
    .map(m => ({ ...m, media_type: m.media_type || (t === 'tv' ? 'tv' : 'movie') }));
  if (state.type === 'anime') arr = arr.filter(isAnime);
  if (!state.adultOnly)       arr = arr.filter(x => !isExplicit(x));
  if (yearFilterActive())     arr = arr.filter(inYearRange);
  return arr;
}

/* How many extra pages to pull when filtering empties one completely. Bounded
   so a narrow year range on a broad query can't fan out into 500 requests. */
const SEARCH_SKIM_MAX_PAGES = 4;

/* Filtering client-side means a page can come back full from TMDB and still
   leave nothing to show. Reporting that as "no results" would be wrong, and
   infinite scroll can't recover it — the observer bails while the grid is
   empty. So skim forward until something survives or the budget runs out. */
async function collectSearchPages(t) {
  let media = [], page = state.page, more = false;
  for (let skims = 0; ; skims++) {
    const d = await tmdbJson(searchUrl(t, page));
    const totalPages = Math.min(d.total_pages || 1, MAX_PAGE);
    media = media.concat(applySearchFilters(d.results || [], t));
    more = page < totalPages;
    if (media.length || !more || skims >= SEARCH_SKIM_MAX_PAGES) break;
    page++;
  }
  // Resume the next append after the last page actually consumed, not the first.
  state.page = page;
  return { media, more };
}

function runSearch(append) {
  const t = state.type;

  const personPromise = (state.page === 1 && !append)
    ? tmdbJson(`${TMDB}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(state.query)}&page=1`)
        .then(d => d.results || [])
        .catch(() => [])
    : Promise.resolve([]);

  /* The media request is the one that decides success. A failed *person* lookup
     just means no people strip, which is not worth surfacing as an error. */
  let failed = false;
  const mediaPromise = collectSearchPages(t)
    .catch(() => { failed = true; return { media: [], more: false }; });

  Promise.all([personPromise, mediaPromise])
    .then(([people, res]) => commitResults(res.media, people, append, failed, res.more));
}

function runDiscover(append) {
  const mediaTypes = DISCOVER_TYPES[state.type] || DISCOVER_TYPES.all;
  /* 'all' fans out to movie + tv. Only call the page a failure when every leg
     failed — one surviving half is still a usable result set. */
  let failures = 0;
  Promise.all(mediaTypes.map(mt =>
    tmdbJson(`${TMDB}/discover/${mt}?${buildDiscoverParams(mt)}`)
      .then(d => (d.results || []).map(m => ({ ...m, media_type: mt })))
      .catch(() => { failures++; return []; })
  )).then(results => {
    // Interleaved movie+tv needs re-sorting; TMDB only ordered each half.
    let media = sortLocally(results.flat());
    // Belt-and-braces: client-side post-filter even with without_keywords on,
    // since TMDB's keyword tagging is incomplete.
    if (!state.adultOnly) media = media.filter(x => !isExplicit(x));
    commitResults(media, [], append, failures === mediaTypes.length);
  });
}

/* Shared tail for both fetch paths: land the results, update the paging flags,
   repaint. `people` is ignored when appending — the strip is first-page only.
   `failed` distinguishes "TMDB is unreachable" from "TMDB returned nothing". */
function commitResults(media, people, append, failed = false, more = null) {
  if (append) {
    state.cache.push(...media);
  } else {
    state.cache = media;
    state.personCache = people;
  }
  /* Search passes `more` from TMDB's total_pages, because client-side filtering
     can zero out a page that wasn't the last one — keying off media.length there
     would stop paging early. Discover filters server-side, so it keeps the
     simple check. */
  state.exhausted = more === null ? media.length === 0 : !more;
  state.loading = false;
  state.hasFetched = true;
  /* Don't strand the user on a half-loaded page: an append that failed keeps
     whatever is already on screen and just stops paging. */
  state.fetchFailed = failed && !state.cache.length;
  renderResults({ append });
}

const sortLocally = (arr) =>
  arr.sort(SORT_COMPARATORS[state.sort] || SORT_COMPARATORS[DEFAULT_SORT]);

export {
  buildDiscoverParams, expandProviders, buildSearchParams, currentYear, yearFilterActive,
  inYearRange, searchUrl, applySearchFilters, collectSearchPages, lastFetchAt, fetchMedia,
  runFetch, runSearch, runDiscover, commitResults, sortLocally
};
