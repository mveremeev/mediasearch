import { fetchMedia } from './api.js';
import { state } from './state.js';

/* ---------- 14. INFINITE SCROLL ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    if (!state.autoLoad) return;     // gated - Load More button handles it instead
    if (state.loading || state.exhausted) return;
    if (state.cache.length === 0) return; // initial load not done yet
    state.page++;
    fetchMedia(true);
  });
}, { rootMargin: '600px 0px' });

export {
  io
};
