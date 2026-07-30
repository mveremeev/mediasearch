import { DEFAULT_SORT } from './config.js';

/* ---------- 2. STATE + REFS ---------- */
const state = {
  page: 1,
  query: '',
  type: 'all',           // 'all' | 'movie' | 'tv' | 'anime'
  sort: DEFAULT_SORT,
  yearMin: 0,
  yearMax: new Date().getFullYear(),
  ratingMin: 0,
  ratingMax: 10,
  servicesAll: true,
  serviceVals: [],       // selected provider ids (raw, '|' splits expanded later)
  language: '',          // ISO 639-1 code or '' for any
  locationOnly: false,
  adultOnly: false,
  userRegion: '',
  allRegions: [],
  cache: [],             // current media list
  personCache: [],       // current people (search only)
  loading: false,
  exhausted: false,
  fetchFailed: false,    // last fetch failed outright (network/HTTP), vs. legitimately returning nothing
  hasFetched: false,     // a fetch has completed at least once — gates paging without requiring a non-empty grid
  autoLoad: true,        // when off, show a Load More button instead of infinite scroll
  lowData: false,        // when on, no <img> rendered anywhere; cached LowData.svg shown via CSS, autoLoad forced off
  detailOverrides: {},   // {`${mt}:${id}`: minimal item} - lets showDetail open items not in cache (e.g. from collection)
};

const $  = (id) => document.getElementById(id);
const qs = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const els = {
  searchForm:    $('search-form'),
  searchInput:   $('search-input'),
  clearBtn:      $('clear-btn'),
  themeToggle:   $('theme-toggle'),
  autoloadToggle:$('autoload-toggle'),
  lowdataToggle: $('lowdata-toggle'),
  loadMoreBtn:   $('load-more'),
  filters:       $('filters'),
  chipRail:      $('chip-rail'),
  scrollL:       $('scroll-l'),
  scrollR:       $('scroll-r'),
  pills:         $('pills'),
  yearMin:       $('year-min'),
  yearMax:       $('year-max'),
  yearMinVal:    $('year-min-val'),
  yearMaxVal:    $('year-max-val'),
  yearReset:     $('year-reset'),
  ratingMin:     $('rating-min'),
  ratingMax:     $('rating-max'),
  ratingMinVal:  $('rating-min-val'),
  ratingMaxVal:  $('rating-max-val'),
  ratingReset:   $('rating-reset'),
  serviceAll:    $('service-all'),
  servicesPanel: $('services-panel'),
  languagePanel: $('language-panel'),
  locationOnly:  $('location-only'),
  adultOnly:     $('adult-only'),
  regionDisplay: $('region-display'),
  sectionTitle:  $('section-title'),
  sectionMeta:   $('section-meta'),
  peopleStrip:   $('people-strip'),
  peopleGrid:    $('people-grid'),
  seeMorePeople: $('see-more-people'),
  gridSubTitle:  $('grid-sub-title'),
  grid:          $('grid'),
  gridStatus:    $('grid-status'),
  sentinel:      $('sentinel'),
  // overlays
  detailOverlay:    $('detail-overlay'),
  detailClose:      $('detail-close'),
  detailBackdropImg:$('detail-backdrop-img'),
  detailBackdropWrap:$('detail-backdrop-wrap'),
  detailPoster:     $('detail-poster'),
  detailPosterWrap: $('detail-poster-wrap'),
  detailTitle:      $('detail-title'),
  detailMeta:       $('detail-meta'),
  detailLangs:      $('detail-langs'),
  detailOverview:   $('detail-overview'),
  detailActions:    $('detail-actions'),
  detailCollectionActions: $('detail-collection-actions'),
  detailCast:       $('detail-cast'),
  seeMoreCast:      $('see-more-cast'),
  regionRow:        $('region-row'),
  detailProviders:  $('detail-providers'),
  actorOverlay:     $('actor-overlay'),
  actorClose:       $('actor-close'),
  actorContent:     $('actor-content'),
  castGridOverlay:  $('cast-grid-overlay'),
  castGridClose:    $('cast-grid-close'),
  castGridContent:  $('cast-grid-content'),
  infoOverlay:      $('info-overlay'),
  infoClose:        $('info-close'),
  infoContent:      $('info-content'),
  copySlugBtn:      $('copy-slug-btn'),
  copyIdBtn:        $('copy-id-btn'),
  adblockOverlay:   $('adblock-overlay'),
  adblockClose:     $('adblock-close'),
  adblockContinue:  $('adblock-continue'),
  adblockDontShow:  $('adblock-dont-show'),
  adblockHaveIt:    $('adblock-have-it'),
  collectionBtn:    $('collection-btn'),
  collectionCount:  $('collection-count'),
  collectionOverlay:$('collection-overlay'),
  collectionClose:  $('collection-close'),
  collectionTabs:   $('collection-tabs'),
  collectionStatus: $('collection-status'),
  collectionBody:   $('collection-body'),
  collectionImport: $('collection-import'),
  collectionExport: $('collection-export'),
  collectionImportInput: $('collection-import-input'),
};

export {
  state, $, qs, qsa, els
};
