import {
  parseScript, objectionList, renderBody, placeholdersIn, escapeHtml, SAMPLE_SCRIPT, TZ_SCRIPT,
} from './script-engine.js';
import * as backend from './client-api.js';

const $ = (id) => document.getElementById(id);

// ---------- storage ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`salesfog:${key}`)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`salesfog:${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

let scripts = store.get('scripts', null);
if (!Array.isArray(scripts) || !scripts.length) {
  scripts = [{ id: crypto.randomUUID(), name: 'Sample: restaurant loyalty', text: SAMPLE_SCRIPT }];
}
if (!store.get('seeded:tz', false)) {
  const tz = { id: crypto.randomUUID(), name: 'TZ: BitBar referral', text: TZ_SCRIPT };
  scripts.unshift(tz);
  store.set('activeScript', tz.id);
  store.set('seeded:tz', true);
  store.set('scripts', scripts);
}
let activeScriptId = store.get('activeScript', scripts[0].id);
if (!scripts.some((s) => s.id === activeScriptId)) activeScriptId = scripts[0].id;

let profiles = [];
let call = null; // the call in progress

// ---------- views ----------
function showView(name) {
  $('view-setup').hidden = name !== 'setup';
  $('view-call').hidden = name !== 'call';
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- script library ----------
function activeScript() {
  return scripts.find((s) => s.id === activeScriptId);
}

// Placeholders the app fills in by itself; anything else in a script
// becomes a field the rep fills in before (or during) the call.
const AUTO_VARS = new Set(['prospect', 'first_name', 'company', 'website', 'industry', 'my_name', 'my_company',
  'address', 'city', 'customers', 'customer', 'venue', 'team', 'offering', 'visit']);
const FIELD_HINTS = {
  pos: { label: 'POS system', placeholder: 'Detected from their website if left blank' },
};
// Fields like {{local_bar}} are filled with the nearest similar business.
const isNearbyField = (key) => /^(local|nearby)_/.test(key);
const NEARBY_HINT = 'Leave blank to use the nearest similar place';

function scriptFields(text) {
  return placeholdersIn(text).filter((k) => !AUTO_VARS.has(k));
}

function fieldLabel(key) {
  return FIELD_HINTS[key]?.label || key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function renderFieldInputs(container, keys, values, placeholders = {}) {
  container.innerHTML = keys.map((k) => `
    <label>${escapeHtml(fieldLabel(k))}
      <input type="text" data-field="${k}" value="${escapeHtml(values[k] || '')}"
        placeholder="${escapeHtml(placeholders[k] ?? FIELD_HINTS[k]?.placeholder ?? (isNearbyField(k) ? NEARBY_HINT : ''))}" autocomplete="off">
    </label>`).join('');
  container.hidden = !keys.length;
}

function renderSetupFields() {
  const keys = scriptFields(activeScript().text);
  const prev = Object.fromEntries([...$('script-fields').querySelectorAll('[data-field]')].map((i) => [i.dataset.field, i.value]));
  renderFieldInputs($('script-fields'), keys, prev);
}

function saveScripts() {
  store.set('scripts', scripts);
  store.set('activeScript', activeScriptId);
}

function renderScriptPicker() {
  $('script-select').innerHTML = scripts
    .map((s) => `<option value="${s.id}" ${s.id === activeScriptId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
    .join('');
  const s = activeScript();
  $('script-name').value = s.name;
  $('script-text').value = s.text;
  updateScriptStatus();
  renderSetupFields();
}

function updateScriptStatus() {
  const parsed = parseScript($('script-text').value);
  const custom = Object.keys(parsed.objections).length;
  $('script-status').textContent = `${parsed.steps.length} step${parsed.steps.length === 1 ? '' : 's'}`
    + ` · ${custom} objection rebuttal${custom === 1 ? '' : 's'} · saved`;
}

function addScript(name, text) {
  const s = { id: crypto.randomUUID(), name, text };
  scripts.push(s);
  activeScriptId = s.id;
  saveScripts();
  renderScriptPicker();
}

$('script-select').addEventListener('change', (e) => {
  activeScriptId = e.target.value;
  saveScripts();
  renderScriptPicker();
});

let saveTimer;
function onScriptEdit() {
  const s = activeScript();
  s.name = $('script-name').value.trim() || 'Untitled script';
  s.text = $('script-text').value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveScripts();
    const opt = $('script-select').selectedOptions[0];
    if (opt) opt.textContent = s.name;
    updateScriptStatus();
    renderSetupFields();
  }, 300);
}
$('script-text').addEventListener('input', onScriptEdit);
$('script-name').addEventListener('input', onScriptEdit);

$('script-new').addEventListener('click', () => addScript('Untitled script', '# Opener\nHi {{first_name}}, this is {{my_name}} from {{my_company}}.\n'));
$('script-delete').addEventListener('click', () => {
  const s = activeScript();
  if (!confirm(`Delete “${s.name}”?`)) return;
  scripts = scripts.filter((x) => x.id !== s.id);
  if (!scripts.length) scripts.push({ id: crypto.randomUUID(), name: 'Sample: restaurant loyalty', text: SAMPLE_SCRIPT });
  activeScriptId = scripts[0].id;
  saveScripts();
  renderScriptPicker();
});

async function loadFile(file) {
  if (!file) return;
  if (file.size > 1_000_000) return alert('That file is too large for a script (max 1 MB).');
  const text = await file.text();
  addScript(file.name.replace(/\.(txt|md|markdown)$/i, ''), text);
}
$('script-file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
$('script-text').addEventListener('dragover', (e) => e.preventDefault());
$('script-text').addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});

// ---------- rep details ----------
const rep = store.get('rep', { name: '', company: '' });
$('my-name').value = rep.name;
$('my-company').value = rep.company;
['my-name', 'my-company'].forEach((id) => $(id).addEventListener('input', () => {
  store.set('rep', { name: $('my-name').value.trim(), company: $('my-company').value.trim() });
}));

// ---------- start a call ----------
$('call-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('company-url').value.trim();
  const prospect = $('prospect-name').value.trim();
  const fields = Object.fromEntries([...$('script-fields').querySelectorAll('[data-field]')]
    .map((i) => [i.dataset.field, i.value.trim()]));
  const btn = $('start-btn');
  btn.disabled = true;
  $('analyze-status').textContent = 'Reading their website…';
  $('analyze-status').classList.remove('error');

  let analysis;
  try {
    analysis = await backend.analyze(url);
    $('analyze-status').textContent = '';
  } catch (err) {
    // Still let the rep make the call; they can pick the industry by hand.
    analysis = {
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      company: url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split(/[/.]/)[0],
      industry: { id: 'generic', label: 'General business', confidence: 0 },
      vocab: profiles.find((p) => p.id === 'generic')?.vocab || {},
      signals: [],
      error: err.message,
    };
    $('analyze-status').textContent = `Couldn't read the site (${err.message}). Starting anyway — pick the industry manually.`;
    $('analyze-status').classList.add('error');
  } finally {
    btn.disabled = false;
  }
  startCall(prospect, analysis, fields);
});

function startCall(prospect, analysis, fields) {
  const script = activeScript();
  const parsed = parseScript(script.text);
  if (!parsed.steps.length) {
    alert('Your script is empty. Add at least one step first.');
    return;
  }
  call = {
    startedAt: Date.now(),
    prospect,
    analysis,
    industryId: analysis.industry.id,
    scriptName: script.name,
    parsed,
    objections: objectionList(parsed),
    step: 0,
    visited: new Set([0]),
    objectionLog: [],
    activeObjection: null,
    fields,
    id: crypto.randomUUID(),
    location: null, // { address, lat, lng, city, source }
    nearby: null, // { noun, places, source } | { loading } | { error }
    nearbyPick: '', // auto-picked nearest place, used when the rep left the field blank
  };
  $('nav-call').hidden = false;
  renderCallHeader();
  renderCallFields();
  renderObjectionButtons();
  renderStep();
  showView('call');
  locateProspect();
}

function currentVocab() {
  return profiles.find((p) => p.id === call.industryId)?.vocab || call.analysis.vocab || {};
}

function renderContext() {
  const profile = profiles.find((p) => p.id === call.industryId);
  const r = store.get('rep', {});
  return {
    industryId: call.industryId,
    vocab: currentVocab(),
    autoAdapt: $('auto-adapt').checked,
    vars: {
      prospect: call.prospect,
      first_name: call.prospect.split(/\s+/)[0],
      company: call.analysis.company,
      website: call.analysis.url,
      industry: (profile?.label || call.analysis.industry.label).toLowerCase(),
      my_name: r.name,
      my_company: r.company,
      pos: call.analysis.pos || '',
      address: call.location?.address || '',
      city: call.location?.city || '',
      ...Object.fromEntries(nearbyFields().map((k) => [k, call.nearbyPick])),
      ...Object.fromEntries(Object.entries(call.fields).filter(([, v]) => v)),
    },
  };
}

function renderCallHeader() {
  const a = call.analysis;
  $('call-prospect').textContent = call.prospect;
  $('call-company-link').textContent = a.company || a.url;
  $('call-company-link').href = a.url;
  $('industry-select').innerHTML = profiles
    .map((p) => `<option value="${p.id}" ${p.id === call.industryId ? 'selected' : ''}>${escapeHtml(p.label)}</option>`)
    .join('');
  const sig = $('industry-signals');
  if (a.error) {
    sig.textContent = 'Site could not be read — choose manually.';
  } else if (a.industry.id === 'generic') {
    sig.textContent = 'No strong industry signals found.';
  } else {
    sig.innerHTML = `Detected (${a.industry.confidence}% sure) from: ${a.signals.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join(' ')}`;
  }
}

function renderCallFields() {
  const keys = scriptFields(call.parsed.steps.map((st) => st.body).join('\n')
    + call.objections.map((o) => o.body).join('\n'));
  const placeholders = { pos: call.analysis.pos ? `Detected: ${call.analysis.pos}` : 'Not found on their website' };
  for (const k of keys.filter(isNearbyField)) {
    placeholders[k] = call.nearbyPick ? `Nearest: ${call.nearbyPick}` : 'Pick from nearby places below';
  }
  renderFieldInputs($('call-fields'), keys, call.fields, placeholders);
}

function callScriptText() {
  return call.parsed.steps.map((st) => st.body).join('\n') + call.objections.map((o) => o.body).join('\n');
}
function nearbyFields() {
  return scriptFields(callScriptText()).filter(isNearbyField);
}

// ---------- prospect location + nearby similar places ----------
async function locateProspect() {
  const { id } = call;
  call.location = { loading: true };
  renderLocation();
  try {
    const loc = await backend.locate(call.analysis.url, call.analysis.company || '');
    if (call?.id !== id) return;
    call.location = loc;
  } catch (err) {
    if (call?.id !== id) return;
    call.location = { error: err.message, address: err.body?.address || '' };
  }
  renderLocation();
  renderStep();
  loadNearby();
}

async function loadNearby() {
  const { id, location } = call;
  if (!location || location.lat == null) {
    call.nearby = null;
    return renderNearby();
  }
  call.nearby = { loading: true };
  renderNearby();
  try {
    const result = await backend.nearby({
      lat: location.lat, lng: location.lng, industry: call.industryId, exclude: call.analysis.company || '',
    });
    if (call?.id !== id) return;
    call.nearby = result;
    call.nearbyPick = result.places[0]?.name || '';
    // A place picked from the previous list no longer applies to a new area.
    for (const k of nearbyFields()) {
      if (call.fields[k] && call.fields[k] === call.pickedFromList) call.fields[k] = '';
    }
  } catch (err) {
    if (call?.id !== id) return;
    call.nearby = { error: err.message };
  }
  renderNearby();
  renderCallFields();
  renderStep();
}

function renderLocation() {
  const loc = call.location;
  const el = $('call-location');
  if (!loc) { el.innerHTML = ''; return; }
  if (loc.loading) { el.innerHTML = '<span class="muted">Finding their address…</span>'; return; }
  const edit = `<button class="btn link small" id="loc-edit">${loc.error ? 'Enter address' : 'Change'}</button>`;
  el.innerHTML = loc.error
    ? `<span class="error">${escapeHtml(loc.error)}</span> ${edit}`
    : `📍 ${escapeHtml(loc.address || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`)}
       <span class="muted small">· from ${escapeHtml(loc.source)}${loc.approximate ? ' (approximate)' : ''}</span> ${edit}`;
}

$('call-location').addEventListener('click', (e) => {
  if (e.target.id !== 'loc-edit') return;
  const current = call.location?.address || '';
  $('call-location').innerHTML = `
    <form id="loc-form" class="row">
      <input type="text" id="loc-input" value="${escapeHtml(current)}" placeholder="Street, city" autocomplete="off">
      <button class="btn secondary small" type="submit">Look up</button>
      <button class="btn link small" type="button" id="loc-cancel">Cancel</button>
    </form>`;
  $('loc-input').focus();
});
$('call-location').addEventListener('click', (e) => {
  if (e.target.id === 'loc-cancel') renderLocation();
});
$('call-location').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('loc-input').value.trim();
  if (!q) return;
  const { id } = call;
  call.location = { loading: true };
  renderLocation();
  try {
    const loc = await backend.geocodeAddress(q);
    if (call?.id !== id) return;
    call.location = loc;
  } catch (err) {
    if (call?.id !== id) return;
    call.location = { error: err.message, address: q };
  }
  renderLocation();
  renderStep();
  loadNearby();
});

const useMiles = /-(US|GB|LR|MM)$/i.test(navigator.language || '');
function formatDistance(m) {
  if (useMiles) {
    const mi = m / 1609.34;
    return mi < 0.1 ? `${Math.round(m * 3.281)} ft` : `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
  }
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function renderNearby() {
  const el = $('nearby');
  const n = call.nearby;
  el.hidden = !n;
  if (!n) return;
  if (n.loading) { el.innerHTML = '<div class="muted small">Finding similar places nearby…</div>'; return; }
  if (n.error) { el.innerHTML = `<div class="error small">Nearby search failed: ${escapeHtml(n.error)}</div>`; return; }
  const fields = nearbyFields();
  const chosen = fields.length ? (call.fields[fields[0]] || call.nearbyPick) : '';
  el.innerHTML = `
    <div class="nearby-head">
      <strong>Nearby ${escapeHtml(n.noun)}</strong>
      <span class="muted small">${fields.length ? `click one to use it for {{${escapeHtml(fields[0])}}}` : ''} · ${escapeHtml(n.source)}</span>
    </div>
    ${n.places.length ? `<ul class="nearby-list">${n.places.map((p, i) => `
      <li class="${p.name === chosen ? 'chosen' : ''}">
        <button data-place="${i}" ${fields.length ? '' : 'disabled'}>
          <span class="place-name">${escapeHtml(p.name)}</span>
          <span class="muted small">${escapeHtml(p.kind)} · ${formatDistance(p.distanceM)}${p.address ? ` · ${escapeHtml(p.address)}` : ''}</span>
        </button>
        <a class="small" target="_blank" rel="noopener" title="Open in Google Maps"
          href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address || ''}`)}">map</a>
      </li>`).join('')}</ul>` : '<div class="muted small">No similar places found nearby.</div>'}`;
}

$('nearby').addEventListener('click', (e) => {
  const b = e.target.closest('[data-place]');
  if (!b) return;
  const place = call.nearby.places[Number(b.dataset.place)];
  for (const k of nearbyFields()) call.fields[k] = place.name;
  call.pickedFromList = place.name;
  renderCallFields();
  renderNearby();
  renderStep();
});
$('call-fields').addEventListener('input', (e) => {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  call.fields[input.dataset.field] = input.value.trim();
  if (isNearbyField(input.dataset.field)) renderNearby();
  renderStep();
});

$('industry-select').addEventListener('change', (e) => {
  call.industryId = e.target.value;
  renderStep();
  loadNearby();
});
$('auto-adapt').addEventListener('change', () => call && renderStep());

function renderStep() {
  const ctx = renderContext();
  const { steps } = call.parsed;
  const step = steps[call.step];
  $('step-meta').textContent = `Step ${call.step + 1} of ${steps.length} · ${call.scriptName}`;
  $('step-title').textContent = step.title;
  $('step-body').innerHTML = renderBody(step.body, ctx) || '<p class="muted">(empty step)</p>';

  $('step-list').innerHTML = steps.map((s, i) => `
    <li class="${i === call.step ? 'current' : ''} ${call.visited.has(i) ? 'visited' : ''}">
      <button data-step="${i}">${escapeHtml(s.title)}</button>
    </li>`).join('');

  $('prev-btn').disabled = call.step === 0;
  $('next-btn').textContent = call.step === steps.length - 1 ? 'Finish call' : 'Next →';

  if (call.activeObjection) showRebuttal(call.activeObjection);

  const missing = placeholdersIn(step.body).filter((k) => ctx.vars[k] === '');
  if (missing.includes('my_name') || missing.includes('my_company')) {
    $('step-meta').textContent += ' · tip: fill in your name/company on the Setup page';
  }
}

$('step-list').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-step]');
  if (b) goTo(Number(b.dataset.step));
});

function goTo(i) {
  const n = call.parsed.steps.length;
  if (i < 0) return;
  if (i >= n) return openEndDialog();
  call.step = i;
  call.visited.add(i);
  hideRebuttal();
  renderStep();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('prev-btn').addEventListener('click', () => goTo(call.step - 1));
$('next-btn').addEventListener('click', () => goTo(call.step + 1));

// ---------- objections ----------
function renderObjectionButtons() {
  $('objection-buttons').innerHTML = call.objections.map((o, i) => `
    <button class="btn objection" data-objection="${o.key}" title="${i < 9 ? `Shortcut: ${i + 1}` : ''}">
      ${i < 9 ? `<kbd>${i + 1}</kbd>` : ''} ${escapeHtml(o.label)}
    </button>`).join('');
}

$('objection-buttons').addEventListener('click', (e) => {
  const b = e.target.closest('[data-objection]');
  if (b) triggerObjection(b.dataset.objection);
});

function triggerObjection(key) {
  const o = call.objections.find((x) => x.key === key);
  if (!o) return;
  call.activeObjection = key;
  call.objectionLog.push({ key, label: o.label, step: call.parsed.steps[call.step].title });
  showRebuttal(key);
}

function showRebuttal(key) {
  const o = call.objections.find((x) => x.key === key);
  $('rebuttal-title').textContent = `“${o.label}”`;
  $('rebuttal-body').innerHTML = renderBody(o.body, renderContext());
  $('rebuttal').hidden = false;
  $('step-body').classList.add('dimmed');
  document.querySelectorAll('[data-objection]').forEach((b) => b.classList.toggle('active', b.dataset.objection === key));
  $('rebuttal').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideRebuttal() {
  call.activeObjection = null;
  $('rebuttal').hidden = true;
  $('step-body').classList.remove('dimmed');
  document.querySelectorAll('[data-objection]').forEach((b) => b.classList.remove('active'));
}
$('rebuttal-back').addEventListener('click', hideRebuttal);
$('rebuttal-lost').addEventListener('click', () => {
  openEndDialog('Not interested');
});

// ---------- end call ----------
function openEndDialog(outcome = 'Meeting booked') {
  document.querySelector(`input[name="outcome"][value="${outcome}"]`).checked = true;
  $('end-notes').value = '';
  $('end-dialog').showModal();
}
$('end-call-btn').addEventListener('click', () => openEndDialog());

$('end-dialog').addEventListener('close', () => {
  if ($('end-dialog').returnValue !== 'save' || !call) return;
  const history = store.get('history', []);
  history.unshift({
    at: Date.now(),
    prospect: call.prospect,
    company: call.analysis.company,
    url: call.analysis.url,
    industry: profiles.find((p) => p.id === call.industryId)?.label || '',
    objections: call.objectionLog.map((o) => o.label),
    outcome: document.querySelector('input[name="outcome"]:checked').value,
    notes: $('end-notes').value.trim(),
    durationSec: Math.round((Date.now() - call.startedAt) / 1000),
  });
  store.set('history', history.slice(0, 200));
  call = null;
  $('nav-call').hidden = true;
  $('call-form').reset();
  $('my-name').value = store.get('rep', {}).name || '';
  $('my-company').value = store.get('rep', {}).company || '';
  $('analyze-status').textContent = '';
  renderHistory();
  showView('setup');
});

function renderHistory() {
  const history = store.get('history', []);
  $('history-card').hidden = !history.length;
  $('history-body').innerHTML = history.slice(0, 25).map((h) => `
    <tr>
      <td>${escapeHtml(new Date(h.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}</td>
      <td>${escapeHtml(h.prospect)}</td>
      <td>${escapeHtml(h.company || '')}</td>
      <td>${escapeHtml(h.industry)}</td>
      <td>${h.objections.length ? escapeHtml(h.objections.join(', ')) : '—'}</td>
      <td><span class="outcome" data-outcome="${escapeHtml(h.outcome)}">${escapeHtml(h.outcome)}</span>${h.notes ? `<div class="muted small">${escapeHtml(h.notes)}</div>` : ''}</td>
    </tr>`).join('');
}
$('history-clear').addEventListener('click', () => {
  if (!confirm('Clear all call history?')) return;
  store.set('history', []);
  renderHistory();
});

// ---------- keyboard shortcuts during a call ----------
document.addEventListener('keydown', (e) => {
  if (!call || $('view-call').hidden || $('end-dialog').open) return;
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') goTo(call.step + 1);
  else if (e.key === 'ArrowLeft') goTo(call.step - 1);
  else if (e.key === 'Escape') hideRebuttal();
  else if (/^[1-9]$/.test(e.key) && call.objections[Number(e.key) - 1]) triggerObjection(call.objections[Number(e.key) - 1].key);
  else return;
  e.preventDefault();
});

// ---------- boot ----------
async function boot() {
  renderScriptPicker();
  renderHistory();
  profiles = await backend.init();
  if (backend.mode === 'static') {
    $('proxy-settings').hidden = false;
    $('proxy-url').value = backend.getProxy();
    $('proxy-url').addEventListener('change', (e) => backend.setProxy(e.target.value));
  }
  $('industry-ids').innerHTML = profiles.map((p) => `<code>${p.id}</code>`).join(' ');
  showView('setup');
}
boot();
