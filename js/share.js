import { collectionKey, itemFromEntry, saveEntriesTo } from './collection.js';
import { COLLECTION_TABS, setCollectionStatus } from './collection-ui.js';
import { copyTextToClipboard } from './copy.js';
import { showOverlay } from './overlays.js';
import { attachImageLoaders, renderCard } from './render.js';
import { els, state } from './state.js';

/* ---------- 13e. SHARED PLAYLISTS ----------
   There is no backend, so a shared playlist travels entirely inside the link:
   `#list=<payload>` where the payload is the list's entries, deflated when the
   browser supports CompressionStream, then base64url-encoded. It lives in the
   fragment so it never reaches the server or its logs.

   Anyone opening the link sees the list read-only and can save it into one of
   their own lists, or download it as a CSV. The payload is untrusted input, so
   decodeShare() rebuilds every entry from validated fields only. */
const SHARE_PARAM   = 'list';
const SHARE_VER     = 1;
const SHARE_MAX     = 1000;   // entries per link; well past any real list
const NAME_MAX      = 80;
const TITLE_MAX     = 300;
const POSTER_RE     = /^\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/;

/* ---- base64url <-> bytes ---- */
function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const canDeflate = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const pipeBytes = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();

/* Leading char tags the encoding: 'z' = deflate-raw, 'j' = plain UTF-8 JSON. */
async function encodeShare(name, entries) {
  const payload = {
    v: SHARE_VER,
    n: name,
    i: entries.map(e => [e.mediaType === 'tv' ? 1 : 0, e.id, e.title || '', e.year || '', e.posterPath || '']),
  };
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (canDeflate()) {
    try { return 'z' + bytesToB64url(new Uint8Array(await pipeBytes(raw, new CompressionStream('deflate-raw'))));
    } catch { /* fall through to plain */ }
  }
  return 'j' + bytesToB64url(raw);
}

/* Returns { name, entries } or null when the link is unusable. */
async function decodeShare(str) {
  try {
    const tag = str[0];
    let bytes = b64urlToBytes(str.slice(1));
    if (tag === 'z') {
      if (!canDeflate()) return null;
      bytes = new Uint8Array(await pipeBytes(bytes, new DecompressionStream('deflate-raw')));
    } else if (tag !== 'j') return null;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || !Array.isArray(data.i)) return null;
    const seen = new Set();
    const entries = [];
    for (const row of data.i.slice(0, SHARE_MAX)) {
      if (!Array.isArray(row)) continue;
      const [t, id, title, year, poster] = row;
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const mediaType = t === 1 ? 'tv' : 'movie';
      const key = collectionKey(id, mediaType);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        id, mediaType,
        title: typeof title === 'string' ? title.slice(0, TITLE_MAX) : '',
        year: /^\d{4}$/.test(String(year)) ? String(year) : '',
        posterPath: typeof poster === 'string' && POSTER_RE.test(poster) ? poster : '',
      });
    }
    const name = typeof data.n === 'string' && data.n.trim() ? data.n.trim().slice(0, NAME_MAX) : 'Shared list';
    return { name, entries };
  } catch { return null; }
}

/* ---- CSV download ---- */
const tmdbLink = (e) => `https://www.themoviedb.org/${e.mediaType}/${e.id}`;
/* Quote every field; prefix a leading = + - @ so spreadsheets don't run it as a formula. */
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
const fileSlug = (s) => (s || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list';

function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/* BOM so Excel reads titles as UTF-8 rather than mangling accents. */
function downloadCsv(name, entries) {
  const rows = [['Title', 'Year', 'Type', 'TMDB link']]
    .concat(entries.map(e => [e.title, e.year, e.mediaType === 'tv' ? 'Show' : 'Movie', tmdbLink(e)]));
  const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  downloadFile(`stash-${fileSlug(name)}.csv`, csv, 'text/csv;charset=utf-8');
}

/* ---- Sharing from My Collection ---- */
const shareUrlFor = (encoded) => `${location.origin}${location.pathname}#${SHARE_PARAM}=${encoded}`;

async function shareCollectionTab(tabKey, entries) {
  if (!entries.length) { setCollectionStatus('Nothing to share in this list yet.', 'error'); return; }
  const name = tabKey === 'all' ? 'Collection' : (COLLECTION_TABS.find(t => t.key === tabKey) || {}).label || 'My list';
  const url = shareUrlFor(await encodeShare(name, entries));
  const ok = await copyTextToClipboard(url);
  const n = entries.length;
  setCollectionStatus(ok
    ? `Link copied. Anyone who opens it can save or download these ${n} title${n === 1 ? '' : 's'}.`
    : 'Could not copy the link.', ok ? 'info' : 'error');
}

/* ---- Viewing a shared list ---- */
let shared = null;   // { name, entries } currently shown

function setSharedStatus(text, kind = 'info') {
  const el = els.sharedStatus;
  el.hidden = !text;
  el.textContent = text || '';
  if (text) el.dataset.kind = kind; else el.removeAttribute('data-kind');
}

function renderShared() {
  const { name, entries } = shared;
  els.sharedTitle.textContent = name;
  const n = entries.length;
  els.sharedMeta.textContent = `Shared playlist · ${n} title${n === 1 ? '' : 's'}`;
  els.sharedSave.disabled = n === 0;
  els.sharedDownload.disabled = n === 0;
  if (!n) {
    els.sharedBody.innerHTML = `<div class="collection-empty"><strong>This list is empty.</strong></div>`;
    return;
  }
  // findItem() falls back to detailOverrides, so quick-add and the detail view
  // both work for titles that aren't in this viewer's own collection.
  entries.forEach(e => { state.detailOverrides[collectionKey(e.id, e.mediaType)] = itemFromEntry(e); });
  els.sharedBody.innerHTML = `<div class="grid">${entries.map((e, i) => renderCard(itemFromEntry(e), i, false)).join('')}</div>`;
  attachImageLoaders(els.sharedBody);
}

/* Reads #list=… from the URL. Returns true when a shared list was opened. */
async function openSharedFromHash() {
  const m = location.hash.match(new RegExp(`^#${SHARE_PARAM}=([A-Za-z0-9_-]+)$`));
  if (!m) return false;
  const data = await decodeShare(m[1]);
  shared = data || { name: 'Shared list', entries: [] };
  setSharedStatus(data ? '' : 'This link is broken or incomplete. Ask for a fresh one.', data ? 'info' : 'error');
  els.sharedTarget.value = 'want';
  renderShared();
  showOverlay(els.sharedOverlay);
  return true;
}

/* Drop the fragment once the shared view closes, so a reload doesn't reopen it. */
function clearShareHash() {
  if (location.hash.startsWith(`#${SHARE_PARAM}=`)) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function saveShared() {
  if (!shared || !shared.entries.length) return;
  const key = els.sharedTarget.value;
  const label = els.sharedTarget.selectedOptions[0]?.textContent || 'your list';
  const { added, skipped } = saveEntriesTo(shared.entries, key);
  const parts = [`Saved ${added} title${added === 1 ? '' : 's'} to ${label}`];
  if (skipped) parts.push(`${skipped} already in your collection`);
  setSharedStatus(parts.join(', ') + '.', added ? 'info' : 'error');
}

function downloadShared() {
  if (shared && shared.entries.length) downloadCsv(shared.name, shared.entries);
}

export {
  encodeShare, decodeShare, downloadCsv, shareCollectionTab, openSharedFromHash,
  clearShareHash, saveShared, downloadShared
};
