/**
 * Tests for api/_lib/backlogOrder.js. Run: node api/scripts/testBacklogOrder.js
 */
const assert = require('assert');
const { consensusOrder } = require('../_lib/backlogOrder');

const props = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, created_at: `2026-10-${String(i + 1).padStart(2, '0')}` }));
const ids = (n) => props(n).map(p => p.id);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test('weight is placed / total — full list 1.0, 2 of 20 is 0.1', () => {
  const r = consensusOrder(props(20), new Map([['full', ids(20)], ['two', ['p1', 'p2']]]));
  close(r.weights.full.weight, 1);
  close(r.weights.two.weight, 0.1);
});

test('a 2/20 mod cannot drag a family to the top over a full ranker', () => {
  // full ranker puts p20 last; the light ranker puts p20 first.
  const r = consensusOrder(props(20), new Map([['full', ids(20)], ['two', ['p20', 'p19']]]));
  // p20: (1·0 + 0.1·1) / 1.1
  close(r.order.find(x => x.id === 'p20').score, 0.1 / 1.1);
  assert.strictEqual(r.order[0].id, 'p1');
  assert.ok(r.order.find(x => x.id === 'p20').rank > 15);
});

test('a lone light ranker still orders the list (their picks first)', () => {
  const r = consensusOrder(props(20), new Map([['two', ['p7', 'p3']]]));
  assert.deepStrictEqual(r.order.slice(0, 2).map(x => x.id), ['p7', 'p3']);
});

test('unplaced families get a neutral score (mean of leftover scores)', () => {
  // N=5, placed 2 → leftover positions 3,4,5 → scores .5,.25,0 → mean .25
  const r = consensusOrder(props(5), new Map([['m', ['p1', 'p2']]]));
  close(r.order.find(x => x.id === 'p4').score, 0.25);
});

test('everyone ranks everything → plain average position (Borda)', () => {
  const r = consensusOrder(props(4), new Map([
    ['a', ['p1', 'p2', 'p3', 'p4']],
    ['b', ['p2', 'p1', 'p3', 'p4']],
    ['c', ['p2', 'p3', 'p1', 'p4']],
  ]));
  assert.deepStrictEqual(r.order.map(x => x.id), ['p2', 'p1', 'p3', 'p4']);
  close(r.order[0].score, (2 / 3 + 1 + 1) / 3);
  for (const w of Object.values(r.weights)) close(w.weight, 1);
});

test('a new proposal shifts N — a complete ranker drops to 20/21', () => {
  const r = consensusOrder(props(21), new Map([['full', ids(20)]]));
  close(r.weights.full.weight, 20 / 21);
  // The newcomer sits at the full ranker's neutral (only leftover slot = last).
  close(r.order.find(x => x.id === 'p21').score, 0);
});

test('closed proposals in a saved ranking are dropped and positions compacted', () => {
  const open = props(3); // p1..p3 open; 'gone' was published
  const r = consensusOrder(open, new Map([['m', ['gone', 'p3', 'p1', 'p2']]]));
  assert.deepStrictEqual(r.order.map(x => x.id), ['p3', 'p1', 'p2']);
  close(r.weights.m.weight, 1);
});

test('nobody has ranked → no scores, oldest first', () => {
  const r = consensusOrder(props(3), new Map([['m', []]]));
  assert.deepStrictEqual(r.order.map(x => [x.id, x.score]), [['p1', null], ['p2', null], ['p3', null]]);
});

test('single proposal does not divide by zero', () => {
  const r = consensusOrder(props(1), new Map([['m', ['p1']]]));
  close(r.order[0].score, 1);
});

console.log(`\n${passed} passed`);
