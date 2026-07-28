import { fetchMedia } from './api.js';
import { currentDetail } from './detail.js';
import { savePrefs } from './prefs.js';
import { attachImageLoaders, renderResults } from './render.js';
import { els, state } from './state.js';
import { backdropUrl, posterUrl } from './util.js';

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

export {
  isLight, applyTheme, toggleTheme, applyAutoLoadUI, applyLowDataUI, toggleLowData,
  refreshLoadMore, toggleAutoLoad
};
