import { clearCurrentDetail } from './detail.js';
import { els, qs, qsa } from './state.js';

/* ---------- Overlay helpers ---------- */
function showOverlay(el) {
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function hideOverlay(el) {
  el.classList.remove('active');
  el.setAttribute('aria-hidden', 'true');
  // restore scroll only if no overlay still active
  if (!qs('.overlay.active')) document.body.style.overflow = '';
}
/* Single teardown path so the close button, a backdrop click and Escape can
   never drift apart. Detail also drops currentDetail, otherwise a later
   collection:change would keep re-rendering a row nobody is looking at. */
function closeOverlay(el) {
  hideOverlay(el);
  if (el === els.detailOverlay) clearCurrentDetail();
}
/* Wire the two ways every overlay closes itself. */
function wireOverlay(overlay, closeBtn) {
  if (closeBtn) closeBtn.addEventListener('click', () => closeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(overlay); });
}
/* Escape closes the top-most overlay only, so stacked popups unwind one at a
   time. Reads the same --overlay-z scale the stylesheet defines, so a new
   overlay participates just by having a z-index. */
function closeTopOverlay() {
  const open = qsa('.overlay.active');
  if (!open.length) return;
  const zOf = (el) => Number(getComputedStyle(el).zIndex) || 0;
  closeOverlay(open.reduce((top, el) => zOf(el) >= zOf(top) ? el : top));
}

export {
  showOverlay, hideOverlay, closeOverlay, wireOverlay, closeTopOverlay
};
