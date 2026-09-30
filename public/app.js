import {
  parseScript, objectionList, renderBody, placeholdersIn, escapeHtml, SAMPLE_SCRIPT,
} from './script-engine.js';

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
  const btn = $('start-btn');
  btn.disabled = true;
  $('analyze-status').textContent = 'Reading their website…';
  $('analyze-status').classList.remove('error');

  let analysis;
  try {
    const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`);
    analysis = await res.json();
    if (!res.ok) throw new Error(analysis.error || `HTTP ${res.status}`);
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
  startCall(prospect, analysis);
});

function startCall(prospect, analysis) {
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
  };
  $('nav-call').hidden = false;
  renderCallHeader();
  renderObjectionButtons();
  renderStep();
  showView('call');
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

$('industry-select').addEventListener('change', (e) => {
  call.industryId = e.target.value;
  renderStep();
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
  try {
    profiles = await (await fetch('/api/profiles')).json();
  } catch {
    profiles = [{ id: 'generic', label: 'General business', vocab: { customers: 'customers', customer: 'customer', venue: 'business', team: 'team', offering: 'offering', visit: 'visit' } }];
  }
  $('industry-ids').innerHTML = profiles.map((p) => `<code>${p.id}</code>`).join(' ');
  showView('setup');
}
boot();
