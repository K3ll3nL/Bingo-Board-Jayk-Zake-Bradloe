import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from '../PageBackground';

// Shiny odds by chain length — source: Serebii
// Index = chain length; index 40 covers 40+
const CHAIN_ODDS = [
  4096, 3855, 3640, 3449, 3277, 3121, 2979, 2849, 2731, 2621,
  2521, 2427, 2341, 2259, 2185, 2114, 2048, 1986, 1927, 1872,
  1820, 1771, 1724, 1680, 1638, 1598, 1560, 1524, 1489, 1456,
  1310, 1285, 1260, 1236, 1213, 1192,  993,  799,  400,  200,
    99,
];

function getOdds(chain) {
  return CHAIN_ODDS[Math.min(Math.max(chain, 0), 40)];
}

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
const MAX_IMPROVEMENT = BASE_ODDS / 99;

// ── Accent colors ─────────────────────────────────────────────────────────────
const A = '#818cf8'; // indigo-400
const AB = 'rgba(99,102,241,0.15)';
const ABorder = 'rgba(99,102,241,0.3)';

// ── StatCard ──────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  emerald: '#34d399', yellow: '#fbbf24', red: '#f87171',
  amber: '#fbbf24',  pink: '#f472b6',   violet: '#a78bfa',
};

function StatCard({ label, value, color, note }) {
  const col = COLOR_MAP[color] ?? '#fff';
  return (
    <div className="rounded-xl p-3.5" style={{
      background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold leading-tight" style={{ color: col }}>{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1 leading-snug">{note}</p>}
    </div>
  );
}

// ── CounterBox ────────────────────────────────────────────────────────────────
function CounterBox({ value, onChange, min = 0, max = 40 }) {
  const [raw, setRaw] = React.useState(String(value));

  React.useEffect(() => {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n !== value) setRaw(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      >−</button>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        onChange={e => {
          const s = e.target.value.replace(/[^0-9]/g, '');
          setRaw(s);
          if (s !== '') onChange(Math.min(max, parseInt(s, 10)));
        }}
        onBlur={() => {
          const n = parseInt(raw, 10);
          const v = isNaN(n) ? 0 : Math.max(min, Math.min(max, n));
          onChange(v);
          setRaw(String(v));
        }}
        className="w-16 text-center text-3xl font-black focus:outline-none tabular-nums"
        style={{ background: 'transparent', color: A }}
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      >+</button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BDSPRadar() {
  const navigate = useNavigate();
  const [chain, setChain] = useState(0);
  const [encRateStr, setEncRateStr] = useState('');
  const [secsStr, setSecsStr] = useState('20');
  const [contRateStr, setContRateStr] = useState('93');
  const [showNerdStats, setShowNerdStats] = useState(false);

  const secsPerEnc = Math.max(1, parseFloat(secsStr) || 20);
  const contRate = Math.max(0.5, Math.min(0.99, (parseFloat(contRateStr) || 93) / 100));
  const encRate = encRateStr !== '' ? Math.max(0.01, Math.min(1, parseFloat(encRateStr) / 100)) : 1;

  const stats = useMemo(() => {
    const n = Math.max(0, Math.min(40, chain));
    const odds = getOdds(n);
    const chanceThisFar = Math.pow(contRate, n) * 100;
    const chanceToForty = n >= 40 ? 100 : Math.pow(contRate, 40 - n) * 100;
    const encToShiny = odds / 4;
    const timeToShinyS = encToShiny * secsPerEnc;
    const E = expectedToChain(n, contRate);
    const attempts = n > 0 ? 1 / Math.pow(contRate, n) : 1;
    const extraPerAttempt = encRate < 1 ? (1 / encRate - 1) : 0;
    const encToRecover = E + attempts * extraPerAttempt;
    const timeToRecoverS = encToRecover * secsPerEnc;
    const timeTotalS = timeToRecoverS + timeToShinyS;
    return { n, odds, chanceThisFar, chanceToForty, encToShiny, timeToShinyS, encToRecover, timeToRecoverS, timeTotalS };
  }, [chain, contRate, encRate, secsPerEnc]);

  const pct = parseFloat(contRateStr) || 93;
  const isBigJumpZone = chain >= 36;

  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b"
        style={{ background: 'rgba(13,15,20,0.85)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tools')}
              className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Shiny Tools</span>
            </button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
            <span className="text-sm font-semibold text-white">BDSP Radar</span>
          </div>
          <button
            onClick={() => setShowNerdStats(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
            style={showNerdStats
              ? { background: AB, borderColor: ABorder, color: A }
              : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
            </svg>
            Stats for Nerds
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Main tracker card ────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden mb-5" style={{
          background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${A} 0%, transparent 100%)` }} />
          <div className="p-5 lg:p-7">

            {/* ── Desktop hero row: big odds left, counter right ── */}
            <div className="hidden lg:flex items-start justify-between gap-8 pb-6 mb-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(129,140,248,0.5)' }}>
                  Current odds
                </p>
                <p className="text-7xl font-black leading-none tabular-nums" style={{ color: A }}>
                  1/{stats.odds.toLocaleString()}
                </p>
                <p className="text-sm mt-2.5" style={{ color: 'rgba(129,140,248,0.5)' }}>
                  {(100 / stats.odds).toFixed(4)}% per patch
                  {stats.n > 0 && (
                    <span className="ml-3 font-bold" style={{ color: A }}>
                      {(BASE_ODDS / stats.odds).toFixed(1)}× base odds
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'rgba(129,140,248,0.6)' }}>
                  Chain Length
                </p>
                <CounterBox value={chain} onChange={setChain} />
                <div className="mt-2">
                  {chain >= 40 && <p className="text-xs font-bold" style={{ color: '#fbbf24' }}>★ Max chain — best odds!</p>}
                  {isBigJumpZone && chain < 40 && <p className="text-xs font-bold" style={{ color: '#fbbf24' }}>Odds spike zone!</p>}
                  <p className="text-sm text-gray-500">
                    {chain >= 40 ? '41× base odds!' : `${40 - chain} step${40 - chain !== 1 ? 's' : ''} to chain 40`}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Mobile: counter at top ── */}
            <div className="lg:hidden mb-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(129,140,248,0.6)' }}>
                Chain Length
              </p>
              <div className="flex items-center justify-between">
                <CounterBox value={chain} onChange={setChain} />
                <div className="text-right">
                  {chain >= 40 && <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#fbbf24' }}>★ Max chain — best odds!</p>}
                  {isBigJumpZone && chain < 40 && <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#fbbf24' }}>Odds spike zone!</p>}
                  <p className="text-sm text-gray-500 mt-0.5">
                    {chain >= 40 ? '40+ chain' : `${40 - chain} step${40 - chain !== 1 ? 's' : ''} to 40`}
                  </p>
                </div>
              </div>
            </div>

            {/* Slider (both) */}
            <div className="mb-5">
              <input type="range" min={0} max={40} step={1} value={chain}
                onChange={e => setChain(Number(e.target.value))}
                className="w-full" style={{ accentColor: A }} />
              <div className="flex justify-between text-[10px] mt-1 select-none" style={{ color: 'rgba(255,255,255,0.2)' }}>
                <span>0</span><span>10</span><span>20</span>
                <span style={{ color: isBigJumpZone ? '#fbbf24' : undefined }}>36+</span>
                <span>40</span>
              </div>
            </div>

            {/* Action buttons (both) */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setChain(c => Math.min(40, c + 1))}
                className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all active:scale-95"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(52,211,153,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(52,211,153,0.1)'}>
                <span className="text-lg leading-none">🎯</span>
                <span className="text-sm font-bold" style={{ color: '#34d399' }}>Patch Found</span>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(52,211,153,0.5)' }}>chain +1</span>
              </button>
              <button onClick={() => setChain(0)}
                className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}>
                <span className="text-lg leading-none">↩</span>
                <span className="text-sm font-bold text-gray-300">Reset Chain</span>
                <span className="text-[10px] font-mono text-gray-600">chain → 0</span>
              </button>
            </div>

            {/* ── Mobile: odds + next milestone below buttons ── */}
            <div className="lg:hidden pt-5 mt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(129,140,248,0.5)' }}>
                    Current odds
                  </p>
                  <p className="text-4xl font-black leading-none" style={{ color: A }}>
                    1/{stats.odds.toLocaleString()}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(129,140,248,0.5)' }}>
                    {(100 / stats.odds).toFixed(4)}% per patch
                    {stats.n > 0 && <span className="ml-2 font-semibold" style={{ color: A }}>{(BASE_ODDS / stats.odds).toFixed(1)}× base</span>}
                  </p>
                </div>
                {chain < 40 && (() => {
                  const next = [1,5,10,20,30,36,40].find(k => k > chain);
                  if (!next) return null;
                  return (
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1 text-gray-600">Next milestone</p>
                      <p className="text-sm font-bold" style={{ color: next >= 36 ? '#fbbf24' : A }}>Chain {next}</p>
                      <p className="text-sm font-mono tabular-nums text-gray-400">1/{getOdds(next).toLocaleString()}</p>
                    </div>
                  );
                })()}
                {chain >= 40 && <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>★ Max odds</p>}
              </div>
            </div>

          </div>
        </div>

        {/* ── Nerd stats ───────────────────────────────────────────────────── */}
        {showNerdStats && <div className="mt-6 space-y-5">

            {/* Settings */}
            <div className="rounded-xl p-4" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-4">Settings</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Sec / Step', hint: 'optional', unit: 's', min: 1, max: 300, value: secsStr, set: setSecsStr, placeholder: '20' },
                  { label: 'Encounter Rate', hint: 'optional', unit: '%', min: 1, max: 100, value: encRateStr, set: setEncRateStr, placeholder: '100' },
                  { label: 'Continuation Rate', hint: 'default 93%', unit: '%', min: 50, max: 99, value: contRateStr, set: setContRateStr, placeholder: '93' },
                ].map(({ label, hint, unit, min, max, value, set, placeholder }) => (
                  <div key={label}>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      {label}
                    </label>
                    <p className="text-[10px] text-gray-700 mb-2">{hint}</p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={min} max={max} value={value} placeholder={placeholder}
                        onChange={e => set(e.target.value)}
                        className="w-full rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none"
                        style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}
                      />
                      <span className="text-xs text-gray-600 shrink-0">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Reach this chain"
                value={formatPct(stats.chanceThisFar)}
                color="emerald"
                note={chain === 0 ? 'Every run starts here.' : `${pct}% per step`}
              />
              <StatCard
                label="Reach chain 40"
                value={formatPct(stats.chanceToForty)}
                color={stats.chanceToForty > 50 ? 'emerald' : stats.chanceToForty > 10 ? 'yellow' : 'red'}
                note={chain >= 40 ? "You're there!" : `${40 - chain} more step${40 - chain !== 1 ? 's' : ''}`}
              />
              <StatCard
                label="Time to shiny (here)"
                value={formatTime(stats.timeToShinyS)}
                color="pink"
                note={`~${Math.round(stats.encToShiny).toLocaleString()} radars at 4 patches each`}
              />
              <StatCard
                label="Recovery if chain breaks"
                value={chain === 0 ? '—' : formatTime(stats.timeToRecoverS)}
                color="amber"
                note={chain === 0 ? 'Nothing to recover from.' : `~${Math.round(stats.encToRecover).toLocaleString()} enc to rebuild`}
              />
            </div>

            {/* Combined */}
            <div className="rounded-xl p-3.5" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Combined: recover + shiny</p>
              <p className="text-2xl font-bold" style={{ color: '#a78bfa' }}>
                {chain === 0 ? formatTime(stats.timeToShinyS) : formatTime(stats.timeTotalS)}
              </p>
            </div>

            {/* Progress bar */}
            <div className="rounded-xl p-4" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Odds improvement</p>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${((BASE_ODDS - stats.odds) / (BASE_ODDS - 99)) * 100}%`,
                    background: `linear-gradient(90deg, ${A}, #c084fc)`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1.5 text-gray-600">
                <span>Base (1/4096)</span>
                <span>Max (1/99)</span>
              </div>
            </div>

            {/* Reference table */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="px-5 py-3.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <h2 className="text-sm font-bold text-white">Shiny Odds by Chain Length</h2>
                <p className="text-xs text-gray-500 mt-0.5">Note the big jumps at chains 36+</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left px-5 py-2.5">Chain</th>
                      <th className="text-right px-5 py-2.5">Odds</th>
                      <th className="text-right px-5 py-2.5">Probability</th>
                      <th className="px-5 py-2.5">vs Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {KEY_CHAINS.map(k => {
                      const o = getOdds(k);
                      const mult = BASE_ODDS / o;
                      const barWidth = (mult / MAX_IMPROVEMENT) * 100;
                      const isActive = stats.n === k || (k === 40 && stats.n >= 40);
                      const isSpike = k >= 36;
                      return (
                        <tr key={k} className="border-b transition-colors"
                          style={{
                            borderColor: 'rgba(255,255,255,0.04)',
                            background: isActive ? 'rgba(99,102,241,0.1)' : undefined,
                          }}>
                          <td className="px-5 py-2 font-semibold tabular-nums"
                            style={{ color: isActive ? A : isSpike ? '#fbbf24' : '#d1d5db' }}>
                            {k === 40 ? '40+' : k}
                            {isActive && <span className="ml-2 text-xs font-normal" style={{ color: 'rgba(129,140,248,0.6)' }}>◄ you</span>}
                          </td>
                          <td className="text-right px-5 py-2 tabular-nums" style={{ color: isActive ? A : '#9ca3af' }}>
                            1/{o.toLocaleString()}
                          </td>
                          <td className="text-right px-5 py-2 tabular-nums text-gray-500 text-xs">
                            {(100 / o).toFixed(4)}%
                          </td>
                          <td className="px-5 py-2 w-44">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className="h-full rounded-full"
                                  style={{
                                    width: `${barWidth}%`,
                                    background: k === 0 ? 'rgba(255,255,255,0.15)' : isSpike ? '#fbbf24' : A,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium w-10 text-right tabular-nums"
                                style={{ color: k === 0 ? 'rgba(255,255,255,0.2)' : isSpike ? '#fbbf24' : A }}>
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

            <p className="text-[10px] text-gray-700 text-center pb-2">
              Odds from Serebii · serebii.net/brilliantdiamondshiningpearl/shinypokemon.shtml ·
              Chain survival % assumes optimal play (furthest patches, Repels active)
            </p>
          </div>}
      </div>
    </div>
  );
}
