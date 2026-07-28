import { VPN_LIST } from './config.js';
import { showOverlay } from './overlays.js';
import { els } from './state.js';
import { escapeHtml } from './util.js';

/* ---------- 13. INFO OVERLAY ---------- */
function showInfoOverlay(regions) {
  const regionsTxt = regions && regions.length ? regions.sort().join(', ') : '-';
  const vpns = VPN_LIST.map(v => `<a href="${v.url}" target="_blank" rel="noopener">${v.name}</a>`).join('');
  els.infoContent.innerHTML = `
    <h3>Available in</h3>
    <p>${escapeHtml(regionsTxt)}</p>
    <p class="muted">Streaming options vary country-to-country.</p>
    <h3>Top VPNs</h3>
    <div class="vpn-list">${vpns}</div>
  `;
  showOverlay(els.infoOverlay);
}

export {
  showInfoOverlay
};
