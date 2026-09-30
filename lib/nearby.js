// Finds similar businesses near a location using OpenStreetMap data:
// Overpass first (one query, rich tags), Nominatim as a fallback.

import { nominatim, shortAddress } from './location.js';

const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const UA = 'SalesfogBot/1.0 (+https://github.com/camthebarman/salesfog)';

// For each industry: OSM tag filters (key, regex of values), Nominatim search
// words for the fallback, and a bonus for places that are especially similar.
const SIMILAR = {
  cocktail_bar: {
    noun: 'bars',
    osm: [['amenity', 'bar|pub|nightclub']],
    words: ['bar', 'pub'],
    bonus: (t) => (t.cocktails === 'yes' || /cocktail|lounge|speakeasy|mixolog/i.test(t.name) ? 2 : 0) + (t.amenity === 'bar' ? 1 : 0),
  },
  brewery_pub: {
    noun: 'pubs and bars',
    osm: [['amenity', 'pub|bar|biergarten'], ['craft', 'brewery']],
    words: ['pub', 'bar'],
    bonus: (t) => (t.amenity === 'pub' || t.microbrewery === 'yes' || t.craft === 'brewery' ? 2 : 0),
  },
  diner: {
    noun: 'diners and restaurants',
    osm: [['amenity', 'restaurant|cafe']],
    words: ['diner', 'restaurant'],
    bonus: (t) => (/diner|breakfast|american|burger/i.test(t.cuisine || '') || /diner/i.test(t.name) ? 3 : 0),
  },
  restaurant: {
    noun: 'restaurants',
    osm: [['amenity', 'restaurant']],
    words: ['restaurant'],
    bonus: () => 0,
  },
  cafe: {
    noun: 'cafés',
    osm: [['amenity', 'cafe']],
    words: ['cafe', 'coffee'],
    bonus: (t) => (/coffee/i.test(t.cuisine || '') ? 1 : 0),
  },
  salon_spa: { noun: 'salons', osm: [['shop', 'hairdresser|beauty|massage']], words: ['hairdresser', 'beauty salon'], bonus: () => 0 },
  fitness: { noun: 'gyms', osm: [['leisure', 'fitness_centre|sports_centre']], words: ['gym', 'fitness'], bonus: () => 0 },
  healthcare: { noun: 'practices', osm: [['amenity', 'dentist|clinic|doctors']], words: ['dentist', 'clinic'], bonus: () => 0 },
  legal: { noun: 'law firms', osm: [['office', 'lawyer']], words: ['lawyer'], bonus: () => 0 },
  hotel: { noun: 'hotels', osm: [['tourism', 'hotel|guest_house|motel']], words: ['hotel'], bonus: () => 0 },
  retail: { noun: 'shops', osm: [['shop', 'clothes|boutique|gift|shoes|jewelry']], words: ['shop'], bonus: () => 0 },
  generic: {
    noun: 'bars and restaurants',
    osm: [['amenity', 'bar|pub|restaurant|cafe']],
    words: ['bar', 'restaurant'],
    bonus: () => 0,
  },
};
SIMILAR.software = SIMILAR.generic;
SIMILAR.agency = SIMILAR.generic;

export function similarityFor(industryId) {
  return SIMILAR[industryId] || SIMILAR.generic;
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const KIND_LABELS = {
  bar: 'Bar', pub: 'Pub', nightclub: 'Nightclub', biergarten: 'Beer garden', restaurant: 'Restaurant', cafe: 'Café',
  fast_food: 'Fast food', brewery: 'Brewery', hairdresser: 'Hair salon', beauty: 'Beauty salon', massage: 'Massage',
  fitness_centre: 'Gym', sports_centre: 'Sports centre', dentist: 'Dentist', clinic: 'Clinic', doctors: 'Doctor',
  lawyer: 'Law firm', hotel: 'Hotel', guest_house: 'Guest house', motel: 'Motel',
};

export function kindLabel(t) {
  if (t.cocktails === 'yes') return 'Cocktail bar';
  if (t.cuisine && /diner/i.test(t.cuisine)) return 'Diner';
  const base = KIND_LABELS[t.amenity || t.craft || t.shop || t.leisure || t.office || t.tourism] || 'Business';
  const cuisine = t.cuisine && t.amenity === 'restaurant' ? ` (${t.cuisine.split(';')[0].replace(/_/g, ' ')})` : '';
  return base + cuisine;
}

function normalizeName(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(the|bar|pub|restaurant|cafe|café|diner|nyc|inc|llc|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isSamePlace(place, exclude) {
  if (place.distanceM < 25) return true;
  const a = normalizeName(place.name);
  const b = normalizeName(exclude);
  return Boolean(a && b && (a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b))));
}

async function viaOverpass(lat, lng, radius, sim) {
  const clauses = sim.osm
    .map(([k, v]) => `nwr(around:${radius},${lat},${lng})["${k}"~"^(${v})$"]["name"];`)
    .join('');
  const query = `[out:json][timeout:15];(${clauses});out center tags 80;`;
  const res = await fetch(`${OVERPASS}?${new URLSearchParams({ data: query })}`, {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const { elements = [] } = await res.json();
  return elements.map((e) => {
    const t = e.tags || {};
    const plat = e.lat ?? e.center?.lat;
    const plng = e.lon ?? e.center?.lon;
    return {
      name: t.name,
      tags: t,
      lat: plat,
      lng: plng,
      address: [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city']].filter(Boolean).join(', '),
      website: t.website || t['contact:website'] || '',
    };
  });
}

async function viaNominatim(lat, lng, radius, sim) {
  const dLat = radius / 111_000;
  const dLng = radius / (111_000 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(5)).join(',');
  const out = [];
  for (const word of sim.words) {
    const results = await nominatim('search', {
      q: word, viewbox, bounded: '1', limit: '40', addressdetails: '1', extratags: '1',
    });
    for (const r of results) {
      if (!r.name) continue;
      const t = { ...(r.extratags || {}), name: r.name, [r.category]: r.type };
      out.push({
        name: r.name, tags: t, lat: Number(r.lat), lng: Number(r.lon), address: shortAddress(r.address), website: t.website || '',
      });
    }
  }
  return out;
}

const cache = new Map();

export async function findNearby({ lat, lng, industryId, exclude = '', limit = 8 }) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${industryId},${exclude}`;
  if (cache.has(key)) return cache.get(key);

  const sim = similarityFor(industryId);
  let source = 'OpenStreetMap (Overpass)';
  let places = [];
  for (const radius of [1200, 3500, 8000]) {
    let raw;
    try {
      raw = await viaOverpass(lat, lng, radius, sim);
    } catch {
      source = 'OpenStreetMap (Nominatim)';
      raw = await viaNominatim(lat, lng, radius, sim);
    }
    const seen = new Set();
    places = raw
      .filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ ...p, distanceM: distanceMeters(lat, lng, p.lat, p.lng) }))
      .filter((p) => p.distanceM <= radius * 1.5 && !isSamePlace(p, exclude))
      .filter((p) => {
        const k = normalizeName(p.name) || p.name;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (places.length >= 5) break;
  }

  // Closer is better; a more similar place is worth walking a bit further for.
  const ranked = places
    .map((p) => ({ ...p, similarity: sim.bonus(p.tags) }))
    .sort((a, b) => (a.distanceM - a.similarity * 250) - (b.distanceM - b.similarity * 250))
    .slice(0, limit)
    .map(({ tags, ...p }) => ({ ...p, kind: kindLabel(tags) }));

  const result = { noun: sim.noun, source, places: ranked };
  cache.set(key, result);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return result;
}
