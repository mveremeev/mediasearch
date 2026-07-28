import {
  ADULT_TEXT_HINTS, ANIME_GENRE_ID, ANIME_LANG, GENRE_MOVIE, GENRE_TV, IMG, NO_POSTER,
  NO_PROFILE, TMDB, nsfwKeywordCache
} from './config.js';
import { dateOf, yearOf } from './fields.js';
import { state } from './state.js';

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
  if (state.lowData || !path) return '';
  return `<img src="${IMG}/w92${path}" alt="${escapeAttr(name)}" width="92" height="92" loading="lazy" decoding="async">`;
}

/* fetch().then(r => r.json()) treats every HTTP status as success. TMDB answers
   401 (bad key), 404 and 429 (rate limit) with a JSON body, so `d.results` comes
   back undefined and the `|| []` fallbacks downstream render a transport failure
   as a genuinely empty result set — "No results found" for what is actually a
   dead API key. Check the status so callers can tell the two apart. */
function tmdbJson(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    return r.json();
  });
}

const formatVotes = (n) => n >= 1000 ? (n/1000).toFixed(n>=10000 ? 0 : 1)+'k' : String(n||0);

/* Shared by the JustWatch fallback URL and the miruro anime search. Diacritics
   are folded and apostrophes dropped outright (so "Don't Look Up" becomes
   dont-look-up, matching how both sites build their slugs) before every other
   run of non-alphanumerics collapses to a single dash. */
const slugify = (str) => (str || '').toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/['‘’ʼ`]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

/* Inline async placeholders inside the overlays. Styling lives in styles.css
   (.inline-loading / .inline-note) rather than repeated style attributes. */
const loadingHtml = (text, padded = false) =>
  `<div class="inline-loading${padded ? ' is-padded' : ''}"><span class="spinner"></span>${escapeHtml(text)}</div>`;
const noteHtml = (text, padded = false) =>
  `<p class="inline-note${padded ? ' is-padded' : ''}">${escapeHtml(text)}</p>`;

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
  return genreIds.map(id => map[id]).filter(Boolean).slice(0, 2).join(', ');
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

export {
  escapeHtml, escapeAttr, posterUrl, profileUrl, backdropUrl, posterImg, profileImg,
  providerImg, tmdbJson, formatVotes, slugify, loadingHtml, noteHtml,
  getMediaType, getTypeLabel, isAnime, hasNsfwText, hasNsfwKeyword, isExplicit,
  getGenreLabel, sliderToYear, yearToSlider
};
