import React, { useState, useEffect, useMemo } from 'react';


// ─── Constants ────────────────────────────────────────────────────────────────

// Type names ordered by iapetos163's TypeIndex enum
// Normal=0 Fighting=1 Flying=2 Poison=3 Ground=4 Rock=5 Bug=6 Ghost=7 Steel=8
// Fire=9 Water=10 Grass=11 Electric=12 Psychic=13 Ice=14 Dragon=15 Dark=16 Fairy=17
const TYPE_NAMES = ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel",
  "Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
// Display list (alphabetical-ish) for UI filters — order doesn't matter here
const TYPES = ["Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison",
  "Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

// Flavor index (iapetos163): Sweet=0 Salty=1 Sour=2 Bitter=3 Hot/Spicy=4
const FLAVOR_IDX = { Sweet: 0, Salty: 1, Sour: 2, Bitter: 3, Hot: 4 };
// Type index (iapetos163 TypeIndex enum)
const TYPE_IDX = { Normal:0,Fighting:1,Flying:2,Poison:3,Ground:4,Rock:5,Bug:6,Ghost:7,
  Steel:8,Fire:9,Water:10,Grass:11,Electric:12,Psychic:13,Ice:14,Dragon:15,Dark:16,Fairy:17 };
// MealPower index (iapetos163 MealPower enum)
// EGG=0 CATCH=1 EXP=2 ITEM=3 RAID=4 SPARKLING=5 TITLE=6 HUMUNGO=7 TEENSY=8 ENCOUNTER=9
const MP_NAMES = ["Egg","Catch","Exp","Item","Raid","Sparkling","Title","Humungo","Teensy","Encounter"];
const MP_IDX = Object.fromEntries(MP_NAMES.map((n,i) => [n,i]));

// Normalize UI display names → internal MP_NAMES keys (handles "Catching"→"Catch", "Item Drop"→"Item")
const POWER_TO_MP = {
  Encounter:'Encounter', Egg:'Egg', Raid:'Raid',
  Catching:'Catch',   Catch:'Catch',
  Exp:'Exp',
  'Item Drop':'Item', Item:'Item',
  Humungo:'Humungo', Teensy:'Teensy', Title:'Title', Sparkling:'Sparkling',
};

const POWER_FULL = {
  Egg: "Egg Power", Catch: "Catching Power", Exp: "Exp. Point Power",
  Item: "Item Drop Power", Raid: "Raid Power", Sparkling: "Sparkling Power",
  Title: "Title Power", Humungo: "Humungo Power", Teensy: "Teensy Power",
  Encounter: "Encounter Power",
};

// Full 5×5 taste map [firstFlavor][secondFlavor] → MealPower index
// Ported from iapetos163/sv-sandwich-builder src/mechanics/taste.ts
// (Sweet=0, Salty=1, Sour=2, Bitter=3, Spicy/Hot=4)
const TASTE_MAP_2D = [
  [0, 0, 1, 0, 4], // Sweet × (Sweet,Salty,Sour,Bitter,Spicy) → Egg,Egg,Catch,Egg,Raid
  [9, 9, 9, 2, 9], // Salty × ... → Encounter,Encounter,Encounter,Exp,Encounter
  [1, 8, 8, 8, 8], // Sour  × ... → Catch,Teensy,Teensy,Teensy,Teensy
  [3, 2, 3, 3, 3], // Bitter× ... → Item,Exp,Item,Item,Item
  [4, 7, 7, 7, 7], // Spicy × ... → Raid,Humungo,Humungo,Humungo,Humungo
];

const TYPE_COLORS = {
  Normal:'#A8A77A', Fire:'#EE8130', Water:'#6390F0', Electric:'#F7D02C',
  Grass:'#7AC74C', Ice:'#96D9D6', Fighting:'#C22E28', Poison:'#A33EA1',
  Ground:'#E2BF65', Flying:'#A98FF3', Psychic:'#F95587', Bug:'#A6B91A',
  Rock:'#B6A136', Ghost:'#735797', Dragon:'#6F35FC', Dark:'#705746',
  Steel:'#B7B7C5', Fairy:'#D685AD',
};

const POWER_COLORS = {
  Egg:'#D2B48C', Catch:'#ADD8E6', Exp:'#FF6347', Item:'#90EE90',
  Humungo:'#C0C0C0', Teensy:'#06b3b3', Raid:'#DA70D6', Encounter:'#DAD04A',
  Title:'#F4A460', Sparkling:'#00FFFF',
};

const FLAVOR_COLORS = {
  Sweet:'#f79bcd', Salty:'#d4d0c4', Sour:'#c9b508', Bitter:'#8fb830', Hot:'#d63010',
};

// ─── Data loading ─────────────────────────────────────────────────────────────

async function fetchGHJson(filename) {
  const res = await fetch(`/data/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename} (${res.status})`);
  return res.json();
}

// ─── Mechanics (ported from iapetos163/sv-sandwich-builder) ───────────────────

// Full 5×5 taste map → boosted meal power index
function getBoostedMealPower(flavorVec) {
  const ranked = flavorVec.map((a, i) => ({ f: i, a })).sort((a, b) => b.a - a.a || a.f - b.f);
  if (!ranked[0] || ranked[0].a <= 0) return null;
  const first = ranked[0].f;
  const second = (ranked[1] && ranked[1].a > 0) ? ranked[1].f : first;
  return TASTE_MAP_2D[first][second];
}

// Assigns which type index each of the 3 meal power slots gets.
// Based on iapetos163 src/mechanics/powers.ts calculateTypes()
function calcTypes(rankedTypes) {
  const [a = { type: 0, amount: 0 }, , c = { type: 2, amount: 0 }] = rankedTypes;
  const fa = a.amount, sa = (rankedTypes[1] ?? { amount: 0 }).amount;
  if (fa > 480)                                         return [a, a, a];
  if (fa > 280 || (fa > 105 && fa - sa > 105))         return [a, a, c];
  if (fa <= 105 && fa - 1.5 * sa >= 70)                return [a, c, a];
  return [a, c, rankedTypes[1] ?? a];
}

// Assigns level to each of the 3 slots based on type boost amounts.
// Based on iapetos163 src/mechanics/powers.ts calculateLevels()
function calcLevels(rankedTypes) {
  const fa = (rankedTypes[0] ?? {}).amount ?? 0;
  const ta = (rankedTypes[2] ?? {}).amount ?? 0;
  if (fa >= 460)           return [3, 3, 3];
  if (fa >= 380)           return ta >= 380 ? [3, 3, 3] : [3, 3, 2];
  if (fa > 280)            return ta >= 180 ? [2, 2, 2] : [2, 2, 1];
  if (fa >= 180)           return ta >= 180 ? [2, 2, 1] : [2, 1, 1];
  return [1, 1, 1];
}

// Build ingredient vectors from cecilbowen array-format ingredients
function buildVectors(selFillings, selCondiments) {
  const fv = Array(5).fill(0);   // flavor
  const tv = Array(18).fill(0);  // type
  const mv = Array(10).fill(0);  // meal power

  for (const f of selFillings) {
    const pieces = f.selectedPieces ?? f.pieces ?? 1;
    for (const { flavor, amount } of f.tastes  ?? []) { const i = FLAVOR_IDX[flavor]; if (i != null) fv[i] += amount * pieces; }
    for (const { type,   amount } of f.powers  ?? []) { const i = MP_IDX[type];       if (i != null) mv[i] += amount * pieces; }
    for (const { type,   amount } of f.types   ?? []) { const i = TYPE_IDX[type];     if (i != null) tv[i] += amount * pieces; }
  }
  for (const c of selCondiments) {
    for (const { flavor, amount } of c.tastes  ?? []) { const i = FLAVOR_IDX[flavor]; if (i != null) fv[i] += amount; }
    for (const { type,   amount } of c.powers  ?? []) { const i = MP_IDX[type];       if (i != null) mv[i] += amount; }
    for (const { type,   amount } of c.types   ?? []) { const i = TYPE_IDX[type];     if (i != null) tv[i] += amount; }
  }

  // Herba bonuses
  const herba = selCondiments.filter(c => c.name.toLowerCase().includes('herba')).length;
  if (herba >= 1) mv[MP_IDX.Title]     += 10000;
  if (herba >= 2) mv[MP_IDX.Sparkling] += 20000;

  // Base +20 type boost (standard 2-star sandwich)
  for (let i = 0; i < 18; i++) tv[i] += 20;

  return { fv, tv, mv };
}

// Full power evaluation — returns [{power, type, level, score}]
// Filter order matches iapetos163: Sparkling guard → slice(3) → zero-amount guard
function evaluateVectors(fv, tv, mv) {
  const bmp = getBoostedMealPower(fv);
  const adjMv = mv.map((v, i) => i === bmp ? v + 100 : v);

  const rankedMPs   = adjMv.map((a, i) => ({ mp: i, a })).sort((a, b) => b.a - a.a || a.mp - b.mp);
  const rankedTypes = tv.map((a, i)    => ({ type: i, amount: a })).sort((a, b) => b.amount - a.amount || a.type - b.type);

  const assignedTypes  = calcTypes(rankedTypes);
  const assignedLevels = calcLevels(rankedTypes);

  return rankedMPs
    .filter(mp => mp.mp !== MP_IDX.Sparkling || mp.a > 1000) // Sparkling requires herba boost
    .slice(0, 3)
    .filter((mp, i) => mp.a > 0 && assignedTypes[i])
    .map((mp, i) => ({
      power:    MP_NAMES[mp.mp],
      fullName: POWER_FULL[MP_NAMES[mp.mp]] || MP_NAMES[mp.mp],
      type:     mp.mp === MP_IDX.Egg ? null : TYPE_NAMES[assignedTypes[i].type],
      level:    assignedLevels[i],
      score:    mp.a,
    }));
}

function calculatePowers(selFillings, selCondiments) {
  const { fv, tv, mv } = buildVectors(selFillings, selCondiments);
  const mealPowers = evaluateVectors(fv, tv, mv);

  const FLAVOR_NAMES = ['Sweet','Salty','Sour','Bitter','Hot'];
  return {
    mealPowers,
    sortedTastes: fv.map((a, i) => ({ flavor: FLAVOR_NAMES[i], amount: a })).sort((a, b) => b.amount - a.amount),
    sortedSkills: mv.map((a, i) => ({ name: MP_NAMES[i], power: a })).sort((a, b) => b.power - a.power),
    sortedTypes:  tv.map((a, i) => ({ name: TYPE_NAMES[i], power: a })).sort((a, b) => b.power - a.power),
  };
}

// ─── Combinatorial sandwich search (informed by iapetos163 target logic) ──────

// Primary flavor indices needed per power (from taste.ts primaryFlavorsForPower)
const POWER_PRIMARY_FLAVORS = {
  Egg:[0], Humungo:[4], Teensy:[2], Item:[3], Encounter:[1],
  Exp:[3,1], Catch:[0,2], Raid:[0,4], Title:[], Sparkling:[],
};

function powersMatch(result, targets) {
  return targets.every(tgt => {
    const mp = POWER_TO_MP[tgt.power] || tgt.power; // normalize "Catching"→"Catch" etc.
    return result.some(r =>
      r.power === mp &&
      (mp === 'Egg' || !tgt.type || r.type === tgt.type) &&
      r.level >= (tgt.level || 1)
    );
  });
}

// k-combinations generator
function* combinations(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

function rankForTargets(targets, ingredients, isFilling, limit) {
  // Normalize power names before looking up flavors/types
  const normTargets = targets.map(t => ({ ...t, power: POWER_TO_MP[t.power] || t.power }));
  const reqTypeIdxs = normTargets
    .filter(t => t.type && t.power !== 'Egg')
    .map(t => TYPE_IDX[t.type]).filter(i => i != null);
  const reqFlavorIdxs = [...new Set(normTargets.flatMap(t => POWER_PRIMARY_FLAVORS[t.power] || []))];

  const scored = ingredients.map(ing => {
    const pcs = isFilling ? (ing.pieces ?? 1) : 1;
    let s = 0;
    for (const { flavor, amount } of ing.tastes ?? []) {
      if (reqFlavorIdxs.includes(FLAVOR_IDX[flavor])) s += amount * pcs;
    }
    for (const { type, amount } of ing.types ?? []) {
      if (reqTypeIdxs.includes(TYPE_IDX[type])) s += amount * pcs * 2;
    }
    return { ...ing, _score: s };
  });

  // If nothing scores (Sparkling/Title have empty flavor/type requirements), fall back
  // to ranking by total type power so we at least pick useful fillings
  if (!scored.some(x => x._score > 0)) {
    return ingredients
      .map(ing => {
        const pcs = isFilling ? (ing.pieces ?? 1) : 1;
        const s = (ing.types ?? []).reduce((acc, { amount }) => acc + amount * pcs, 0);
        return { ...ing, _score: s };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  }

  return scored
    .filter(x => x._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

// Generator yielding (fillings, allConds, numHerba) combos for a given numHerba & total.
function* yieldCombos(numHerba, total, maxFill, maxCond, candFill, candCond, allHerba) {
  const maxNonHerba = maxCond - numHerba;
  const minNonHerba = numHerba >= 1 ? 0 : 1;
  const herbaCombos = numHerba === 0 ? [[]]
    : numHerba === 1 ? allHerba.map(h => [h])
    : [...combinations(allHerba, 2)];

  for (const herbaCombo of herbaCombos) {
    if (herbaCombo.length < numHerba) continue;
    for (let nF = Math.min(maxFill, total - minNonHerba); nF >= Math.max(1, total - maxNonHerba); nF--) {
      const nC = total - nF;
      if (nC < minNonHerba || nC > maxNonHerba) continue;
      for (const fillCombo of combinations(candFill, nF)) {
        const fillings = fillCombo.map(f => ({ ...f, selectedPieces: f.pieces ?? 1 }));
        const condSets = nC === 0 ? [[]] : [...combinations(candCond, nC)];
        for (const condCombo of condSets) {
          const allConds = [...herbaCombo, ...condCombo];
          yield { fillings, allConds, numHerba };
        }
      }
    }
  }
}

// Returns all sandwiches at the minimum ingredient count satisfying targets.
//
// Phase 1 uses a small ranked candidate list with a per-herba-option budget so
// every herba option (0, 1, 2 Herba Mystica) always gets a chance to find a
// match — the old single `break outer` killed all remaining herba options the
// moment the budget ran out on the first one.
//
// Phase 2 uses ALL ingredients (not just the ranked shortlist) so long as
// minTotal ≤ 3.  At minTotal=2 that's ~50×30=1500 evals; at minTotal=3 it's
// ~C(50,2)×30 + 50×C(30,2) ≈ 58 k evals — both finish in well under a second
// in modern JS.  For minTotal ≥ 4 we fall back to the ranked candidates.
function findSandwichesAtMinCount(targets, allFillings, allCondiments, playerCount = 1) {
  targets = targets.map(t => ({ ...t, power: POWER_TO_MP[t.power] || t.power }));

  const maxFill = playerCount * 6;
  const maxCond = playerCount * 4;

  const hasSparkling = targets.some(t => t.power === 'Sparkling');
  const hasTitle     = targets.some(t => t.power === 'Title');
  const hasLv3       = targets.some(t => t.level >= 3);
  const hasLv2       = targets.some(t => t.level >= 2);

  const herbaOptions = hasSparkling ? [2]
    : hasLv3   ? [2, 1]
    : hasTitle  ? [1]
    : hasLv2    ? [0, 1]
    : [0];

  const allHerba = allCondiments.filter(c => c.name.toLowerCase().includes('herba'));
  const nonHerba = allCondiments.filter(c => !c.name.toLowerCase().includes('herba'));

  // Phase 1 candidates: ranked shortlist for speed
  const p1Fill = rankForTargets(targets, allFillings, true,  Math.min(maxFill, 12));
  const p1Cond = rankForTargets(targets, nonHerba,   false, Math.min(maxCond, 10));

  const ingredientKey = (fillings, conds) =>
    [...fillings.map(f => f.name), ...conds.map(c => c.name)].sort().join('|');

  // ── Phase 1: find minTotal using ranked candidates, per-herba budget ──────────
  // Each herba option gets its own 3 000-eval budget so budget exhaustion on
  // numHerba=0 never prevents numHerba=1/2 from being tried.
  let minTotal = null;
  const PER_HERBA_BUDGET = 3000;

  for (const numHerba of herbaOptions) {
    const minNonHerba = numHerba >= 1 ? 0 : 1;
    const maxNonHerba = maxCond - numHerba;
    const maxTotalToTry = Math.min(minTotal ?? Infinity, maxFill + maxNonHerba);
    let evals = 0;

    herbaSearch:
    for (let total = 1 + minNonHerba; total <= maxTotalToTry; total++) {
      for (const { fillings, allConds } of yieldCombos(numHerba, total, maxFill, maxCond, p1Fill, p1Cond, allHerba)) {
        evals++;
        const { fv, tv, mv } = buildVectors(fillings, allConds);
        if (powersMatch(evaluateVectors(fv, tv, mv), targets)) {
          minTotal = Math.min(minTotal ?? total, total);
          break herbaSearch;
        }
        if (evals >= PER_HERBA_BUDGET) break herbaSearch;
      }
    }
  }

  if (minTotal === null) return [];

  // ── Phase 2: exhaustive at minTotal over the full ingredient pool ─────────────
  // For small minTotal every combination is checked so no valid sandwich is missed.
  const p2Fill = minTotal <= 3 ? allFillings : p1Fill;
  const p2Cond = minTotal <= 3 ? nonHerba    : p1Cond;

  const seen    = new Set();
  const results = [];

  for (const numHerba of herbaOptions) {
    for (const { fillings, allConds, numHerba: nh } of yieldCombos(numHerba, minTotal, maxFill, maxCond, p2Fill, p2Cond, allHerba)) {
      const { fv, tv, mv } = buildVectors(fillings, allConds);
      const powers = evaluateVectors(fv, tv, mv);
      if (!powersMatch(powers, targets)) continue;
      const key = ingredientKey(fillings, allConds);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ fillings, condiments: allConds, powers, numHerba: nh });
      }
    }
  }

  return results;
}

// When any target has level=null ("Any"), search each specific level (1/2/3)
// independently so no reachable sandwich is missed.
function findAllSandwiches(targets, allFillings, allCondiments, playerCount = 1) {
  const ingredientKey = r =>
    [...r.fillings.map(f => f.name), ...r.condiments.map(c => c.name)].sort().join('|');

  const hasAnyLevel = targets.some(t => t.level === null);
  const levelSets = hasAnyLevel ? [1, 2, 3] : [null];

  const seen = new Set();
  const results = [];

  for (const level of levelSets) {
    const resolvedTargets = targets.map(t =>
      t.level === null && level !== null ? { ...t, level } : t
    );
    for (const r of findSandwichesAtMinCount(resolvedTargets, allFillings, allCondiments, playerCount)) {
      const key = ingredientKey(r);
      if (!seen.has(key)) { seen.add(key); results.push(r); }
    }
  }

  return results;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type, small }) {
  const color = TYPE_COLORS[type] || '#888';
  return (
    <span
      className={`inline-block font-bold rounded ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ backgroundColor: color + '33', color, border: `1px solid ${color}66` }}
    >
      {type}
    </span>
  );
}

function MealPowerCard({ mp, rank }) {
  const pColor = POWER_COLORS[mp.power] || '#aaa';
  const tColor = mp.type ? TYPE_COLORS[mp.type] : null;
  return (
    <div
      className="rounded-lg p-3 border flex items-center gap-3"
      style={{ backgroundColor: pColor + '18', borderColor: pColor + '55' }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ backgroundColor: pColor + '33', color: pColor }}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm leading-tight">{mp.fullName}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {mp.type && <TypeBadge type={mp.type} small />}
          <span className="text-xs" style={{ color: pColor }}>Level {mp.level}</span>
          <span className="text-gray-600 text-xs">({mp.score} pts)</span>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max, color }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right shrink-0" style={{ color }}>{label}</span>
      <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-gray-500">{value}</span>
    </div>
  );
}

function IngredientRow({ ingredient, isSelected, onAdd, onRemove, isFilling, selectedPieces, onPiecesChange, atLimit }) {
  const topFlavors = [...(ingredient.tastes || [])].sort((a, b) => b.amount - a.amount).slice(0, 2);
  const topTypes   = [...(ingredient.types  || [])].sort((a, b) => b.amount - a.amount).slice(0, 2);
  const maxPieces  = ingredient.maxPiecesOnDish ?? 12;
  const curPieces  = selectedPieces ?? ingredient.pieces ?? 1;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 border-b border-white/5 transition-colors ${isSelected ? 'bg-white/[0.07]' : 'hover:bg-white/5'}`}>
      {ingredient.imageUrl && (
        <img src={ingredient.imageUrl} alt={ingredient.name}
          className="w-7 h-7 object-contain shrink-0"
          onError={e => { e.target.style.display = 'none'; }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white leading-tight truncate">{ingredient.name}</p>
        <div className="flex gap-1 flex-wrap mt-0.5">
          {topFlavors.map(f => (
            <span key={f.flavor} className="text-[10px] px-1 rounded"
              style={{ color: FLAVOR_COLORS[f.flavor], backgroundColor: FLAVOR_COLORS[f.flavor] + '22' }}>
              {f.flavor} {f.amount > 0 ? `+${f.amount}` : f.amount}
            </span>
          ))}
          {topTypes.map(t => <TypeBadge key={t.type} type={t.type} small />)}
        </div>
      </div>

      {/* Controls */}
      {isSelected ? (
        isFilling ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => curPieces <= 1 ? onRemove() : onPiecesChange(curPieces - 1)}
              className="w-6 h-6 rounded bg-white/10 text-white text-xs hover:bg-white/20 flex items-center justify-center">−</button>
            <span className="text-xs text-white w-5 text-center select-none">{curPieces}</span>
            <button
              onClick={() => onPiecesChange(Math.min(maxPieces, curPieces + 1))}
              disabled={curPieces >= maxPieces}
              className="w-6 h-6 rounded bg-white/10 text-white text-xs hover:bg-white/20 flex items-center justify-center disabled:opacity-30">+</button>
          </div>
        ) : (
          <button onClick={onRemove}
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-red-500/20 text-red-400 hover:bg-red-500/40">−</button>
        )
      ) : (
        <button onClick={onAdd} disabled={atLimit}
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${atLimit ? 'opacity-25 cursor-not-allowed bg-white/5 text-gray-600' : 'bg-white/10 text-white hover:bg-white/20'}`}>+</button>
      )}
    </div>
  );
}

// ─── Target Power sub-component ───────────────────────────────────────────────

const ALL_POWERS = [
  'Encounter','Egg','Raid','Catching','Exp','Item Drop','Humungo','Teensy','Title','Sparkling',
];

// Map display name → effect name used in sandwiches.json
const POWER_EFFECT_NAME = {
  Encounter:  'Encounter Power',
  Egg:        'Egg Power',
  Raid:       'Raid Power',
  Catching:   'Catching Power',
  Exp:        'Exp. Point Power',
  'Item Drop':'Item Drop Power',
  Humungo:    'Humungo Power',
  Teensy:     'Teensy Power',
  Title:      'Title Power',
  Sparkling:  'Sparkling Power',
};

const POWER_ALIAS = {
  Encounter:  'Encounter', Egg: 'Egg', Raid: 'Raid', Catching: 'Catch',
  Exp:        'Exp', 'Item Drop': 'Item', Humungo: 'Humungo', Teensy: 'Teensy',
  Title:      'Title', Sparkling: 'Sparkling',
};

// Only Egg Power has no Pokémon type — Title and Sparkling do
const NO_TYPE_POWERS = new Set(['Egg']);

// What flavor dominance produces each power (from TASTE_POWERS)
const POWER_FLAVOR_HINT = {
  Encounter: { flavors: ['Salty'],          hint: 'Make Salty your dominant flavor' },
  Egg:       { flavors: ['Sweet'],          hint: 'Make Sweet your dominant flavor' },
  Raid:      { flavors: ['Sweet','Hot'],    hint: 'Sweet dominant, Hot second' },
  Catch:     { flavors: ['Sweet','Sour'],   hint: 'Sweet dominant, Sour second' },
  Exp:       { flavors: ['Bitter','Salty'], hint: 'Bitter dominant, Salty second' },
  Teensy:    { flavors: ['Sour'],           hint: 'Make Sour your dominant flavor' },
  Item:      { flavors: ['Bitter'],         hint: 'Make Bitter your dominant flavor' },
  Humungo:   { flavors: ['Hot'],            hint: 'Make Hot your dominant flavor' },
  Title:     { flavors: [],                 hint: 'Use at least 1 Herba Mystica condiment' },
  Sparkling: { flavors: [],                 hint: 'Use at least 2 Herba Mystica condiments' },
};

const EMPTY_TARGET = { power: 'Encounter', type: 'Dragon', level: null };

function TargetRow({ target, index, onChange, onRemove, canRemove }) {
  const needsType = !NO_TYPE_POWERS.has(target.power);
  const pc = POWER_COLORS[POWER_ALIAS[target.power]] || '#aaa';

  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Target {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors text-xs">✕ Remove</button>
        )}
      </div>

      {/* Power */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Power</p>
        <div className="flex flex-wrap gap-1">
          {ALL_POWERS.map(p => {
            const alias = POWER_ALIAS[p];
            const c = POWER_COLORS[alias] || '#aaa';
            const active = target.power === p;
            return (
              <button key={p} onClick={() => onChange({ ...target, power: p, type: NO_TYPE_POWERS.has(p) ? null : (target.type || 'Dragon') })}
                className="text-xs px-2 py-0.5 rounded-full border transition-all"
                style={{ backgroundColor: active ? c+'33' : 'transparent', borderColor: active ? c : 'rgba(255,255,255,0.1)', color: active ? c : '#6b7280' }}>
                {POWER_EFFECT_NAME[p].replace(' Power', '')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Type */}
      {needsType && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Pokémon Type</p>
          <div className="flex flex-wrap gap-1">
            {TYPES.map(t => {
              const tc = TYPE_COLORS[t] || '#888';
              const active = target.type === t;
              return (
                <button key={t} onClick={() => onChange({ ...target, type: t })}
                  className="text-xs px-2 py-0.5 rounded-full border transition-all"
                  style={{ backgroundColor: active ? tc+'33' : 'transparent', borderColor: active ? tc : '#374151', color: active ? tc : '#6b7280' }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Level */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Level</p>
        <div className="flex gap-1">
          {[null, 1, 2, 3].map(lv => (
            <button key={lv ?? 'any'} onClick={() => onChange({ ...target, level: lv })}
              className="text-xs px-2.5 py-0.5 rounded-full border transition-all"
              style={{ backgroundColor: target.level === lv ? pc+'33' : 'transparent', borderColor: target.level === lv ? pc : '#374151', color: target.level === lv ? pc : '#6b7280' }}>
              {lv === null ? 'Any' : `Lv. ${lv}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetPowerTab({ fillings, condiments, playerCount = 1 }) {
  const [sandwiches, setSandwiches] = useState(null);
  const [meals, setMeals] = useState(null);
  const [loadingSW, setLoadingSW] = useState(true);
  const [errorSW, setErrorSW] = useState(null);
  const [resultsTab, setResultsTab] = useState('presets'); // 'presets' | 'meals' | 'custom'

  const [targets, setTargets] = useState([{ ...EMPTY_TARGET }]);
  const [customResults, setCustomResults] = useState([]);
  const [cooccurrences, setCooccurrences] = useState({}); // { "Exp:Bitter:2": count, ... }
  const [searching, setSearching] = useState(false);
  const [sandwichCache, setSandwichCache] = useState(null); // { "Power:Type:Level": { results, cooccurrences } }

  useEffect(() => {
    Promise.all([
      fetchGHJson('sandwiches.json'),
      fetchGHJson('meals.json'),
      fetch('/data/sandwichCache.json').then(r => r.ok ? r.json() : {}),
    ])
      .then(([sw, ml, cache]) => { setSandwiches(sw); setMeals(ml); setSandwichCache(cache); setLoadingSW(false); })
      .catch(e => { setErrorSW(e.message); setLoadingSW(false); });
  }, []);

  // ─── Search: pure client-side lookup in the static cache ─────────────────
  useEffect(() => {
    // sandwichCache.json not yet generated — skip search until it's ready
    if (!fillings.length || !condiments.length || !sandwichCache || Object.keys(sandwichCache).length === 0) return;

    setSearching(true);
    setCustomResults([]);
    setCooccurrences({});

    const POWER_TO_MP_CLIENT = {
      Encounter:'Encounter', Egg:'Egg', Raid:'Raid', Catching:'Catch', Catch:'Catch',
      Exp:'Exp', 'Item Drop':'Item', Item:'Item', Humungo:'Humungo', Teensy:'Teensy',
      Title:'Title', Sparkling:'Sparkling',
    };
    const normTargets = targets.map(t => ({
      power: POWER_TO_MP_CLIENT[t.power] || t.power,
      type:  t.type,
      level: t.level,
    }));

    // "Any" level expands to all 3 levels
    const allKeys = [...new Set(
      normTargets.flatMap(t =>
        t.level === null
          ? [1,2,3].map(lv => `${t.power}:${t.type ?? 'none'}:${lv}`)
          : [`${t.power}:${t.type ?? 'none'}:${t.level}`]
      )
    )];

    const fillMap = Object.fromEntries(fillings.map(f => [f.name, f]));
    const condMap = Object.fromEntries(condiments.map(c => [c.name, c]));

    function sandwichKey(s) {
      return [...(s.fillings||[]).map(f=>`${f.name}×${f.pieces??1}`), ...(s.condiments||[])].sort().join('|');
    }
    function reconstitute(s) {
      return {
        ...s,
        fillings:   (s.fillings||[]).map(f=>({...(fillMap[f.name]||{name:f.name}), selectedPieces:f.pieces??1})),
        condiments: (s.condiments||[]).map(n=>condMap[n]||{name:n}),
      };
    }

    // Union all sandwiches from relevant cache keys
    const allSandwichMap = new Map();
    const mergedCooc = {};
    for (const key of allKeys) {
      const entry = sandwichCache[key];
      if (!entry) continue;
      for (const s of (entry.results ?? [])) {
        const k = sandwichKey(s);
        if (!allSandwichMap.has(k)) allSandwichMap.set(k, s);
      }
      for (const [k, count] of Object.entries(entry.cooccurrences ?? {})) {
        mergedCooc[k] = (mergedCooc[k] ?? 0) + count;
      }
    }

    // Filter: every target must be satisfied by the sandwich's stored powers
    const results = [...allSandwichMap.values()]
      .filter(s => normTargets.every(tgt =>
        (s.powers ?? []).some(p =>
          p.power === tgt.power &&
          (tgt.power === 'Egg' || !tgt.type || p.type === tgt.type) &&
          p.level >= (tgt.level ?? 1)
        )
      ))
      .map(s => reconstitute(s))
      .sort((a, b) =>
        (a.totalPieces - b.totalPieces) ||
        ((a.fillings.length + a.condiments.length) - (b.fillings.length + b.condiments.length))
      );

    setCooccurrences(mergedCooc);
    setCustomResults(results);
    setSearching(false);
  }, [targets, fillings, condiments, playerCount, sandwichCache]);

  function updateTarget(i, val) { setTargets(prev => prev.map((t, idx) => idx === i ? val : t)); }
  function removeTarget(i) { setTargets(prev => prev.filter((_, idx) => idx !== i)); }
  function addTarget() { if (targets.length < 3) setTargets(prev => [...prev, { ...EMPTY_TARGET }]); }

  function matchesTargets(item) {
    return targets.every(tgt => {
      const effectName = POWER_EFFECT_NAME[tgt.power];
      const needsType = !NO_TYPE_POWERS.has(tgt.power);
      return item.effects?.some(e =>
        e.name === effectName &&
        (!needsType || !tgt.type || e.type === tgt.type) &&
        (tgt.level === null || e.level === tgt.level)
      );
    });
  }

  const matches = useMemo(() => {
    if (!sandwiches) return [];
    return sandwiches.filter(matchesTargets);
  }, [sandwiches, targets]);

  const mealMatches = useMemo(() => {
    if (!meals) return [];
    return meals.filter(matchesTargets);
  }, [meals, targets]);

  if (loadingSW) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      Loading recipes…
    </div>
  );

  if (errorSW) return (
    <div className="rounded-lg p-4 bg-red-900/20 border border-red-700 text-red-300 text-sm">
      Failed to load recipes: {errorSW}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Left: Target selectors */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Target Meal Powers</p>
        {targets.map((tgt, i) => (
          <TargetRow key={i} target={tgt} index={i}
            onChange={val => updateTarget(i, val)}
            onRemove={() => removeTarget(i)}
            canRemove={targets.length > 1} />
        ))}
        {targets.length < 3 && (
          <button onClick={addTarget}
            className="w-full py-2 rounded-lg text-gray-600 hover:text-gray-400 text-sm transition-colors" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
            + Add another target
          </button>
        )}
      </div>

      {/* Right: Results */}
      <div>
        {/* Sub-tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.5rem' }}>
          {[
            { key: 'presets', label: `Presets (${matches.length})` },
            { key: 'meals',   label: `Restaurants (${mealMatches.length})` },
            { key: 'custom',  label: 'Build Your Own', wip: true },
          ].map(({ key, label, wip }) => (
            <button key={key} onClick={() => setResultsTab(key)}
              className="px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5"
              style={resultsTab === key ? { backgroundColor: '#35373b', color: '#fff' } : { color: '#6b7280' }}>
              {label}
              {wip && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 leading-none">
                  WIP
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Preset results */}
        {resultsTab === 'presets' && (
          matches.length === 0 ? (
            <div className="rounded-xl flex items-center justify-center py-16 text-gray-600 text-sm" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              No preset sandwiches match all targets
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {matches.map(sw => (
                <div key={sw.number} className="rounded-xl p-3" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start gap-3">
                    {sw.imageUrl && (
                      <img src={sw.imageUrl} alt={sw.name}
                        className="w-12 h-12 rounded-lg object-cover shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-600 text-xs">#{sw.number}</span>
                        <span className="text-white font-semibold text-sm">{sw.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {sw.effects?.map((e, i) => {
                          const alias = Object.entries(POWER_EFFECT_NAME).find(([, v]) => v === e.name)?.[0];
                          const ak = POWER_ALIAS[alias] || 'Egg';
                          const ec = POWER_COLORS[ak] || '#aaa';
                          const isTarget = targets.some(tgt => {
                            const en = POWER_EFFECT_NAME[tgt.power];
                            const nt = !NO_TYPE_POWERS.has(tgt.power);
                            return e.name === en && (!nt || !tgt.type || e.type === tgt.type);
                          });
                          return (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full border"
                              style={{ backgroundColor: isTarget ? ec+'33' : 'transparent', borderColor: isTarget ? ec : '#374151', color: isTarget ? ec : '#6b7280' }}>
                              {e.name.replace(' Power', '')}{e.type ? `: ${e.type}` : ''} Lv.{e.level}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        {sw.fillings?.join(', ')}
                        {sw.condiments?.length > 0 && <> · <span className="text-gray-700">{sw.condiments.join(', ')}</span></>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Restaurant meals */}
        {resultsTab === 'meals' && (
          mealMatches.length === 0 ? (
            <div className="rounded-xl flex items-center justify-center py-16 text-gray-600 text-sm" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
              No restaurant meals match all targets
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {mealMatches.map((meal, mi) => (
                <div key={mi} className="rounded-xl p-3" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex items-start gap-3">
                    {meal.imageUrl && (
                      <img src={meal.imageUrl} alt={meal.name}
                        className="w-12 h-12 rounded-lg object-cover shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-white font-semibold text-sm">{meal.name}</span>
                        {meal.cost != null && (
                          <span className="text-[10px] text-gray-500">¥{meal.cost.toLocaleString()}</span>
                        )}
                      </div>
                      {/* Effects */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {meal.effects?.map((e, i) => {
                          const alias = Object.entries(POWER_EFFECT_NAME).find(([, v]) => v === e.name)?.[0];
                          const ak = POWER_ALIAS[alias] || 'Egg';
                          const ec = POWER_COLORS[ak] || '#aaa';
                          const isTarget = targets.some(tgt => {
                            const en = POWER_EFFECT_NAME[tgt.power];
                            const nt = !NO_TYPE_POWERS.has(tgt.power);
                            return e.name === en && (!nt || !tgt.type || e.type === tgt.type);
                          });
                          return (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full border"
                              style={{ backgroundColor: isTarget ? ec+'33' : 'transparent', borderColor: isTarget ? ec : '#374151', color: isTarget ? ec : '#6b7280' }}>
                              {e.name.replace(' Power', '')}{e.type ? `: ${e.type}` : ''} Lv.{e.level}
                            </span>
                          );
                        })}
                      </div>
                      {/* Shop & towns */}
                      {meal.shop && (
                        <div className="text-xs text-gray-600">
                          <span className="text-gray-500">{meal.shop}</span>
                          {meal.towns?.length > 0 && (
                            <span> · {meal.towns.join(', ')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Build Your Own — coming soon placeholder */}
        {resultsTab === 'custom' && (
          <div className="rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center py-16 text-gray-600 text-sm text-center gap-2">
            <span className="text-2xl">🥪</span>
            <span className="text-gray-400 font-medium">Custom sandwich finder coming soon</span>
            <span className="text-xs text-gray-600">We're building a database of optimal recipes. Check the Presets tab in the meantime.</span>
          </div>
        )}
        {/* Build Your Own — hidden until cache is ready */}
        {resultsTab === 'custom' && false && (
          searching ? (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-500 text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Searching all valid sandwiches…
            </div>
          ) : customResults.length > 0 ? (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {customResults.map((res, ri) => (
                <div key={ri} className="rounded-xl p-4 space-y-3" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    {res.fillings.length} filling{res.fillings.length !== 1 ? 's' : ''}, {res.condiments.length} condiment{res.condiments.length !== 1 ? 's' : ''}
                    {res.totalPieces != null && (
                      <span className="text-gray-600 font-normal ml-2">({res.totalPieces} total pieces)</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {res.powers.map((p, i) => {
                      const pc = POWER_COLORS[p.power] || '#aaa';
                      const isTarget = targets.some(t => t.power === p.power && (t.power === 'Egg' || !t.type || p.type === t.type));
                      return (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full border font-medium"
                          style={{ backgroundColor: isTarget ? pc+'33' : 'transparent', borderColor: isTarget ? pc : '#374151', color: isTarget ? pc : '#6b7280' }}>
                          {p.fullName.replace(' Power','')}{p.type ? `: ${p.type}` : ''} Lv.{p.level}
                        </span>
                      );
                    })}
                  </div>
                  {res.fillings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">Fillings</p>
                      <div className="space-y-1">
                        {res.fillings.map(f => (
                          <div key={f.name} className="flex items-center gap-2 text-sm">
                            {f.imageUrl && <img src={f.imageUrl} alt={f.name} className="w-6 h-6 object-contain shrink-0" onError={e => { e.target.style.display='none'; }} />}
                            <span className="text-gray-200 flex-1">{f.name}</span>
                            <span className="text-gray-500 text-xs shrink-0">×{f.selectedPieces ?? f.pieces} piece{(f.selectedPieces ?? f.pieces) !== 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {res.condiments.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 mb-1.5">Condiments</p>
                      <div className="space-y-1">
                        {res.condiments.map(c => (
                          <div key={c.name} className="flex items-center gap-2 text-sm">
                            {c.imageUrl && <img src={c.imageUrl} alt={c.name} className="w-6 h-6 object-contain shrink-0" onError={e => { e.target.style.display='none'; }} />}
                            <span className="text-gray-200 flex-1">{c.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 flex flex-col items-center justify-center py-16 text-gray-600 text-sm text-center gap-2">
              <span>No custom sandwich found for these targets.</span>
              <span className="text-xs text-gray-700">Try adjusting the target level or type, or check the Presets tab.</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SVSandwichCalculator() {
  const [pageMode, setPageMode] = useState('builder'); // 'builder' | 'target'
  const [playerCount, setPlayerCount] = useState(1); // 1–4

  const [fillings, setFillings] = useState([]);
  const [condiments, setCondiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tab, setTab] = useState('fillings'); // 'fillings' | 'condiments'
  const [search, setSearch] = useState('');
  const [flavorFilters, setFlavorFilters] = useState(new Set());
  const [typeFilters, setTypeFilters] = useState(new Set());
  const [showKey, setShowKey] = useState(false);

  const [selFillings, setSelFillings] = useState([]);   // [{...filling, selectedPieces}]
  const [selCondiments, setSelCondiments] = useState([]); // [{...condiment}]

  useEffect(() => {
    Promise.all([
      fetchGHJson('fillings.json'),
      fetchGHJson('condiments.json'),
    ])
      .then(([f, c]) => { setFillings(f); setCondiments(c); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  function toggleFilter(set, setter, val) {
    setter(prev => {
      const next = new Set(prev);
      next.has(val) ? next.delete(val) : next.add(val);
      return next;
    });
  }

  const allIngredients = tab === 'fillings' ? fillings : condiments;
  const filtered = allIngredients.filter(i => {
    if (search.trim() && !i.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    const flavorsOk = flavorFilters.size === 0 || (i.tastes || []).some(t => flavorFilters.has(t.flavor));
    const typesOk   = typeFilters.size === 0   || (i.types  || []).some(t => typeFilters.has(t.type));
    return flavorsOk && typesOk;
  });

  const selNames = new Set([
    ...selFillings.map(f => f.name),
    ...selCondiments.map(c => c.name),
  ]);

  function addFilling(ing) {
    setSelFillings(prev => {
      if (prev.length >= playerCount * 6) return prev;
      return [...prev, { ...ing, selectedPieces: ing.pieces ?? 1 }];
    });
  }

  function removeFilling(name) {
    setSelFillings(prev => prev.filter(f => f.name !== name));
  }

  function setPieces(name, pieces) {
    setSelFillings(prev => prev.map(f => f.name === name ? { ...f, selectedPieces: pieces } : f));
  }

  function addCondiment(ing) {
    if (selCondiments.length >= playerCount * 4) return;
    setSelCondiments(prev => prev.find(c => c.name === ing.name) ? prev : [...prev, { ...ing }]);
  }

  function removeCondiment(name) {
    setSelCondiments(prev => prev.filter(c => c.name !== name));
  }

  const results = useMemo(() => {
    if (!selFillings.length && !selCondiments.length) return null;
    return calculatePowers(selFillings, selCondiments);
  }, [selFillings, selCondiments]);

  // Meal powers are only valid once there's at least 1 filling AND 1 condiment
  const sandwichComplete = selFillings.length >= 1 && selCondiments.length >= 1;

  const maxTasteScore = results ? Math.max(1, ...results.sortedTastes.map(t => t.amount)) : 1;
  const maxTypeScore  = results ? Math.max(1, ...results.sortedTypes.slice(0, 8).map(t => t.power)) : 1;

  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-30 border-b"
        style={{ background: 'rgba(13,15,20,0.85)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <button onClick={() => navigate('/tools')}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Shiny Tools</span>
          </button>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span className="text-sm font-semibold text-white">S/V Sandwich Calculator</span>
        </div>
      </div>

    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Top-level tabs + player count */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.5rem' }}>
        {[
          { key: 'builder', label: '🥪 Custom Builder' },
          { key: 'target',  label: '🎯 Target Power' },
        ].map(({ key, label, wip }) => (
          <button
            key={key}
            onClick={() => setPageMode(key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5"
            style={pageMode === key
              ? { background: 'rgba(255,255,255,0.09)', color: '#fff' }
              : { color: '#6b7280' }
            }
          >
            {label}
            {wip && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 leading-none">
                WIP
              </span>
            )}
          </button>
        ))}
      </div>

        {/* Player count selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Players:</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setPlayerCount(n)}
                className="w-7 h-7 rounded text-xs font-bold transition-all"
                style={playerCount === n
                  ? { background: 'rgba(255,255,255,0.09)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }
                  : { background: 'transparent', color: '#6b7280', border: '1px solid rgba(255,255,255,0.08)' }}>
                {n}
              </button>
            ))}
          </div>
          {playerCount > 1 && (
            <span className="text-xs text-gray-600">
              (max {playerCount * 6} fillings, {playerCount * 4} condiments)
            </span>
          )}
        </div>
      </div>

      {/* Target Power tab — loads its own data independently */}
      {pageMode === 'target' && <TargetPowerTab fillings={fillings} condiments={condiments} playerCount={playerCount} />}

      {/* Builder tab */}
      {pageMode === 'builder' && loading && (
        <div className="flex items-center justify-center py-24 gap-3 text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Loading ingredient data…
        </div>
      )}

      {pageMode === 'builder' && error && (
        <div className="rounded-lg p-4 bg-red-900/20 border border-red-700 text-red-300 text-sm">
          Failed to load data: {error}
        </div>
      )}

      {pageMode === 'builder' && !loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left: Ingredient picker ── */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>

            {/* Tabs */}
            <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              {['fillings', 'condiments'].map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setSearch(''); }}
                  className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                    tab === t ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t === 'fillings' ? `Fillings (${selFillings.length}/${playerCount * 6})` : `Condiments (${selCondiments.length}/${playerCount * 4})`}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 pt-2 pb-1.5 space-y-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="w-full rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-white/20"
                style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}
              />

              {/* Flavor filters */}
              <div className="flex flex-wrap gap-1">
                {['Sweet','Salty','Sour','Bitter','Hot'].map(f => {
                  const active = flavorFilters.has(f);
                  const fc = FLAVOR_COLORS[f];
                  return (
                    <button key={f} onClick={() => toggleFilter(flavorFilters, setFlavorFilters, f)}
                      className="text-[11px] px-2 py-0.5 rounded-full border transition-all"
                      style={{ backgroundColor: active ? fc+'33' : 'transparent', borderColor: active ? fc : '#374151', color: active ? fc : '#6b7280' }}>
                      {f}
                    </button>
                  );
                })}
                <div className="w-px bg-gray-700 mx-0.5" />
                {(flavorFilters.size > 0 || typeFilters.size > 0) && (
                  <button onClick={() => { setFlavorFilters(new Set()); setTypeFilters(new Set()); }}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-gray-700 text-gray-600 hover:text-red-400 transition-colors">
                    Clear
                  </button>
                )}
              </div>

              {/* Type filters — collapsible grid */}
              <div className="flex flex-wrap gap-1">
                {TYPES.map(t => {
                  const active = typeFilters.has(t);
                  const tc = TYPE_COLORS[t] || '#888';
                  return (
                    <button key={t} onClick={() => toggleFilter(typeFilters, setTypeFilters, t)}
                      className="text-[11px] px-2 py-0.5 rounded-full border transition-all"
                      style={{ backgroundColor: active ? tc+'33' : 'transparent', borderColor: active ? tc : '#374151', color: active ? tc : '#6b7280' }}>
                      {t}
                    </button>
                  );
                })}
              </div>

              {/* Flavor → Power key toggle */}
              <button onClick={() => setShowKey(v => !v)}
                className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1">
                <svg className={`w-3 h-3 transition-transform ${showKey ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Flavor → Power guide
              </button>
              {showKey && (
                <div className="rounded-lg p-2 space-y-1" style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    { flavors: ['Sweet'],          power: 'Egg',       label: 'Sweet dominant' },
                    { flavors: ['Sweet','Sour'],   power: 'Catch',     label: 'Sweet + Sour' },
                    { flavors: ['Sweet','Hot'],    power: 'Raid',      label: 'Sweet + Hot' },
                    { flavors: ['Salty'],          power: 'Encounter', label: 'Salty dominant' },
                    { flavors: ['Bitter','Salty'], power: 'Exp',       label: 'Bitter + Salty' },
                    { flavors: ['Sour'],           power: 'Teensy',    label: 'Sour dominant' },
                    { flavors: ['Bitter'],         power: 'Item',      label: 'Bitter dominant' },
                    { flavors: ['Hot'],            power: 'Humungo',   label: 'Hot dominant' },
                  ].map(row => (
                    <div key={row.power} className="flex items-center gap-2 text-[11px]">
                      <div className="flex gap-0.5 w-28 shrink-0">
                        {row.flavors.map(f => (
                          <span key={f} className="px-1.5 py-0.5 rounded" style={{ backgroundColor: FLAVOR_COLORS[f]+'22', color: FLAVOR_COLORS[f] }}>{f}</span>
                        ))}
                      </div>
                      <span className="text-gray-600">→</span>
                      <span style={{ color: POWER_COLORS[row.power] || '#aaa' }}>{POWER_FULL[row.power]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ingredient list */}
            <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
              {filtered.length === 0 && (
                <p className="text-gray-600 text-sm text-center py-8">No results</p>
              )}
              {filtered.map(ing => {
                const isFill = tab === 'fillings';
                const isSelected = selNames.has(ing.name);
                const atLimit = isFill
                  ? selFillings.length >= playerCount * 6 && !isSelected
                  : selCondiments.length >= playerCount * 4 && !isSelected;
                const selFilling = isFill ? selFillings.find(f => f.name === ing.name) : null;
                return (
                  <IngredientRow
                    key={ing.name}
                    ingredient={ing}
                    isSelected={isSelected}
                    isFilling={isFill}
                    onAdd={() => isFill ? addFilling(ing) : addCondiment(ing)}
                    onRemove={() => isFill ? removeFilling(ing.name) : removeCondiment(ing.name)}
                    selectedPieces={selFilling?.selectedPieces}
                    onPiecesChange={isFill ? p => setPieces(ing.name, p) : undefined}
                    atLimit={atLimit}
                  />
                );
              })}
            </div>

            {/* Clear button */}
            {(selFillings.length > 0 || selCondiments.length > 0) && (
              <div className="border-t px-3 py-2" style={{ background: '#0d0f14', borderColor: 'rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => { setSelFillings([]); setSelCondiments([]); }}
                  className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                >
                  Clear all selections
                </button>
              </div>
            )}
          </div>

          {/* ── Right: Results ── */}
          <div className="space-y-4">
            {!results ? (
              <div className="rounded-xl flex flex-col items-center justify-center py-20 text-gray-600" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
                <span className="text-4xl mb-3">🥪</span>
                <p className="text-sm">Add at least one filling and one condiment</p>
              </div>
            ) : (
              <>
                {/* Meal powers — only shown once sandwich is completable */}
                {sandwichComplete ? (
                  <div className="rounded-xl p-4 space-y-2" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Meal Powers</p>
                    {results.mealPowers.length === 0 ? (
                      <p className="text-gray-600 text-sm">No active powers yet</p>
                    ) : results.mealPowers.map((mp, i) => (
                      <MealPowerCard key={i} mp={mp} rank={i + 1} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl p-4 text-center text-gray-600 text-xs" style={{ border: '1px dashed rgba(255,255,255,0.1)' }}>
                    Add at least 1 filling and 1 condiment to see Meal Powers
                  </div>
                )}

                {/* Flavor breakdown */}
                {results.sortedTastes.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Flavor Profile</p>
                    <div className="space-y-1.5">
                      {results.sortedTastes.filter(t => t.amount > 0).map(t => (
                        <ScoreBar
                          key={t.flavor}
                          label={t.flavor}
                          value={t.amount}
                          max={maxTasteScore}
                          color={FLAVOR_COLORS[t.flavor] || '#888'}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Top types */}
                <div className="rounded-xl p-4" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Top Types</p>
                  <div className="space-y-1.5">
                    {results.sortedTypes.slice(0, 8).map(t => (
                      <ScoreBar
                        key={t.name}
                        label={t.name}
                        value={t.power}
                        max={maxTypeScore}
                        color={TYPE_COLORS[t.name] || '#888'}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
    </div>
  );
}
