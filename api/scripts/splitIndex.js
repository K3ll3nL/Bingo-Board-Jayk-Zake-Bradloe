#!/usr/bin/env node
/**
 * One-shot codemod that splits api/index.js into api/lib/core.js + api/routes/*.js.
 *
 * Uses the AST map from analyzeIndex.js to move exact source ranges — no source
 * text is rewritten, only relocated, so handler behavior is unchanged by
 * construction. Run analyzeIndex.js first.
 *
 *   node api/scripts/splitIndex.js --dry-run   # report only
 *   node api/scripts/splitIndex.js             # write files
 *
 * The original is preserved as api/index.legacy.js for diffing.
 */
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const analysis = JSON.parse(fs.readFileSync(path.join(__dirname, '.index-analysis.json'), 'utf8'));
const srcLines = fs.readFileSync(path.join(API, 'index.js'), 'utf8').split(/\r?\n/);
const DRY = process.argv.includes('--dry-run');

// Declarations that must NOT move — index.js owns the app instance itself.
const KEEP_IN_INDEX = new Set(['express', 'app']);

// Mutable module-level state used by exactly one route module. Exporting a
// reassigned `let` through a destructured require would hand callers a stale
// snapshot, so these live inside the one module that owns them instead.
const MOVE_TO_MODULE = new Map([
  ['pokemonPoolCache', 'bingo'],
]);

/** Route path prefix -> route module name. First match wins, so order matters. */
const MODULE_RULES = [
  [/^\/api\/internal\//, 'internal'],
  [/^\/api\/mod\/board-builder/, 'boardBuilder'],
  [/^\/api\/mod\/game-board/, 'gameBoard'],
  [/^\/api\/mod\/feedback/, 'feedback'],
  [/^\/api\/admin\//, 'admin'],
  [/^\/api\/upload\//, 'upload'],
  [/^\/api\/approvals/, 'approvals'],
  [/^\/api\/overlay\//, 'overlay'],
  [/^\/api\/tools\//, 'tools'],
  [/^\/api\/radar\//, 'radar'],
  [/^\/api\/banners/, 'banners'],
  [/^\/api\/feedback/, 'feedback'],
  [/^\/api\/keys/, 'keys'],
  [/^\/api\/notifications|^\/api\/broadcast-notifications/, 'notifications'],
  [/^\/api\/badges|^\/api\/badge-families/, 'badges'],
  [/^\/api\/users\/:userId\/badge/, 'badges'],
  [/^\/api\/users\//, 'users'],
  [/^\/api\/user\//, 'users'],
  [/^\/api\/profile\//, 'profile'],
  [/^\/api\/leaderboard/, 'leaderboard'],
  [/^\/api\/stats\//, 'stats'],
  [/^\/api\/tier-list/, 'tierList'],
  [/^\/api\/bingo\//, 'bingo'],
  [/^\/api\/pokedex|^\/api\/pokemon\//, 'pokemon'],
  [/^\/api\/ambassadors/, 'ambassadors'],
  [/^\/api\/events|^\/api\/health|^\/api\/debug\//, 'system'],
];

function moduleFor(routePath) {
  for (const [re, name] of MODULE_RULES) if (re.test(routePath)) return name;
  return 'system';
}

/** Extend a chunk upward to swallow the comment block that documents it. */
function withLeadingComments(startLine, claimed) {
  let s = startLine;
  while (s > 1) {
    const prev = srcLines[s - 2].trim();
    const isComment = prev.startsWith('//') || prev.startsWith('*') ||
                      prev.startsWith('/*') || prev.endsWith('*/');
    if (!isComment) break;
    if (claimed.has(s - 1)) break;
    s -= 1;
  }
  return s;
}

/**
 * Moved code sits one directory deeper than api/, so paths that were relative
 * to api/ have to be re-rooted. Counted so the rewrite is auditable rather
 * than silent.
 */
const rehomeCounts = { require: 0, dirname: 0 };
function rehome(text) {
  return text
    .replace(/require\((['"])\.\/([^'"]+)\1\)/g, (m, q, mod) => {
      rehomeCounts.require += 1;
      return `require(${q}../${mod}${q})`;
    })
    .replace(/path\.join\(__dirname,\s*(['"])(?!\.\.)/g, (m, q) => {
      rehomeCounts.dirname += 1;
      return `path.join(__dirname, '..', ${q}`;
    });
}

const claimed = new Set();
function takeChunk(startLine, endLine) {
  const s = withLeadingComments(startLine, claimed);
  for (let i = s; i <= endLine; i++) {
    if (claimed.has(i)) throw new Error(`line ${i} claimed twice`);
    claimed.add(i);
  }
  return rehome(srcLines.slice(s - 1, endLine).join('\n'));
}

// ---- 1. Partition -----------------------------------------------------------
const coreDecls = analysis.declarations.filter(
  (d) => !KEEP_IN_INDEX.has(d.name) && !MOVE_TO_MODULE.has(d.name));
const coreNames = new Set(coreDecls.map((d) => d.name));

// Multiple declarators can share one VariableDeclaration node; dedupe by range.
const seenRanges = new Set();
const coreChunks = [];
for (const d of coreDecls) {
  const key = `${d.startLine}:${d.endLine}`;
  if (seenRanges.has(key)) continue;
  seenRanges.add(key);
  coreChunks.push({ startLine: d.startLine, endLine: d.endLine, name: d.name });
}
coreChunks.sort((a, b) => a.startLine - b.startLine);

const middleware = analysis.routes.filter((r) => r.path === null);
const realRoutes = analysis.routes.filter((r) => r.path !== null);

// ---- 2. Pre-flight assertions ----------------------------------------------
const problems = [];
for (const d of coreDecls) {
  // A moved declaration may not depend on anything index.js keeps.
  const text = srcLines.slice(d.startLine - 1, d.endLine).join('\n');
  if (/\bapp\.(get|post|put|patch|delete|use)\b/.test(text)) {
    problems.push(`declaration ${d.name} (L${d.startLine}) registers routes — cannot move to lib/core.js`);
  }
}
for (const r of realRoutes) {
  for (const a of r.assigns) {
    if (coreNames.has(a)) {
      problems.push(`route ${r.verb.toUpperCase()} ${r.path} (L${r.startLine}) assigns to shared binding "${a}" — needs a setter in core.js`);
    }
  }
}
if (problems.length) {
  console.log('PRE-FLIGHT PROBLEMS:');
  for (const p of problems) console.log('  - ' + p);
  console.log('');
}

// ---- 3. Build core.js -------------------------------------------------------
const coreBody = coreChunks.map((c) => takeChunk(c.startLine, c.endLine)).join('\n\n');
const coreExports = [...coreNames].sort();
const coreOut = [
  '/**',
  ' * Shared API infrastructure: supabase client, constants, caches, and every',
  ' * helper used by more than one route module.',
  ' *',
  ' * Extracted verbatim from the original monolithic api/index.js — handler',
  ' * bodies were relocated, not rewritten.',
  ' */',
  "require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });",
  '',
  coreBody,
  '',
  'module.exports = {',
  ...coreExports.map((n) => `  ${n},`),
  '};',
  '',
].join('\n');

// ---- 4. Build route modules -------------------------------------------------
const byModule = new Map();
for (const r of realRoutes) {
  const m = moduleFor(r.path);
  if (!byModule.has(m)) byModule.set(m, []);
  byModule.get(m).push(r);
}

const moduleFiles = [];
for (const [name, routes] of byModule) {
  routes.sort((a, b) => a.startLine - b.startLine);
  const needed = new Set();
  for (const r of routes) for (const ref of r.refs) if (coreNames.has(ref)) needed.add(ref);

  // Module-local state this module owns (see MOVE_TO_MODULE).
  const localDecls = analysis.declarations
    .filter((d) => MOVE_TO_MODULE.get(d.name) === name)
    .map((d) => takeChunk(d.startLine, d.endLine));

  const bodies = routes.map((r) => takeChunk(r.startLine, r.endLine)).join('\n\n');
  const requireLine = needed.size
    ? `const {\n${[...needed].sort().map((n) => `  ${n},`).join('\n')}\n} = require('../lib/core');`
    : '';

  const content = [
    `/**`,
    ` * ${name} routes (${routes.length}).`,
    ` * Registered from api/index.js — see api/API_INDEX.md for the full route map.`,
    ` */`,
    requireLine,
    '',
    ...localDecls,
    localDecls.length ? '' : null,
    'module.exports = function register(app) {',
    '',
    bodies.split('\n').map((l) => (l ? '  ' + l : l)).join('\n'),
    '',
    '};',
    '',
  ].filter((l) => l !== null).join('\n');

  moduleFiles.push({ name, content, count: routes.length, firstLine: routes[0].startLine });
}
moduleFiles.sort((a, b) => a.firstLine - b.firstLine);

// ---- 5. Build the new index.js ---------------------------------------------
const mwNeeded = new Set();
for (const m of middleware) for (const ref of m.refs) if (coreNames.has(ref)) mwNeeded.add(ref);
// The multer error handler at the bottom needs multer itself.
const mwChunks = middleware
  .sort((a, b) => a.startLine - b.startLine)
  .map((m) => ({ line: m.startLine, text: takeChunk(m.startLine, m.endLine) }));

// Middleware and route modules must be registered in true source order —
// bucketing into "before/after the first route" silently moved the dev-auth
// middleware below every route, which breaks `Bearer dev_token` locally.
// A module may not straddle a middleware line, or its routes would be split
// across that middleware; assert rather than reorder silently.
for (const m of moduleFiles) {
  const lastLine = Math.max(...byModule.get(m.name).map((r) => r.endLine));
  for (const c of mwChunks) {
    if (c.line > m.firstLine && c.line < lastLine) {
      problems.push(`module ${m.name} straddles middleware at L${c.line} — registration order cannot be preserved`);
    }
  }
}

const registrationUnits = [
  ...moduleFiles.map((m) => ({ line: m.firstLine, text: `require('./routes/${m.name}')(app);` })),
  ...mwChunks.map((c) => ({ line: c.line, text: c.text })),
].sort((a, b) => a.line - b.line);

const indexOut = [
  "require('dotenv').config({ path: require('path').join(__dirname, '.env') });",
  '',
  // `express` is the only require index.js owns outright; cors/multer and every
  // other shared binding come from lib/core.js to avoid duplicate declarations.
  "const express = require('express');",
  '',
  mwNeeded.size
    ? `const {\n${[...mwNeeded].sort().map((n) => `  ${n},`).join('\n')}\n} = require('./lib/core');`
    : '',
  '',
  'const app = express();',
  '',
  '// Middleware and route modules below are emitted in their original source',
  '// order, so both middleware precedence and path-matching precedence',
  '// (e.g. /reorder before /:id) match the pre-split behavior exactly.',
  '',
  ...registrationUnits.map((u) => u.text),
  '',
  '// Start server locally (not needed in Vercel)',
  'if (require.main === module) {',
  '  const PORT = process.env.PORT || 3000;',
  '  app.listen(PORT, () => {',
  '    console.log(`🚀 Server running on http://localhost:${PORT}`);',
  '  });',
  '}',
  '',
  '// Export for Vercel serverless',
  'module.exports = app;',
  '',
].join('\n');

// ---- 6. Report / write ------------------------------------------------------
console.log(`core.js:      ${coreExports.length} exports, ${coreBody.split('\n').length} lines`);
for (const m of moduleFiles) {
  console.log(`  routes/${m.name}.js`.padEnd(30) + `${m.count} routes, ${m.content.split('\n').length} lines`);
}
const unclaimed = [];
for (let i = 1; i <= srcLines.length; i++) {
  if (!claimed.has(i) && srcLines[i - 1].trim()) unclaimed.push(i);
}
console.log(`rehomed paths: ${rehomeCounts.require} require(./x), ${rehomeCounts.dirname} __dirname joins`);
console.log(`unclaimed non-blank source lines: ${unclaimed.length}`);
if (unclaimed.length && unclaimed.length < 80) {
  for (const l of unclaimed) console.log(`  L${l}: ${srcLines[l - 1].slice(0, 90)}`);
}

if (DRY) { console.log('\n(dry run — nothing written)'); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.log('\nrefusing to write with unresolved pre-flight problems'); process.exit(1); }

fs.mkdirSync(path.join(API, 'lib'), { recursive: true });
fs.mkdirSync(path.join(API, 'routes'), { recursive: true });
fs.copyFileSync(path.join(API, 'index.js'), path.join(API, 'index.legacy.js'));
fs.writeFileSync(path.join(API, 'lib', 'core.js'), coreOut);
for (const m of moduleFiles) fs.writeFileSync(path.join(API, 'routes', `${m.name}.js`), m.content);
fs.writeFileSync(path.join(API, 'index.js'), indexOut);
console.log('\nwritten. original preserved at api/index.legacy.js');
