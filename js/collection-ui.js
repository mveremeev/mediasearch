import {
  COLLECTION_ACTIONS, COLLECTION_VER, collectionKey, getCounts, getEntry, isActionActive,
  itemFromEntry, loadCollection, mergeImport
} from './collection.js';
import { showDetail } from './detail.js';
import { showOverlay } from './overlays.js';
import { attachImageLoaders, renderCard } from './render.js';
import { els, qsa, state } from './state.js';

/* ---------- 13b. COLLECTION OVERLAY + IMPORT/EXPORT ---------- */
let collectionTab = 'all';
/* Owned here; the tab click handler lives in the init wiring, so it goes
   through these rather than reaching across modules. */
function setCollectionTab(t) { collectionTab = t; }
const getCollectionTab = () => collectionTab;
/* Tabs are "All" plus one per collection action, in the order the user is most
   likely to want them. Labels come from COLLECTION_ACTIONS except where the tab
   reads better pluralised. */
const TAB_LABEL_OVERRIDES = { favourite: 'Favourites' };
const COLLECTION_TABS = [
  { key: 'all', label: 'All' },
  ...['want', 'favourite', 'watching', 'watched', 'liked', 'disliked'].map(key => ({
    key,
    label: TAB_LABEL_OVERRIDES[key] || COLLECTION_ACTIONS.find(a => a.key === key).label,
  })),
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
  state.detailOverrides[collectionKey(id, mt)] = itemFromEntry(e);
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
  // Tab keys other than 'all' are collection-action keys, so one predicate covers them.
  const filtered = (collectionTab === 'all' ? items.slice() : items.filter(e => isActionActive(e, collectionTab)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  if (filtered.length === 0) {
    const msg = items.length === 0
      ? `<strong>Your collection is empty.</strong><span>Open a movie or show, then tap a heart, bookmark, play or check icon to start collecting.</span>`
      : `<strong>Nothing here yet.</strong><span>Try a different tab - or add something from a movie or show card.</span>`;
    els.collectionBody.innerHTML = `<div class="collection-empty">${msg}</div>`;
    return;
  }

  const html = filtered.map((e, i) => renderCard(itemFromEntry(e), i, false)).join('');
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
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      setCollectionStatus(parts.join(', ') + '.', result.total ? 'info' : 'error');
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

export {
  collectionTab, setCollectionTab, getCollectionTab, TAB_LABEL_OVERRIDES,
  COLLECTION_TABS, openCollection, openDetailFromCollection, renderCollectionTabs,
  updateCollectionTabActive, renderCollectionBody, renderCollection, setCollectionStatus,
  exportCollection, importCollection, ADBLOCK_SKIP_KEY, adblockSkipped,
  showAdblockPrompt
};
