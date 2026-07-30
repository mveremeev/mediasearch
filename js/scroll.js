import { fetchMedia } from './api.js';
import { state } from './state.js';

/* ---------- 14. INFINITE SCROLL ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    if (!state.autoLoad) return;     // gated - Load More button handles it instead
    if (state.loading || state.exhausted) return;
    /* Was `cache.length === 0`, meaning "initial load not done yet". That also
       froze paging whenever a client-side filter emptied the grid while TMDB
       still had pages left, leaving no way to reach the later matches. */
    if (!state.hasFetched) return;
    state.page++;
    fetchMedia(true);
  });
}, { rootMargin: '600px 0px' });

export {
  io
};
