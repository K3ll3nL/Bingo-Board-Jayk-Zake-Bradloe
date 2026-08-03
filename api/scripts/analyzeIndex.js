#!/usr/bin/env node
/**
 * Analysis pass for the api/index.js split. Emits a machine-readable map of
 * top-level statements to api/scripts/.index-analysis.json, and prints only
 * counts + hazards to stdout.
 *
 * Hazards it looks for (these are what break a naive extraction):
 *   - route handlers that ASSIGN to a module-level `let` (can't survive being
 *     destructured out of a shared module — needs a setter or a state object)
 *   - top-level declarations referenced by routes in more than one future module
 *   - anything at top level that isn't a declaration or a route registration
 */
const fs = require('fs');
const path = require('path');

const parser = require(require.resolve('@babel/parser', {
  paths: [path.join(__dirname, '..', '..', 'client', 'node_modules')],
}));

const SRC = path.join(__dirname, '..', 'index.js');
const OUT = path.join(__dirname, '.index-analysis.json');

const code = fs.readFileSync(SRC, 'utf8');
const ast = parser.parse(code, {
  sourceType: 'script',
  plugins: ['optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread'],
});

/** Collect every identifier name referenced anywhere under a node. */
function collectIdentifiers(node, out = new Set(), assigned = new Set()) {
  if (!node || typeof node !== 'object') return { out, assigned };
  if (Array.isArray(node)) {
    for (const n of node) collectIdentifiers(n, out, assigned);
    return { out, assigned };
  }
  if (typeof node.type !== 'string') return { out, assigned };

  if (node.type === 'Identifier') out.add(node.name);
  if (node.type === 'AssignmentExpression' && node.left && node.left.type === 'Identifier') {
    assigned.add(node.left.name);
  }
  // Don't descend into property keys (obj.foo shouldn't register `foo`).
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' ||
        key === 'trailingComments' || key === 'innerComments') continue;
    if (node.type === 'MemberExpression' && key === 'property' && !node.computed) continue;
    if (node.type === 'ObjectProperty' && key === 'key' && !node.computed) continue;
    collectIdentifiers(node[key], out, assigned);
  }
  return { out, assigned };
}

const declarations = []; // top-level names we could move into lib/
const routes = [];
const other = [];

for (const node of ast.program.body) {
  const startLine = node.loc.start.line;
  const endLine = node.loc.end.line;

  if (node.type === 'FunctionDeclaration' && node.id) {
    declarations.push({ name: node.id.name, kind: 'function', mutable: false, startLine, endLine });
    continue;
  }
  if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations) {
      // Plain `const x = ...`
      if (d.id.type === 'Identifier') {
        declarations.push({
          name: d.id.name,
          kind: node.kind,
          mutable: node.kind !== 'const',
          startLine, endLine,
        });
        continue;
      }
      // Destructured `const { a, b } = require(...)` — each binding is a name
      // routes may reference, so they must be exported from core too.
      if (d.id.type === 'ObjectPattern') {
        for (const p of d.id.properties) {
          const bound = p.value || p.argument;
          if (bound && bound.type === 'Identifier') {
            declarations.push({
              name: bound.name,
              kind: node.kind,
              mutable: node.kind !== 'const',
              startLine, endLine,
            });
          }
        }
      }
    }
    continue;
  }
  if (node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'MemberExpression' &&
      node.expression.callee.object.name === 'app') {
    const verb = node.expression.callee.property.name;
    const first = node.expression.arguments[0];
    const routePath = first && first.type === 'StringLiteral' ? first.value : null;
    const { out, assigned } = collectIdentifiers(node.expression.arguments);
    routes.push({
      verb, path: routePath, startLine, endLine,
      refs: [...out], assigns: [...assigned],
    });
    continue;
  }
  other.push({ type: node.type, startLine, endLine });
}

const declNames = new Set(declarations.map((d) => d.name));
const mutableDecls = new Set(declarations.filter((d) => d.mutable).map((d) => d.name));

// Hazard 1: routes that reassign a module-level binding.
const reassigners = routes
  .filter((r) => r.assigns.some((a) => mutableDecls.has(a)))
  .map((r) => ({
    route: `${r.verb.toUpperCase()} ${r.path}`,
    line: r.startLine,
    assigns: r.assigns.filter((a) => mutableDecls.has(a)),
  }));

// Hazard 2: declarations that are themselves mutable and read by routes.
const mutableReadByRoutes = [...mutableDecls].filter((m) =>
  routes.some((r) => r.refs.includes(m)));

// Usage counts, to inform which declarations belong in a shared lib.
const usage = {};
for (const d of declarations) {
  usage[d.name] = routes.filter((r) => r.refs.includes(d.name)).length;
}

fs.writeFileSync(OUT, JSON.stringify({ declarations, routes, other, usage }, null, 2));

console.log(`top-level: ${declarations.length} declarations, ${routes.length} routes, ${other.length} other`);
console.log(`mutable module-level bindings: ${[...mutableDecls].join(', ') || '(none)'}`);
console.log('');
console.log(`HAZARD routes reassigning module state: ${reassigners.length}`);
for (const r of reassigners) console.log(`  L${r.line} ${r.route} -> ${r.assigns.join(', ')}`);
console.log('');
console.log(`mutable bindings read by routes: ${mutableReadByRoutes.join(', ') || '(none)'}`);
console.log('');
console.log('non-declaration/non-route top-level statements:');
for (const o of other) console.log(`  L${o.startLine}-${o.endLine} ${o.type}`);
console.log('');
const shared = declarations.filter((d) => usage[d.name] >= 1).length;
console.log(`declarations referenced by >=1 route (candidates for lib/): ${shared}`);
console.log(`analysis written to ${OUT}`);
