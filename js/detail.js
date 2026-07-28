import { COLLECTION_ACTIONS, collectionKey, getEntry, isActionActive } from './collection.js';
import {
  ANIME_GENRE_ID, API_KEY, CAST_PREVIEW_MAX, ICONS, LANG_NAME_MAP, LANG_NATIVE_MAP,
  NSFW_KEYWORD_IDS, PROVIDER_URLS, TMDB, nsfwKeywordCache
} from './config.js';
import { resetCopyBtn } from './copy.js';
import { fetchRegions } from './geo.js';
import { showInfoOverlay } from './info-overlay.js';
import { showOverlay } from './overlays.js';
import { showCastGrid } from './people.js';
import { attachImageLoaders, paintNsfwOnCard, renderPerson } from './render.js';
import { els, qs, state } from './state.js';
import { dateOf, yearOf } from './fields.js';
import { backdropUrl, escapeAttr, escapeHtml, formatVotes, getMediaType, getTypeLabel, isAnime, isExplicit, loadingHtml, noteHtml, posterUrl, providerImg, slugify, tmdbJson } from './util.js';

/* ---------- 10. DETAIL OVERLAY ---------- */
let lastSelectedRegion = '';
let currentDetail = null;  // {id, mt, item} - set on open, cleared on close. Used so collection:change can re-render the row.
/* Owned here, cleared by the shared overlay teardown. Exposed as a function
   rather than a bare binding: ES module imports are read-only, so other
   modules cannot assign to `currentDetail` directly. */
function clearCurrentDetail() { currentDetail = null; }
/* Bumped on every showDetail / fetchProviders call so a slow response from a
   previously-viewed title can't paint over the one on screen now. */
let detailToken = 0;
let providerToken = 0;

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
  return COLLECTION_ACTIONS.map(({ key, label }) => {
    const on = isActionActive(entry, key);
    return `
    <button type="button" class="coll-btn coll-${key}${on ? ' is-active' : ''}"
      data-coll-action="${key}" aria-pressed="${on ? 'true' : 'false'}" title="${label}">
      <span class="coll-icon">${ICONS[key]}</span>
      <span class="coll-label">${label}</span>
    </button>`;
  }).join('');
}

function showDetail(id, mt) {
  const item = state.cache.find(x => x.id === id && getMediaType(x) === mt)
            || state.detailOverrides[collectionKey(id, mt)];
  if (!item) return;
  currentDetail = { id, mt, item };
  /* Opening a second title before the first one's requests land used to let the
     stale responses overwrite the new title's meta, cast and providers. Every
     async continuation below re-checks this token and bails if it moved on. */
  const token = ++detailToken;
  const isStale = () => token !== detailToken;
  const title = item.title || item.name || '';
  const date  = dateOf(item);

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
  els.detailMeta.innerHTML = renderDetailMeta(item);
  if (els.detailLangs) { els.detailLangs.hidden = true; els.detailLangs.innerHTML = ''; }
  els.detailActions.innerHTML = renderDetailActions(item, '');
  els.detailCollectionActions.innerHTML = renderCollectionActions(item);
  els.detailCast.innerHTML = loadingHtml('Loading cast…');
  els.seeMoreCast.hidden = true;
  els.detailProviders.innerHTML = loadingHtml('Loading streaming…');
  els.regionRow.innerHTML = '';

  // Reset the copy pills so a previous title's "Copied" state doesn't carry over.
  [els.copySlugBtn, els.copyIdBtn].forEach(resetCopyBtn);

  showOverlay(els.detailOverlay);
  attachImageLoaders(els.detailOverlay);

  // Fetch details + videos + keywords (keywords drives the NSFW badge for
  // titles like Overflow where TMDB's adult flag is false but the tag is set).
  tmdbJson(`${TMDB}/${mt}/${id}?api_key=${API_KEY}&append_to_response=videos,keywords`)
    .then(d => {
      const kwList = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
      const keywordNsfw = kwList.some(k => NSFW_KEYWORD_IDS.has(k.id));
      nsfwKeywordCache.set(collectionKey(id, mt), keywordNsfw);
      if (keywordNsfw) paintNsfwOnCard(item);   // cards repaint even if the overlay moved on
      if (isStale()) return;
      els.detailMeta.innerHTML = renderDetailMeta(item, d);
      renderDetailLangs(d);
      const trailer = (d.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                    || (d.videos?.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
      els.detailActions.innerHTML = renderDetailActions(item, trailer);
      // Overview can be richer if we have it
      if (d.overview) els.detailOverview.textContent = d.overview;
    })
    .catch(() => {});

  // Cast
  tmdbJson(`${TMDB}/${mt}/${id}/credits?api_key=${API_KEY}`)
    .then(d => {
      if (isStale()) return;
      const cast = d.cast || [];
      if (!cast.length) { els.detailCast.innerHTML = noteHtml('No cast info.'); return; }
      els.detailCast.innerHTML = cast.slice(0, CAST_PREVIEW_MAX).map((p,i) => renderPerson(p, p.character || '', i)).join('');
      attachImageLoaders(els.detailCast);
      if (cast.length > CAST_PREVIEW_MAX) {
        els.seeMoreCast.hidden = false;
        els.seeMoreCast.onclick = () => showCastGrid(cast, true);
      }
    })
    .catch(() => { if (!isStale()) els.detailCast.innerHTML = noteHtml('Could not load cast.'); });

  // Region selector + providers
  fetchRegions().then(regions => {
    if (isStale()) return;
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

/* Runtime for movies, season/episode counts for shows. Only available once the
   full record has loaded, so it's a separate tail on the meta row. */
function renderRuntimeMeta(mt, d) {
  if (mt === 'movie' && d.runtime) {
    const h = Math.floor(d.runtime / 60), m = d.runtime % 60;
    return `<span>${h ? h+'h ' : ''}${m}m</span>`;
  }
  if (mt === 'tv') {
    const parts = [];
    if (d.number_of_seasons)  parts.push(d.number_of_seasons === 1 ? '1 season' : `${d.number_of_seasons} seasons`);
    if (d.number_of_episodes) parts.push(`${d.number_of_episodes} eps`);
    if (parts.length) return `<span>${parts.join(', ')}</span>`;
  }
  return '';
}
/* One renderer for both passes. `d` (the full /movie|/tv payload) is absent on
   the synchronous paint from cache and present once the fetch lands; genres and
   runtime are the only parts that need it. */
function renderDetailMeta(item, d = null) {
  const mt = getMediaType(item);
  const rating = item.vote_average || 0;
  const genres = d ? (d.genres || []).map(g => g.name).join(', ') : '';
  return `
    ${rating > 0 ? `<span class="star">★ ${rating.toFixed(1)}</span><span class="vote-count">${formatVotes(item.vote_count || 0)} votes</span>` : ''}
    <span>${yearOf(dateOf(item))}</span>
    <span class="badge">${getTypeLabel(mt)}</span>
    ${isAnime(item) ? `<span class="badge">Anime</span>` : ''}
    ${isExplicit(item) ? `<span class="badge adult">NSFW 18+</span>` : ''}
    ${genres ? `<span>${escapeHtml(genres)}</span>` : ''}
    ${d ? renderRuntimeMeta(mt, d) : ''}
  `;
}
function renderDetailActions(item, trailer) {
  const parts = [];
  const mt = getMediaType(item);
  if (trailer && trailer.key) parts.push(`<a class="btn btn-red" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${trailer.key}">▶ Watch trailer</a>`);
  if (item.id) {
    /* zstream browses by title slug, not by TMDB id, and its /browse path is
       the same for films and shows — so unlike the old embed URLs there's no
       movie/tv branch here, only the button label differs. */
    const slug = slugify(item.title || item.name || '');
    const watchUrl = `https://zstream.mov/browse/${slug}`;
    const watchLabel = mt === 'movie' ? 'Watch movie' : 'Watch show';
    const animeMode = isAnime(item);
    const genreIds = item.genre_ids || (item.genres || []).map(g => g.id);
    const animated = !animeMode && genreIds.includes(ANIME_GENRE_ID);
    if (animeMode) {
      parts.push(`<button type="button" class="btn btn-anime"><span class="anime-spark" aria-hidden="true">🏴‍☠️</span> Watch anime</button>`);
    } else if (animated) {
      parts.push(`<button type="button" class="btn btn-anime btn-muted" disabled title="Not detected as anime"><span class="anime-spark" aria-hidden="true">❓</span> Watch anime</button>`);
    }
    // Greyed but still clickable when an anime primary is present.
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
  const token = ++providerToken;
  const isStale = () => token !== providerToken;
  const slug = slugify(title);
  const jwType = mt === 'movie' ? 'movie' : 'tv-series';
  const jwLocale = (() => { const c = JW_LOCALE_MAP[region] || region.toLowerCase(); return JW_SUPPORTED.has(c) ? c : 'us'; })();
  const jwFallback = `https://www.justwatch.com/${jwLocale}/${jwType}/${slug}`;
  const gUrl    = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${yearOf(date)} ${mt==='movie'?'movie':'TV show'} where to watch`)}`;

  // Low-data: omit the brand <img> tags; CSS already drops them via :root[data-low-data] rule.
  const buildLinks = (jwUrl) => {
    const tmdbImg = state.lowData ? '' : `<img src="TMDB.ico" alt="" width="20" height="20" loading="lazy" decoding="async"/>`;
    const jwImg   = state.lowData ? '' : `<img src="justwatch.png" alt="" width="20" height="20" loading="lazy" decoding="async"/>`;
    const gImg    = state.lowData ? '' : `<img src="Google.png" alt="" width="20" height="20" loading="lazy" decoding="async"/> `;
    const bothIcons = state.lowData ? '' : `${tmdbImg} ${jwImg} `;
    return `
      <div class="provider-row">
        <a href="${jwUrl}" target="_blank" rel="noopener">${bothIcons}TMDB (JustWatch) →</a>
        <a href="${gUrl}" target="_blank" rel="noopener">${gImg}Google →</a>
      </div>`;
  };

  els.detailProviders.innerHTML = loadingHtml('Loading…');
  tmdbJson(`${TMDB}/${mt}/${id}/watch/providers?api_key=${API_KEY}`)
    .then(data => {
      if (isStale()) return;
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
      if (isStale()) return;
      els.detailProviders.innerHTML = `<p class="providers-empty">Could not load providers.</p>${buildLinks(jwFallback)}`;
    });
}

export {
  lastSelectedRegion, currentDetail, clearCurrentDetail, detailToken, providerToken,
  LANG_VISIBLE_MAX, renderDetailLangs, showLanguageInfoOverlay, renderCollectionActions,
  showDetail, renderRuntimeMeta, renderDetailMeta, renderDetailActions, JW_LOCALE_MAP,
  JW_SUPPORTED, fetchProviders
};
