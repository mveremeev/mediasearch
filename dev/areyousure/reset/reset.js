/* /dev/areyousure/reset — nuke every piece of state Stash has stored on this
   origin (localStorage + sessionStorage + cookies). Keys are removed
   individually so the status line can show exactly what was wiped, instead
   of a vague "done". */
(function () {
  const status = document.getElementById('status');

  let lsKeys = [];
  let ssCount = 0;
  let cookieCount = 0;
  let hadError = false;

  try {
    lsKeys = Object.keys(localStorage);
    lsKeys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { hadError = true; }
    });
  } catch (e) { hadError = true; }

  try {
    ssCount = sessionStorage.length;
    sessionStorage.clear();
  } catch (e) { hadError = true; }

  try {
    document.cookie.split(';').forEach(function (c) {
      const name = c.split('=')[0].trim();
      if (!name) return;
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      cookieCount++;
    });
  } catch (e) { hadError = true; }

  if (!status) return;
  const parts = [];
  if (lsKeys.length)    parts.push(lsKeys.length + ' localStorage key' + (lsKeys.length === 1 ? '' : 's'));
  if (ssCount)          parts.push(ssCount + ' sessionStorage key' + (ssCount === 1 ? '' : 's'));
  if (cookieCount)      parts.push(cookieCount + ' cookie' + (cookieCount === 1 ? '' : 's'));

  if (parts.length === 0) {
    status.textContent = 'Nothing to clear — storage was already empty.';
    status.classList.add('done');
  } else {
    status.textContent = 'Cleared: ' + parts.join(', ') + (lsKeys.length ? '  ·  (' + lsKeys.join(', ') + ')' : '');
    status.classList.add(hadError ? 'fail' : 'done');
  }
})();
