import { dateOf, yearOf } from './fields.js';
import { getMediaType } from './util.js';

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
const collectionKey   = (id, mt) => `${mt}:${id}`;

/* The six collection actions in display order. `field` names the part of an
   entry the action writes. Because status and rating store the action key
   itself ('want', 'liked', …), reading and writing both collapse to a lookup —
   see isActionActive / applyCollectionAction. Single source of truth for the
   card hover row, the detail action row, the collection tabs, and state sync;
   these were four hand-maintained copies of the same list. */
const COLLECTION_ACTIONS = [
  { key:'favourite', label:'Favourite',     field:'favourite' },
  { key:'want',      label:'Want to watch', field:'status'    },
  { key:'watching',  label:'Watching',      field:'status'    },
  { key:'watched',   label:'Watched',       field:'status'    },
  { key:'liked',     label:'Liked',         field:'rating'    },
  { key:'disliked',  label:'Disliked',      field:'rating'    },
];
const ACTION_FIELD = Object.fromEntries(COLLECTION_ACTIONS.map(a => [a.key, a.field]));

/* Is `key` currently switched on for this entry? Accepts a bare {} for items
   that aren't in the collection at all. */
function isActionActive(entry, key) {
  if (ACTION_FIELD[key] === 'favourite') return !!entry.favourite;
  return entry[ACTION_FIELD[key]] === key;
}
/* Apply `key` to an item. Every mutator below toggles when re-applied, so this
   doubles as the "unset" path. */
function applyCollectionAction(item, key) {
  const field = ACTION_FIELD[key];
  if (field === 'favourite') return toggleFavourite(item);
  if (field === 'rating')    return setRating(item, key);
  return setEntryStatus(item, key);
}

/* The parsed collection is memoised. getEntry() is called once per card, so
   without this a 40-card page re-read and re-parsed the whole store 40 times
   (~3 MB of JSON for a 400-item collection) — and every heart click did it
   again via refreshCardStates. localStorage is the durable copy; this is the
   working one.

   Contract: loadCollection() hands back the *live* cached object, so anything
   that mutates it must call saveCollection() to persist and notify. Every
   mutator below does. */
let collectionCache = null;
/* Drop the memoised copy so the next loadCollection() re-reads localStorage.
   Used by the cross-tab `storage` listener, which lives in the init wiring. */
function invalidateCollectionCache() { collectionCache = null; }
function loadCollection() {
  if (collectionCache) return collectionCache;
  collectionCache = { version: COLLECTION_VER, items: {} };
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLECTION_KEY) || 'null');
    if (parsed && typeof parsed === 'object' && parsed.items) {
      collectionCache = { version: parsed.version || COLLECTION_VER, items: parsed.items };
    }
  } catch { /* corrupt or unavailable — fall back to the empty collection */ }
  return collectionCache;
}
function saveCollection(col) {
  collectionCache = col;
  try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(col)); } catch {}
  document.dispatchEvent(new CustomEvent('collection:change'));
}
function getEntry(id, mt) {
  return loadCollection().items[collectionKey(id, mt)] || null;
}
/* Build a stub from a TMDB item (or merge over an existing entry). */
function entryFromItem(item) {
  return {
    id: item.id,
    mediaType: getMediaType(item),
    title: item.title || item.name || '',
    posterPath: item.poster_path || '',
    year: yearOf(dateOf(item)),
    favourite: false,
    status: null,
    rating: null,
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };
}
/* The inverse: a stored entry rebuilt as a sparse TMDB-shaped item, so
   renderCard and showDetail can consume collection data unchanged. */
const itemFromEntry = (e) => ({
  id: e.id,
  media_type: e.mediaType,
  title: e.title,
  name: e.title,
  poster_path: e.posterPath,
  release_date:   e.mediaType === 'movie' && e.year ? `${e.year}-01-01` : '',
  first_air_date: e.mediaType === 'tv'    && e.year ? `${e.year}-01-01` : '',
});
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
    year: base.year || yearOf(dateOf(item)),
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
  const c = { total: items.length };
  COLLECTION_ACTIONS.forEach(a => { c[a.key] = 0; });
  items.forEach(e => COLLECTION_ACTIONS.forEach(a => { if (isActionActive(e, a.key)) c[a.key]++; }));
  return c;
}
/* Keys that must never be used as collection map keys. Assigning `obj['__proto__']`
   on a plain object swaps its prototype instead of storing an entry, so a crafted
   import file would silently drop the item while still counting it as imported. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/* Merge an imported collection into the current one. Per-field "newest wins" by
   updatedAt; non-empty title/poster/year overwrite empty ones regardless. */
function mergeImport(incoming) {
  if (!incoming || typeof incoming !== 'object' || !incoming.items) {
    return { ok:false, reason:'Not a valid collection file.' };
  }
  const col = loadCollection();
  let added = 0, updated = 0, skipped = 0;
  Object.entries(incoming.items).forEach(([key, inc]) => {
    if (UNSAFE_KEYS.has(key)) { skipped++; return; }
    if (!inc || typeof inc !== 'object' || inc.id == null || !inc.mediaType) { skipped++; return; }
    const existing = Object.prototype.hasOwnProperty.call(col.items, key) ? col.items[key] : undefined;
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
  /* `total` counts only entries we actually accepted — reporting the raw key count
     would claim success for malformed or unsafe keys we silently dropped. */
  return { ok:true, added, updated, skipped, total: Object.keys(incoming.items).length - skipped };
}

export {
  COLLECTION_KEY, COLLECTION_VER, collectionKey, COLLECTION_ACTIONS, ACTION_FIELD,
  isActionActive, applyCollectionAction, collectionCache, invalidateCollectionCache,
  loadCollection, saveCollection, getEntry, entryFromItem, itemFromEntry, upsertEntry,
  setEntryStatus, setRating, toggleFavourite, getCounts, UNSAFE_KEYS, mergeImport
};
