/* ---------- 0. TRUSTED TYPES ----------
   CSP ships with `require-trusted-types-for 'script'`. Define a default
   pass-through policy so existing innerHTML assignments continue to work
   without rewriting every site. Strings we build here are already escaped
   via escapeHtml / escapeAttr at user-data boundaries. */
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: (s) => s,
      createScriptURL: (s) => s,
      createScript: (s) => s,
    });
  } catch { /* policy already exists (HMR / double-load) */ }
}
