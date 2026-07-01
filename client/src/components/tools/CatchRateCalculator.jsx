import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from '../PageBackground';
import { POKEMON_CATCH_DATA } from '../../data/pokemonCatchData';

// ─── Formula functions ────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function calcGen1(catchRate, maxHP, currentHP, ballMult, statusAdd) {
  if (ballMult === null) return 1;
  const f = Math.floor((3 * maxHP - 2 * currentHP) * catchRate / (3 * maxHP));
  const modified = clamp(Math.round(f * ballMult) + statusAdd, 0, 255);
  if (modified >= 255) return 1;
  return Math.pow(modified / 255, 4);
}

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

function calcPLA(catchRate, maxHP, currentHP, ballBonus, statusMult) {
  if (ballBonus === null) return 1;
  const a = clamp(
    Math.floor((3 * maxHP - 2 * currentHP) * catchRate * ballBonus * statusMult / (3 * maxHP)),
    0, 255
  );
  if (a >= 255) return 1;
  const b = Math.floor(65536 / Math.pow(255 / a, 0.75));
  return Math.pow(b / 65536, 3);
}

// ─── Ball definitions ─────────────────────────────────────────────────────────

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
  feather: { name: 'Feather Ball', short: 'FeB', color: '#bae6fd', getBonus: () => 1 },
  wing:    { name: 'Wing Ball',    short: 'WiB', color: '#7dd3fc', getBonus: () => 1.5 },
  jet:     { name: 'Jet Ball',     short: 'JtB', color: '#38bdf8', getBonus: () => 2 },
  heavy_pla: { name: 'Heavy Ball (PLA)', short: 'HvB', color: '#94a3b8', getBonus: () => 1 },
  leaden:  { name: 'Leaden Ball',  short: 'LdB', color: '#64748b', getBonus: () => 1.5 },
  gigaton: { name: 'Gigaton Ball', short: 'GgB', color: '#475569', getBonus: () => 2 },
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
    name: 'Quick Ball', short: 'QB', color: '#fde68a',
    getBonus: (ctx) => ctx.turn === 1 ? 5 : 1,
    contexts: ['turn'],
    bonusDesc: '5× on turn 1 only (4× in Gen IV)',
  },
  dusk: {
    name: 'Dusk Ball', short: 'DkB', color: '#6b7280',
    getBonus: (ctx) => (ctx.isNight || ctx.isCave) ? 3.5 : 1,
    contexts: ['time'],
    bonusDesc: '3.5× at night or inside caves/buildings',
  },
  moon: {
    name: 'Moon Ball', short: 'MnB', color: '#c4b5fd',
    getBonus: (ctx) => ctx.isMoonEvo ? 4 : 1,
    contexts: ['moonevo'],
    bonusDesc: '4× if target evolves with a Moon Stone',
  },
  love: {
    name: 'Love Ball', short: 'LoB', color: '#fb7185',
    getBonus: (ctx) => ctx.isSameSpeciesOppositeGender ? 8 : 1,
    contexts: ['love'],
    bonusDesc: '8× if target is same species & opposite gender as your lead',
  },
  level: {
    name: 'Level Ball', short: 'LvB', color: '#fbbf24',
    getBonus: (ctx) => {
      const ratio = ctx.playerLevel / ctx.level;
      if (ratio >= 4) return 8;
      if (ratio >= 2) return 4;
      if (ratio > 1)  return 2;
      return 1;
    },
    contexts: ['level', 'playerLevel'],
    bonusDesc: 'Up to 8× if your Pokémon is 4× higher level',
  },
  lure: {
    name: 'Lure Ball', short: 'LrB', color: '#2dd4bf',
    getBonus: (ctx) => ctx.isFishing ? 3 : 1,
    contexts: ['encounter'],
    bonusDesc: '3× when using a fishing rod',
  },
  fast: {
    name: 'Fast Ball', short: 'FsB', color: '#f472b6',
    getBonus: (ctx) => ctx.baseSpeed >= 100 ? 4 : 1,
    contexts: ['speed'],
    bonusDesc: '4× if target\'s base Speed is 100 or higher',
  },
  heavy: {
    name: 'Heavy Ball', short: 'HvB', color: '#94a3b8',
    getBonus: () => 1,
    getHeavyAdd: (ctx) => {
      const kg = ctx.weightKg;
      if (kg >= 409.6) return 30;
      if (kg >= 307.2) return 20;
      if (kg >= 204.8) return 0;
      return -20;
    },
    contexts: ['weight'],
    bonusDesc: 'Gen II: ±20–30 additive to catch rate by weight',
  },
  beast: {
    name: 'Beast Ball', short: 'BsB', color: '#818cf8',
    getBonus: (ctx) => ctx.isUltraBeast ? 5 : 0.1,
    contexts: ['ub'],
    bonusDesc: '5× for Ultra Beasts, 0.1× for everything else',
  },
};

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
  gen9sv: [
    { id: 'none',      label: 'None',       mult: 1 },
    { id: 'sleep',     label: 'Sleep',      mult: 2.5 },
    { id: 'par',       label: 'Paralysis',  mult: 1.5 },
    { id: 'psn',       label: 'Poison',     mult: 1.5 },
    { id: 'brn',       label: 'Burn',       mult: 1.5 },
    { id: 'frostbite', label: 'Frostbite',  mult: 1 },
  ],
};

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
  const statusMult = statusDef.mult ?? 1;
  const ballBonus = ball.getBonus(ctx);
  if (ballBonus === null || ballBonus === Infinity) return 1;
  return calcStandard(catchRate, maxHP, currentHP, ballBonus, statusMult);
}

// ─── Accent ───────────────────────────────────────────────────────────────────
const A  = '#fbbf24';
const AB = 'rgba(251,191,36,0.10)';
const ABorder = 'rgba(251,191,36,0.28)';
const CARD = { background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' };
const INPUT_STYLE = { background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' };

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="relative inline-block w-9 h-5 shrink-0">
        <input type="checkbox" className="sr-only" checked={value} onChange={e => onChange(e.target.checked)} />
        <span className={`block w-9 h-5 rounded-full transition-colors ${value ? 'bg-amber-500' : 'bg-white/10'}`} />
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}

// ─── NumInput ─────────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, min = 1, max = 999, step = 1, wide = false }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={e => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.min(Math.max(v, min), max));
        }}
        className={`${wide ? 'w-32' : 'w-24'} rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none`}
        style={INPUT_STYLE} />
    </div>
  );
}

// ─── HPBar ────────────────────────────────────────────────────────────────────
function HPBar({ pct: hpPct, onChange }) {
  const barRef = useRef(null);
  const dragging = useRef(false);

  const updateFromX = React.useCallback((clientX) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    onChange(Math.round(clamp((clientX - rect.left) / rect.width * 100, 1, 100)));
  }, [onChange]);

  useEffect(() => {
    const onMove = e => {
      if (!dragging.current) return;
      if (e.cancelable) e.preventDefault();
      updateFromX(e.touches ? e.touches[0].clientX : e.clientX);
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [updateFromX]);

  const color = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#fbbf24' : '#ef4444';
  const thumbLeft = `calc(${hpPct}% - 10px)`;

  return (
    <div>
      <div
        ref={barRef}
        className="relative rounded-lg select-none"
        style={{ height: 44, background: 'rgba(255,255,255,0.06)', cursor: 'crosshair' }}
        onMouseDown={e => { dragging.current = true; updateFromX(e.clientX); }}
        onTouchStart={e => { dragging.current = true; updateFromX(e.touches[0].clientX); }}
      >
        {/* Filled bar */}
        <div className="h-full rounded-lg transition-colors duration-150"
          style={{ width: `${hpPct}%`, background: color }} />
        {/* Thumb */}
        <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-lg pointer-events-none"
          style={{ left: thumbLeft, border: `2.5px solid ${color}` }} />
        {/* Label */}
        <div className="absolute inset-0 flex items-center justify-end pr-3 pointer-events-none">
          <span className="text-sm font-bold text-white drop-shadow-sm">{hpPct}%</span>
        </div>
      </div>
      <div className="flex justify-between text-[10px] mt-1.5 px-0.5 select-none">
        <span style={{ color: '#ef4444' }}>● Critical (&lt;25%)</span>
        <span style={{ color: '#fbbf24' }}>● Low (25–50%)</span>
        <span style={{ color: '#22c55e' }}>● Healthy (&gt;50%)</span>
      </div>
    </div>
  );
}

// ─── PokemonSearch ────────────────────────────────────────────────────────────
function PokemonSearch({ selectedPokemon, onSelect, onClear }) {
  const [query, setQuery] = useState(selectedPokemon?.name || '');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (selectedPokemon) setQuery(selectedPokemon.name);
  }, [selectedPokemon]);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const results = useMemo(() => {
    if (!query.trim() || query === selectedPokemon?.name) return [];
    const q = query.toLowerCase();
    const prefix = POKEMON_CATCH_DATA.filter(([name]) => name.toLowerCase().startsWith(q));
    const infix  = POKEMON_CATCH_DATA.filter(([name]) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q));
    return [...prefix, ...infix].slice(0, 10);
  }, [query, selectedPokemon]);

  function handleSelect([name, catchRate, weightKg, baseSpeed, types]) {
    setQuery(name);
    setOpen(false);
    onSelect({ name, catchRate, weightKg, baseSpeed, types });
  }

  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    if (!e.target.value) onClear();
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="Search Pokémon by name…"
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="w-full rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none transition-colors"
        style={{ ...INPUT_STYLE, borderColor: selectedPokemon ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.07)' }}
      />
      {selectedPokemon && (
        <button
          onClick={() => { setQuery(''); onClear(); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none"
          tabIndex={-1}
        >×</button>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-40 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: '#13151a', border: '1px solid rgba(255,255,255,0.1)', maxHeight: 280, overflowY: 'auto' }}>
          {results.map(entry => {
            const [name, catchRate, , , types] = entry;
            return (
              <button key={name}
                className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-white/[0.05] transition-colors text-left"
                onMouseDown={() => handleSelect(entry)}>
                <div>
                  <span className="text-sm text-white font-medium">{name}</span>
                  <span className="ml-2 text-[11px] text-gray-600">{types.join('/')}</span>
                </div>
                <span className="text-xs font-mono text-gray-500 shrink-0 ml-3">rate {catchRate}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CatchRateCalculator() {
  const navigate = useNavigate();

  // Core
  const [gameId,    setGameId]    = useState('sv');
  const [catchRate, setCatchRate] = useState(45);
  const [statusId,  setStatusId]  = useState('none');
  const [ballId,    setBallId]    = useState('ultra');
  const [showNerdStats, setShowNerdStats] = useState(false);

  // Pokémon search
  const [selectedPokemon,    setSelectedPokemon]    = useState(null);
  const [catchRateOverridden, setCatchRateOverridden] = useState(false);

  // HP
  const [hpPct,      setHpPct]      = useState(50);
  const [hpExactMode, setHpExactMode] = useState(false);
  const [maxHP,      setMaxHP]      = useState(200);
  const [curHP,      setCurHP]      = useState(100);

  // Ball context inputs
  const [turn,         setTurn]         = useState(1);
  const [isNight,      setIsNight]      = useState(false);
  const [isCave,       setIsCave]       = useState(false);
  const [isFishing,    setIsFishing]    = useState(false);
  const [isSurfing,    setIsSurfing]    = useState(false);
  const [isWater,      setIsWater]      = useState(false);
  const [isBug,        setIsBug]        = useState(false);
  const [caughtBefore, setCaughtBefore] = useState(false);
  const [level,        setLevel]        = useState(50);
  const [playerLevel,  setPlayerLevel]  = useState(50);
  const [baseSpeed,    setBaseSpeed]    = useState(60);
  const [isMoonEvo,    setIsMoonEvo]    = useState(false);
  const [isSSOG,       setSSOG]         = useState(false);
  const [weightKg,     setWeightKg]     = useState(50);
  const [isUltraBeast, setIsUB]         = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const game = useMemo(() => GAMES.find(g => g.id === gameId), [gameId]);
  const { formula, ballSet } = game;
  const availableBalls = BALL_SETS[ballSet] || BALL_SETS.gen9;
  const statusDefs = useMemo(() => getStatusDefs(formula, gameId), [formula, gameId]);

  const activeBallId   = availableBalls.includes(ballId) ? ballId : availableBalls[1] ?? availableBalls[0];
  const activeStatusId = statusDefs.find(s => s.id === statusId) ? statusId : 'none';

  const computedMaxHP = hpExactMode ? maxHP : 200;
  const computedCurHP = hpExactMode
    ? Math.max(1, Math.min(curHP, maxHP))
    : Math.max(1, Math.round(200 * hpPct / 100));

  const ctx = {
    formula, ballSet, gameId,
    turn, isNight, isCave, isFishing, isSurfing,
    isWater, isBug, caughtBefore,
    level, playerLevel, baseSpeed,
    isMoonEvo, isSameSpeciesOppositeGender: isSSOG,
    weightKg, isUltraBeast,
  };

  const ctxDeps = [
    formula, catchRate, computedMaxHP, computedCurHP, activeBallId, activeStatusId,
    turn, isNight, isCave, isFishing, isSurfing, isWater, isBug, caughtBefore,
    level, playerLevel, baseSpeed, isMoonEvo, isSSOG, weightKg, isUltraBeast,
  ];

  const prob = useMemo(
    () => computeProb(formula, catchRate, computedMaxHP, computedCurHP, activeBallId, activeStatusId, ctx),
    ctxDeps // eslint-disable-line react-hooks/exhaustive-deps
  );

  const activeBall = BALLS[activeBallId];
  const needsCtx = (key) => activeBall?.contexts?.includes(key);

  const hasConditions =
    needsCtx('turn') || needsCtx('time') || needsCtx('encounter') ||
    needsCtx('type') || needsCtx('caught') || needsCtx('moonevo') ||
    needsCtx('love') || needsCtx('ub') || needsCtx('level') ||
    needsCtx('playerLevel') || needsCtx('speed') || needsCtx('weight');

  const ballComparison = useMemo(() => {
    if (!showNerdStats) return [];
    return availableBalls
      .map(bid => ({
        id: bid,
        ...BALLS[bid],
        prob: computeProb(formula, catchRate, computedMaxHP, computedCurHP, bid, activeStatusId, ctx),
      }))
      .sort((a, b) => b.prob - a.prob);
  }, [showNerdStats, availableBalls, ...ctxDeps]); // eslint-disable-line react-hooks/exhaustive-deps

  const probColor = prob >= 0.5 ? '#22c55e' : prob >= 0.2 ? '#fbbf24' : prob >= 0.05 ? '#f97316' : '#ef4444';

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleSelectPokemon(p) {
    setSelectedPokemon(p);
    setCatchRate(p.catchRate);
    setCatchRateOverridden(false);
    setWeightKg(p.weightKg);
    setBaseSpeed(p.baseSpeed);
    setIsWater(p.types.includes('Water'));
    setIsBug(p.types.includes('Bug'));
  }

  function handleClearPokemon() {
    setSelectedPokemon(null);
    setCatchRateOverridden(false);
  }

  function toggleHpExactMode() {
    if (!hpExactMode) {
      setMaxHP(200);
      setCurHP(Math.max(1, Math.round(200 * hpPct / 100)));
    } else {
      setHpPct(Math.max(1, Math.min(100, Math.round((curHP / maxHP) * 100))));
    }
    setHpExactMode(v => !v);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b"
        style={{ background: 'rgba(13,15,20,0.85)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
            <span className="text-sm font-semibold text-white">Catch Rate Calculator</span>
          </div>
          <button
            onClick={() => setShowNerdStats(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={showNerdStats
              ? { background: AB, borderColor: ABorder, color: A }
              : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            Stats for Nerds
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* ── 1. Game ─────────────────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Game</p>
          <select value={gameId} onChange={e => setGameId(e.target.value)}
            className="rounded-lg px-3 py-2 text-white text-sm w-full sm:max-w-xs focus:outline-none"
            style={{ ...INPUT_STYLE, colorScheme: 'dark' }}>
            {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>

        {/* ── 2. Pokémon + Catch Rate ──────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Pokémon</p>
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-start min-w-0">
            <div className="min-w-0">
              <PokemonSearch
                selectedPokemon={selectedPokemon}
                onSelect={handleSelectPokemon}
                onClear={handleClearPokemon}
              />
              {!selectedPokemon && (
                <p className="text-[11px] text-gray-600 mt-1.5">
                  Search to auto-fill catch rate, weight, and type — or set manually below.
                </p>
              )}
            </div>

            <div className="shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Catch Rate
                {selectedPokemon && !catchRateOverridden && (
                  <span className="ml-1.5 text-[10px] font-normal normal-case" style={{ color: A }}>auto-filled</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={255} value={catchRate}
                  onChange={e => {
                    setCatchRate(clamp(Number(e.target.value) || 1, 1, 255));
                    setCatchRateOverridden(true);
                  }}
                  className="w-24 rounded-lg px-2.5 py-2 text-2xl font-bold text-white focus:outline-none"
                  style={{
                    background: '#0d0f14',
                    border: `1px solid ${selectedPokemon && !catchRateOverridden ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                />
                <span className="text-xs text-gray-600">/ 255</span>
              </div>
              {catchRateOverridden && selectedPokemon && (
                <button
                  onClick={() => { setCatchRate(selectedPokemon.catchRate); setCatchRateOverridden(false); }}
                  className="text-[10px] mt-1 transition-colors"
                  style={{ color: A }}
                >
                  ↩ Reset to {selectedPokemon.name}'s rate ({selectedPokemon.catchRate})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 3. HP Remaining ──────────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={CARD}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">HP Remaining</p>
            <button
              onClick={toggleHpExactMode}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all"
              style={hpExactMode
                ? { background: AB, borderColor: ABorder, color: A }
                : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280' }}>
              {hpExactMode ? 'Bar mode' : 'Exact HP'}
            </button>
          </div>

          {hpExactMode ? (
            <div className="flex gap-4 items-end">
              <NumInput label="Current HP" value={curHP} onChange={setCurHP} min={1} max={maxHP} wide />
              <NumInput label="Max HP" value={maxHP} onChange={setMaxHP} min={1} max={9999} wide />
              <div className="pb-1 text-sm text-gray-500">
                = {Math.round((Math.max(1, Math.min(curHP, maxHP)) / maxHP) * 100)}%
              </div>
            </div>
          ) : (
            <HPBar pct={hpPct} onChange={setHpPct} />
          )}
        </div>

        {/* ── 4. Status Condition ───────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">Status Condition</p>
          <div className="flex flex-wrap gap-2">
            {statusDefs.map(s => {
              const active = activeStatusId === s.id;
              const bonus = s.mult && s.mult !== 1 ? `${s.mult}×` : s.add && s.add !== 0 ? `+${s.add}` : null;
              return (
                <button key={s.id} onClick={() => setStatusId(s.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                  style={active
                    ? { background: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.4)', color: '#a78bfa' }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#6b7280' }}>
                  {s.label}
                  {bonus && <span className="ml-1 opacity-70">{bonus}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 5. Ball Selector ──────────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={CARD}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2.5">Poké Ball</p>
          <div className="flex flex-wrap gap-2">
            {availableBalls.map(bid => {
              const b = BALLS[bid];
              if (!b) return null;
              const isActive = bid === activeBallId;
              return (
                <button key={bid} onClick={() => setBallId(bid)}
                  title={b.bonusDesc || b.name}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border"
                  style={isActive
                    ? { borderColor: b.color, backgroundColor: b.color + '22', color: '#fff' }
                    : { borderColor: 'rgba(255,255,255,0.08)', color: '#6b7280' }}>
                  {b.name}
                </button>
              );
            })}
          </div>
          {activeBall?.bonusDesc && (
            <p className="text-xs text-gray-500 mt-2">{activeBall.bonusDesc}</p>
          )}
          {activeBall?.note && (
            <p className="text-xs mt-1" style={{ color: A, opacity: 0.8 }}>{activeBall.note}</p>
          )}
        </div>

        {/* ── 6. Ball Conditions ────────────────────────────────────────────────── */}
        {hasConditions && (
          <div className="rounded-xl p-4" style={CARD}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
              Conditions for {activeBall?.name}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              {needsCtx('turn') && (
                <NumInput label="Turn Number" value={turn} onChange={setTurn} min={1} max={99} />
              )}
              {(needsCtx('level') || needsCtx('playerLevel')) && (
                <NumInput label="Target Level" value={level} onChange={setLevel} min={1} max={100} />
              )}
              {needsCtx('playerLevel') && (
                <NumInput label="Your Lead Level" value={playerLevel} onChange={setPlayerLevel} min={1} max={100} />
              )}
              {needsCtx('speed') && (
                <div>
                  <NumInput label="Base Speed" value={baseSpeed} onChange={setBaseSpeed} min={1} max={200} />
                  {selectedPokemon && (
                    <p className="text-[10px] mt-0.5" style={{ color: A }}>auto-filled from {selectedPokemon.name}</p>
                  )}
                </div>
              )}
              {needsCtx('weight') && (
                <div>
                  <NumInput label="Weight (kg)" value={weightKg} onChange={setWeightKg} min={0.1} max={999.9} step={0.1} />
                  {selectedPokemon && (
                    <p className="text-[10px] mt-0.5" style={{ color: A }}>auto-filled from {selectedPokemon.name}</p>
                  )}
                </div>
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
              {needsCtx('caught')  && <Toggle value={caughtBefore} onChange={setCaughtBefore} label="Already caught this species" />}
              {needsCtx('moonevo') && <Toggle value={isMoonEvo}    onChange={setIsMoonEvo}    label="Evolves with Moon Stone" />}
              {needsCtx('love')    && <Toggle value={isSSOG}       onChange={setSSOG}         label="Same species, opposite gender as your lead" />}
              {needsCtx('ub')      && <Toggle value={isUltraBeast} onChange={setIsUB}         label="Ultra Beast" />}
            </div>
          </div>
        )}

        {/* ── 7. Result ─────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5" style={CARD}>
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Catch probability</p>
              <p className="text-6xl font-black leading-none" style={{ color: probColor }}>{pct(prob)}</p>
            </div>
            <div className="pb-0.5">
              <p className="text-base text-gray-400">
                ~{prob >= 1 ? '1' : prob <= 0 ? '∞' : expectedAttempts(prob).toFixed(1)} throws on average
              </p>
            </div>
          </div>

          <div className="h-3 w-full rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(prob * 100, 100)}%`, background: probColor }} />
          </div>

          {prob > 0 && prob < 1 && (
            <div className="grid grid-cols-5 gap-2">
              {[50, 75, 90, 95, 99].map(conf => (
                <div key={conf} className="rounded-xl px-2 py-2.5 text-center" style={{ background: 'rgba(0,0,0,0.25)' }}>
                  <p className="text-[10px] text-gray-500 mb-0.5">{conf}%</p>
                  <p className="text-white font-bold text-sm">{attemptsForConfidence(prob, conf / 100).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 8. Stats for Nerds ────────────────────────────────────────────────── */}
        {showNerdStats && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={CARD}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <h2 className="text-sm font-bold text-white">All Balls Comparison</h2>
                <p className="text-xs text-gray-500 mt-0.5">Current HP, status, and conditions applied · click a row to select</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left px-4 py-2.5">Ball</th>
                      <th className="text-right px-4 py-2.5">Probability</th>
                      <th className="text-right px-4 py-2.5">Avg Throws</th>
                      <th className="px-4 py-2.5 w-28"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ballComparison.map((b) => {
                      const isSelected = b.id === activeBallId;
                      const rc = b.prob >= 0.5 ? '#22c55e' : b.prob >= 0.2 ? '#fbbf24' : b.prob >= 0.05 ? '#f97316' : '#ef4444';
                      return (
                        <tr key={b.id} onClick={() => setBallId(b.id)}
                          className="border-b cursor-pointer transition-colors hover:bg-white/[0.025]"
                          style={{ borderColor: 'rgba(255,255,255,0.04)', background: isSelected ? 'rgba(251,191,36,0.06)' : undefined }}>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold" style={{ color: b.color }}>{b.name}</span>
                            {isSelected && <span className="ml-2 text-[10px] text-gray-600">selected</span>}
                          </td>
                          <td className="text-right px-4 py-2.5 font-bold tabular-nums" style={{ color: rc }}>{pct(b.prob)}</td>
                          <td className="text-right px-4 py-2.5 text-gray-400 tabular-nums">
                            {b.prob >= 1 ? '1' : b.prob <= 0 ? '∞' : expectedAttempts(b.prob).toFixed(1)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(b.prob * 100, 100)}%`, background: rc }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {prob > 0 && prob < 1 && (
              <div className="rounded-2xl overflow-hidden" style={CARD}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <h2 className="text-sm font-bold text-white">Throws Needed by Confidence</h2>
                  <p className="text-xs text-gray-500 mt-0.5">How many throws guarantee a catch at each probability threshold</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500"
                        style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                        <th className="text-left px-4 py-2.5">Confidence</th>
                        <th className="text-right px-4 py-2.5">Throws needed</th>
                        <th className="text-right px-4 py-2.5">Interpretation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { conf: 50,   note: '50/50 — coin flip' },
                        { conf: 75,   note: '3 in 4 chance' },
                        { conf: 90,   note: 'Expected unlucky' },
                        { conf: 95,   note: 'Very likely caught' },
                        { conf: 99,   note: 'Almost guaranteed' },
                        { conf: 99.9, note: 'Essentially certain' },
                      ].map(({ conf, note }) => (
                        <tr key={conf} className="border-b transition-colors hover:bg-white/[0.02]"
                          style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <td className="px-4 py-2.5 font-semibold" style={{ color: A }}>{conf}%</td>
                          <td className="text-right px-4 py-2.5 text-white font-bold tabular-nums">
                            {attemptsForConfidence(prob, conf / 100).toLocaleString()}
                          </td>
                          <td className="text-right px-4 py-2.5 text-gray-600 text-xs">{note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[10px] text-gray-700 text-center pb-2">
              Formulas from Bulbapedia · Gen I uses 4-shake check model · Legends: Arceus uses approximate model
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
