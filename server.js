import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSite, expandLink } from './lib/fetch-site.js';
import { analyzeHtml } from './lib/analyze.js';
import { publicProfiles } from './lib/industries.js';
import { locateBusiness, geocode } from './lib/location.js';
import { findNearby } from './lib/nearby.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

// Pages fetched by /api/analyze, reused by /api/locate right after.
const pageCache = new Map();
async function getPage(url) {
  const hit = pageCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.page;
  const page = await fetchSite(url);
  pageCache.set(url, { at: Date.now(), page });
  pageCache.set(page.url, { at: Date.now(), page });
  if (pageCache.size > 100) pageCache.delete(pageCache.keys().next().value);
  return page;
}

function errorMessage(err, fallback) {
  if (err.name === 'TimeoutError') return 'The site took too long to respond.';
  if (err.code === 'ENOTFOUND') return 'Could not find that domain.';
  return err.message || fallback;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const LIB_DIR = path.join(path.dirname(PUBLIC_DIR), 'lib');

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  // The browser shares lib/ with the server (public/ imports ../lib/*.js).
  const [root, relPath] = rel.startsWith('lib/') ? [LIB_DIR, rel.slice(4)] : [PUBLIC_DIR, rel];
  const file = path.join(root, relPath);
  if (!file.startsWith(root + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/profiles') return sendJson(res, 200, publicProfiles());

  if (pathname === '/api/analyze') {
    try {
      const { url, html } = await getPage(searchParams.get('url'));
      return sendJson(res, 200, analyzeHtml(html, url));
    } catch (err) {
      return sendJson(res, 422, { error: errorMessage(err, 'Could not analyze that site.') });
    }
  }

  // Where is the prospect? Address from their site, geocoded.
  if (pathname === '/api/locate') {
    try {
      const company = searchParams.get('company') || '';
      let page = null;
      try { page = await getPage(searchParams.get('url')); } catch { /* fall back to a name search */ }
      const location = await locateBusiness({
        html: page?.html || '', url: page?.url || '', company, fetchPage: fetchSite, expandLink,
      });
      if (!location || location.lat === null) return sendJson(res, 404, { error: 'Could not find an address for this business.', address: location?.address || null });
      return sendJson(res, 200, location);
    } catch (err) {
      return sendJson(res, 502, { error: errorMessage(err, 'Address lookup failed.') });
    }
  }

  // Manually entered address -> coordinates.
  if (pathname === '/api/geocode') {
    try {
      const q = (searchParams.get('q') || '').trim();
      if (!q) return sendJson(res, 400, { error: 'Enter an address.' });
      const g = await geocode(q);
      if (!g) return sendJson(res, 404, { error: 'Could not find that address.' });
      return sendJson(res, 200, { address: q, lat: g.lat, lng: g.lng, city: g.city, source: 'the address you entered' });
    } catch (err) {
      return sendJson(res, 502, { error: errorMessage(err, 'Address lookup failed.') });
    }
  }

  // Similar businesses near a point.
  if (pathname === '/api/nearby') {
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return sendJson(res, 400, { error: 'Invalid coordinates.' });
    }
    try {
      return sendJson(res, 200, await findNearby({
        lat, lng, industryId: searchParams.get('industry') || 'generic', exclude: searchParams.get('exclude') || '',
      }));
    } catch (err) {
      return sendJson(res, 502, { error: errorMessage(err, 'Nearby search failed.') });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Salesfog running at http://localhost:${PORT}`);
});
