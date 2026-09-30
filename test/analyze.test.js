import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHtml } from '../lib/analyze.js';
import { normalizeUrl } from '../lib/fetch-site.js';

const page = (title, body, extra = '') => `<!doctype html><html><head><title>${title}</title>${extra}</head><body>${body}</body></html>`;

test('mixology bar is detected and uses "clients"', () => {
  const r = analyzeHtml(page('The Gilded Owl | Craft Cocktail Bar',
    '<h1>Mixology in the heart of downtown</h1><p>Our bartenders shake craft cocktails nightly. See the cocktail menu — negroni, mezcal, house bitters.</p>'),
  'https://gildedowl.com');
  assert.equal(r.industry.id, 'cocktail_bar');
  assert.equal(r.vocab.customers, 'clients');
  assert.equal(r.company, 'The Gilded Owl');
});

test('diner is detected and uses "regulars"', () => {
  const r = analyzeHtml(page('Rosie\'s Diner - Breakfast All Day',
    '<h1>Rosie\'s Diner</h1><p>Pancakes, waffles, hash browns and bottomless coffee since 1962. Milkshakes and burgers too.</p>'),
  'https://rosiesdiner.com');
  assert.equal(r.industry.id, 'diner');
  assert.equal(r.vocab.customers, 'regulars');
});

test('schema.org type is a strong signal', () => {
  const ld = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"Bright Smiles"}</script>';
  const r = analyzeHtml(page('Bright Smiles', '<p>Welcome to our office.</p>', ld), 'https://brightsmiles.example');
  assert.equal(r.industry.id, 'healthcare');
  assert.equal(r.vocab.customers, 'patients');
});

test('unrecognizable site falls back to generic', () => {
  const r = analyzeHtml(page('Home', '<p>Hello world.</p>'), 'https://acme-widgets.com');
  assert.equal(r.industry.id, 'generic');
  assert.equal(r.company, 'Acme Widgets');
});

test('normalizeUrl adds https and rejects other schemes', () => {
  assert.equal(normalizeUrl('example.com').href, 'https://example.com/');
  assert.throws(() => normalizeUrl('file:///etc/passwd'));
  assert.throws(() => normalizeUrl(''));
});
