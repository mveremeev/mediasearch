import { API_KEY, TMDB } from './config.js';
import { state } from './state.js';
import { tmdbJson } from './util.js';

/* ---------- 5. GEOLOCATION ---------- */
/* IANA timezone → ISO country code, used as a network-free fallback for fetchCountry().
   Not exhaustive - extend as needed. Common timezones for ~50 countries. */
const TZ_TO_COUNTRY = {
  'Asia/Dubai':'AE','Asia/Qatar':'QA','Asia/Riyadh':'SA','Asia/Kuwait':'KW','Asia/Bahrain':'BH',
  'Asia/Tokyo':'JP','Asia/Seoul':'KR','Asia/Hong_Kong':'HK','Asia/Singapore':'SG','Asia/Bangkok':'TH',
  'Asia/Manila':'PH','Asia/Jakarta':'ID','Asia/Kuala_Lumpur':'MY','Asia/Taipei':'TW','Asia/Shanghai':'CN',
  'Asia/Kolkata':'IN','Asia/Karachi':'PK','Asia/Dhaka':'BD','Asia/Tehran':'IR','Asia/Tel_Aviv':'IL','Asia/Jerusalem':'IL',
  'Europe/London':'GB','Europe/Dublin':'IE','Europe/Paris':'FR','Europe/Berlin':'DE','Europe/Madrid':'ES',
  'Europe/Rome':'IT','Europe/Amsterdam':'NL','Europe/Brussels':'BE','Europe/Vienna':'AT','Europe/Zurich':'CH',
  'Europe/Stockholm':'SE','Europe/Oslo':'NO','Europe/Copenhagen':'DK','Europe/Helsinki':'FI','Europe/Warsaw':'PL',
  'Europe/Prague':'CZ','Europe/Budapest':'HU','Europe/Athens':'GR','Europe/Lisbon':'PT','Europe/Bucharest':'RO',
  'Europe/Moscow':'RU','Europe/Istanbul':'TR','Europe/Kiev':'UA','Europe/Kyiv':'UA',
  'America/New_York':'US','America/Detroit':'US','America/Chicago':'US','America/Denver':'US',
  'America/Phoenix':'US','America/Los_Angeles':'US','America/Anchorage':'US','Pacific/Honolulu':'US',
  'America/Toronto':'CA','America/Vancouver':'CA','America/Edmonton':'CA','America/Halifax':'CA',
  'America/Mexico_City':'MX','America/Sao_Paulo':'BR','America/Buenos_Aires':'AR','America/Argentina/Buenos_Aires':'AR',
  'America/Santiago':'CL','America/Bogota':'CO','America/Lima':'PE',
  'Australia/Sydney':'AU','Australia/Melbourne':'AU','Australia/Brisbane':'AU','Australia/Perth':'AU','Australia/Adelaide':'AU',
  'Pacific/Auckland':'NZ',
  'Africa/Cairo':'EG','Africa/Johannesburg':'ZA','Africa/Lagos':'NG','Africa/Nairobi':'KE','Africa/Casablanca':'MA',
};
function timezoneCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TZ_TO_COUNTRY[tz] || null;
  } catch { return null; }
}
function fetchCountry() {
  const ok = (c) => { if (!c) throw new Error('empty'); return String(c).trim().toUpperCase(); };
  // Cloudflare trace first - worked reliably on Chrome in user testing
  const t1 = () => fetch('https://www.cloudflare.com/cdn-cgi/trace').then(r=>r.text()).then(t=>ok(t.match(/loc=([A-Z]{2})/)?.[1]));
  const t2 = () => fetch('https://ipwho.is/').then(r=>r.json()).then(d=>ok(d.country_code));
  const t3 = () => fetch('https://api.country.is/').then(r=>r.json()).then(d=>ok(d.country));
  // Network-free fallback - Firefox often blocks all three above due to CORS
  const tz = () => Promise.resolve(timezoneCountry()).then(ok);
  return t1().catch(()=>t2()).catch(()=>t3()).catch(()=>tz()).catch(() => 'US');
}
function fetchRegions() {
  if (state.allRegions.length) return Promise.resolve(state.allRegions);
  return tmdbJson(`${TMDB}/watch/providers/regions?api_key=${API_KEY}`)
    .then(d => { state.allRegions = d.results || []; return state.allRegions; })
    .catch(() => []);
}

export {
  TZ_TO_COUNTRY, timezoneCountry, fetchCountry, fetchRegions
};
