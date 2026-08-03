#!/usr/bin/env node
/**
 * Compares two route tables (from verifySplit.js) and reports:
 *   1. set differences — any route added or lost by the split
 *   2. order-sensitive pairs whose relative order CHANGED
 *
 * Express matches in registration order, so reordering only matters for pairs
 * that could both match the same request: same method, same segment count, and
 * segment-wise compatible (a param matches any literal).
 */
const fs = require('fs');

const [beforePath, afterPath] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath, 'utf8')).filter((r) => !r.startsWith('MIDDLEWARE'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8')).filter((r) => !r.startsWith('MIDDLEWARE'));

const setBefore = new Set(before);
const setAfter = new Set(after);
const lost = before.filter((r) => !setAfter.has(r));
const gained = after.filter((r) => !setBefore.has(r));

console.log(`before: ${before.length} routes, after: ${after.length} routes`);
console.log(`lost:   ${lost.length ? lost.join(', ') : '(none)'}`);
console.log(`gained: ${gained.length ? gained.join(', ') : '(none)'}`);

/** Could a single request path match both patterns? */
function canCollide(a, b) {
  const [ma, pa] = a.split(' ');
  const [mb, pb] = b.split(' ');
  if (ma !== mb) return false;
  const sa = pa.split('/').filter(Boolean);
  const sb = pb.split('/').filter(Boolean);
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i], y = sb[i];
    if (x.startsWith(':') || y.startsWith(':')) continue; // param matches anything
    if (x !== y) return false;
  }
  return true;
}

const idxBefore = new Map(before.map((r, i) => [r, i]));
const idxAfter = new Map(after.map((r, i) => [r, i]));

const flipped = [];
const collidingPairs = [];
for (let i = 0; i < before.length; i++) {
  for (let j = i + 1; j < before.length; j++) {
    const a = before[i], b = before[j];
    if (!canCollide(a, b)) continue;
    collidingPairs.push([a, b]);
    if (!idxAfter.has(a) || !idxAfter.has(b)) continue;
    // a came before b originally; assert it still does.
    if (idxAfter.get(a) > idxAfter.get(b)) flipped.push([a, b]);
  }
}

console.log(`\norder-sensitive (potentially colliding) pairs: ${collidingPairs.length}`);
for (const [a, b] of collidingPairs) console.log(`  ${a}  ||  ${b}`);
console.log(`\npairs whose relative order FLIPPED: ${flipped.length}`);
for (const [a, b] of flipped) console.log(`  WAS ${a} before ${b} — NOW REVERSED`);

const ok = lost.length === 0 && gained.length === 0 && flipped.length === 0;
console.log(`\n${ok ? '*** PASS — no routes lost/gained, no matching precedence changed ***' : '*** FAIL ***'}`);
process.exit(ok ? 0 : 1);
