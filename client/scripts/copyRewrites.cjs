#!/usr/bin/env node
/*
 * Copy rewrite ledger — finds user-visible phrases that read as AI-written and
 * stores the planned rewrite for each one in copy-rewrites.json.
 *
 *   node client/scripts/copyRewrites.cjs scan    # (re)build the ledger; keeps your to/status edits
 *   node client/scripts/copyRewrites.cjs apply   # write every `approved` entry into the source
 *   node client/scripts/copyRewrites.cjs stats   # counts by kind / status / file
 *
 * Workflow: edit an entry's `to`, set `status` to "approved", run apply. Apply
 * marks it "applied". Anything else ("pending", "skip") is never touched.
 *
 * Kinds:
 *   eyebrow  — text rendered through an `uppercase` + letter-spaced style
 *   em-dash  — visible string or JSX text containing "—" (lone "—" placeholders excluded)
 *   emoji    — visible string or JSX text containing an emoji
 *   voice    — formula-named section titles worth rewriting in your own words
 * plus `styles`: every class string / constant that produces an eyebrow, so the
 * look itself can be changed in one place.
 *
 * Entries are keyed by an id built from file + kind + source text + occurrence
 * index, never the line number, so edits elsewhere in a file don't orphan them.
 * Apply finds the text by exact match (on the recorded line first, then anywhere
 * in the file if it is unique) and refuses anything ambiguous.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const REPO = path.resolve(__dirname, '..', '..');
const LEDGER = path.join(__dirname, 'copy-rewrites.json');
const ROOTS = ['client/src', 'api/_routes', 'api/_lib', 'api/_badgeRegistry.js'];

// Phrases built on the "eyebrow + catchy title" formula. Matched case-insensitively
// as a whole string. Add to this list and re-scan to track more.
const VOICE = [
  'Watch Out!', 'Hunter Spotlight', 'Community Read', 'Community Fan Favorite',
  'Hot Streak', 'Most Unique Catch', 'Tier Upsets', 'Overachiever', 'Trap',
  'Rarest Catches', 'Most Active Hunters', 'Top Hunted', 'Consensus',
];

// Pages only moderators/admins reach. Their copy matters less to the public read.
const MOD_FILES = /(Approvals|BadgeUpload|BoardBuilder|PokemonGameManager|ModFeedback|BannerManager|MonthlyBadgeModal|Admin|Mod[A-Z]|GameUtilization|Overlay)/;

const EMOJI = /\p{Extended_Pictographic}/u;
// Arrows, shapes and dingbats (★ ✦ ✓ ✗ ☀) are ordinary text glyphs here, not
// emoji — except the handful that render as colour emoji and read as AI garnish.
const NON_TEXT_EMOJI = /^(?![✨✅❌⚡❗❓])[©®™↔↕↖↗↘↙↩↪▪▫▶◀◻◼◽◾☀-➿]$/u;

// ── helpers ──────────────────────────────────────────────────────────────────
const rel = f => path.relative(REPO, f).replace(/\\/g, '/');

function walk(p, out = []) {
  const abs = path.join(REPO, p);
  if (!fs.existsSync(abs)) return out;
  if (fs.statSync(abs).isFile()) {
    if (/\.(jsx?|cjs)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const n of fs.readdirSync(abs)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    walk(path.join(p, n), out);
  }
  return out;
}

const isCaps = s => typeof s === 'string' && /\buppercase\b/.test(s) && /\btracking-/.test(s);

function sentenceCase(s) {
  const keep = /^(I|II|III|IV|TID|OT|ID|SV|LZA|LGPE|BDSP|PLA|DLC|OBS|XP|HA|UTC|[A-Z]{2,}\d*|Pok[ée]mon|Pok[ée]dex|Pok[ée]board|Twitch|Discord|Restricted|Standard|Shalpha|Jeopardy|Bingo)$/;
  let first = true;
  return s.replace(/[A-Za-zÀ-ÿ][\wÀ-ÿ'’-]*/g, w => {
    if (first) { first = false; return w; }
    return keep.test(w) ? w : w.toLowerCase();
  });
}

// First-pass rewrite of em dashes. A draft, not a decision: every entry still
// needs a human to approve it. Rules:
//   "— select a collection —" placeholder        -> dashes dropped, capitalised
//   label, no sentence punctuation ("Gen I — Kanto", "Rejected — fires when…") -> colon
//   inside a sentence ("Network error — try again.") -> new sentence
//   dash ending a fragment ("Find a wild Ditto —" + JSX) -> colon
//   dash opening a fragment ("— hatch eggs until…")       -> plain hyphen, what people type
function draftDash(s) {
  const bare = s.match(/^—\s*(.*?)\s*—$/s);
  if (bare) return cap(bare[1]);
  const sentence = /[.!?](\s|$)/.test(s);
  return s
    .replace(/\s*—\s*$/, ':')
    .replace(/^—\s*/, '- ')
    .replace(/[ \t]*(\r?\n[ \t]*)?—[ \t]*(\r?\n[ \t]*)?([a-z]?)/g, (m, nl1, nl2, c) => {
      const gap = nl1 || nl2 || ' ';
      return sentence ? `.${gap}${c.toUpperCase()}` : `:${gap}${c}`;
    });
}
const cap = s => s.replace(/^([a-z])/, c => c.toUpperCase());

function dropEmoji(s) {
  return s.replace(/\s*\p{Extended_Pictographic}️?/gu, '').replace(/\s{2,}/g, ' ').trim() || null;
}

function idFor(file, kind, from, n) {
  return crypto.createHash('sha1').update(`${file}|${kind}|${from}|${n}`).digest('hex').slice(0, 10);
}

// ── scan ─────────────────────────────────────────────────────────────────────
function scan() {
  const files = ROOTS.flatMap(r => walk(r));
  const phrases = [];
  const styles = new Map(); // key -> style record
  const wrappers = new Map(); // component name -> { props:Set, children:bool, file, line }
  const routes = routeMap();
  const parsed = [];

  for (const abs of files) {
    const src = fs.readFileSync(abs, 'utf8');
    let ast;
    try {
      ast = parser.parse(src, { sourceType: 'unambiguous', plugins: ['jsx'], errorRecovery: true });
    } catch (e) {
      console.warn(`skip ${rel(abs)}: ${e.message}`);
      continue;
    }
    parsed.push({ abs, src, ast, lines: src.split('\n') });
  }

  // Pass 1: find caps styles, and components that render children/props through one.
  for (const f of parsed) {
    const file = rel(f.abs);
    const capsConsts = new Map(); // const name -> class string

    traverse(f.ast, {
      VariableDeclarator(p) {
        const { id, init } = p.node;
        if (id.type !== 'Identifier' || !init) return;
        const s = staticString(init);
        if (isCaps(s)) {
          capsConsts.set(id.name, s);
          addStyle(styles, file, init.loc.start.line, s, `const ${id.name}`);
        }
        if (init.type === 'ObjectExpression' && hasUppercaseTransform(init)) {
          capsConsts.set(id.name, 'textTransform: uppercase');
          addStyle(styles, file, init.loc.start.line, 'textTransform: uppercase', `const ${id.name} (style object)`);
        }
      },
    });
    f.capsConsts = capsConsts;

    traverse(f.ast, {
      JSXOpeningElement(p) {
        const caps = elementCaps(p.node, capsConsts);
        if (!caps) return;
        if (caps.literal) addStyle(styles, file, p.node.loc.start.line, caps.literal, `<${tagName(p.node)}>`);
        const comp = enclosingComponent(p);
        if (!comp) return;
        const el = p.parentPath.node;
        const params = componentParams(p);
        for (const ex of exprChildren(el)) {
          if (ex.type === 'Identifier' && (ex.name === 'children' || params.has(ex.name))) {
            const w = wrappers.get(comp) || { props: new Set(), children: false, file, line: p.node.loc.start.line, className: caps.literal || caps.ref };
            if (ex.name === 'children') w.children = true; else w.props.add(ex.name);
            wrappers.set(comp, w);
          }
          if (ex.type === 'MemberExpression' && ex.object.name === 'props') {
            const w = wrappers.get(comp) || { props: new Set(), children: false, file, line: p.node.loc.start.line, className: caps.literal || caps.ref };
            w.props.add(ex.property.name);
            wrappers.set(comp, w);
          }
        }
      },
    });
  }

  // Pass 2: collect phrases.
  for (const f of parsed) {
    const file = rel(f.abs);
    const seen = new Map();
    const audience = MOD_FILES.test(file) ? 'mod' : (file.startsWith('api/') ? 'api' : 'public');
    const page = routes[path.basename(file, path.extname(file))] || null;
    const propStrings = collectPropStrings(f.ast);

    const push = (kind, node, from, extra = {}) => {
      if (!from || !from.trim()) return;
      from = from.trim();
      // One source string = one entry. A second finding on the same text (an
      // eyebrow that is also a formula name, an em dash next to an emoji) is
      // recorded as a flag, so apply never has two edits racing for one string.
      const same = phrases.find(q => q.file === file && q.line === node.loc.start.line && q.from === from);
      if (same) {
        if (same.kind !== kind && !(same.flags || []).includes(kind)) {
          same.flags = [...(same.flags || []), kind];
          const base = same.to ?? same.from;
          if (kind === 'emoji') same.to = dropEmoji(base);
          if (kind === 'em-dash') { same.to = draftDash(base); same.toSource = 'draft'; }
        }
        return;
      }
      const key = `${kind}|${from}`;
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const line = node.loc.start.line;
      phrases.push({
        id: idFor(file, kind, from, n),
        kind,
        file,
        line,
        audience,
        page,
        from,
        to: null,
        status: 'pending',
        ...extra,
        context: {
          component: extra.component || null,
          line: f.lines[line - 1].trim().slice(0, 220),
          ...(extra.context || {}),
        },
      });
    };

    traverse(f.ast, {
      // eyebrow text: everything rendered inside a caps element
      JSXElement(p) {
        const open = p.node.openingElement;
        const caps = elementCaps(open, f.capsConsts);
        const wrap = wrappers.get(tagName(open));
        const component = enclosingComponent(p);
        if (caps) {
          if (p.findParent(q => q.isJSXElement() && elementCaps(q.node.openingElement, f.capsConsts))) return; // counted at outermost
          for (const t of textsIn(p.node, propStrings)) {
            push('eyebrow', t.node, t.text, {
              to: t.resolvedVia ? null : sentenceCase(t.text),
              rendersAs: t.text.toUpperCase(),
              component,
              ...(t.resolvedVia ? { note: `dynamic — one of the values of ${t.resolvedVia}` } : {}),
              context: { element: tagName(open), className: caps.literal || caps.ref },
            });
          }
        } else if (wrap) {
          if (wrap.children) for (const t of textsIn(p.node, propStrings)) {
            push('eyebrow', t.node, t.text, { to: sentenceCase(t.text), rendersAs: t.text.toUpperCase(), component, context: { element: `<${tagName(open)}> children`, className: wrap.className, wrapper: `${wrap.file}:${wrap.line}` } });
          }
          for (const a of open.attributes) {
            if (a.type !== 'JSXAttribute' || !wrap.props.has(a.name.name) || !a.value) continue;
            for (const s of stringsIn(a.value.type === 'JSXExpressionContainer' ? a.value.expression : a.value)) {
              push('eyebrow', s.node, s.text, { to: sentenceCase(s.text), rendersAs: s.text.toUpperCase(), component, context: { element: `<${tagName(open)} ${a.name.name}>`, className: wrap.className, wrapper: `${wrap.file}:${wrap.line}` } });
            }
          }
        }
      },

      JSXText(p) { visible(p.node, p.node.value, p); },
      StringLiteral(p) { if (isVisibleLiteral(p)) visible(p.node, p.node.value, p); },
      TemplateLiteral(p) {
        if (!isVisibleLiteral(p)) return;
        for (const q of p.node.quasis) visible(q, q.value.cooked, p);
      },
    });

    function visible(node, text, p) {
      if (!text) return;
      const component = enclosingComponent(p);
      const t = text.replace(/\s+/g, ' ').trim();
      if (t.includes('—') && t !== '—' && /[A-Za-z]/.test(t)) {
        const raw = rawSource(f.src, node);
        push('em-dash', node, raw, { to: draftDash(raw), toSource: 'draft', component });
      }
      const emo = [...t].filter(c => EMOJI.test(c) && !NON_TEXT_EMOJI.test(c));
      if (emo.length) {
        const raw = rawSource(f.src, node);
        const to = dropEmoji(raw);
        push('emoji', node, raw, {
          to, component, context: { emoji: emo.join(' ') },
          ...(to ? {} : { note: 'icon-only: swap for a real sprite/item image or an SVG icon, then mark skip' }),
        });
      }
      if (VOICE.some(v => v.toLowerCase() === t.toLowerCase())) {
        push('voice', node, rawSource(f.src, node), { component });
      }
    }
  }

  // Merge with the existing ledger: keep any human edits.
  const prev = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { phrases: [], styles: [] };
  const prevById = new Map(prev.phrases.map(p => [p.id, p]));
  for (const p of phrases) {
    const old = prevById.get(p.id);
    if (old) { p.to = old.to; p.status = old.status; if (old.note) p.note = old.note; prevById.delete(p.id); }
  }
  const orphaned = [...prevById.values()].filter(p => p.status !== 'pending' && p.status !== 'applied');

  const styleList = [...styles.values()].sort((a, b) => b.count - a.count);
  const prevStyles = new Map((prev.styles || []).map(s => [s.from, s]));
  for (const s of styleList) { const o = prevStyles.get(s.from); if (o) { s.to = o.to; s.status = o.status; } }

  phrases.sort((a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.line - b.line);
  const out = {
    _readme: 'Edit `to`, set `status` to "approved", then run: node client/scripts/copyRewrites.cjs apply. '
      + 'status: pending | approved | applied | skip. Re-scan keeps your edits (matched by id). '
      + '`to` is pre-filled only where the rewrite is mechanical (eyebrow sentence case, emoji removal); '
      + 'em-dash and voice entries need a human rewrite. `styles` lists every class string that makes an eyebrow — '
      + 'eyebrow text changes alone leave the caps look in place.',
    generated: new Date().toISOString(),
    summary: summarize(phrases, styleList),
    styles: styleList,
    phrases,
    ...(orphaned.length ? { orphaned } : {}),
  };
  fs.writeFileSync(LEDGER, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${rel(LEDGER)}`);
  console.log(JSON.stringify(out.summary, null, 2));
  if (orphaned.length) console.log(`${orphaned.length} edited entries no longer match source — kept under "orphaned"`);
}

function summarize(phrases, styles) {
  const by = k => phrases.reduce((m, p) => (m[p[k]] = (m[p[k]] || 0) + 1, m), {});
  return { total: phrases.length, byKind: by('kind'), byAudience: by('audience'), byStatus: by('status'), styleSources: styles.length };
}

function addStyle(map, file, line, s, where) {
  const key = s;
  const r = map.get(key) || { from: s, to: null, status: 'pending', count: 0, sites: [] };
  r.count++;
  if (r.sites.length < 40) r.sites.push(`${file}:${line} ${where}`);
  map.set(key, r);
}

// ── AST utilities ────────────────────────────────────────────────────────────
function staticString(n) {
  if (!n) return null;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral') return n.quasis.map(q => q.value.cooked).join(' ');
  return null;
}

function hasUppercaseTransform(obj) {
  return obj.properties.some(p => p.type === 'ObjectProperty'
    && (p.key.name === 'textTransform' || p.key.value === 'textTransform')
    && p.value.type === 'StringLiteral' && p.value.value === 'uppercase');
}

function exprIsCaps(e, capsConsts) {
  if (!e) return null;
  const s = staticString(e);
  if (isCaps(s)) return { literal: s };
  if (e.type === 'Identifier' && capsConsts.has(e.name)) return { ref: e.name };
  if (e.type === 'TemplateLiteral') {
    for (const x of e.expressions) { const r = exprIsCaps(x, capsConsts); if (r) return r; }
  }
  if (e.type === 'ConditionalExpression') return exprIsCaps(e.consequent, capsConsts) || exprIsCaps(e.alternate, capsConsts);
  if (e.type === 'LogicalExpression') return exprIsCaps(e.right, capsConsts);
  if (e.type === 'CallExpression') { for (const a of e.arguments) { const r = exprIsCaps(a, capsConsts); if (r) return r; } }
  if (e.type === 'ObjectExpression') {
    if (hasUppercaseTransform(e)) return { literal: 'textTransform: uppercase' };
    for (const p of e.properties) if (p.type === 'SpreadElement' && p.argument.type === 'Identifier' && capsConsts.has(p.argument.name)) return { ref: p.argument.name };
  }
  return null;
}

function elementCaps(open, capsConsts) {
  for (const a of open.attributes) {
    if (a.type !== 'JSXAttribute' || !a.value) continue;
    if (a.name.name !== 'className' && a.name.name !== 'style') continue;
    const e = a.value.type === 'JSXExpressionContainer' ? a.value.expression : a.value;
    const r = exprIsCaps(e, capsConsts);
    if (r) return r;
  }
  return null;
}

function tagName(open) {
  const n = open.name;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${n.object.name}.${n.property.name}`;
  return '?';
}

function enclosingComponent(p) {
  let q = p;
  let name = null;
  while ((q = q.parentPath)) {
    const n = q.node;
    let nm = null;
    if (n.type === 'FunctionDeclaration' && n.id) nm = n.id.name;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /Function|Arrow/.test(n.init?.type || '')) nm = n.id.name;
    if (nm && /^[A-Z]/.test(nm)) name = nm; // keep climbing: outermost component wins
  }
  return name;
}

function componentParams(p) {
  const fn = p.findParent(q => q.isFunction() && q.parentPath && (q.parentPath.isVariableDeclarator() || q.isFunctionDeclaration()));
  const names = new Set();
  const first = fn?.node.params[0];
  if (first?.type === 'ObjectPattern') for (const pr of first.properties) {
    if (pr.type === 'ObjectProperty' && pr.value.type === 'Identifier') names.add(pr.value.name);
    if (pr.type === 'ObjectProperty' && pr.value.type === 'AssignmentPattern') names.add(pr.value.left.name);
  }
  names.delete('className'); names.delete('style');
  return names;
}

function exprChildren(el) {
  const out = [];
  const visit = n => {
    for (const c of n.children || []) {
      if (c.type === 'JSXExpressionContainer') out.push(c.expression);
      if (c.type === 'JSXElement') visit(c);
    }
  };
  visit(el);
  return out;
}

// Every literal string a JSX subtree renders, plus resolutions of `{x.prop}`.
function textsIn(el, propStrings) {
  const out = [];
  const visit = n => {
    for (const c of n.children || []) {
      if (c.type === 'JSXText') { const t = c.value.replace(/\s+/g, ' ').trim(); if (/[A-Za-z]/.test(t)) out.push({ node: c, text: t }); }
      else if (c.type === 'JSXElement') visit(c);
      else if (c.type === 'JSXExpressionContainer') {
        for (const s of stringsIn(c.expression)) out.push(s);
        const e = c.expression;
        if (e.type === 'MemberExpression' && !e.computed && propStrings.has(e.property.name)) {
          for (const s of propStrings.get(e.property.name)) out.push({ ...s, resolvedVia: `.${e.property.name}` });
        }
      }
    }
  };
  visit(el);
  return out;
}

function stringsIn(e) {
  if (!e) return [];
  if (e.type === 'StringLiteral') return /[A-Za-z]/.test(e.value) ? [{ node: e, text: e.value }] : [];
  if (e.type === 'TemplateLiteral') return e.quasis.filter(q => /[A-Za-z]/.test(q.value.cooked)).map(q => ({ node: q, text: q.value.cooked.trim() }));
  if (e.type === 'ConditionalExpression') return [...stringsIn(e.consequent), ...stringsIn(e.alternate)];
  if (e.type === 'LogicalExpression') return stringsIn(e.right);
  return [];
}

// prop name -> [{node,text}] for every `{ prop: 'string' }` in the file
function collectPropStrings(ast) {
  const m = new Map();
  traverse(ast, {
    ObjectProperty(p) {
      const k = p.node.key.name || p.node.key.value;
      if (!['label', 'title', 'heading', 'eyebrow', 'name', 'caption', 'kicker', 'tag'].includes(k)) return;
      if (p.node.value.type !== 'StringLiteral' || !/[A-Za-z]/.test(p.node.value.value)) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ node: p.node.value, text: p.node.value.value });
    },
  });
  return m;
}

const NON_VISIBLE_ATTRS = new Set(['className', 'style', 'key', 'id', 'to', 'href', 'src', 'type', 'name', 'role', 'htmlFor', 'rel', 'target', 'data-testid']);

function isVisibleLiteral(p) {
  const par = p.parentPath;
  if (!par) return false;
  if (par.isImportDeclaration() || par.isExportAllDeclaration() || par.isExportNamedDeclaration()) return false;
  if (par.isJSXAttribute() && NON_VISIBLE_ATTRS.has(par.node.name.name)) return false;
  if (par.isObjectProperty() && par.node.key === p.node) return false;
  if (par.isMemberExpression() && par.node.property === p.node) return false;
  // console.*, require(), new Error() in API logging, throw-for-logs
  const call = p.findParent(q => q.isCallExpression());
  if (call) {
    const c = call.node.callee;
    if (c.type === 'MemberExpression' && c.object.name === 'console') return false;
    if (c.type === 'Identifier' && c.name === 'require') return false;
  }
  const attr = p.findParent(q => q.isJSXAttribute());
  if (attr && NON_VISIBLE_ATTRS.has(attr.node.name.name)) return false;
  return true;
}

function rawSource(src, node) {
  return src.slice(node.start, node.end).replace(/^['"`]|['"`]$/g, '').trim();
}

function routeMap() {
  const app = path.join(REPO, 'client/src/App.jsx');
  if (!fs.existsSync(app)) return {};
  const src = fs.readFileSync(app, 'utf8');
  const m = {};
  for (const r of src.matchAll(/<Route[^>]*path="([^"]+)"[^>]*element=\{\s*(?:<[A-Za-z]+[^>]*>\s*)*<([A-Z]\w*)/g)) {
    m[r[2]] = m[r[2]] ? m[r[2]] : r[1];
  }
  return m;
}

// ── apply ────────────────────────────────────────────────────────────────────
function apply() {
  const led = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const todo = led.phrases.filter(p => p.status === 'approved');
  if (!todo.length) return console.log('nothing approved');
  const byFile = new Map();
  for (const p of todo) byFile.set(p.file, [...(byFile.get(p.file) || []), p]);
  let ok = 0, bad = 0;
  for (const [file, list] of byFile) {
    const abs = path.join(REPO, file);
    let src = fs.readFileSync(abs, 'utf8');
    for (const p of list.sort((a, b) => b.line - a.line)) {
      if (p.to == null) { console.log(`✗ ${p.id} ${file}:${p.line} approved with no "to"`); bad++; continue; }
      const lines = src.split('\n');
      const span = p.from.split('\n').length;
      const window = lines.slice(p.line - 1, p.line - 1 + span + 2).join('\n');
      let next;
      if (window.split(p.from).length === 2) {
        const before = lines.slice(0, p.line - 1).join('\n') + (p.line > 1 ? '\n' : '');
        next = before + window.replace(p.from, p.to) + (lines.length > p.line - 1 + span + 2 ? '\n' + lines.slice(p.line - 1 + span + 2).join('\n') : '');
      } else if (src.split(p.from).length === 2) {
        next = src.replace(p.from, p.to);
      } else {
        console.log(`✗ ${p.id} ${file}:${p.line} "${p.from.slice(0, 50)}" — ${src.includes(p.from) ? 'ambiguous' : 'not found'}`);
        bad++;
        continue;
      }
      src = next;
      p.status = 'applied';
      ok++;
    }
    fs.writeFileSync(abs, src);
  }
  led.summary.byStatus = led.phrases.reduce((m, p) => (m[p.status] = (m[p.status] || 0) + 1, m), {});
  fs.writeFileSync(LEDGER, JSON.stringify(led, null, 2) + '\n');
  console.log(`applied ${ok}, failed ${bad}. Re-run scan to refresh line numbers.`);
}

function stats() {
  const led = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const rows = {};
  for (const p of led.phrases) { const k = `${p.kind.padEnd(8)} ${p.file}`; rows[k] = (rows[k] || 0) + 1; }
  console.log(JSON.stringify(led.summary, null, 2));
  for (const [k, v] of Object.entries(rows).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
}

({ scan, apply, stats }[process.argv[2]] || (() => console.log('usage: scan | apply | stats')))();
