/* ---------- 3a. ITEM FIELD ACCESSORS ----------
   Tiny readers for the TMDB item shape. Deliberately dependency-free: config.js
   needs dateOf for its sort comparators, and everything else needs it too, so
   parking these in util.js created a config → util → state → config import
   cycle. Under ESM that cycle left `DEFAULT_SORT` in the temporal dead zone
   when state.js evaluated, throwing at load. Keep this module a leaf. */

const yearOf = (date) => (date && date.length >= 4) ? date.slice(0,4) : '-';
/* Movies carry release_date, shows first_air_date; nothing reads them apart. */
const dateOf = (item) => item.release_date || item.first_air_date || '';

export {
  yearOf, dateOf
};
