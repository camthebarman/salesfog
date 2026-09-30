import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, objectionList, renderBody, SAMPLE_SCRIPT } from '../public/script-engine.js';

const ctx = (industryId, customers, customer, extra = {}) => ({
  industryId,
  vocab: { customers, customer, venue: 'spot' },
  autoAdapt: true,
  vars: { prospect: 'Jordan Lee', first_name: 'Jordan', company: 'Rosie\'s' },
  ...extra,
});

test('parses steps and objection sections', () => {
  const p = parseScript(SAMPLE_SCRIPT);
  assert.deepEqual(p.steps.map((s) => s.title), ['Opener', 'Why I\'m calling', 'Discovery', 'Pitch', 'Close']);
  assert.deepEqual(Object.keys(p.objections).sort(),
    ['competitor', 'custom_send_me_an_email', 'not_interested', 'not_right_time']);
});

test('script without headings splits on paragraphs', () => {
  const p = parseScript('Hello {{prospect}}.\n\nSecond part.\n\n\nThird.');
  assert.equal(p.steps.length, 3);
});

test('built-in objections always exist, falling back to defaults', () => {
  const list = objectionList(parseScript('# Hi\nhello'));
  assert.deepEqual(list.map((o) => o.label), ['Not interested', 'Not the right time', 'Already using a competitor']);
  assert.ok(list.every((o) => o.body && !o.fromScript));
});

test('fills placeholders and preserves capitalization', () => {
  const html = renderBody('Hi {{first_name}}, how are your {{customers}}? {{Customers}} matter.', ctx('diner', 'regulars', 'regular'));
  assert.match(html, /Jordan/);
  assert.match(html, />regulars</);
  assert.match(html, />Regulars</);
});

test('auto-adapt swaps generic words per industry', () => {
  const body = 'We help you keep customers happy. Every customer counts.';
  const diner = renderBody(body, ctx('diner', 'regulars', 'regular'));
  const bar = renderBody(body, ctx('cocktail_bar', 'clients', 'client'));
  assert.match(diner, /keep <mark[^>]*>regulars<\/mark>/);
  assert.match(diner, /Every <mark[^>]*>regular<\/mark>/);
  assert.match(bar, /keep <mark[^>]*>clients<\/mark>/);
  const off = renderBody(body, ctx('diner', 'regulars', 'regular', { autoAdapt: false }));
  assert.doesNotMatch(off, /regulars/);
});

test('industry-tagged lines are filtered', () => {
  const body = '[diner] Diner line\n[cocktail_bar, brewery_pub] Bar line\n[!diner] Not diner\nAlways';
  const diner = renderBody(body, ctx('diner', 'regulars', 'regular'));
  assert.match(diner, /Diner line/);
  assert.doesNotMatch(diner, /Bar line|Not diner/);
  const bar = renderBody(body, ctx('cocktail_bar', 'clients', 'client'));
  assert.match(bar, /Bar line/);
  assert.match(bar, /Not diner/);
  assert.doesNotMatch(bar, /Diner line/);
});

test('escapes HTML from scripts and values', () => {
  const html = renderBody('<img src=x onerror=alert(1)> {{company}}', ctx('generic', 'customers', 'customer', {
    vars: { company: '<b>x</b>' },
  }));
  assert.doesNotMatch(html, /<img|<b>/);
});

test('rep notes and bullets render', () => {
  const html = renderBody('> pause here\n- one\n- two', ctx('generic', 'customers', 'customer'));
  assert.match(html, /class="rep-note">pause here/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
});
