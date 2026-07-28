/* =====================================================================
   Stash - entry point
   Loaded by index.html as <script type="module">, which pulls in the whole
   graph below. Module map (roughly the old scripts.js section order):

     trusted-types  - default TT policy; side-effect only, must be first
     config         - API key, endpoints, services, genre/language tables
     state          - module-level `state` object + cached DOM refs (`els`)
     util           - escaping, tmdbJson, image URLs, year-slider math
     prefs          - localStorage prefs save/load
     collection     - favourites + want/watching/watched store, import/export
     geo            - 3-tier country lookup
     api            - search vs discover dispatch, paging
     render         - grid cards, people, skeletons, NSFW badges
     filters        - selected-filter pills + chip UI + filter wiring
     detail         - detail overlay: meta, trailer, cast, providers
     people         - actor filmography + full cast grid
     info-overlay   - regions + VPN list
     collection-ui  - collection overlay, tabs, import/export UI, adblock prompt
     copy           - copy id / slug buttons
     scroll         - IntersectionObserver for infinite scroll
     overlays       - shared show/hide/close/wire helpers
     theme          - light/dark + low-data mode
     main           - init: wires everything up on DOMContentLoaded

   Cross-module rule: ES module imports are read-only bindings, so a module
   that owns mutable state exposes a setter (clearCurrentDetail,
   setCollectionTab, invalidateCollectionCache) rather than being assigned to
   from outside.
   ===================================================================== */

/* Side-effect import: registers the Trusted Types default policy. No module
   imports a binding from it, so it has to be named explicitly or it would be
   left out of the graph entirely. First, so the policy exists before anything
   else can touch innerHTML. */
import './trusted-types.js';

import { fetchMedia } from './api.js';
import {
  COLLECTION_KEY, applyCollectionAction, collectionKey, getCounts,
  invalidateCollectionCache
} from './collection.js';
import {
  ADBLOCK_SKIP_KEY, adblockSkipped, exportCollection, getCollectionTab, importCollection,
  openCollection, openDetailFromCollection, renderCollection, renderCollectionBody,
  setCollectionTab, showAdblockPrompt, updateCollectionTabActive
} from './collection-ui.js';
import { copyTextToClipboard, flashCopy } from './copy.js';
import { currentDetail, renderCollectionActions, showDetail } from './detail.js';
import {
  buildLanguageRadios, buildServiceCheckboxes, onFilterChange, setLanguage,
  setRatingRange, setSort, setType, setYearRange, syncServicesFromUI, updatePills,
  wireFilters
} from './filters.js';
import { fetchCountry } from './geo.js';
import { closeTopOverlay, hideOverlay, wireOverlay } from './overlays.js';
import { showActor, showCastGrid } from './people.js';
import { loadPrefs } from './prefs.js';
import { handleCollectionActionClick, refreshCardStates } from './render.js';
import { io } from './scroll.js';
import { els, qsa, state } from './state.js';
import {
  applyAutoLoadUI, applyLowDataUI, applyTheme, toggleAutoLoad, toggleLowData,
  toggleTheme
} from './theme.js';
import { slugify } from './util.js';

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
    els.regionDisplay.textContent = c;
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

  /* Cards and person cards are role="button", so both need click and
     Enter/Space. Delegated once per container instead of eight near-identical
     listeners. `guard` lets the grid's quick-add buttons swallow the event. */
  const wireActivation = (root, selector, open, guard) => {
    const hit = (e) => {
      if (guard && guard(e)) return null;
      return e.target.closest(selector);
    };
    root.addEventListener('click', (e) => { const el = hit(e); if (el) open(el); });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('.card-quick-btn')) return;  // button handles its own activation
      const el = hit(e); if (el) { e.preventDefault(); open(el); }
    });
  };
  const openCard = (open) => (card) => open(Number(card.dataset.id), card.dataset.type);
  const openPerson = (p) => showActor(Number(p.dataset.id));

  wireActivation(els.grid, '.card', openCard(showDetail), handleCollectionActionClick);
  wireActivation(els.collectionBody, '.card', openCard(openDetailFromCollection), handleCollectionActionClick);
  wireActivation(els.peopleGrid, '.person-card', openPerson);
  wireActivation(els.detailCast, '.person-card', openPerson);
  wireActivation(els.castGridContent, '.person-card', (p) => {
    hideOverlay(els.castGridOverlay);
    openPerson(p);
  });
  els.seeMorePeople.addEventListener('click', () => showCastGrid(state.personCache, false));

  // Actor overlay: credit clicks → detail overlay (no modal stacking)
  wireActivation(els.actorContent, '.credit-card', (card) => {
    const id = Number(card.dataset.id);
    const mt = card.dataset.type;
    if (!id || (mt !== 'movie' && mt !== 'tv')) return;
    const title = card.dataset.title || '';
    const date  = card.dataset.date || '';
    state.detailOverrides[collectionKey(id, mt)] = {
      id, media_type: mt, title, name: title,
      poster_path: card.dataset.poster || '',
      release_date:   mt === 'movie' ? date : '',
      first_air_date: mt === 'tv'    ? date : '',
    };
    hideOverlay(els.actorOverlay);
    showDetail(id, mt);
  });

  // Overlay close handlers (button + backdrop); Escape unwinds the stack.
  wireOverlay(els.detailOverlay,     els.detailClose);
  wireOverlay(els.actorOverlay,      els.actorClose);
  wireOverlay(els.castGridOverlay,   els.castGridClose);
  wireOverlay(els.infoOverlay,       els.infoClose);
  wireOverlay(els.adblockOverlay,    els.adblockClose);
  wireOverlay(els.collectionOverlay, els.collectionClose);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopOverlay(); });

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
  /* Both adblock exits do the same thing; "I already have one" additionally
     always persists the skip, where Continue only does so when ticked. */
  const leaveAdblockPrompt = (persist) => {
    if (persist) { try { localStorage.setItem(ADBLOCK_SKIP_KEY, '1'); } catch {} }
    const url = els.adblockContinue.dataset.url || '';
    hideOverlay(els.adblockOverlay);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  els.adblockContinue.addEventListener('click', () => leaveAdblockPrompt(els.adblockDontShow.checked));
  els.adblockHaveIt.addEventListener('click', () => leaveAdblockPrompt(true));

  // Copy pills at the bottom of the detail overlay
  const wireCopy = (btn, valueOf) => btn.addEventListener('click', async () => {
    if (!currentDetail) return;
    const value = valueOf(currentDetail);
    const ok = await copyTextToClipboard(value);
    flashCopy(btn, ok ? `Copied ${value}` : 'Copy failed');
  });
  wireCopy(els.copySlugBtn, (d) => slugify(d.item.title || d.item.name || ''));
  wireCopy(els.copyIdBtn,   (d) => String(d.id));

  // Collection: open from header, import/export, tabs
  els.collectionBtn.addEventListener('click', openCollection);
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
    if (tab.dataset.tab === getCollectionTab()) return; // no-op click
    setCollectionTab(tab.dataset.tab);
    updateCollectionTabActive();   // cheap: class swap only
    renderCollectionBody();        // body content needs new filter
  });
  // Detail-overlay collection-actions row
  els.detailCollectionActions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-coll-action]');
    if (btn && currentDetail) applyCollectionAction(currentDetail.item, btn.dataset.collAction);
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

  /* Another tab wrote the collection — drop our memoised copy and re-sync.
     `storage` only fires in *other* tabs, so this can't loop. */
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== COLLECTION_KEY) return;
    invalidateCollectionCache();
    document.dispatchEvent(new CustomEvent('collection:change'));
  });

  // Initial badge from saved data
  document.dispatchEvent(new CustomEvent('collection:change'));

  // Infinite scroll observer
  io.observe(els.sentinel);

  // Initial paint
  updatePills();
  fetchMedia(false);
}

document.addEventListener('DOMContentLoaded', init);

export {
  init
};
