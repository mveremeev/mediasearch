import { fetchMedia } from './api.js';
import {
  DEFAULT_SORT, LANGUAGES, LANG_NAME_MAP, SERVICES, SORT_LABELS, TYPE_LABELS
} from './config.js';
import { fetchCountry } from './geo.js';
import { savePrefs } from './prefs.js';
import { els, qs, qsa, state } from './state.js';
import { escapeHtml, sliderToYear, yearToSlider } from './util.js';

/* ---------- 8. PILLS ---------- */
function updatePills() {
  const pills = [];
  if (state.type !== 'all') pills.push({ key:'type', label:`Type: ${TYPE_LABELS[state.type]}` });
  if (!state.servicesAll && state.serviceVals.length) {
    state.serviceVals.forEach(v => {
      const svc = SERVICES.find(s => s.v === v);
      if (svc) pills.push({ key:`service:${v}`, label:svc.name });
    });
  }
  if (!state.query && state.language) {
    pills.push({ key:'language', label:`Lang: ${LANG_NAME_MAP[state.language] || state.language.toUpperCase()}` });
  }
  const cy = new Date().getFullYear();
  if (state.yearMin > 0 || state.yearMax < cy) {
    const lo = state.yearMin === 0 ? '...' : state.yearMin;
    pills.push({ key:'year', label:`${lo}–${state.yearMax}` });
  }
  if (!state.query && (state.ratingMin > 0 || state.ratingMax < 10)) {
    pills.push({ key:'rating', label:`★ ${state.ratingMin}–${state.ratingMax}` });
  }
  if (!state.query && state.sort !== DEFAULT_SORT) {
    pills.push({ key:'sort', label:SORT_LABELS[state.sort] });
  }
  if (state.locationOnly) pills.push({ key:'location', label:`Region: ${state.userRegion || 'detecting…'}` });
  if (state.adultOnly)    pills.push({ key:'adult', label:'NSFW on' });

  els.pills.innerHTML = pills.map(p => `
    <span class="pill" data-key="${p.key}">
      ${escapeHtml(p.label)}
      <button type="button" aria-label="Remove filter">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
      </button>
    </span>`).join('');

  // Clear-all lives on the pills row, only when there's something to clear
  if (pills.length > 0) {
    els.pills.insertAdjacentHTML('beforeend', `
      <button type="button" class="pill-clear" data-action="clear-all">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        Clear all
      </button>`);
  }
}

function clearOnePill(key) {
  if (key === 'type') setType('all');
  else if (key.startsWith('service:')) {
    const v = key.split(':')[1];
    const cb = qs(`#services-panel input[type="checkbox"][value="${v}"]`);
    if (cb) { cb.checked = false; }
    syncServicesFromUI();
  }
  else if (key === 'year')     { setYearRange(0, new Date().getFullYear()); }
  else if (key === 'rating')   { setRatingRange(0, 10); }
  else if (key === 'sort')     { setSort(DEFAULT_SORT); }
  else if (key === 'language') { setLanguage(''); }
  else if (key === 'location') { els.locationOnly.checked = false; state.locationOnly = false; }
  else if (key === 'adult')    { els.adultOnly.checked = false; state.adultOnly = false; }
  onFilterChange();
}

/* Every filter chip presents the same three surfaces: an optional radio group,
   the current value shown in its summary, and an "active" outline once it
   differs from the default. Six call sites used to spell this out by hand
   (and would throw if a selector ever missed). */
function syncChip(chip, { radios, value, label, active }) {
  if (radios) qsa(`input[name="${radios}"]`).forEach(r => { r.checked = (r.value === value); });
  const valueEl = qs(`[data-value-for="${chip}"]`);
  if (valueEl) valueEl.textContent = label;
  const chipEl = qs(`.chip[data-chip="${chip}"]`);
  if (chipEl) chipEl.classList.toggle('chip-active', active);
}

function setType(t) {
  state.type = t;
  syncChip('type', { radios:'media-type', value:t, label:TYPE_LABELS[t], active:t !== 'all' });
  document.body.classList.toggle('is-anime', t === 'anime');
}

function setSort(s) {
  state.sort = s;
  syncChip('sort', { radios:'sort-by', value:s, label:SORT_LABELS[s] || 'Popularity', active:s !== DEFAULT_SORT });
}

function setLanguage(code) {
  state.language = code || '';
  const label = state.language ? (LANG_NAME_MAP[state.language] || state.language.toUpperCase()) : 'Any';
  syncChip('language', { radios:'lang', value:state.language, label, active:!!state.language });
}

function setYearRange(min, max) {
  state.yearMin = min; state.yearMax = max;
  els.yearMin.value = yearToSlider(min);
  els.yearMax.value = yearToSlider(max);
  syncYearDisplay();
}
function syncYearDisplay() {
  const cy = new Date().getFullYear();
  els.yearMinVal.textContent = state.yearMin === 0 ? 'All' : state.yearMin;
  els.yearMaxVal.textContent = state.yearMax >= cy ? 'Now' : state.yearMax;
  const txt = (state.yearMin === 0 && state.yearMax >= cy) ? 'Any' :
              `${state.yearMin === 0 ? '...' : state.yearMin}–${state.yearMax >= cy ? 'Now' : state.yearMax}`;
  syncChip('year', { label: txt, active: txt !== 'Any' });
}

function setRatingRange(min, max) {
  state.ratingMin = min; state.ratingMax = max;
  els.ratingMin.value = min;
  els.ratingMax.value = max;
  syncRatingDisplay();
}
function syncRatingDisplay() {
  els.ratingMinVal.textContent = state.ratingMin.toFixed(1).replace(/\.0$/,'');
  els.ratingMaxVal.textContent = state.ratingMax.toFixed(1).replace(/\.0$/,'');
  const txt = (state.ratingMin === 0 && state.ratingMax === 10) ? '0–10'
            : `${state.ratingMin}–${state.ratingMax}`;
  syncChip('rating', { label: '★ ' + txt, active: state.ratingMin > 0 || state.ratingMax < 10 });
}

function syncServicesFromUI() {
  const checks = qsa('#services-panel input[type="checkbox"]');
  const checked = checks.filter(c => c.checked);
  state.serviceVals = checked.map(c => c.value);
  state.servicesAll = checked.length === 0;
  els.serviceAll.checked = state.servicesAll;
  const label = state.servicesAll ? 'All'
    : checked.length === 1 ? (SERVICES.find(s => s.v === state.serviceVals[0])?.name || '1 selected')
    : `${checked.length} selected`;
  syncChip('services', { label, active: !state.servicesAll });
}


/* ---------- 9. CHIPS UI + filter wiring ---------- */
function buildServiceCheckboxes() {
  const html = SERVICES.map(s => `
    <label class="opt">
      <input type="checkbox" value="${s.v}"${s.p ? ` data-providers="${s.p}"` : ''}>
      <span>${s.name}</span>
    </label>`).join('');
  els.servicesPanel.insertAdjacentHTML('beforeend', html);
}

function buildLanguageRadios() {
  if (!els.languagePanel) return;
  const html = LANGUAGES.map(l => `
    <label class="opt">
      <input type="radio" name="lang" value="${l.v}">
      <span>${l.name}</span>
      <em class="opt-tag">${l.v.toUpperCase()}</em>
    </label>`).join('');
  els.languagePanel.insertAdjacentHTML('beforeend', html);
}

function wireFilters() {
  // Type radios
  qsa('input[name="media-type"]').forEach(r => r.addEventListener('change', () => {
    setType(r.value);
    onFilterChange();
  }));
  // Sort radios
  qsa('input[name="sort-by"]').forEach(r => r.addEventListener('change', () => {
    setSort(r.value);
    onFilterChange();
  }));
  // Language radios (delegated - radios injected by JS after init)
  if (els.languagePanel) {
    els.languagePanel.addEventListener('change', (e) => {
      if (e.target.matches('input[name="lang"]')) {
        setLanguage(e.target.value);
        onFilterChange();
      }
    });
  }
  /* Both range chips behave identically: whichever thumb was dragged past the
     other gets pinned to it, the pair is mirrored into state, the label
     updates live on `input`, and only `change` (drag release) refetches.
     `apply` is the one thing that differs — year goes through the segmented
     slider scale, rating is read straight off the input. */
  const wireRange = (minEl, maxEl, resetEl, apply, reset) => {
    const onInput = (moved) => {
      const lo = Number(minEl.value), hi = Number(maxEl.value);
      if (lo > hi) { if (moved === minEl) minEl.value = hi; else maxEl.value = lo; }
      apply();
    };
    minEl.addEventListener('input', () => onInput(minEl));
    maxEl.addEventListener('input', () => onInput(maxEl));
    minEl.addEventListener('change', onFilterChange);
    maxEl.addEventListener('change', onFilterChange);
    resetEl.addEventListener('click', (e) => { e.preventDefault(); reset(); onFilterChange(); });
  };
  wireRange(els.yearMin, els.yearMax, els.yearReset, () => {
    state.yearMin = sliderToYear(els.yearMin.value);
    state.yearMax = sliderToYear(els.yearMax.value);
    syncYearDisplay();
  }, () => setYearRange(0, new Date().getFullYear()));
  wireRange(els.ratingMin, els.ratingMax, els.ratingReset, () => {
    state.ratingMin = parseFloat(els.ratingMin.value);
    state.ratingMax = parseFloat(els.ratingMax.value);
    syncRatingDisplay();
  }, () => setRatingRange(0, 10));
  // Services + "All"
  els.serviceAll.addEventListener('change', () => {
    if (els.serviceAll.checked) {
      qsa('#services-panel input[type="checkbox"]').forEach(c => c.checked = false);
      syncServicesFromUI();
      onFilterChange();
    } else {
      els.serviceAll.checked = true; // can't manually uncheck "all" - pick a service to deactivate
    }
  });
  // delegated: service checkboxes
  els.servicesPanel.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
      syncServicesFromUI();
      onFilterChange();
    }
  });
  // Toggle chips
  els.locationOnly.addEventListener('change', () => {
    state.locationOnly = els.locationOnly.checked;
    if (state.locationOnly && !state.userRegion) {
      els.regionDisplay.textContent = '…';
      fetchCountry().then(c => { state.userRegion = c; els.regionDisplay.textContent = c; onFilterChange(); });
    } else {
      els.regionDisplay.textContent = state.userRegion || '-';
      onFilterChange();
    }
  });
  els.adultOnly.addEventListener('change', () => {
    state.adultOnly = els.adultOnly.checked;
    onFilterChange();
  });

  // Clear all filters (pills-row button)
  function doClearAll() {
    setType('all');
    setSort(DEFAULT_SORT);
    setYearRange(0, new Date().getFullYear());
    setRatingRange(0, 10);
    qsa('#services-panel input[type="checkbox"]').forEach(c => c.checked = false);
    syncServicesFromUI();
    setLanguage('');
    els.locationOnly.checked = false; state.locationOnly = false;
    els.adultOnly.checked = false; state.adultOnly = false;
    onFilterChange();
  }

  // Pills click → remove single pill, or clear-all
  els.pills.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear-all"]')) { doClearAll(); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    const pill = btn.closest('.pill');
    if (pill) clearOnePill(pill.dataset.key);
  });

  // Only one chip dropdown open at a time; position the (fixed) panel under the summary.
  // Avoid the read-after-write forced reflow Lighthouse logged (149ms): batch
  // all reads (getBoundingClientRect + offsetWidth) BEFORE any style writes.
  const positionPanel = (d) => {
    const summary = d.querySelector('summary');
    const panel = d.querySelector('.chip-panel');
    if (!summary || !panel) return;
    // Reads first (all in one frame, no intermediate writes)
    const r  = summary.getBoundingClientRect();
    const pw = panel.offsetWidth || 240;
    const vw = window.innerWidth;
    let left = r.left;
    if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
    // Writes second (single style update)
    panel.style.left = `${left}px`;
    panel.style.top  = `${r.bottom + 8}px`;
  };
  const chips = qsa('.chip[data-chip]');
  const closeAllChips = () => chips.forEach(d => { d.open = false; });
  /* A fixed panel can't follow its trigger, so it closes on scroll/resize.
     These listeners only exist while a panel is actually open — previously
     they ran a document-wide querySelectorAll on every scroll event for the
     whole session, which is pure cost on a page built around scrolling. */
  const watchDismiss = (on) => {
    const fn = on ? addEventListener : removeEventListener;
    fn.call(window, 'scroll', closeAllChips, { passive: true });
    fn.call(window, 'resize', closeAllChips);
  };
  chips.forEach(d => {
    d.addEventListener('toggle', () => {
      if (d.open) {
        chips.forEach(o => { if (o !== d) o.open = false; });
        positionPanel(d);
      }
      watchDismiss(chips.some(c => c.open));
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.chip[data-chip]') && !e.target.closest('.chip-panel')) closeAllChips();
  });

  // Scroll arrows
  els.scrollL.addEventListener('click', () => els.chipRail.scrollBy({ left: -240, behavior:'smooth' }));
  els.scrollR.addEventListener('click', () => els.chipRail.scrollBy({ left:  240, behavior:'smooth' }));
  /* scrollWidth/clientWidth force layout, so coalesce to one read per frame
     instead of one per scroll event — the rail fires these in bursts while
     the user drags it. */
  let arrowsQueued = false;
  const updateArrows = () => {
    if (arrowsQueued) return;
    arrowsQueued = true;
    requestAnimationFrame(() => {
      arrowsQueued = false;
      const sl = els.chipRail.scrollLeft;
      const max = els.chipRail.scrollWidth - els.chipRail.clientWidth - 4;
      els.scrollL.toggleAttribute('disabled', sl <= 0);
      els.scrollR.toggleAttribute('disabled', sl >= max);
    });
  };
  els.chipRail.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  setTimeout(updateArrows, 50);

  // Search input - debounce the clear-button toggle + empty-search-trigger so
  // the input handler returns immediately (was a 686ms INP offender in
  // Lighthouse). Keystroke latency stays sub-frame; the clear-icon and
  // empty-query reset run on idle.
  let searchInputTimer = null;
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (searchInputTimer) { clearTimeout(searchInputTimer); searchInputTimer = null; }
    runQueryChange(els.searchInput.value.trim());
  });
  els.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (searchInputTimer) clearTimeout(searchInputTimer);
    searchInputTimer = setTimeout(() => {
      searchInputTimer = null;
      els.clearBtn.classList.toggle('visible', !!val);
      if (val === '' && state.query !== '') runQueryChange('');
    }, 120);
  });
  els.clearBtn.addEventListener('click', () => {
    els.searchInput.value = '';
    els.clearBtn.classList.remove('visible');
    runQueryChange('');
    els.searchInput.focus();
  });
}

function runQueryChange(q) {
  if (q === state.query) return;
  state.query = q;
  state.page  = 1;
  state.exhausted = false;
  document.body.classList.toggle('is-searching', !!q);
  // close any open dropdowns
  qsa('.chip[data-chip][open]').forEach(d => d.open = false);
  els.grid.innerHTML = '';
  updatePills();
  fetchMedia(false);
}

function onFilterChange() {
  state.page = 1;
  state.exhausted = false;
  els.grid.innerHTML = '';
  updatePills();
  savePrefs();
  fetchMedia(false);
}

export {
  updatePills, clearOnePill, syncChip, setType, setSort, setLanguage, setYearRange,
  syncYearDisplay, setRatingRange, syncRatingDisplay, syncServicesFromUI,
  buildServiceCheckboxes, buildLanguageRadios, wireFilters, runQueryChange,
  onFilterChange
};
