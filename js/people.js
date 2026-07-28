import { API_KEY, TMDB } from './config.js';
import { showOverlay } from './overlays.js';
import { attachImageLoaders, renderPerson } from './render.js';
import { els } from './state.js';
import { dateOf, yearOf } from './fields.js';
import { escapeAttr, escapeHtml, loadingHtml, noteHtml, posterImg, profileImg, tmdbJson } from './util.js';

/* ---------- 11. ACTOR OVERLAY ---------- */
const ACTOR_CREDITS_MAX = 18;
let actorToken = 0;
function showActor(personId) {
  const token = ++actorToken;
  els.actorContent.innerHTML = loadingHtml('Loading…', true);
  showOverlay(els.actorOverlay);
  Promise.all([
    tmdbJson(`${TMDB}/person/${personId}?api_key=${API_KEY}`),
    tmdbJson(`${TMDB}/person/${personId}/movie_credits?api_key=${API_KEY}`),
    tmdbJson(`${TMDB}/person/${personId}/tv_credits?api_key=${API_KEY}`),
  ]).then(([p, mc, tc]) => {
    if (token !== actorToken) return;
    const movies = (mc.cast || []).slice(0, ACTOR_CREDITS_MAX);
    const tvs    = (tc.cast || []).slice(0, ACTOR_CREDITS_MAX);
    const creditCard = (c, mt, idx = 0) => {
      const title = (mt === 'movie' ? c.title : c.name) || '';
      const date  = dateOf(c);
      const year  = yearOf(date);
      const posterPath = c.poster_path || '';
      return `
        <article class="credit-card" data-id="${c.id}" data-type="${mt}"
          data-title="${escapeAttr(title)}" data-date="${escapeAttr(date)}" data-poster="${escapeAttr(posterPath)}"
          tabindex="0" role="button" style="--i:${Math.min(idx, 24)}">
          <div class="credit-poster">
            ${posterImg(posterPath, title)}
          </div>
          <div class="credit-info">
            <div class="credit-title" title="${escapeAttr(title)}">${escapeHtml(title)}</div>
            ${year !== '-' ? `<div class="credit-year">${escapeHtml(year)}</div>` : ''}
          </div>
        </article>`;
    };
    els.actorContent.innerHTML = `
      <div class="actor-header">
        <div class="actor-photo-lg">${profileImg(p.profile_path, p.name||'')}</div>
        <div>
          <div class="actor-name">${escapeHtml(p.name||'')}</div>
          ${p.known_for_department ? `<div class="actor-known-for">Known for ${escapeHtml(p.known_for_department)}</div>` : ''}
        </div>
      </div>
      ${movies.length ? `<div class="actor-section"><h4>Movies</h4><div class="credit-grid">${movies.map((c,i)=>creditCard(c,'movie',i)).join('')}</div></div>` : ''}
      ${tvs.length ? `<div class="actor-section"><h4>TV</h4><div class="credit-grid">${tvs.map((c,i)=>creditCard(c,'tv',i)).join('')}</div></div>` : ''}
    `;
    attachImageLoaders(els.actorContent);
  }).catch(() => {
    if (token === actorToken) els.actorContent.innerHTML = noteHtml('Could not load person.', true);
  });
}


/* ---------- 12. CAST GRID ---------- */
function showCastGrid(list, withRole) {
  const html = list.map((p, i) => renderPerson(p, withRole ? p.character : '', i)).join('');
  els.castGridContent.innerHTML = `
    <h3>${withRole ? 'Cast &amp; crew' : 'People'}</h3>
    <div class="people-grid">${html}</div>
  `;
  attachImageLoaders(els.castGridContent);
  showOverlay(els.castGridOverlay);
}

export {
  ACTOR_CREDITS_MAX, actorToken, showActor, showCastGrid
};
