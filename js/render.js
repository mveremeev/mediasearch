import {
  COLLECTION_ACTIONS, applyCollectionAction, collectionKey, getEntry, isActionActive,
  itemFromEntry
} from './collection.js';
import {
  API_KEY, DEFAULT_SORT, ICONS, LANG_NAME_MAP, NO_POSTER, NO_PROFILE, NSFW_KEYWORD_IDS,
  PEOPLE_PREVIEW_MAX, SORT_LABELS, TMDB, TYPE_LABELS, nsfwKeywordCache,
  nsfwLookupInFlight
} from './config.js';
import { els, qs, qsa, state } from './state.js';
import { refreshLoadMore } from './theme.js';
import { dateOf, yearOf } from './fields.js';
import { escapeAttr, escapeHtml, getGenreLabel, getMediaType, getTypeLabel, hasNsfwText, isAnime, isExplicit, posterImg, profileImg, tmdbJson } from './util.js';

/* ---------- 7. RENDER ---------- */
function setStatus(kind) {
  if (kind === 'loading') {
    els.gridStatus.removeAttribute('data-empty');
    els.gridStatus.innerHTML = '<span class="spinner"></span><span>Loading…</span>';
  } else if (kind === 'error') {
    els.gridStatus.setAttribute('data-empty','');
    els.gridStatus.innerHTML = '<strong>Couldn’t reach TMDB</strong><span>Check your connection and try again — your filters are fine.</span>';
  } else if (kind === 'searching') {
    /* Nothing survived the client-side filters on the pages pulled so far, but
       TMDB still has more. Distinct from 'empty' so we don't tell the user to
       widen filters that may well match a few pages further in. */
    els.gridStatus.setAttribute('data-empty','');
    els.gridStatus.innerHTML = state.autoLoad
      ? '<strong>Still looking…</strong><span>No matches in the results so far — checking further pages.</span>'
      : '<strong>No matches yet</strong><span>Nothing in the results so far — use Load more to keep looking.</span>';
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
  refreshLoadMore();
}

function renderResults({ append = false } = {}) {
  // Section title + meta
  if (state.query) {
    els.sectionTitle.textContent = `Results for "${state.query}"`;
    els.sectionMeta.textContent = state.cache.length ? `${state.cache.length}+ titles` : '';
  } else {
    els.sectionTitle.textContent = state.type === 'all' ? 'Discover' : (TYPE_LABELS[state.type] || 'Discover');
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
  /* Bind only the cards just inserted. Re-walking the whole grid made every
     append O(total), so infinite scroll degraded quadratically. */
  const added = [];
  for (let i = startIdx; i < els.grid.children.length; i++) added.push(els.grid.children[i]);
  attachImageLoaders(added);
  enrichNsfwBadges(newItems);

  if (!append) attachImageLoaders(els.peopleGrid);

  setStatus(
    state.fetchFailed          ? 'error'
    : state.cache.length       ? ''
    : state.exhausted          ? 'empty'
                               : 'searching'
  );
}

function renderCard(item, idx, showRibbon) {
  const title = item.title || item.name || '';
  const date  = dateOf(item);
  const mt    = getMediaType(item);
  const typeLabel = getTypeLabel(mt);
  const animeTag  = isAnime(item) ? '<span>Anime</span>' : '';
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
  const quickBtns = COLLECTION_ACTIONS.map(({ key, label }) => {
    const on = isActionActive(entry, key);
    return `
    <button type="button" class="card-quick-btn quick-${key}${on ? ' is-active' : ''}"
      data-coll-action="${key}" aria-label="${escapeAttr(label + ': ' + title)}" aria-pressed="${on ? 'true' : 'false'}" title="${escapeAttr(label)}">${ICONS[key]}</button>`;
  }).join('');
  return `
    <article class="card${nsfw ? ' is-nsfw' : ''}" data-id="${item.id}" data-type="${mt}" data-fav="${fav ? '1' : '0'}" data-status="${status}" data-rating="${userRating}" tabindex="0" role="button" aria-label="${escapeAttr(title)}" style="--i:${Math.min(idx, 24)}">
      <div class="card-poster">
        ${showRib ? `<div class="ribbon" aria-hidden="true"><span class="ribbon-tag">Top</span><span class="ribbon-num">${rank}</span></div>` : ''}
        ${posterImg(item.poster_path, title)}
        <div class="card-quick" aria-label="Quick add to collection">${quickBtns}</div>
      </div>
      <div class="card-info">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        <div class="card-meta">
          ${rating > 0 ? `<span class="star">★ ${rating.toFixed(1)}</span>` : ''}
          <span class="num">${yearOf(date)}</span>
          ${typeLabel ? `<span>${typeLabel}</span>${animeTag}` : ''}
          ${lang ? `<span class="card-lang" title="${escapeAttr(langName)}">${escapeHtml(lang)}</span>` : ''}
          ${nsfw && state.adultOnly ? `<span class="card-adult">NSFW 18+</span>` : ''}
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

/* Accepts a container or a list of freshly-inserted elements, so callers that
   only added a page of cards don't pay to re-scan the ones already bound. */
function attachImageLoaders(root) {
  if (!root) return;
  const imgs = Array.isArray(root) ? root.flatMap(el => qsa('img', el)) : qsa('img', root);
  imgs.forEach(img => {
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
/* Run work once the browser is idle, so it never competes with the paint that
   just happened. Falls back to a timeout where requestIdleCallback is missing. */
const onIdle = (fn) => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(fn);

function enrichNsfwBadges(items) {
  if (!Array.isArray(items) || !items.length) return;
  const pending = [];
  items.forEach(item => {
    if (!item || !item.id) return;
    const key = collectionKey(item.id, getMediaType(item));
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
    pending.push([key, item]);
  });
  if (!pending.length) return;
  /* These are cosmetic badges, so they wait for idle and go out a few at a
     time. Firing a whole page at once put ~40 requests ahead of the poster
     images in the connection queue for no visible benefit. */
  onIdle(() => runNsfwLookups(pending));
}

const NSFW_LOOKUP_CONCURRENCY = 4;
function runNsfwLookups(queue) {
  let i = 0;
  const next = () => {
    if (i >= queue.length) return;
    const [key, item] = queue[i++];
    const mt = getMediaType(item);
    tmdbJson(`${TMDB}/${mt}/${item.id}/keywords?api_key=${API_KEY}`)
      .then(d => {
        const list = (mt === 'movie' ? d.keywords : d.results) || [];
        const flagged = list.some(k => NSFW_KEYWORD_IDS.has(k.id));
        nsfwKeywordCache.set(key, flagged);
        if (flagged) paintNsfwOnCard(item);
      })
      .catch(() => {})
      .finally(() => { nsfwLookupInFlight.delete(key); next(); });
  };
  for (let n = 0; n < Math.min(NSFW_LOOKUP_CONCURRENCY, queue.length); n++) next();
}

/* Mark card as NSFW (is-nsfw class). Only add the inline label if NSFW filter is on.
   Idempotent so re-renders are safe. Uses createElement / textContent only. */
function paintNsfwOnCard(item) {
  const mt = getMediaType(item);
  qsa(`.card[data-id="${item.id}"][data-type="${mt}"]`).forEach(card => {
    card.classList.add('is-nsfw');
    if (!state.adultOnly) return;           // inline label only with the NSFW filter on
    const meta = qs('.card-meta', card);
    if (!meta || qs('.card-adult', meta)) return;
    const pill = document.createElement('span');
    pill.className = 'card-adult';
    pill.textContent = 'NSFW 18+';
    meta.insertBefore(pill, qs('.genre', meta));  // a null ref appends
  });
}


/* Look up a TMDB-shaped item by id+type from any source: current grid cache,
   detail-override map, or the saved collection (rebuilt as a sparse stub).
   Used by the card-hover quick-add buttons since cards can come from anywhere. */
function findItem(id, mt) {
  const fromCache = state.cache.find(x => x.id === id && getMediaType(x) === mt);
  if (fromCache) return fromCache;
  const e = getEntry(id, mt);
  return state.detailOverrides[collectionKey(id, mt)] || (e ? itemFromEntry(e) : null);
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
  if (item) applyCollectionAction(item, btn.dataset.collAction);
  return true;
}

/* Refresh data-fav / data-status / .is-active on every visible .card after a
   collection mutation. Cheaper than re-rendering the whole grid. */
function refreshCardStates(root = document) {
  qsa('.card', root).forEach(card => {
    const entry = getEntry(Number(card.dataset.id), card.dataset.type) || {};
    card.dataset.fav    = entry.favourite ? '1' : '0';
    card.dataset.status = entry.status || '';
    card.dataset.rating = entry.rating || '';
    qsa('.card-quick-btn', card).forEach(btn => {
      const on = isActionActive(entry, btn.dataset.collAction);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
}

export {
  setStatus, renderResults, renderCard, renderPerson, attachImageLoaders, onIdle,
  enrichNsfwBadges, NSFW_LOOKUP_CONCURRENCY, runNsfwLookups, paintNsfwOnCard, findItem,
  handleCollectionActionClick, refreshCardStates
};
