import React, { useState, useMemo } from 'react';

// Shiny odds by chain length, sourced from Serebii
// https://www.serebii.net/brilliantdiamondshiningpearl/shinypokemon.shtml
// Index = chain length; index 40 covers 40+
const CHAIN_ODDS = [
  4096, 3855, 3640, 3449, 3277, 3121, 2979, 2849, 2731, 2621, // 0–9
  2521, 2427, 2341, 2259, 2185, 2114, 2048, 1986, 1927, 1872, // 10–19
  1820, 1771, 1724, 1680, 1638, 1598, 1560, 1524, 1489, 1456, // 20–29
  1310, 1285, 1260, 1236, 1213, 1192,  993,  799,  400,  200, // 30–39
   99,                                                          // 40+
];

function getOdds(chain) {
  return CHAIN_ODDS[Math.min(Math.max(chain, 0), 40)];
}

// Expected encounters to build a chain of length N from scratch,
// where each step succeeds with probability c and failure resets to 0.
// Derivation: E = (1 − c^N) / ((1−c) · c^N)
function expectedToChain(n, c) {
  if (n <= 0) return 0;
  if (c >= 0.9999) return n;
  const cN = Math.pow(c, n);
  return (1 - cN) / ((1 - c) * cN);
}

function formatTime(secs) {
  if (!isFinite(secs) || secs > 864000) return '>10 days';
  if (secs < 120) return `${Math.round(secs)}s`;
  if (secs < 7200) return `${(secs / 60).toFixed(1)} min`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatPct(p) {
  if (p >= 99.995) return '≈100%';
  if (p < 0.0005) return '<0.001%';
  if (p >= 10) return `${p.toFixed(1)}%`;
  if (p >= 1) return `${p.toFixed(2)}%`;
  return `${p.toFixed(3)}%`;
}

const KEY_CHAINS = Array.from({ length: 41 }, (_, i) => i);
const BASE_ODDS = 4096;
const MAX_IMPROVEMENT = BASE_ODDS / 99; // ~41.4×

export default function BDSPRadar() {
  const [chain, setChain] = useState(20);
  const [encRateStr, setEncRateStr] = useState('');
  const [secsStr, setSecsStr] = useState('20');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [contRateStr, setContRateStr] = useState('93');

  // Sanitised numeric values
  const secsPerEnc = Math.max(1, parseFloat(secsStr) || 20);
  const contRate = Math.max(0.5, Math.min(0.99, (parseFloat(contRateStr) || 93) / 100));
  const encRate = encRateStr !== '' ? Math.max(0.01, Math.min(1, parseFloat(encRateStr) / 100)) : 1;

  const stats = useMemo(() => {
    const n = Math.max(0, Math.min(40, chain));
    const odds = getOdds(n);

    // 1. % chance of reaching this chain (optimal play)
    const chanceThisFar = Math.pow(contRate, n) * 100;

    // 2. % chance of reaching chain 40 from here
    const chanceToForty = n >= 40 ? 100 : Math.pow(contRate, 40 - n) * 100;

    // 4. Each radar produces 4 independent shiny trials, so expected radars = odds / 4
    const encToShiny = odds / 4;
    const timeToShinyS = encToShiny * secsPerEnc;

    // 3. Expected encounters to rebuild this chain from scratch
    const E = expectedToChain(n, contRate);
    // Average number of chain attempts before one reaches n: 1 / contRate^n
    const attempts = n > 0 ? 1 / Math.pow(contRate, n) : 1;
    // For rare species: each new chain attempt costs extra encounters to find the target
    const extraPerAttempt = encRate < 1 ? (1 / encRate - 1) : 0;
    const encToRecover = E + attempts * extraPerAttempt;
    const timeToRecoverS = encToRecover * secsPerEnc;

    const timeTotalS = timeToRecoverS + timeToShinyS;

    return { n, odds, chanceThisFar, chanceToForty, encToShiny, timeToShinyS, encToRecover, timeToRecoverS, timeTotalS };
  }, [chain, contRate, encRate, secsPerEnc]);

  function handleChainInput(val) {
    const n = Math.max(0, Math.min(40, parseInt(val, 10) || 0));
    setChain(n);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 text-white">
      <h1 className="text-2xl font-bold mb-0.5">BDSP Radar Breakdown</h1>
      <p className="text-gray-400 text-sm mb-3">
        Brilliant Diamond / Shining Pearl — Poké Radar shiny stats.{' '}
        <span className="text-gray-500">Odds sourced from Serebii.</span>
      </p>

      {/* ── Inputs ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4 space-y-3">
        {/* Chain slider + number input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-gray-300">Chain Length</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setChain(c => Math.max(0, c - 1))}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-base leading-none transition-colors"
              >−</button>
              <input
                type="number"
                min={0} max={40}
                value={chain}
                onChange={e => handleChainInput(e.target.value)}
                className="w-14 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white text-center focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => setChain(c => Math.min(40, c + 1))}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-base leading-none transition-colors"
              >+</button>
            </div>
          </div>
          <input
            type="range"
            min={0} max={40} step={1}
            value={chain}
            onChange={e => setChain(Number(e.target.value))}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1 select-none">
            <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span>
          </div>
        </div>

        {/* Optional: encounter rate + seconds */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1 block">
              Encounter Rate{' '}
              <span className="text-gray-500 font-normal text-xs">optional</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1} max={100}
                value={encRateStr}
                onChange={e => setEncRateStr(e.target.value)}
                placeholder="100"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-400 text-sm shrink-0">%</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">How often the target appears in the area</p>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1 block">
              Seconds / Encounter{' '}
              <span className="text-gray-500 font-normal text-xs">optional</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1} max={300}
                value={secsStr}
                onChange={e => setSecsStr(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-400 text-sm shrink-0">s</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Avg time per chain step</p>
          </div>
        </div>

        {/* Advanced */}
        <div>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
          >
            <span>{showAdvanced ? '▾' : '▸'}</span> Advanced
          </button>
          {showAdvanced && (
            <div className="mt-3 max-w-xs">
              <label className="text-sm font-semibold text-gray-300 mb-1 block">
                Continuation Rate
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={50} max={99}
                  value={contRateStr}
                  onChange={e => setContRateStr(e.target.value)}
                  className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <span className="text-gray-400 text-sm">%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Chance of not breaking the chain each step. Default (93%) assumes optimal play — always picking the furthest patches with Repels active.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Current odds hero ── */}
      <div className="bg-indigo-950/50 border border-indigo-500/40 rounded-xl p-3 mb-4 text-center">
        <p className="text-gray-400 text-sm mb-1">
          Shiny odds at chain {stats.n >= 40 ? '40+' : stats.n}
        </p>
        <p className="text-4xl font-bold text-indigo-300">
          1 in {stats.odds.toLocaleString()}
        </p>
        <p className="text-gray-400 text-sm mt-1">
          {(100 / stats.odds).toFixed(4)}% per patch
          {stats.n > 0 && (
            <span className="ml-2 text-indigo-400 font-semibold">
              ({(BASE_ODDS / stats.odds).toFixed(1)}× base)
            </span>
          )}
        </p>
      </div>

      {/* ── 4 stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {/* 1. Chance of reaching this chain */}
        <StatCard
          label="Chance of reaching this chain"
          value={formatPct(stats.chanceThisFar)}
          color="emerald"
          note={
            stats.n === 0
              ? 'Every run starts here.'
              : `${parseFloat(contRateStr) || 93}% success/step — ${formatPct(stats.chanceThisFar)} of chains reach ${stats.n}`
          }
        />

        {/* 2. Chance of reaching chain 40 */}
        <StatCard
          label="Chance of reaching chain 40"
          value={formatPct(stats.chanceToForty)}
          color={stats.chanceToForty > 50 ? 'emerald' : stats.chanceToForty > 10 ? 'yellow' : 'red'}
          note={
            stats.n >= 40
              ? "You're already there!"
              : `${40 - stats.n} more step${40 - stats.n !== 1 ? 's' : ''} at ${parseFloat(contRateStr) || 93}% each`
          }
        />

        {/* 3. Time to recover this chain */}
        <StatCard
          label="Expected time to recover this chain"
          value={stats.n === 0 ? '—' : formatTime(stats.timeToRecoverS)}
          color="amber"
          note={
            stats.n === 0
              ? 'Nothing to recover from chain 0.'
              : `~${Math.round(stats.encToRecover).toLocaleString()} encounters${encRateStr && parseFloat(encRateStr) < 100 ? ` (incl. finding ${encRateStr}% target)` : ''}`
          }
        />

        {/* 4. Time to get a shiny at current rate */}
        <StatCard
          label="Expected time for a shiny at this rate"
          value={formatTime(stats.timeToShinyS)}
          color="pink"
          note={`1 in ${stats.odds.toLocaleString()} per patch × 4 patches/radar → avg ${Math.round(stats.encToShiny).toLocaleString()} radars`}
        />
      </div>

      {/* ── Combined time ── */}
      <div className="mb-4">
        <StatCard
          label="Combined: recover chain + get shiny"
          value={stats.n === 0 ? formatTime(stats.timeToShinyS) : formatTime(stats.timeTotalS)}
          color="violet"
        />
      </div>

      {/* ── Odds reference table ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-gray-300">Shiny Odds Reference</h2>
          <p className="text-xs text-gray-500 mt-0.5">Key chain milestones — note the big jumps near chain 36+</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900/30 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Chain</th>
                <th className="text-right px-4 py-2.5">Rate</th>
                <th className="text-right px-4 py-2.5">Probability</th>
                <th className="px-4 py-2.5">vs Base</th>
              </tr>
            </thead>
            <tbody>
              {KEY_CHAINS.map(k => {
                const o = getOdds(k);
                const mult = BASE_ODDS / o;
                const barWidth = (mult / MAX_IMPROVEMENT) * 100;
                const isActive = stats.n === k || (k === 40 && stats.n >= 40);
                const isBigJump = k >= 36;
                return (
                  <tr
                    key={k}
                    className={`border-b border-gray-700/40 transition-colors ${isActive ? 'bg-indigo-900/25' : 'hover:bg-gray-700/20'}`}
                  >
                    <td className={`px-4 py-2.5 font-semibold ${isActive ? 'text-indigo-300' : isBigJump ? 'text-yellow-300' : 'text-gray-300'}`}>
                      {k === 40 ? '40+' : k}
                      {isActive && <span className="ml-1.5 text-indigo-400 text-xs">◄ you</span>}
                    </td>
                    <td className="text-right px-4 py-2.5 text-gray-300 tabular-nums">
                      1 in {o.toLocaleString()}
                    </td>
                    <td className="text-right px-4 py-2.5 text-gray-400 tabular-nums">
                      {(100 / o).toFixed(4)}%
                    </td>
                    <td className="px-4 py-2.5 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${k === 0 ? 'bg-gray-500' : isBigJump ? 'bg-yellow-400' : 'bg-indigo-500'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium w-10 text-right ${k === 0 ? 'text-gray-500' : isBigJump ? 'text-yellow-400' : 'text-indigo-400'}`}>
                          {k === 0 ? 'base' : `${mult.toFixed(1)}×`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600 mt-4 text-center">
        Odds sourced from Serebii · serebii.net/brilliantdiamondshiningpearl/shinypokemon.shtml ·
        Chain survival % assumes optimal play (furthest patches, Repels active)
      </p>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  emerald: 'text-emerald-400',
  yellow:  'text-yellow-400',
  red:     'text-red-400',
  amber:   'text-amber-400',
  pink:    'text-pink-400',
  violet:  'text-violet-400',
};

function StatCard({ label, value, color, note }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${COLOR_MAP[color] ?? 'text-white'}`}>{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1 leading-snug">{note}</p>}
    </div>
  );
}
