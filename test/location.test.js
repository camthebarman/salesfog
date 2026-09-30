import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLocation, addressFromText, parseMapsUrl, contactPageLinks } from '../lib/location.js';
import { distanceMeters, kindLabel } from '../lib/nearby.js';

test('reads address and coordinates from JSON-LD', async () => {
  const html = `<script type="application/ld+json">{"@type":"BarOrPub","name":"X","address":{"@type":"PostalAddress",
    "streetAddress":"30 Water St","addressLocality":"New York","addressRegion":"NY","postalCode":"10004"},
    "geo":{"latitude":40.7033,"longitude":-74.0110}}</script>`;
  const loc = await extractLocation(html);
  assert.equal(loc.address, '30 Water St, New York, NY 10004');
  assert.equal(loc.lat, 40.7033);
  assert.equal(loc.lng, -74.011);
});

test('reads plain-text street addresses', () => {
  assert.equal(addressFromText('Visit us 510 Hudson St NYC 10014 Reservations'), '510 Hudson St NYC 10014');
  assert.equal(addressFromText('Find us at 124 Blagden Alley NW, Washington, DC 20001. Open late.'), '124 Blagden Alley NW, Washington, DC 20001');
  assert.equal(addressFromText('Open 7 days a week since 1999'), null);
});

test('parses Google Maps links', () => {
  assert.deepEqual(parseMapsUrl('https://www.google.com/maps/place/Foo/@40.7337,-74.0061,17z'), { address: null, lat: 40.7337, lng: -74.0061 });
  assert.deepEqual(parseMapsUrl('https://maps.google.com/?q=510+Hudson+St,+New+York'), { address: '510 Hudson St, New York', lat: null, lng: null });
  assert.deepEqual(parseMapsUrl('https://www.google.com/maps/place/Employees+Only/'), { address: 'Employees Only', lat: null, lng: null });
});

test('finds contact pages on the same site', () => {
  const html = '<a href="/menu">Menu</a><a href="/contact-us">Contact</a><a href="https://instagram.com/x">Visit our IG</a>';
  assert.deepEqual(contactPageLinks(html, 'https://bar.com/'), ['https://bar.com/contact-us']);
});

test('distance and labels', () => {
  const d = distanceMeters(40.7033, -74.011, 40.7337, -74.0061);
  assert.ok(d > 3300 && d < 3500, `got ${d}`);
  assert.equal(kindLabel({ amenity: 'bar', cocktails: 'yes' }), 'Cocktail bar');
  assert.equal(kindLabel({ amenity: 'restaurant', cuisine: 'italian;pizza' }), 'Restaurant (italian)');
});
