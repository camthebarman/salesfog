// Parses and renders sales scripts. Pure functions only, so it runs in the
// browser and under `node --test`.
//
// Script format (plain text / Markdown-ish):
//   # Step title                 -> starts a new step
//   # Objection: Not interested  -> rebuttal shown when that objection button is hit
//   {{prospect}} {{company}} ... -> placeholders filled from the prospect + website
//   [diner, cafe] Some line      -> line only shown for those industries
//   [!diner] Some line           -> line hidden for that industry
//   > Pause and let them answer  -> note to the rep (not read aloud)
//   - bullet                     -> bullet list
//   **bold**                     -> emphasis
// A script with no headings is split into steps on blank lines.

export const BUILTIN_OBJECTIONS = [
  { key: 'not_interested', label: 'Not interested', match: /interest/i },
  { key: 'not_right_time', label: 'Not the right time', match: /\btim(e|ing)\b|busy|later|call back/i },
  { key: 'competitor', label: 'Already using a competitor', match: /competitor|already (use|using|have|work)|another (vendor|provider)/i },
];

export const DEFAULT_REBUTTALS = {
  not_interested: `Totally fair, {{first_name}} — most owners I talk to say the same thing before they've seen it.

Can I ask: is it that bringing {{customers}} back isn't a priority right now, or that you've been burned by tools like this before?

> Listen. If they give a reason, address it and return to the script. If it's a hard no, thank them and end the call.`,
  not_right_time: `Completely understand — running a {{venue}} doesn't leave a lot of free minutes.

What if we put 15 minutes on the calendar for a slower day? Would Tuesday or Wednesday morning be better?

> Lock in a specific time before hanging up.`,
  competitor: `That's great — it means you already know keeping {{customers}} coming back matters.

Out of curiosity, what do you like most about what you're using now? And if you could change one thing about it, what would it be?

> Find the gap. Don't bash the competitor.`,
};

function objectionKey(title) {
  const builtin = BUILTIN_OBJECTIONS.find((o) => o.match.test(title));
  if (builtin) return builtin.key;
  return 'custom_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function parseScript(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').trim();
  const steps = [];
  const objections = {};
  const hasHeadings = /^#{1,3}\s+\S/m.test(src);

  if (!hasHeadings) {
    src.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).forEach((body, i) => {
      steps.push({ title: `Step ${i + 1}`, body });
    });
    return { steps, objections };
  }

  let current = null;
  const flush = () => {
    if (!current) return;
    current.body = current.lines.join('\n').trim();
    delete current.lines;
    const m = current.title.match(/^objection\s*[:\-–—]\s*(.+)$/i);
    if (m) {
      const label = m[1].trim();
      const key = objectionKey(label);
      const builtin = BUILTIN_OBJECTIONS.find((o) => o.key === key);
      objections[key] = { key, label: builtin ? builtin.label : label, body: current.body };
    } else {
      steps.push({ title: current.title, body: current.body });
    }
  };

  for (const line of src.split('\n')) {
    const h = line.match(/^#{1,3}\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      current = { title: h[1], lines: [] };
    } else {
      if (!current) current = { title: 'Intro', lines: [] };
      current.lines.push(line);
    }
  }
  flush();
  return { steps: steps.filter((s) => s.body || s.title), objections };
}

// All objection buttons: the three built-ins first, then any custom ones from the script.
export function objectionList(parsed) {
  const list = BUILTIN_OBJECTIONS.map((o) => ({
    key: o.key,
    label: o.label,
    body: parsed.objections[o.key]?.body ?? DEFAULT_REBUTTALS[o.key],
    fromScript: Boolean(parsed.objections[o.key]),
  }));
  for (const o of Object.values(parsed.objections)) {
    if (!BUILTIN_OBJECTIONS.some((b) => b.key === o.key)) list.push({ ...o, fromScript: true });
  }
  return list;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

function matchCase(word, template) {
  if (template === template.toUpperCase() && template.length > 1) return word.toUpperCase();
  if (template[0] === template[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

const PLURAL_WORDS = ['customers', 'clients', 'regulars', 'guests', 'patrons'];
const SINGULAR_WORDS = ['customer', 'client', 'patron'];
const SWAP_RE = new RegExp(`\\b(${[...PLURAL_WORDS, ...SINGULAR_WORDS].join('|')})\\b`, 'gi');

// Swap generic "customers"-style words for the industry's own term,
// e.g. "customers" -> "regulars" for a diner.
function autoAdapt(escapedText, vocab) {
  return escapedText.replace(SWAP_RE, (word) => {
    const lower = word.toLowerCase();
    const target = PLURAL_WORDS.includes(lower) ? vocab.customers : vocab.customer;
    if (!target || target.toLowerCase() === lower) return word;
    return `<mark class="swap" title="Adapted from “${escapeHtml(word)}”">${escapeHtml(matchCase(target, word))}</mark>`;
  });
}

function lookupVar(name, ctx) {
  const key = name.trim().toLowerCase().replace(/\s+/g, '_');
  const val = ctx.vars?.[key] ?? ctx.vocab?.[key];
  return val === undefined || val === '' ? null : String(val);
}

function renderInline(line, ctx) {
  let out = '';
  let last = 0;
  for (const m of line.matchAll(/\{\{\s*([\w ]+?)\s*\}\}/g)) {
    const text = escapeHtml(line.slice(last, m.index));
    out += ctx.autoAdapt ? autoAdapt(text, ctx.vocab || {}) : text;
    const val = lookupVar(m[1], ctx);
    out += val === null
      ? `<mark class="var missing" title="No value for {{${escapeHtml(m[1])}}}">${escapeHtml(m[1])}</mark>`
      : `<mark class="var" title="{{${escapeHtml(m[1])}}}">${escapeHtml(matchCase(val, m[1]))}</mark>`;
    last = m.index + m[0].length;
  }
  const tail = escapeHtml(line.slice(last));
  out += ctx.autoAdapt ? autoAdapt(tail, ctx.vocab || {}) : tail;
  return out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Returns null if the line is excluded for this industry, otherwise the line with its tag removed.
export function applyLineTag(line, industryId) {
  const m = line.match(/^\s*\[(!?)([\w\s,]+)\]\s?(.*)$/);
  if (!m) return line;
  const ids = m[2].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hit = ids.includes(industryId);
  const show = m[1] === '!' ? !hit : hit;
  return show ? m[3] : null;
}

export function renderBody(body, ctx) {
  const lines = String(body || '').split('\n')
    .map((l) => applyLineTag(l, ctx.industryId || 'generic'))
    .filter((l) => l !== null);

  const html = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) html.push(`<ul>${list.map((li) => `<li>${li}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const note = line.match(/^\s*>\s?(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (note) {
      flushPara(); flushList();
      html.push(`<p class="rep-note">${renderInline(note[1], ctx)}</p>`);
    } else if (bullet) {
      flushPara();
      list.push(renderInline(bullet[1], ctx));
    } else {
      flushList();
      para.push(renderInline(line, ctx));
    }
  }
  flushPara(); flushList();
  return html.join('\n');
}

// Placeholders used anywhere in the script, for the "fill in missing values" hint.
export function placeholdersIn(text) {
  return [...new Set([...String(text).matchAll(/\{\{\s*([\w ]+?)\s*\}\}/g)]
    .map((m) => m[1].trim().toLowerCase().replace(/\s+/g, '_')))];
}

export const SAMPLE_SCRIPT = `# Opener
Hi, is this {{first_name}}? This is {{my_name}} with {{my_company}}.
I was just looking at {{company}}'s website.
[cocktail_bar] That cocktail program looks seriously dialed in.
[diner] It looks like the kind of spot people have been coming back to for years.
[restaurant, cafe] The menu looks fantastic.
Do you have two minutes? I promise to keep it quick.
> Wait for a yes. If they're mid-service, jump to "Not the right time".

# Why I'm calling
We help places like {{company}} turn first-time visitors into loyal customers — without discounting.
[cocktail_bar] For bars, that usually means knowing which clients love which drinks, so your bartenders can make every night out feel personal.
[diner] For diners, it's about recognizing your regulars and making sure they keep coming back every week.

# Discovery
A couple of quick questions so I don't waste your time:
- How do you keep in touch with your customers today?
- Roughly what share of your business comes from repeat customers?
- What's the slowest part of your week at the {{venue}}?
> Take notes. Mirror back what you hear before moving on.

# Pitch
Based on what you said, here's what we'd do for {{company}}:
- Capture every customer's visits automatically at checkout
- Send a personal "we miss you" note when a customer hasn't been in for a while
- Fill your slow nights with targeted offers to the people most likely to come in
Most {{venue}} owners see a lift in repeat visits within the first 60 days.

# Close
Would it make sense to set up a 20-minute walkthrough with you and your {{team}}? I have Thursday at 10 or Friday at 2 open.
> Confirm email, date, and time. Send the invite before hanging up.

# Objection: Not interested
Totally fair, {{first_name}}. Quick question before I let you go — if there were a way to get even five more customers back through the door every week, would that be worth 20 minutes?

# Objection: Not the right time
I hear you — I know how busy a {{venue}} gets. When's usually a quieter moment? I'll call back then and keep it to five minutes.

# Objection: Already using a competitor
Good to hear you're already investing in your customers. What do you wish your current tool did better? We usually win on the stuff people find clunky.

# Objection: Send me an email
Happy to. So I send something useful rather than a generic brochure — what's the one thing you'd want it to answer?
`;
