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
  if (p >= 99.995) return '100%';
  if (p < 0.0005) return '<0.001%';
  if (p >= 10) return `${p.toFixed(1)}%`;
  if (p >= 1) return `${p.toFixed(2)}%`;
  return `${p.toFixed(3)}%`;
}

const KEY_CHAINS = Array.from({ length: 41 }, (_, i) => i);
const BASE_ODDS = 4096;
const MAX_IMPROVEMENT = BASE_ODDS / 99; // ~41.4×

// ── CounterBox ────────────────────────────────────────────────────────────────
function CounterBox({ label, sublabel, value, onChange, color = 'indigo' }) {
  const COLOR_TEXT = {
    indigo: 'text-indigo-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
    violet: 'text-violet-400',
  };
  const [raw, setRaw] = React.useState(String(value));

  React.useEffect(() => {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n !== value) setRaw(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-gray-900/60 rounded-xl p-3 flex flex-col gap-1.5">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
        {sublabel && <p className="text-[10px] text-gray-600 leading-tight">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-bold transition-colors shrink-0"
        >−</button>
        <input
          type="text"
          inputMode="numeric"
          value={raw}
          onChange={e => {
            const s = e.target.value.replace(/[^0-9]/g, '');
            setRaw(s);
            if (s !== '') onChange(parseInt(s, 10));
          }}
          onBlur={() => {
            const n = parseInt(raw, 10);
            const v = isNaN(n) ? 0 : Math.max(0, Math.min(40, n));
            onChange(v);
            setRaw(String(v));
          }}
          className={`flex-1 min-w-0 bg-transparent text-3xl font-bold text-center focus:outline-none ${COLOR_TEXT[color] ?? 'text-white'}`}
        />
        <button
          onClick={() => onChange(Math.min(40, value + 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-bold transition-colors shrink-0"
        >+</button>
      </div>
    </div>
  );
}

export default function BDSPRadar() {
  const [chain, setChain] = useState(0);
  const [encRateStr, setEncRateStr] = useState('');
  const [secsStr, setSecsStr] = useState('20');
  const [contRateStr, setContRateStr] = useState('93');
  const [showNerdStats, setShowNerdStats] = useState(false);

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 text-white">
      <div className="flex items-start justify-between mb-0.5">
        <h1 className="text-2xl font-bold">BDSP Radar Breakdown</h1>
        <button
          onClick={() => setShowNerdStats(v => !v)}
          className={`mt-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
            showNerdStats
              ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400'
              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500'
          }`}
        >
          Stats for nerds
        </button>
      </div>
      <p className="text-gray-400 text-sm mb-4">
        Brilliant Diamond / Shining Pearl - Poké Radar shiny stats.{' '}
        <span className="text-gray-500">Odds sourced from Serebii.</span>
      </p>

      {/* ── Tracker + Live Odds + Settings ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
        <div className="flex flex-col gap-3">
          <CounterBox
            label="Chain Length"
            sublabel="consecutive radar patches · resets on chain break"
            value={chain}
            onChange={v => setChain(Math.max(0, Math.min(40, v)))}
            color="indigo"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setChain(c => Math.min(40, c + 1))}
              className="flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-emerald-600/20 border border-emerald-600/40 hover:bg-emerald-600/30 transition-colors active:scale-95"
            >
              <span className="text-lg leading-none">🎯</span>
              <span className="text-sm font-bold text-emerald-300">Patch Found</span>
              <span className="text-[10px] text-emerald-600 font-mono">chain +1</span>
            </button>
            <button
              onClick={() => setChain(0)}
              className="flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-gray-700/40 border border-gray-600/60 hover:bg-gray-700/70 transition-colors active:scale-95"
            >
              <span className="text-lg leading-none">↩</span>
              <span className="text-sm font-bold text-gray-300">Reset Chain</span>
              <span className="text-[10px] text-gray-600 font-mono">chain → 0</span>
            </button>
          </div>
        </div>

        {/* Settings row */}
        {showNerdStats && <div className="border-t border-gray-700 mt-4 pt-3 flex flex-wrap gap-x-5 gap-y-3 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Encounter Rate</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={100}
                value={encRateStr} onChange={e => setEncRateStr(e.target.value)}
                placeholder="100"
                className="w-20 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">Sec / Encounter</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={1} max={300}
                value={secsStr} onChange={e => setSecsStr(e.target.value)}
                className="w-20 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-500 text-sm">s</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1">
              Cont. Rate <span className="text-gray-600 font-normal">(adv)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={50} max={99}
                value={contRateStr} onChange={e => setContRateStr(e.target.value)}
                className="w-20 bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <span className="text-gray-500 text-sm">%</span>
            </div>
          </div>
        </div>}
      </div>

      {/* ── Current odds ── */}
      <div className="bg-indigo-950/50 border border-indigo-500/40 rounded-xl p-4 mb-4 text-center">
        <p className="text-gray-400 text-xs mb-1">
          Shiny odds at chain {stats.n >= 40 ? '40+' : stats.n}
        </p>
        <p className="text-4xl font-bold text-indigo-300">
          1 in {stats.odds.toLocaleString()}
        </p>
        <p className="text-gray-500 text-sm mt-1">
          {(100 / stats.odds).toFixed(4)}% per patch
          {stats.n > 0 && (
            <span className="ml-2 text-indigo-400 font-semibold">
              · {(BASE_ODDS / stats.odds).toFixed(1)}× base rate
            </span>
          )}
        </p>
      </div>

      {/* ── Stats ── */}
      {showNerdStats && <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Statistics</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard
            label="Chance of reaching this chain"
            value={formatPct(stats.chanceThisFar)}
            color="emerald"
            note={
              stats.n === 0
                ? 'Every run starts here.'
                : `${parseFloat(contRateStr) || 93}% success/step - ${formatPct(stats.chanceThisFar)} of chains reach ${stats.n}`
            }
          />
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
          <StatCard
            label="Expected time to recover this chain"
            value={stats.n === 0 ? '-' : formatTime(stats.timeToRecoverS)}
            color="amber"
            note={
              stats.n === 0
                ? 'Nothing to recover from chain 0.'
                : `~${Math.round(stats.encToRecover).toLocaleString()} encounters${encRateStr && parseFloat(encRateStr) < 100 ? ` (incl. finding ${encRateStr}% target)` : ''}`
            }
          />
          <StatCard
            label="Expected time for a shiny at this rate"
            value={formatTime(stats.timeToShinyS)}
            color="pink"
            note={`1 in ${stats.odds.toLocaleString()} per patch × 4 patches/radar → avg ${Math.round(stats.encToShiny).toLocaleString()} radars`}
          />
        </div>
        <StatCard
          label="Combined: recover chain + get shiny"
          value={stats.n === 0 ? formatTime(stats.timeToShinyS) : formatTime(stats.timeTotalS)}
          color="violet"
        />
      </div>}

      {/* ── Odds reference table ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-gray-300">Shiny Odds Reference</h2>
          <p className="text-xs text-gray-500 mt-0.5">Key chain milestones - note the big jumps near chain 36+</p>
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
