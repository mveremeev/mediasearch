import { state } from './state.js';

/* ---------- 4. PREFS (localStorage) ---------- */
const PREFS_KEY = 'msearch-prefs-v2';
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      type: state.type,
      sort: state.sort,
      yearMin: state.yearMin,
      yearMax: state.yearMax,
      ratingMin: state.ratingMin,
      ratingMax: state.ratingMax,
      servicesAll: state.servicesAll,
      serviceVals: state.serviceVals,
      language: state.language,
      locationOnly: state.locationOnly,
      adultOnly: state.adultOnly,
      autoLoad: state.autoLoad,
      lowData: state.lowData,
    }));
  } catch {}
}
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export {
  PREFS_KEY, savePrefs, loadPrefs
};
