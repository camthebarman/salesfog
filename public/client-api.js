// One API for the UI, two backends:
//  - server mode: `npm start` serves /api/* (the Node server does the fetching)
//  - static mode: GitHub Pages or any static host. The same lib/ code runs in
//    the browser; prospect websites are fetched through a CORS proxy, and
//    OpenStreetMap is called directly (it allows cross-origin requests).

import { analyzeHtml } from '../lib/analyze.js';
import { publicProfiles } from '../lib/industries.js';
import { locateBusiness, geocode } from '../lib/location.js';
import { findNearby } from '../lib/nearby.js';

export let mode = 'static';

async function serverApi(path, params) {
  const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { body });
  return body;
}

export async function init() {
  try {
    const res = await fetch('/api/profiles', { signal: AbortSignal.timeout(3000) });
    if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
      mode = 'server';
      return res.json();
    }
  } catch { /* no server: static mode */ }
  mode = 'static';
  return publicProfiles();
}

// ---------- website fetching through a CORS proxy (static mode) ----------

const PROXY_KEY = 'salesfog:proxy';

export function getProxy() {
  try { return localStorage.getItem(PROXY_KEY) || ''; } catch { return ''; }
}
export function setProxy(value) {
  try { localStorage.setItem(PROXY_KEY, value.trim()); } catch { /* storage unavailable */ }
}

// Your own proxy (see proxy/cloudflare-worker.js) is tried first. The public
// ones are free but come and go.
function proxies() {
  const list = [];
  const own = getProxy();
  if (own) {
    list.push({
      name: 'your proxy',
      url: (u) => (own.includes('{url}') ? own.replace('{url}', encodeURIComponent(u))
        : `${own}${own.includes('?') ? '&' : '?'}url=${encodeURIComponent(u)}`),
      read: async (res, u) => ({ html: await res.text(), url: res.headers.get('x-final-url') || u }),
    });
  }
  list.push(
    {
      name: 'allorigins',
      url: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
      read: async (res, u) => {
        const j = await res.json();
        if (!j.contents || (j.status?.http_code && j.status.http_code >= 400)) throw new Error(`HTTP ${j.status?.http_code}`);
        return { html: j.contents, url: j.status?.url || u };
      },
    },
    {
      name: 'codetabs',
      url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
      read: async (res, u) => ({ html: await res.text(), url: u }),
    },
  );
  return list;
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter a website URL.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const url = new URL(s);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https URLs are supported.');
  return url.href;
}

const pages = new Map();

async function fetchPage(input) {
  const target = normalizeUrl(input);
  if (pages.has(target)) return pages.get(target);
  const failures = [];
  for (const p of proxies()) {
    try {
      const res = await fetch(p.url(target), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await p.read(res, target);
      if (!page.html || page.html.length < 50) throw new Error('empty response');
      pages.set(target, page);
      return page;
    } catch (err) {
      failures.push(`${p.name}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
    }
  }
  throw new Error(`Couldn't read the website through a proxy (${failures.join('; ')})`);
}

// ---------- the API the UI uses ----------

export async function analyze(url) {
  if (mode === 'server') return serverApi('analyze', { url });
  const page = await fetchPage(url);
  return analyzeHtml(page.html, page.url);
}

export async function locate(url, company) {
  if (mode === 'server') return serverApi('locate', { url, company });
  let page = null;
  try { page = await fetchPage(url); } catch { /* fall back to a name search */ }
  const location = await locateBusiness({
    html: page?.html || '',
    url: page?.url || '',
    company,
    fetchPage,
    expandLink: async (link) => (await fetchPage(link)).url,
  });
  if (!location || location.lat == null) {
    throw Object.assign(new Error('Could not find an address for this business.'), { body: { address: location?.address || null } });
  }
  return location;
}

export async function geocodeAddress(q) {
  if (mode === 'server') return serverApi('geocode', { q });
  const g = await geocode(q);
  if (!g) throw new Error('Could not find that address.');
  return { address: q, lat: g.lat, lng: g.lng, city: g.city, source: 'the address you entered' };
}

export async function nearby({ lat, lng, industry, exclude }) {
  if (mode === 'server') return serverApi('nearby', { lat, lng, industry, exclude });
  return findNearby({ lat: Number(lat), lng: Number(lng), industryId: industry, exclude });
}
