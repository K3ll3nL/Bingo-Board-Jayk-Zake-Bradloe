import React, { useState, useMemo } from 'react';

// ─── Formula functions ────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

// Gen I: 4 shake checks at (modified/255) each
function calcGen1(catchRate, maxHP, currentHP, ballMult, statusAdd) {
  if (ballMult === null) return 1;
  const f = Math.floor((3 * maxHP - 2 * currentHP) * catchRate / (3 * maxHP));
  const modified = clamp(Math.round(f * ballMult) + statusAdd, 0, 255);
  if (modified >= 255) return 1;
  return Math.pow(modified / 255, 4);
}

// Gen II: multiplicative ball/status but same shake structure as Gen I
function calcGen2(catchRate, maxHP, currentHP, ballBonus, statusMult, heavyAdd = 0) {
  if (ballBonus === null) return 1;
  const effectiveRate = clamp(catchRate + heavyAdd, 1, 255);
  const a = clamp(
    Math.floor((3 * maxHP - 2 * currentHP) * effectiveRate * ballBonus * statusMult / (3 * maxHP)),
    0, 255
  );
  if (a >= 255) return 1;
  return Math.pow(a / 255, 4);
}

// Gen III–IX standard: Bulbapedia shake formula
function calcStandard(catchRate, maxHP, currentHP, ballBonus, statusMult, shakes = 4) {
  if (ballBonus === null) return 1;
  const a = clamp(
    Math.floor((3 * maxHP - 2 * currentHP) * catchRate * ballBonus * statusMult / (3 * maxHP)),
    0, 255
  );
  if (a >= 255) return 1;
  const b = Math.floor(65536 / Math.pow(255 / a, 0.75));
  return Math.pow(b / 65536, shakes);
}

// Legends: Arceus — approximate; game uses a fundamentally different catch model
function calcPLA(catchRate, maxHP, currentHP, ballBonus, statusMult) {
  if (ballBonus === null) return 1;
  const hpRatio = currentHP / maxHP;
  // rough approximation of PLA catch probability
  const a = clamp(
    Math.floor((3 * maxHP - 2 * currentHP) * catchRate * ballBonus * statusMult / (3 * maxHP)),
    0, 255
  );
  if (a >= 255) return 1;
  const b = Math.floor(65536 / Math.pow(255 / a, 0.75));
  return Math.pow(b / 65536, 3); // PLA uses 3 shake checks
}

// ─── Ball definitions ─────────────────────────────────────────────────────────

// getBonus(ctx) returns a numeric multiplier, or null for guaranteed catch.
// Special: Heavy Ball Gen II returns { add: N } instead of a multiplier.
// ctx fields: turn, isNight, isCave, isFishing, isSurfing, isWater, isBug,
//   caughtBefore, level, playerLevel, baseSpeed, isMoonEvo,
//   isSameSpeciesOppositeGender, weightKg, isUltraBeast, formula

const BALLS = {
  master:  { name: 'Master Ball',  short: 'MB',  color: '#9b5de5', getBonus: () => null },
  ultra:   { name: 'Ultra Ball',   short: 'UB',  color: '#f5c518', getBonus: () => 2 },
  great:   { name: 'Great Ball',   short: 'GB',  color: '#3b82f6', getBonus: () => 1.5 },
  poke:    { name: 'Poké Ball',    short: 'PB',  color: '#ef4444', getBonus: () => 1 },
  safari:  { name: 'Safari Ball',  short: 'SB',  color: '#22c55e', getBonus: () => 1.5 },
  sport:   { name: 'Sport Ball',   short: 'SpB', color: '#f97316', getBonus: () => 1.5 },
  premier: { name: 'Premier Ball', short: 'PrB', color: '#e5e7eb', getBonus: () => 1 },
  luxury:  { name: 'Luxury Ball',  short: 'LxB', color: '#b45309', getBonus: () => 1, note: 'Raises friendship' },
  heal:    { name: 'Heal Ball',    short: 'HlB', color: '#f9a8d4', getBonus: () => 1, note: 'Restores HP/status on catch' },
  cherish: { name: 'Cherish Ball', short: 'ChB', color: '#dc2626', getBonus: () => 1, note: 'Event-only' },
  park:    { name: 'Park Ball',    short: 'PkB', color: '#facc15', getBonus: () => Infinity },
  dream:   { name: 'Dream Ball',   short: 'DrB', color: '#a78bfa', getBonus: () => 1, note: 'Only works on sleeping Pokémon in Dream World / Poké Transfer' },
  friend:  { name: 'Friend Ball',  short: 'FrB', color: '#86efac', getBonus: () => 1, note: 'Sets high friendship' },

  net: {
    name: 'Net Ball', short: 'NB', color: '#38bdf8',
    getBonus: (ctx) => (ctx.isWater || ctx.isBug) ? 3.5 : 1,
    contexts: ['type'],
    bonusDesc: '3.5× for Water or Bug types',
  },
  dive: {
    name: 'Dive Ball', short: 'DvB', color: '#0ea5e9',
    getBonus: (ctx) => (ctx.isSurfing || ctx.isFishing) ? 3.5 : 1,
    contexts: ['encounter'],
    bonusDesc: '3.5× while surfing or fishing',
  },
  nest: {
    name: 'Nest Ball', short: 'NeB', color: '#4ade80',
    getBonus: (ctx) => {
      // Gen III: floor((41 - level) / 10), min 1; Gen V+: (41 - level) / 10, min 1
      const bonus = ctx.formula === 'standard' && ctx.ballSet === 'gen3'
        ? Math.max(1, Math.floor((41 - ctx.level) / 10))
        : Math.max(1, (41 - ctx.level) / 10);
      return bonus;
    },
    contexts: ['level'],
    bonusDesc: 'Higher bonus for lower-level targets (max ~4× at level 1)',
  },
  repeat: {
    name: 'Repeat Ball', short: 'RpB', color: '#f87171',
    getBonus: (ctx) => ctx.caughtBefore ? 3.5 : 1,
    contexts: ['caught'],
    bonusDesc: '3.5× if already caught this species',
  },
  timer: {
    name: 'Timer Ball', short: 'TB', color: '#d1d5db',
    getBonus: (ctx) => Math.min(4, 1 + Math.floor(ctx.turn / 10)),
    contexts: ['turn'],
    bonusDesc: 'Increases each 10 turns, max 4× at turn 30+',
  },
  quick: {
    name: 'Quick Ball', short: 'QB', color: '#fde047',
    getBonus: (ctx) => ctx.turn === 1 ? 5 : 1,
    contexts: ['turn'],
    bonusDesc: '5× on turn 1 only (4× in Gen IV)',
  },
  dusk: {
    name: 'Dusk Ball', short: 'DkB', color: '#374151',
    getBonus: (ctx) => (ctx.isNight || ctx.isCave) ? 3.5 : 1,
    contexts: ['time'],
    bonusDesc: '3.5× at night or inside caves/buildings',
  },
  moon: {
    name: 'Moon Ball', short: 'MoB', color: '#c4b5fd',
    // Gen II: 4× if moon-stone evo; Gen IV HGSS/Gen VIII: same
    getBonus: (ctx) => ctx.isMoonEvo ? 4 : 1,
    contexts: ['moonevo'],
    bonusDesc: '4× if target evolves with a Moon Stone',
  },
  love: {
    name: 'Love Ball', short: 'LoB', color: '#f9a8d4',
    getBonus: (ctx) => ctx.isSameSpeciesOppositeGender ? 8 : 1,
    contexts: ['love'],
    bonusDesc: '8× if target is same species & opposite gender as your lead',
  },
  level: {
    name: 'Level Ball', short: 'LvB', color: '#fb923c',
    getBonus: (ctx) => {
      const ratio = ctx.playerLevel / Math.max(1, ctx.level);
      if (ratio >= 4) return 8;
      if (ratio >= 2) return 4;
      if (ratio > 1) return 2;
      return 1;
    },
    contexts: ['level', 'playerLevel'],
    bonusDesc: 'Up to 8× if your Pokémon is 4× higher level',
  },
  lure: {
    name: 'Lure Ball', short: 'LrB', color: '#38bdf8',
    getBonus: (ctx) => ctx.isFishing ? 3 : 1,
    contexts: ['encounter'],
    bonusDesc: '3× when using a fishing rod',
  },
  fast: {
    name: 'Fast Ball', short: 'FsB', color: '#e2e8f0',
    getBonus: (ctx) => ctx.baseSpeed >= 100 ? 4 : 1,
    contexts: ['speed'],
    bonusDesc: '4× if target\'s base Speed is 100 or higher',
  },
  heavy: {
    name: 'Heavy Ball', short: 'HvB', color: '#6b7280',
    // Gen II: additive to catch rate; Gen VIII: multiplier
    getBonus: (ctx) => {
      if (ctx.formula === 'gen8heavy') return heavyBallGen8Mult(ctx.weightKg);
      return 1; // Gen II handled via heavyAdd
    },
    getHeavyAdd: (ctx) => {
      // Gen II: additive modifier to base catch rate
      const kg = ctx.weightKg;
      if (kg >= 409.6) return 30;
      if (kg >= 307.2) return 20;
      if (kg >= 204.8) return 0;
      return -20;
    },
    contexts: ['weight'],
    bonusDesc: 'Gen II: ±20–30 additive to catch rate by weight; Gen VIII: multiplier by weight',
  },
  beast: {
    name: 'Beast Ball', short: 'BsB', color: '#67e8f9',
    getBonus: (ctx) => ctx.isUltraBeast ? 5 : 0.1,
    contexts: ['ub'],
    bonusDesc: '5× for Ultra Beasts, 0.1× for everything else',
  },
  // PLA balls
  feather: { name: 'Feather Ball', short: 'FeB', color: '#bae6fd', getBonus: () => 1 },
  wing:    { name: 'Wing Ball',    short: 'WgB', color: '#7dd3fc', getBonus: () => 1.5 },
  jet:     { name: 'Jet Ball',     short: 'JtB', color: '#38bdf8', getBonus: () => 2 },
  heavy_pla: { name: 'Heavy Ball', short: 'HvB', color: '#6b7280', getBonus: () => 1, note: 'PLA variant — stationary throws' },
  leaden:  { name: 'Leaden Ball',  short: 'LdB', color: '#9ca3af', getBonus: () => 1.5 },
  gigaton: { name: 'Gigaton Ball', short: 'GgB', color: '#d1d5db', getBonus: () => 2 },
};

function heavyBallGen8Mult(kg) {
  if (kg >= 300) return 30;
  if (kg >= 200) return 20;
  if (kg >= 100) return 0;
  return -20;
}

// ─── Ball sets per game ───────────────────────────────────────────────────────

const BALL_SETS = {
  gen1:    ['master', 'ultra', 'great', 'poke', 'safari'],
  gen2:    ['master', 'ultra', 'great', 'poke', 'safari', 'sport', 'moon', 'love', 'friend', 'heavy', 'level', 'lure', 'fast'],
  gen3:    ['master', 'ultra', 'great', 'poke', 'safari', 'premier', 'luxury', 'net', 'dive', 'nest', 'repeat', 'timer'],
  gen4:    ['master', 'ultra', 'great', 'poke', 'safari', 'sport', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick'],
  gen4hgss:['master', 'ultra', 'great', 'poke', 'safari', 'sport', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'moon', 'love', 'friend', 'heavy', 'level', 'lure', 'fast', 'park'],
  gen5:    ['master', 'ultra', 'great', 'poke', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'dream'],
  gen6:    ['master', 'ultra', 'great', 'poke', 'safari', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick'],
  gen7:    ['master', 'ultra', 'great', 'poke', 'premier', 'luxury', 'heal', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'dream'],
  gen7ub:  ['master', 'ultra', 'great', 'poke', 'premier', 'luxury', 'heal', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'dream', 'beast'],
  gen8:    ['master', 'ultra', 'great', 'poke', 'safari', 'sport', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'dream', 'moon', 'love', 'friend', 'level', 'lure', 'fast', 'beast'],
  bdsp:    ['master', 'ultra', 'great', 'poke', 'safari', 'sport', 'premier', 'luxury', 'heal', 'cherish', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'park', 'moon', 'love', 'friend', 'heavy', 'level', 'lure', 'fast'],
  pla:     ['poke', 'great', 'ultra', 'feather', 'wing', 'jet', 'heavy_pla', 'leaden', 'gigaton'],
  gen9:    ['master', 'ultra', 'great', 'poke', 'premier', 'luxury', 'heal', 'net', 'dive', 'nest', 'repeat', 'timer', 'dusk', 'quick', 'beast'],
};

// ─── Game list ────────────────────────────────────────────────────────────────

const GAMES = [
  { id: 'rby',  label: 'Red / Blue / Yellow',                formula: 'gen1',     ballSet: 'gen1',     gen: 1 },
  { id: 'gsc',  label: 'Gold / Silver / Crystal',            formula: 'gen2',     ballSet: 'gen2',     gen: 2 },
  { id: 'rse',  label: 'Ruby / Sapphire / Emerald',          formula: 'standard', ballSet: 'gen3',     gen: 3 },
  { id: 'frlg', label: 'FireRed / LeafGreen',                formula: 'standard', ballSet: 'gen3',     gen: 3 },
  { id: 'dp',   label: 'Diamond / Pearl',                    formula: 'standard', ballSet: 'gen4',     gen: 4 },
  { id: 'pt',   label: 'Platinum',                           formula: 'standard', ballSet: 'gen4',     gen: 4 },
  { id: 'hgss', label: 'HeartGold / SoulSilver',             formula: 'standard', ballSet: 'gen4hgss', gen: 4 },
  { id: 'bw',   label: 'Black / White',                      formula: 'standard', ballSet: 'gen5',     gen: 5 },
  { id: 'bw2',  label: 'Black 2 / White 2',                  formula: 'standard', ballSet: 'gen5',     gen: 5 },
  { id: 'xy',   label: 'X / Y',                              formula: 'standard', ballSet: 'gen6',     gen: 6 },
  { id: 'oras', label: 'Omega Ruby / Alpha Sapphire',        formula: 'standard', ballSet: 'gen6',     gen: 6 },
  { id: 'sm',   label: 'Sun / Moon',                         formula: 'standard', ballSet: 'gen7',     gen: 7 },
  { id: 'usum', label: 'Ultra Sun / Ultra Moon',             formula: 'standard', ballSet: 'gen7ub',   gen: 7 },
  { id: 'swsh', label: 'Sword / Shield',                     formula: 'standard', ballSet: 'gen8',     gen: 8 },
  { id: 'bdsp', label: 'Brilliant Diamond / Shining Pearl',  formula: 'standard', ballSet: 'bdsp',     gen: 8 },
  { id: 'pla',  label: 'Legends: Arceus',                    formula: 'pla',      ballSet: 'pla',      gen: 8 },
  { id: 'sv',   label: 'Scarlet / Violet',                   formula: 'standard', ballSet: 'gen9',     gen: 9 },
];

// ─── Status effects ───────────────────────────────────────────────────────────

const STATUS_DEFS = {
  gen1: [
    { id: 'none',  label: 'None',      add: 0 },
    { id: 'sleep', label: 'Sleep',     add: 10 },
    { id: 'frz',   label: 'Frozen',    add: 10 },
    { id: 'par',   label: 'Paralysis', add: 5 },
    { id: 'psn',   label: 'Poison',    add: 5 },
    { id: 'brn',   label: 'Burn',      add: 5 },
  ],
  gen2: [
    { id: 'none',  label: 'None',      mult: 1 },
    { id: 'sleep', label: 'Sleep',     mult: 2.5 },
    { id: 'frz',   label: 'Frozen',    mult: 2.5 },
    { id: 'par',   label: 'Paralysis', mult: 1.5 },
    { id: 'psn',   label: 'Poison',    mult: 1.5 },
    { id: 'brn',   label: 'Burn',      mult: 1.5 },
  ],
  standard: [
    { id: 'none',  label: 'None',      mult: 1 },
    { id: 'sleep', label: 'Sleep',     mult: 2.5 },
    { id: 'frz',   label: 'Frozen',    mult: 2.5 },
    { id: 'par',   label: 'Paralysis', mult: 1.5 },
    { id: 'psn',   label: 'Poison',    mult: 1.5 },
    { id: 'brn',   label: 'Burn',      mult: 1.5 },
  ],
  pla: [
    { id: 'none',  label: 'None',      mult: 1 },
    { id: 'sleep', label: 'Sleep',     mult: 2 },
    { id: 'frz',   label: 'Frozen',    mult: 2 },
    { id: 'par',   label: 'Paralysis', mult: 1.5 },
    { id: 'psn',   label: 'Poison',    mult: 1.5 },
    { id: 'brn',   label: 'Burn',      mult: 1.5 },
  ],
};
// SV removed freeze; frostbite has no catch bonus
STATUS_DEFS.gen9sv = [
  { id: 'none',      label: 'None',       mult: 1 },
  { id: 'sleep',     label: 'Sleep',      mult: 2.5 },
  { id: 'par',       label: 'Paralysis',  mult: 1.5 },
  { id: 'psn',       label: 'Poison',     mult: 1.5 },
  { id: 'brn',       label: 'Burn',       mult: 1.5 },
  { id: 'frostbite', label: 'Frostbite',  mult: 1 },
];

// ─── Common catch rates ───────────────────────────────────────────────────────

const COMMON_RATES = [
  { rate: 3,   label: '3 — Legendary (Mewtwo, birds, beasts, boxes)' },
  { rate: 5,   label: '5 — Zygarde, Eternatus, Ruinous' },
  { rate: 10,  label: '10 — Most box legendaries' },
  { rate: 25,  label: '25 — Pseudo-legendary (Dragonite, Tyranitar, Garchomp)' },
  { rate: 35,  label: '35 — Mythicals (Celebi, Jirachi, Manaphy)' },
  { rate: 45,  label: '45 — Starters, common rare Pokémon' },
  { rate: 70,  label: '70 — Mid-evolution common Pokémon' },
  { rate: 100, label: '100 — Common fully evolved Pokémon' },
  { rate: 120, label: '120 — Very common Pokémon' },
  { rate: 190, label: '190 — Extremely common (Zubat, Tentacool)' },
  { rate: 255, label: '255 — Easiest (Magikarp, Caterpie, Rattata)' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(p) {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  const v = p * 100;
  if (v >= 10) return v.toFixed(2) + '%';
  if (v >= 1)  return v.toFixed(3) + '%';
  return v.toFixed(4) + '%';
}

function expectedAttempts(p) {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  return 1 / p;
}

function attemptsForConfidence(p, confidence) {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

function getStatusDefs(formula, gameId) {
  if (formula === 'gen1') return STATUS_DEFS.gen1;
  if (formula === 'gen2') return STATUS_DEFS.gen2;
  if (formula === 'pla')  return STATUS_DEFS.pla;
  if (gameId === 'sv')    return STATUS_DEFS.gen9sv;
  return STATUS_DEFS.standard;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

function computeProb(formula, catchRate, maxHP, currentHP, ballId, statusId, ctx) {
  const ball = BALLS[ballId];
  if (!ball) return 0;

  const statusDefs = getStatusDefs(formula, ctx.gameId);
  const statusDef = statusDefs.find(s => s.id === statusId) || statusDefs[0];

  if (formula === 'gen1') {
    const statusAdd = statusDef.add ?? 0;
    const ballMult = ball.getBonus(ctx);
    if (ballMult === null || ballMult === Infinity) return 1;
    return calcGen1(catchRate, maxHP, currentHP, ballMult, statusAdd);
  }

  if (formula === 'gen2') {
    const statusMult = statusDef.mult ?? 1;
    const isHeavy = ballId === 'heavy';
    const ballMult = isHeavy ? 1 : (ball.getBonus(ctx) === null || ball.getBonus(ctx) === Infinity ? null : ball.getBonus(ctx));
    if (ballMult === null) return 1;
    const heavyAdd = isHeavy ? (ball.getHeavyAdd ? ball.getHeavyAdd(ctx) : 0) : 0;
    return calcGen2(catchRate, maxHP, currentHP, ballMult, statusMult, heavyAdd);
  }

  if (formula === 'pla') {
    const statusMult = statusDef.mult ?? 1;
    const ballBonus = ball.getBonus(ctx);
    if (ballBonus === null || ballBonus === Infinity) return 1;
    return calcPLA(catchRate, maxHP, currentHP, ballBonus, statusMult);
  }

  // standard (gen3–gen9)
  const statusMult = statusDef.mult ?? 1;
  const ballBonus = ball.getBonus(ctx);
  if (ballBonus === null || ballBonus === Infinity) return 1;
  return calcStandard(catchRate, maxHP, currentHP, ballBonus, statusMult);
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function Pill({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
        active
          ? 'border-opacity-80 text-white'
          : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300'
      }`}
      style={active ? { borderColor: color || '#6366f1', backgroundColor: (color || '#6366f1') + '22' } : {}}
    >
      {children}
    </button>
  );
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="relative inline-block w-9 h-5">
        <input type="checkbox" className="sr-only" checked={value} onChange={e => onChange(e.target.checked)} />
        <span className={`block w-9 h-5 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-white/10'}`} />
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}

function NumberInput({ value, onChange, min = 0, max = 999, label, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-gray-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || min, min, max))}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full focus:outline-none focus:border-amber-500/60"
      />
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CatchRateCalculator() {
  const [gameId,  setGameId]  = useState('sv');
  const [catchRate, setCatchRate] = useState(45);
  const [useHPPct, setUseHPPct] = useState(true);
  const [hpPct,   setHpPct]   = useState(50);
  const [maxHP,   setMaxHP]   = useState(200);
  const [curHP,   setCurHP]   = useState(100);
  const [statusId, setStatusId] = useState('none');
  const [ballId,  setBallId]  = useState('ultra');
  const [showCompare, setShowCompare] = useState(false);

  // Contextual fields
  const [turn,       setTurn]       = useState(1);
  const [isNight,    setIsNight]    = useState(false);
  const [isCave,     setIsCave]     = useState(false);
  const [isFishing,  setIsFishing]  = useState(false);
  const [isSurfing,  setIsSurfing]  = useState(false);
  const [isWater,    setIsWater]    = useState(false);
  const [isBug,      setIsBug]      = useState(false);
  const [caughtBefore, setCaughtBefore] = useState(false);
  const [level,      setLevel]      = useState(50);
  const [playerLevel, setPlayerLevel] = useState(50);
  const [baseSpeed,  setBaseSpeed]  = useState(60);
  const [isMoonEvo,  setIsMoonEvo]  = useState(false);
  const [isSameSpeciesOppositeGender, setSSOG] = useState(false);
  const [weightKg,   setWeightKg]   = useState(50);
  const [isUltraBeast, setIsUB]     = useState(false);

  const game = useMemo(() => GAMES.find(g => g.id === gameId), [gameId]);
  const { formula, ballSet } = game;
  const availableBalls = BALL_SETS[ballSet] || BALL_SETS.gen9;
  const statusDefs = useMemo(() => getStatusDefs(formula, gameId), [formula, gameId]);

  // Ensure selected ball and status exist in current game
  const activeBallId = availableBalls.includes(ballId) ? ballId : availableBalls[1] ?? availableBalls[0];
  const activeStatusId = statusDefs.find(s => s.id === statusId) ? statusId : 'none';

  const computedMaxHP = useHPPct ? 200 : maxHP;
  const computedCurHP = useHPPct
    ? Math.max(1, Math.round(200 * hpPct / 100))
    : Math.max(1, Math.min(curHP, maxHP));

  const ctx = {
    formula, ballSet, gameId,
    turn, isNight, isCave, isFishing, isSurfing,
    isWater, isBug, caughtBefore,
    level, playerLevel, baseSpeed,
    isMoonEvo, isSameSpeciesOppositeGender,
    weightKg, isUltraBeast,
  };

  const prob = useMemo(() =>
    computeProb(formula, catchRate, computedMaxHP, computedCurHP, activeBallId, activeStatusId, ctx),
    [formula, catchRate, computedMaxHP, computedCurHP, activeBallId, activeStatusId,
     turn, isNight, isCave, isFishing, isSurfing, isWater, isBug, caughtBefore,
     level, playerLevel, baseSpeed, isMoonEvo, isSameSpeciesOppositeGender, weightKg, isUltraBeast]
  );

  // Determine which context inputs to show based on selected ball
  const activeBall = BALLS[activeBallId];
  const needsCtx = (key) => activeBall?.contexts?.includes(key);

  // Compare all balls
  const ballComparison = useMemo(() => {
    if (!showCompare) return [];
    return availableBalls
      .map(bid => ({
        id: bid,
        ...BALLS[bid],
        prob: computeProb(formula, catchRate, computedMaxHP, computedCurHP, bid, activeStatusId, ctx),
      }))
      .sort((a, b) => b.prob - a.prob);
  }, [showCompare, availableBalls, formula, catchRate, computedMaxHP, computedCurHP, activeStatusId,
      turn, isNight, isCave, isFishing, isSurfing, isWater, isBug, caughtBefore,
      level, playerLevel, baseSpeed, isMoonEvo, isSameSpeciesOppositeGender, weightKg, isUltraBeast]);

  const probColor = prob >= 0.5 ? '#22c55e' : prob >= 0.2 ? '#f59e0b' : prob >= 0.05 ? '#f97316' : '#ef4444';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Catch Rate Calculator</h1>
        <p className="text-gray-400 text-sm">
          Universal catch probability for every main-series game.
          Formulas sourced from <a href="https://bulbapedia.bulbagarden.net/wiki/Catch_rate" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">Bulbapedia</a>.
          Legends: Arceus uses an approximate model.
        </p>
      </div>

      {/* Game selector */}
      <Section title="Game">
        <select
          value={gameId}
          onChange={e => setGameId(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-full max-w-xs focus:outline-none focus:border-amber-500/60"
        >
          {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </Section>

      {/* Pokémon info */}
      <Section title="Pokémon">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Catch Rate (0–255)</span>
            <input
              type="number"
              min={1} max={255}
              value={catchRate}
              onChange={e => setCatchRate(clamp(Number(e.target.value) || 1, 1, 255))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-28 focus:outline-none focus:border-amber-500/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">Common presets</span>
            <select
              onChange={e => e.target.value && setCatchRate(Number(e.target.value))}
              defaultValue=""
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm focus:outline-none focus:border-amber-500/60"
            >
              <option value="">Select species...</option>
              {COMMON_RATES.map(r => (
                <option key={r.rate} value={r.rate}>{r.label}</option>
              ))}
            </select>
          </div>
          {(needsCtx('level') || needsCtx('playerLevel')) && (
            <NumberInput label="Target Level" value={level} onChange={setLevel} min={1} max={100} className="w-28" />
          )}
          {needsCtx('playerLevel') && (
            <NumberInput label="Your Lead Level" value={playerLevel} onChange={setPlayerLevel} min={1} max={100} className="w-28" />
          )}
          {needsCtx('speed') && (
            <NumberInput label="Base Speed" value={baseSpeed} onChange={setBaseSpeed} min={1} max={200} className="w-28" />
          )}
          {needsCtx('weight') && (
            <NumberInput label="Weight (kg)" value={weightKg} onChange={setWeightKg} min={0.1} max={999} className="w-28" />
          )}
        </div>
      </Section>

      {/* HP */}
      <Section title="HP">
        <div className="flex items-center gap-3 mb-3">
          <Pill active={useHPPct} onClick={() => setUseHPPct(true)} color="#f59e0b">HP %</Pill>
          <Pill active={!useHPPct} onClick={() => setUseHPPct(false)} color="#f59e0b">Exact HP</Pill>
        </div>
        {useHPPct ? (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1} max={100}
              value={hpPct}
              onChange={e => setHpPct(Number(e.target.value))}
              className="w-48 accent-amber-500"
            />
            <span className="text-white font-semibold w-12">{hpPct}%</span>
            <span className="text-gray-400 text-xs">Lower HP = easier to catch</span>
          </div>
        ) : (
          <div className="flex gap-4 flex-wrap">
            <NumberInput label="Current HP" value={curHP} onChange={setCurHP} min={1} max={maxHP} className="w-28" />
            <NumberInput label="Max HP" value={maxHP} onChange={setMaxHP} min={1} max={9999} className="w-28" />
          </div>
        )}
      </Section>

      {/* Status */}
      <Section title="Status Condition">
        <div className="flex flex-wrap gap-2">
          {statusDefs.map(s => (
            <Pill key={s.id} active={activeStatusId === s.id} onClick={() => setStatusId(s.id)} color="#a78bfa">
              {s.label}
              {s.mult && s.mult !== 1 && <span className="ml-1 text-xs opacity-70">{s.mult}×</span>}
              {s.add  && s.add  !== 0 && <span className="ml-1 text-xs opacity-70">+{s.add}</span>}
            </Pill>
          ))}
        </div>
      </Section>

      {/* Ball selector */}
      <Section title="Poké Ball">
        <div className="flex flex-wrap gap-2">
          {availableBalls.map(bid => {
            const b = BALLS[bid];
            if (!b) return null;
            const isActive = bid === activeBallId;
            return (
              <button
                key={bid}
                onClick={() => setBallId(bid)}
                title={b.bonusDesc || b.name}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  isActive ? 'text-white' : 'text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200'
                }`}
                style={isActive ? { borderColor: b.color, backgroundColor: b.color + '22' } : {}}
              >
                {b.name}
              </button>
            );
          })}
        </div>
        {activeBall?.bonusDesc && (
          <p className="text-xs text-gray-400 mt-2">{activeBall.bonusDesc}</p>
        )}
        {activeBall?.note && (
          <p className="text-xs text-amber-400/80 mt-1">{activeBall.note}</p>
        )}
      </Section>

      {/* Contextual inputs */}
      {(needsCtx('turn') || needsCtx('time') || needsCtx('encounter') || needsCtx('type') ||
        needsCtx('caught') || needsCtx('moonevo') || needsCtx('love') || needsCtx('ub')) && (
        <Section title="Conditions">
          <div className="flex flex-wrap gap-4">
            {needsCtx('turn') && (
              <NumberInput label="Turn Number" value={turn} onChange={setTurn} min={1} max={99} className="w-28" />
            )}
            {needsCtx('time') && (
              <div className="flex flex-col gap-2">
                <Toggle value={isNight} onChange={setIsNight} label="Nighttime" />
                <Toggle value={isCave}  onChange={setIsCave}  label="Inside cave / building" />
              </div>
            )}
            {needsCtx('encounter') && (
              <div className="flex flex-col gap-2">
                <Toggle value={isFishing} onChange={setIsFishing} label="Fishing" />
                <Toggle value={isSurfing} onChange={setIsSurfing} label="Surfing" />
              </div>
            )}
            {needsCtx('type') && (
              <div className="flex flex-col gap-2">
                <Toggle value={isWater} onChange={setIsWater} label="Water type" />
                <Toggle value={isBug}   onChange={setIsBug}   label="Bug type" />
              </div>
            )}
            {needsCtx('caught') && (
              <Toggle value={caughtBefore} onChange={setCaughtBefore} label="Already caught this species" />
            )}
            {needsCtx('moonevo') && (
              <Toggle value={isMoonEvo} onChange={setIsMoonEvo} label="Evolves with Moon Stone" />
            )}
            {needsCtx('love') && (
              <Toggle value={isSameSpeciesOppositeGender} onChange={setSSOG} label="Same species, opposite gender as your lead" />
            )}
            {needsCtx('ub') && (
              <Toggle value={isUltraBeast} onChange={setIsUB} label="Ultra Beast" />
            )}
          </div>
        </Section>
      )}

      {/* Result */}
      <div className="rounded-xl border border-white/10 bg-white/3 p-5 space-y-4">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">Catch probability</p>
            <p className="text-4xl font-bold" style={{ color: probColor }}>{pct(prob)}</p>
          </div>
          <div className="pb-1">
            <p className="text-sm text-gray-400">
              ~{prob >= 1 ? '1' : prob <= 0 ? '∞' : expectedAttempts(prob).toFixed(1)} attempts on average
            </p>
          </div>
        </div>

        {/* Probability bar */}
        <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(prob * 100, 100)}%`, backgroundColor: probColor }}
          />
        </div>

        {/* Guarantee table */}
        {prob > 0 && prob < 1 && (
          <div>
            <p className="text-xs text-gray-400 mb-2">Attempts needed to guarantee catch</p>
            <div className="grid grid-cols-5 gap-2">
              {[50, 75, 90, 95, 99].map(conf => (
                <div key={conf} className="text-center bg-white/5 rounded-lg px-2 py-2">
                  <p className="text-xs text-gray-400">{conf}%</p>
                  <p className="text-white font-semibold text-sm">
                    {attemptsForConfidence(prob, conf / 100).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compare all balls */}
      <div>
        <button
          onClick={() => setShowCompare(v => !v)}
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-medium"
        >
          {showCompare ? '▲ Hide' : '▼ Compare all balls'}
        </button>

        {showCompare && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/3 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Ball</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">Probability</th>
                  <th className="text-right px-4 py-2.5 text-xs text-gray-400 font-medium">Avg Attempts</th>
                  <th className="px-4 py-2.5 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {ballComparison.map((b, i) => {
                  const isSelected = b.id === activeBallId;
                  const rowColor = b.prob >= 0.5 ? '#22c55e' : b.prob >= 0.2 ? '#f59e0b' : b.prob >= 0.05 ? '#f97316' : '#ef4444';
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setBallId(b.id)}
                      className={`border-b border-white/5 cursor-pointer transition-colors hover:bg-white/5 ${isSelected ? 'bg-white/8' : ''}`}
                    >
                      <td className="px-4 py-2">
                        <span className="font-medium" style={{ color: b.color }}>{b.name}</span>
                        {isSelected && <span className="ml-2 text-xs text-gray-500">selected</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold" style={{ color: rowColor }}>{pct(b.prob)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {b.prob >= 1 ? '1' : b.prob <= 0 ? '∞' : expectedAttempts(b.prob).toFixed(1)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(b.prob * 100, 100)}%`, backgroundColor: rowColor }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Layout wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-4 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</h2>
      {children}
    </div>
  );
}
