import { PROFILES, GENERIC } from './industries.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', rsquo: '’', lsquo: '‘', mdash: '—', ndash: '–' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function clean(s) {
  return decodeEntities(s || '').replace(/\s+/g, ' ').trim();
}

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]+${attr}\\s*=\\s*["']${name}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return '';
  return clean(tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i)?.slice(1).find(Boolean));
}

function schemaTypes(html) {
  const types = [];
  const blocks = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of blocks) {
    for (const m of json.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)) {
      try {
        const v = JSON.parse(m[1]);
        types.push(...(Array.isArray(v) ? v : [v]));
      } catch { /* ignore malformed JSON-LD */ }
    }
  }
  return types.filter((t) => typeof t === 'string');
}

// Pull the useful bits out of a raw HTML page.
export function extractPage(html) {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = metaContent(html, 'name', 'description') || metaContent(html, 'property', 'og:description');
  const siteName = metaContent(html, 'property', 'og:site_name');
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => clean(m[1].replace(/<[^>]+>/g, ' ')))
    .filter(Boolean)
    .slice(0, 10);
  const text = clean(
    html
      .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).slice(0, 200_000);
  return { title, description, siteName, headings, text, schemaTypes: schemaTypes(html) };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countHits(haystack, phrase) {
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}(?=$|[^\\p{L}\\p{N}])`, 'giu');
  return (haystack.match(re) || []).length;
}

// Score every profile against the page. Title/description/headings count
// extra because they describe what the business *is* rather than what it
// mentions in passing.
// Generic schema.org types that hint at a category without pinning it down
// (e.g. cocktail bars often mark themselves up as FoodEstablishment).
const WEAK_SCHEMA_TYPES = new Set(['FoodEstablishment', 'LocalBusiness', 'Store']);

export function classify(page, hostname = '') {
  const host = hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '');
  const prominent = [page.title, page.siteName, page.description, ...page.headings].join(' | ').toLowerCase();
  const body = page.text.toLowerCase();

  const results = PROFILES.map((profile) => {
    let score = 0;
    const matched = [];
    for (const [phrase, weight = 1] of profile.keywords) {
      const inBody = Math.min(countHits(body, phrase), 4);
      const inProminent = Math.min(countHits(prominent, phrase), 2);
      if (inBody || inProminent) {
        score += weight * (inBody + inProminent * 3);
        matched.push(phrase);
      }
      // "silverdiner.com", "bluestarcafe.com": the domain itself is a hint.
      const compact = phrase.replace(/[^a-z0-9]/g, '');
      if (compact.length >= 4 && host.includes(compact)) {
        score += weight * 3;
        if (!matched.includes(phrase)) matched.push(phrase);
        matched.push(`domain “${hostname.replace(/^www\./, '')}”`);
      }
    }
    const schemaHit = page.schemaTypes.find((t) => profile.schemaTypes.includes(t));
    if (schemaHit) {
      score += WEAK_SCHEMA_TYPES.has(schemaHit) ? 6 : 25;
      matched.unshift(`schema.org ${schemaHit}`);
    }
    return { profile, score, matched };
  }).sort((a, b) => b.score - a.score);

  const [best, second] = results;
  if (!best || best.score < 6) {
    return { profile: GENERIC, confidence: 0, matched: [], ranking: results.slice(0, 3) };
  }
  const confidence = Math.round(100 * (best.score / (best.score + (second?.score || 0) + 5)));
  return { profile: best.profile, confidence, matched: best.matched, ranking: results.slice(0, 3) };
}

// Best guess at the business's display name.
export function companyName(page, url) {
  if (page.siteName) return page.siteName;
  if (page.title) {
    // "Home | The Blue Door Diner" / "The Blue Door — Craft Cocktails"
    const parts = page.title.split(/\s[|–—\-·:]\s/).map((s) => s.trim()).filter(Boolean);
    const generic = /^(home|welcome|homepage|official site|index)$/i;
    const candidate = parts.find((p) => !generic.test(p) && p.length <= 60);
    if (candidate) return candidate;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
    return host.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return '';
  }
}

// POS systems leave fingerprints in a venue's site: online-ordering links,
// gift-card widgets, embedded scripts. Searched in the raw HTML, not the text.
const POS_SIGNATURES = [
  ['Toast', /toasttab\.com|toast-?pos/gi],
  ['Square', /squareup\.com|\.square\.site|square online ordering/gi],
  ['Clover', /clover\.com|cloverdining/gi],
  ['Lightspeed', /lightspeedhq\.|lightspeed restaurant|order\.online\.lightspeed|upserve\.com/gi],
  ['SpotOn', /spoton\.com|order\.spoton/gi],
  ['TouchBistro', /touchbistro/gi],
  ['Revel', /revelsystems|revelup\.com/gi],
  ['SkyTab', /skytab|shift4\.com/gi],
  ['Aloha', /alohaonlineordering|ncr\.com\/restaurants|ncrvoyix/gi],
  ['Heartland', /heartlandpaymentsystems|heartland restaurant/gi],
  ['Owner.com', /owner\.com/gi],
];

export function detectPos(html) {
  let best = null;
  for (const [name, re] of POS_SIGNATURES) {
    const hits = (html.match(re) || []).length;
    if (hits && (!best || hits > best.hits)) best = { name, hits };
  }
  return best ? best.name : null;
}

export function analyzeHtml(html, url) {
  const page = extractPage(html);
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch { /* keep empty */ }
  const { profile, confidence, matched, ranking } = classify(page, hostname);
  return {
    url,
    company: companyName(page, url),
    title: page.title,
    description: page.description,
    industry: { id: profile.id, label: profile.label, confidence },
    vocab: profile.vocab,
    pos: detectPos(html),
    signals: [...new Set(matched)].slice(0, 8),
    alternatives: ranking
      .filter((r) => r.profile.id !== profile.id && r.score > 0)
      .map((r) => ({ id: r.profile.id, label: r.profile.label })),
  };
}
