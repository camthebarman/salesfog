// Finds where a business is: pulls an address or coordinates out of its
// website, then geocodes with OpenStreetMap's Nominatim.
//
// Runs in Node (server.js) and in the browser (the static GitHub Pages
// build). Anything that needs to fetch a third-party page is passed in.

const IS_NODE = typeof window === 'undefined';
const ENV = globalThis.process?.env || {};
const NOMINATIM = ENV.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
// Browsers send their own User-Agent/Referer, and custom headers would
// trigger a CORS preflight, so only the server identifies itself.
export const HEADERS = IS_NODE ? { 'user-agent': 'SalesfogBot/1.0 (+https://github.com/camthebarman/salesfog)' } : {};

// ---------- extraction ----------

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function validCoords(lat, lng) {
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function formatPostal(a) {
  if (!a) return '';
  if (typeof a === 'string') return a.trim();
  const region = [a.addressRegion, a.postalCode].filter(Boolean).join(' ');
  return [a.streetAddress, a.addressLocality, region, typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

// Walk every JSON-LD object looking for an address / geo pair.
function fromJsonLd(html) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const address = formatPostal(node.address);
    const lat = num(node.geo?.latitude);
    const lng = num(node.geo?.longitude);
    if ((address && /\d/.test(address)) || validCoords(lat, lng)) {
      found.push({ address: address || null, lat: validCoords(lat, lng) ? lat : null, lng: validCoords(lat, lng) ? lng : null });
    }
    Object.values(node).forEach(walk);
  };
  for (const [, json] of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(json.trim())); } catch { /* malformed JSON-LD */ }
  }
  // Prefer entries that have a street address and coordinates.
  found.sort((a, b) => (b.address ? 1 : 0) + (b.lat !== null ? 1 : 0) - ((a.address ? 1 : 0) + (a.lat !== null ? 1 : 0)));
  return found[0] ? { ...found[0], source: 'structured data' } : null;
}

function fromMeta(html) {
  const meta = (name) => html.match(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    || html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["']`, 'i'))?.[1];
  const pos = meta('geo.position') || meta('ICBM');
  if (pos) {
    const [lat, lng] = pos.split(/[;,]/).map(num);
    if (validCoords(lat, lng)) return { address: null, lat, lng, source: 'page metadata' };
  }
  const lat = num(meta('place:location:latitude'));
  const lng = num(meta('place:location:longitude'));
  if (validCoords(lat, lng)) return { address: null, lat, lng, source: 'page metadata' };
  const street = meta('business:contact_data:street_address');
  if (street) {
    const address = [street, meta('business:contact_data:locality'), meta('business:contact_data:region'), meta('business:contact_data:postal_code')]
      .filter(Boolean).join(', ');
    return { address, lat: null, lng: null, source: 'page metadata' };
  }
  return null;
}

const MAPS_LINK = /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com)[^"'\s<>]*/gi;

export function parseMapsUrl(raw) {
  const href = raw.replace(/&amp;/g, '&');
  let m = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    || href.match(/[?&](?:ll|sll|q|query|daddr|destination|center)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (m && validCoords(num(m[1]), num(m[2]))) return { address: null, lat: num(m[1]), lng: num(m[2]) };
  let url;
  try { url = new URL(href); } catch { return null; }
  const q = url.searchParams.get('q') || url.searchParams.get('query') || url.searchParams.get('daddr')
    || url.searchParams.get('destination') || url.searchParams.get('address');
  if (q && q.trim().length > 3) return { address: q.trim(), lat: null, lng: null };
  m = url.pathname.match(/\/maps\/(?:place|search|dir)\/([^/@]+)/);
  if (m) {
    const text = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
    if (text.length > 3) return { address: text, lat: null, lng: null };
  }
  return null;
}

// expandLink(url) -> final URL after redirects, for maps.app.goo.gl short
// links. Optional; without it short links are skipped.
async function fromMapsLinks(html, expandLink) {
  const links = [...new Set(html.match(MAPS_LINK) || [])].slice(0, 4);
  // Links carrying coordinates beat ones carrying a name.
  let best = null;
  for (const link of links) {
    const isShort = /goo\.gl/i.test(link);
    if (isShort && !expandLink) continue;
    const parsed = parseMapsUrl(isShort ? (await expandLink(link).catch(() => null)) || link : link);
    if (!parsed) continue;
    if (parsed.lat !== null) return { ...parsed, source: 'Google Maps link' };
    best ||= { ...parsed, source: 'Google Maps link' };
  }
  return best;
}

const SUFFIX = 'St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Sq|Square|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Alley|Row|Plaza|Pike|Broadway';
const STREET_RE = new RegExp(
  `(?<street>\\b\\d{1,5}[A-Za-z]?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z0-9][\\w'.-]*\\s+){0,4}(?:${SUFFIX})\\b\\.?`
  + '(?:\\s*(?:NW|NE|SW|SE|N|S|E|W)\\b\\.?)?'
  + '(?:,?\\s*(?:Suite|Ste|Unit|#|Floor|Fl)\\.?\\s*[\\w-]+)?)'
  + "(?<city>,?\\s+[A-Z][A-Za-z.'-]*(?:\\s+[A-Z][A-Za-z.'-]*){0,2})?"
  + '(?<state>,?\\s+[A-Z]{2}\\b\\.?)?'
  + '(?<zip>,?\\s+\\d{5}(?:-\\d{4})?\\b)?',
  'g',
);

// Plain-text street addresses, e.g. "510 Hudson St NYC 10014".
export function addressFromText(text) {
  const candidates = [...text.matchAll(STREET_RE)].map((m) => {
    const { street, city = '', state = '', zip = '' } = m.groups;
    // Without a state or ZIP, what follows the street is probably not a city.
    const full = state || zip ? street + city + state + zip : street;
    return { text: full.trim().replace(/[,\s]+$/, ''), score: (zip ? 3 : 0) + (state ? 1 : 0) + (city ? 0.5 : 0) };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.text || null;
}

function visibleText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

export async function extractLocation(html, { expandLink } = {}) {
  const text = visibleText(html);
  const textAddress = addressFromText(text);
  const candidates = [fromJsonLd(html), fromMeta(html)];
  const structured = candidates.find((c) => c && c.lat !== null) || candidates.find(Boolean);
  if (structured) return structured;
  if (textAddress) return { address: textAddress, lat: null, lng: null, source: 'website text' };
  return fromMapsLinks(html, expandLink);
}

// Links to the pages where venues usually list their address.
export function contactPageLinks(html, baseUrl) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = `${m[1]} ${m[2].replace(/<[^>]+>/g, ' ')}`.toLowerCase();
    if (!/contact|visit|location|find[- ]us|directions|hours|about|info/.test(label)) continue;
    try {
      const url = new URL(m[1].replace(/&amp;/g, '&'), baseUrl);
      if (url.hostname === new URL(baseUrl).hostname && !out.includes(url.href) && url.href !== baseUrl) out.push(url.href);
    } catch { /* bad href */ }
  }
  // "contact" and "visit" pages are the most likely to have the address.
  return out.sort((a, b) => (/contact|visit|location|find/.test(b) ? 1 : 0) - (/contact|visit|location|find/.test(a) ? 1 : 0)).slice(0, 2);
}

// ---------- geocoding ----------

// Nominatim's usage policy allows at most one request per second.
let nominatimQueue = Promise.resolve();
export function nominatim(path, params) {
  const url = `${NOMINATIM}/${path}?${new URLSearchParams({ format: 'jsonv2', 'accept-language': 'en', ...params })}`;
  const attempt = async () => {
    const res = await fetch(url, { headers: IS_NODE ? { ...HEADERS, 'accept-language': 'en' } : {}, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Map lookup failed (HTTP ${res.status}).`);
    return res.json();
  };
  // The public server occasionally drops a request; one retry smooths that over.
  const run = nominatimQueue.then(() => attempt().catch(() => new Promise((r) => setTimeout(r, 1500)).then(attempt)));
  nominatimQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

export async function geocode(query) {
  const results = await nominatim('search', { q: query, limit: '1', addressdetails: '1' });
  const r = results[0];
  if (!r) return null;
  return { lat: Number(r.lat), lng: Number(r.lon), display: r.display_name, city: cityOf(r.address) };
}

export async function reverseGeocode(lat, lng) {
  const r = await nominatim('reverse', { lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' });
  if (!r || r.error) return null;
  return { display: shortAddress(r.address) || r.display_name, city: cityOf(r.address) };
}

function cityOf(a = {}) {
  return a.city || a.town || a.village || a.suburb || a.borough || a.county || '';
}

export function shortAddress(a = {}) {
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  return [street, cityOf(a), a.state].filter(Boolean).join(', ');
}

// Last resort: look the business up on the map by name.
async function lookupByName(company, hint = '') {
  const results = await nominatim('search', { q: [company, hint].filter(Boolean).join(', '), limit: '5', addressdetails: '1' });
  const venue = results.find((r) => ['amenity', 'shop', 'leisure', 'tourism', 'office', 'craft', 'healthcare'].includes(r.category));
  if (!venue) return null;
  return {
    address: shortAddress(venue.address) || venue.display_name,
    lat: Number(venue.lat),
    lng: Number(venue.lon),
    city: cityOf(venue.address),
    source: 'map search by name',
    approximate: true,
  };
}

// Full pipeline: homepage -> contact pages -> map search by name.
// fetchPage(url) -> { url, html } is used for contact pages.
export async function locateBusiness({ html, url, company, fetchPage, expandLink }) {
  let found = html ? await extractLocation(html, { expandLink }) : null;
  if (html && fetchPage && (!found || (found.lat === null && !found.address))) {
    for (const link of contactPageLinks(html, url)) {
      try {
        const page = await fetchPage(link);
        found = await extractLocation(page.html, { expandLink });
        if (found) { found.source += ' (contact page)'; break; }
      } catch { /* try the next page */ }
    }
  }

  if (found && found.lat === null && found.address) {
    const g = await geocode(found.address).catch(() => null);
    if (g) return { ...found, lat: g.lat, lng: g.lng, city: g.city };
    // The site's address text may be messy; try it with the company name.
    const byName = await lookupByName(company, found.address.split(',').slice(-2).join(',')).catch(() => null);
    return byName || { ...found, city: '' };
  }
  if (found && found.lat !== null) {
    if (!found.address) {
      const r = await reverseGeocode(found.lat, found.lng).catch(() => null);
      return { ...found, address: r?.display || null, city: r?.city || '' };
    }
    return { ...found, city: found.city || '' };
  }
  return company ? lookupByName(company).catch(() => null) : null;
}
