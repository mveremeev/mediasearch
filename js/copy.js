import { qs } from './state.js';

/* ---------- 13d. COPY ID ----------
   Small affordance at the bottom of the detail overlay. Copies the TMDB
   numeric ID; clipboard API with a textarea fallback for non-secure contexts. */
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
/* Both copy pills behave identically; each carries its resting label in
   data-label so this code never hard-codes the wording. */
const COPY_RESET_MS = 1600;
const copyTimers = new WeakMap();
function flashCopy(btn, text) {
  const label = qs('.copy-id-text', btn);
  if (!label) return;
  clearTimeout(copyTimers.get(btn));
  btn.classList.add('is-copied');
  label.textContent = text;
  copyTimers.set(btn, setTimeout(() => resetCopyBtn(btn), COPY_RESET_MS));
}
function resetCopyBtn(btn) {
  if (!btn) return;
  clearTimeout(copyTimers.get(btn));
  copyTimers.delete(btn);
  btn.classList.remove('is-copied');
  const label = qs('.copy-id-text', btn);
  if (label) label.textContent = btn.dataset.label || '';
}

export {
  copyTextToClipboard, COPY_RESET_MS, copyTimers, flashCopy, resetCopyBtn
};
