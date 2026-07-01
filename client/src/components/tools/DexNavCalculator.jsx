import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from '../PageBackground';

// ── Serebii lookup table ──────────────────────────────────────────────────────
const TABLE_NO_CHARM = [
  [0,          0,   4096,    4096,    4096,   4096   ],
  [1,         16,   2906,    1344.23, 804.22, 573.81 ],
  [17,        33,   2251.79, 804.18,  446.06, 308.72 ],
  [34,        50,   1838.01, 573.76,  308.70, 211.26 ],
  [51,        66,   1552.69, 446.02,  236.07, 160.62 ],
  [67,        83,   1344.05, 364.83,  191.14, 129.60 ],
  [84,       100,   1184.84, 308.66,  160.60, 108.65 ],
  [101,      150,   1059.36, 267.49,  138.50,  93.54 ],
  [151,      200,    957.90, 236.03,  121.75,  82.14 ],
  [201,      300,    874.19, 211.20,  108.63,  73.23 ],
  [301,      400,    803.93, 191.10,   98.07,  66.07 ],
  [401,      500,    744.12, 174.50,   89.39,  60.19 ],
  [501,      600,    692.59, 160.56,   82.12,  55.28 ],
  [601,      700,    647.74, 148.68,   75.96,  51.12 ],
  [701,      800,    608.35, 138.45,   70.66,  47.54 ],
  [801,      900,    573.47, 129.54,   66.05,  44.44 ],
  [901, Infinity,    542.37, 121.70,   62.01,  41.72 ],
];

const TABLE_CHARM = [
  [0,          0,   1365.67, 1365.67, 1365.67, 1365.67],
  [1,         16,    969.00,  698.56,  517.95,  411.58 ],
  [17,        33,    750.93,  469.40,  319.71,  242.46 ],
  [34,        50,    613.00,  353.50,  231.28,  171.93 ],
  [51,        66,    517.90,  283.54,  181.22,  133.23 ],
  [67,        83,    448.35,  236.72,  149.00,  108.79 ],
  [84,       100,    395.28,  203.19,  126.53,   91.95 ],
  [101,      150,    353.45,  177.99,  109.96,   79.64 ],
  [151,      200,    319.64,  158.36,   97.25,   70.25 ],
  [201,      300,    291.73,  142.64,   87.18,   62.85 ],
  [301,      400,    268.31,  129.77,   79.00,   56.87 ],
  [401,      500,    248.37,  119.03,   72.24,   51.93 ],
  [501,      600,    231.20,  109.94,   66.55,   47.79 ],
  [601,      700,    216.25,  102.14,   61.69,   44.27 ],
  [701,      800,    203.12,   95.38,   57.50,   41.24 ],
  [801,      900,    191.49,   89.47,   53.85,   38.60 ],
  [901, Infinity,    181.12,   84.24,   50.63,   36.28 ],
];

function slRow(sl, charm) {
  const t = charm ? TABLE_CHARM : TABLE_NO_CHARM;
  return t.find(r => sl >= r[0] && sl <= r[1]) ?? t[t.length - 1];
}

function prob(sl, chain, charm) {
  const [, , std, boost, e50, e100] = slRow(sl, charm);
  if (chain === 100)                 return 1 / e100;
  if (chain === 50)                  return 1 / e50;
  if (chain > 0 && chain % 5 === 0) return 1 / boost;
  return 0.96 / std + 0.04 / boost;
}

function oddsNums(sl, charm) {
  const [, , std, boost, e50, e100] = slRow(sl, charm);
  return { std, boost, e50, e100 };
}

function chainAt(start, offset, resetAt) {
  if (resetAt <= 0) return start + offset;
  return (start + offset) % (resetAt + 1);
}

function fmtOdds(p)    { return `1/${Math.round(1 / p).toLocaleString()}`; }
function fmtDenom(d)   { return `1/${Math.round(d).toLocaleString()}`; }
function fmtPct(p, d = 2) {
  const v = p * 100;
  if (v >= 99.995) return '≈100%';
  if (v < 0.00005) return '<0.0001%';
  return `${v.toFixed(d)}%`;
}
function fmtTime(s) {
  if (!isFinite(s) || s > 864000) return '>10 days';
  if (s < 120)  return `${Math.round(s)}s`;
  if (s < 7200) return `${(s / 60).toFixed(1)} min`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
function fmtEnc(n) {
  return n >= 10000 ? `${(n / 1000).toFixed(0)}k`
       : n >=  1000 ? `${(n / 1000).toFixed(1)}k`
       : String(n);
}

// ── Accent ────────────────────────────────────────────────────────────────────
const A  = '#60a5fa'; // blue-400
const AB = 'rgba(96,165,250,0.12)';
const ABorder = 'rgba(96,165,250,0.3)';

// ── CounterBox ────────────────────────────────────────────────────────────────
function CounterBox({ label, sublabel, value, onChange, accent = A }) {
  const [raw, setRaw] = React.useState(String(value));

  React.useEffect(() => {
    const n = parseInt(raw, 10);
    if (isNaN(n) || n !== value) setRaw(String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3 min-w-0 overflow-hidden" style={{
      background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        {sublabel && <p className="text-[10px] text-gray-700 leading-tight mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-xl font-bold transition-all active:scale-95 shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        >−</button>
        <input
          type="text" inputMode="numeric" value={raw}
          onChange={e => {
            const s = e.target.value.replace(/[^0-9]/g, '');
            setRaw(s);
            if (s !== '') onChange(parseInt(s, 10));
          }}
          onBlur={() => {
            const n = parseInt(raw, 10);
            const v = isNaN(n) ? 0 : Math.max(0, n);
            onChange(v); setRaw(String(v));
          }}
          className="flex-1 min-w-0 text-4xl font-black text-center focus:outline-none tabular-nums bg-transparent"
          style={{ color: accent }}
        />
        <button
          onClick={() => onChange(value + 1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-xl font-bold transition-all active:scale-95 shrink-0"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        >+</button>
      </div>
    </div>
  );
}

// ── SmallStatCard ─────────────────────────────────────────────────────────────
function SmallStatCard({ label, value, sub, note, accent = '#9ca3af' }) {
  return (
    <div className="rounded-xl p-3.5" style={{
      background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold leading-tight" style={{ color: accent }}>{value}</p>
      {sub  && <p className="text-xs leading-tight mt-0.5" style={{ color: accent, opacity: 0.55 }}>{sub}</p>}
      {note && <p className="text-xs text-gray-600 mt-1 leading-snug">{note}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DexNavCalculator() {
  const navigate = useNavigate();
  const [chain, setChain]             = useState(0);
  const [searchLevel, setSearchLevel] = useState(0);
  const [shinyCharm, setShinyCharm]   = useState(false);
  const [resetAtStr, setResetAtStr]   = useState('');
  const [secsStr, setSecsStr]         = useState('');
  const [graphMode, setGraphMode]     = useState('cdf');
  const [showNerdStats, setShowNerdStats] = useState(false);

  const resetAt    = resetAtStr ? Math.max(1, parseInt(resetAtStr) || 0) : 0;
  const secsPerEnc = secsStr    ? Math.max(1, parseFloat(secsStr)  || 10) : null;

  const advance = (alsoSL) => {
    setChain(c => {
      const next = c + 1;
      return (resetAt > 0 && next > resetAt) ? 0 : next;
    });
    if (alsoSL) setSearchLevel(s => s + 1);
  };
  const handleSetChain = v => setChain(Math.max(0, resetAt > 0 ? Math.min(v, resetAt) : v));

  const comp = useMemo(() => {
    const nextChain = chain + 1;
    const currentP  = prob(searchLevel, nextChain, shinyCharm);
    const { std, boost, e50, e100 } = oddsNums(searchLevel, shinyCharm);
    const effectiveP = 0.768 / std + 0.232 / boost;
    const distTo50  = Math.max(0, 50  - nextChain);
    const distTo100 = Math.max(0, 100 - nextChain);
    const slAt50  = searchLevel + distTo50;
    const slAt100 = searchLevel + distTo100;
    const pAt50   = prob(slAt50,  50,  shinyCharm);
    const pAt100  = prob(slAt100, 100, shinyCharm);
    const graphMax = Math.min(1200, Math.max(200, distTo100 + 100, Math.ceil(1 / effectiveP * 1.5)));
    const fullMax  = Math.min(20000, Math.max(graphMax, Math.ceil(1 / effectiveP * 5)));

    const points = [];
    let cumNotShiny = 1;
    for (let i = 0; i <= fullMax; i++) {
      const c  = chainAt(nextChain, i, resetAt);
      const sl = searchLevel + i;
      const p  = prob(sl, c, shinyCharm);
      points.push({ enc: i, cdf: 1 - cumNotShiny, p, chain: c, sl });
      cumNotShiny *= (1 - p);
    }

    const find = target => { for (const pt of points) if (pt.cdf >= target) return pt; return points[points.length - 1]; };
    const m50 = find(0.500), m63 = find(0.632), m75 = find(0.750), m90 = find(0.900), m99 = find(0.990);

    let expectedEnc = 0;
    { let survival = 1;
      const cap = Math.max(fullMax, Math.ceil(1 / effectiveP) * 15);
      for (let i = 0; i <= cap; i++) {
        expectedEnc += survival;
        const c = chainAt(nextChain, i, resetAt);
        const p = prob(searchLevel + i, c, shinyCharm);
        survival *= (1 - p);
        if (survival < 1e-6) break;
      }
      expectedEnc = Math.round(expectedEnc);
    }

    return { currentP, effectiveP, std, boost, e50, e100, distTo50, distTo100, slAt50, slAt100, pAt50, pAt100, graphMax, fullMax, points, m50, m63, m75, m90, m99, expectedEnc };
  }, [chain, searchLevel, shinyCharm, resetAt]);

  const { currentP, std, boost, e50, e100, distTo50, distTo100, slAt50, slAt100, pAt50, pAt100, graphMax, points, m50, m63, m75, m90, m99, expectedEnc } = comp;

  const nextChain   = chain + 1;
  const atMilestone = nextChain === 50  ? 'enc50'
                    : nextChain === 100 ? 'enc100'
                    : nextChain % 5 === 0 ? 'boost'
                    : null;

  const milestoneColor = atMilestone === 'enc100' ? '#fbbf24'
                       : atMilestone === 'enc50'  ? '#34d399'
                       : atMilestone === 'boost'  ? '#38bdf8'
                       : A;
  const milestoneBg = atMilestone === 'enc100' ? 'rgba(251,191,36,0.08)'
                    : atMilestone === 'enc50'  ? 'rgba(52,211,153,0.08)'
                    : atMilestone === 'boost'  ? 'rgba(56,189,248,0.08)'
                    : AB;
  const milestoneBorder = atMilestone === 'enc100' ? 'rgba(251,191,36,0.3)'
                        : atMilestone === 'enc50'  ? 'rgba(52,211,153,0.3)'
                        : atMilestone === 'boost'  ? 'rgba(56,189,248,0.3)'
                        : ABorder;

  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b"
        style={{ background: 'rgba(13,15,20,0.85)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
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
            <span className="text-sm font-semibold text-white">DexNav Calculator</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Shiny Charm quick toggle */}
            <button
              onClick={() => setShinyCharm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={shinyCharm
                ? { background: 'rgba(250,204,21,0.12)', borderColor: 'rgba(250,204,21,0.4)', color: '#fde047' }
                : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
              ✦ Shiny Charm
            </button>
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
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── Live Tracker ──────────────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <CounterBox
            label="Chain" accent={A}
            sublabel={resetAtStr ? `resets after ${resetAtStr}` : 'consecutive encounters · resets on break'}
            value={chain} onChange={handleSetChain}
          />
          <CounterBox
            label="Search Level" accent="#34d399"
            sublabel="total encounters with this species · never resets"
            value={searchLevel} onChange={v => setSearchLevel(Math.max(0, v))}
          />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'On-Target', sub: 'chain+1 · SL+1', icon: '🎯', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)', onClick: () => advance(true) },
            { label: 'Off-Target', sub: 'chain+1 · SL stays', icon: '↪', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)', onClick: () => advance(false) },
            { label: 'Reset Chain', sub: 'SL unchanged', icon: '↩', color: '#9ca3af', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', onClick: () => setChain(0) },
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick}
              className="flex flex-col items-center justify-center gap-1 py-3 sm:py-4 rounded-xl transition-all active:scale-95"
              style={{ background: btn.bg, border: `1px solid ${btn.border}` }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.2)'}
              onMouseLeave={e => e.currentTarget.style.filter = ''}>
              <span className="text-lg sm:text-xl leading-none">{btn.icon}</span>
              <span className="text-sm font-bold" style={{ color: btn.color }}>{btn.label}</span>
              <span className="text-[10px] font-mono" style={{ color: btn.color, opacity: 0.5 }}>{btn.sub}</span>
            </button>
          ))}
        </div>

        {/* ── Current Odds Hero ──────────────────────────────────────────────── */}
        <div className="rounded-2xl p-5 mb-6" style={{
          background: milestoneBg,
          border: `1px solid ${milestoneBorder}`,
        }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            {/* Left: odds */}
            <div>
              {atMilestone === 'enc100' && <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#fbbf24' }}>★ Step 100 — Best Odds!</p>}
              {atMilestone === 'enc50'  && <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#34d399' }}>★ Step 50 — Bonus Encounter!</p>}
              {atMilestone === 'boost'  && <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#38bdf8' }}>✦ Every 5th Step Boost</p>}
              <p className="text-xs text-gray-500 mb-1">
                {chain === 0 ? `Next encounter is chain 1 · SL ${searchLevel}` : `Next encounter is chain ${nextChain} · SL ${searchLevel}`}
              </p>
              <p className="text-5xl font-black leading-none" style={{ color: milestoneColor }}>
                {fmtOdds(currentP)}
              </p>
              <p className="text-sm mt-1" style={{ color: milestoneColor, opacity: 0.7 }}>
                {atMilestone === 'boost' || atMilestone === 'enc50' || atMilestone === 'enc100'
                  ? `${fmtPct(currentP, 4)} this encounter`
                  : `${fmtPct(1/std, 4)} standard · ${fmtPct(1/boost, 4)} if boost`}
              </p>
              {/* Milestone previews */}
              {atMilestone !== 'enc100' && (distTo50 > 0 || distTo100 > 0) && (
                <div className="flex gap-4 mt-3 text-xs">
                  {distTo50 > 0 && (
                    <span className="text-gray-500">
                      Step 50 → <span className="font-bold" style={{ color: '#34d399' }}>{fmtDenom(1/pAt50)}</span>
                      <span className="text-gray-600"> in {distTo50} enc</span>
                    </span>
                  )}
                  {distTo100 > 0 && (
                    <span className="text-gray-500">
                      Step 100 → <span className="font-bold" style={{ color: '#fbbf24' }}>{fmtDenom(1/pAt100)}</span>
                      <span className="text-gray-600"> in {distTo100} enc</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: SL odds breakdown */}
            <div className="rounded-xl px-4 py-3 shrink-0 self-start" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">SL {searchLevel} odds</p>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  { label: 'No boost',      denom: std,   color: '#6b7280', active: !atMilestone },
                  { label: 'Every 5th / 4%', denom: boost, color: '#38bdf8', active: atMilestone === 'boost' },
                  { label: 'Step 50 ★',     denom: e50,   color: '#34d399', active: atMilestone === 'enc50'  },
                  { label: 'Step 100 ★',    denom: e100,  color: '#fbbf24', active: atMilestone === 'enc100' },
                ].map(({ label, denom, color, active }) => (
                  <div key={label} className="flex justify-between gap-5" style={{ opacity: active ? 1 : 0.35 }}>
                    <span style={{ color: active ? '#d1d5db' : '#4b5563' }}>
                      {label}{active ? <span style={{ color }} className="ml-1">◄</span> : ''}
                    </span>
                    <span style={{ color }}>1/{Math.round(denom).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Nerd Stats ────────────────────────────────────────────────────── */}
        {showNerdStats && (
          <div className="space-y-5">
            {/* Settings */}
            <div className="rounded-xl p-4 flex flex-wrap gap-4 items-end" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Reset chain after <span className="text-gray-700 font-normal normal-case">(optional)</span>
                </p>
                <input type="number" min={1} value={resetAtStr}
                  onChange={e => setResetAtStr(e.target.value)} placeholder="no reset"
                  className="w-32 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none"
                  style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Seconds / encounter <span className="text-gray-700 font-normal normal-case">(optional)</span>
                </p>
                <input type="number" min={1} max={300} value={secsStr}
                  onChange={e => setSecsStr(e.target.value)} placeholder="—"
                  className="w-32 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none"
                  style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.07)' }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              {(() => {
                const enc50Reachable = resetAt <= 0 || resetAt >= 50;
                const step50Card = !enc50Reachable
                  ? <SmallStatCard key="s50" label="Step 50 Bonus" value="Unreachable" accent="#6b7280"
                      note={`Resets at ${resetAt} — need ≥50`} />
                  : distTo50 === 0
                    ? <SmallStatCard key="s50" label="Step 50 ★ NEXT" value={fmtDenom(1/pAt50)} accent="#34d399"
                        sub={fmtPct(pAt50, 4)} note={`SL ${slAt50}`} />
                    : <SmallStatCard key="s50" label="Step 50 Bonus" value={fmtDenom(1/pAt50)} accent="#34d399"
                        sub={`in ${distTo50} enc${secsPerEnc ? ` · ${fmtTime(distTo50 * secsPerEnc)}` : ''}`}
                        note={`SL ${slAt50} at that point`} />;

                const enc100Reachable = resetAt <= 0 || resetAt >= 100;
                const step100Card = !enc100Reachable
                  ? <SmallStatCard key="s100" label="Step 100 Bonus" value="Unreachable" accent="#6b7280"
                      note={`Resets at ${resetAt} — need ≥100`} />
                  : distTo100 === 0
                    ? <SmallStatCard key="s100" label="Step 100 ★ NEXT" value={fmtDenom(1/pAt100)} accent="#fbbf24"
                        sub={fmtPct(pAt100, 4)} note={`SL ${slAt100}`} />
                    : <SmallStatCard key="s100" label="Step 100 Bonus" value={fmtDenom(1/pAt100)} accent="#fbbf24"
                        sub={`in ${distTo100} enc${secsPerEnc ? ` · ${fmtTime(distTo100 * secsPerEnc)}` : ''}`}
                        note={`SL ${slAt100} at that point`} />;

                return [step50Card, step100Card,
                  <SmallStatCard key="exp" label="Expected encounters"
                    value={expectedEnc.toLocaleString()} accent="#fb923c"
                    sub={secsPerEnc ? `≈ ${fmtTime(expectedEnc * secsPerEnc)}` : undefined}
                    note="from now · SL growth + milestones + boosts included" />
                ];
              })()}
            </div>

            {/* Graph */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {graphMode === 'cdf' ? 'Cumulative Shiny Probability' : 'Per-Encounter Shiny Rate'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {graphMode === 'cdf' ? 'Spikes at chain 50 & 100' : 'Step spikes at milestones'}
                  </p>
                </div>
                <div className="flex rounded-lg overflow-hidden border text-xs font-semibold shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  {['cdf', 'hazard'].map(m => (
                    <button key={m} onClick={() => setGraphMode(m)}
                      className="px-3 py-1.5 transition-colors"
                      style={{ background: graphMode === m ? A : 'transparent', color: graphMode === m ? '#0d0f14' : '#6b7280' }}>
                      {m === 'cdf' ? 'CDF' : 'Per-Enc'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <DexNavGraph points={points} graphMode={graphMode} graphMax={graphMax}
                  chain={chain} resetAt={resetAt} m50={m50} m63={m63} m90={m90} accentColor={A} />
              </div>
            </div>

            {/* Milestones table */}
            <div className="rounded-2xl overflow-hidden" style={{
              background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <h2 className="text-sm font-bold text-white">Probability Milestones</h2>
                <p className="text-xs text-gray-500 mt-0.5">Encounters from now · SL increases per on-target encounter</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                      <th className="text-left px-4 py-2.5">Target</th>
                      <th className="text-right px-4 py-2.5">Encounter #</th>
                      <th className="text-right px-4 py-2.5">Chain / SL</th>
                      {secsPerEnc && <th className="text-right px-4 py-2.5">Est. time</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '50%',           m: m50, color: '#34d399' },
                      { label: '63.2% (1 avg)', m: m63, color: A         },
                      { label: '75%',           m: m75, color: '#fbbf24' },
                      { label: '90%',           m: m90, color: '#fb923c' },
                      { label: '99%',           m: m99, color: '#f87171' },
                    ].map(({ label, m, color }) => (
                      <tr key={label} className="border-b transition-colors hover:bg-white/[0.02]"
                        style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-2.5 font-semibold" style={{ color }}>{label}</td>
                        <td className="text-right px-4 py-2.5 text-gray-300 tabular-nums font-mono">
                          {m?.enc.toLocaleString() ?? '—'}
                        </td>
                        <td className="text-right px-4 py-2.5 text-gray-600 tabular-nums text-xs">
                          {m ? `chain ${m.chain} · SL ${m.sl.toLocaleString()}` : '—'}
                        </td>
                        {secsPerEnc && (
                          <td className="text-right px-4 py-2.5 text-gray-400">
                            {m ? fmtTime(m.enc * secsPerEnc) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SL reference */}
            <SLReferenceTable shinyCharm={shinyCharm} currentSL={searchLevel} accentColor={A} />

            <p className="text-[10px] text-gray-700 text-center pb-2">
              Odds from Serebii · every 5th step = guaranteed boost · steps 50 & 100 = special higher bonuses · SL = search level (never resets)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Graph ─────────────────────────────────────────────────────────────────────
function DexNavGraph({ points, graphMode, graphMax, chain, resetAt, m50, m63, m90, accentColor }) {
  const W = 580, H = 230;
  const PAD = { top: 12, right: 20, bottom: 38, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const vis = points.filter(p => p.enc <= graphMax);
  if (!vis.length) return null;

  const xScale = enc => PAD.left + (enc / graphMax) * plotW;

  let yScale, yTicks;
  if (graphMode === 'cdf') {
    yScale = v => PAD.top + (1 - v) * plotH;
    yTicks = [0, 0.25, 0.50, 0.75, 1.0];
  } else {
    const maxP = Math.max(...vis.map(d => d.p));
    const yMax = maxP * 1.15;
    yScale = v => PAD.top + (1 - v / yMax) * plotH;
    yTicks = [0, maxP * 0.25, maxP * 0.5, maxP * 0.75, maxP];
  }

  const cdfPath = () => {
    const step = Math.max(1, Math.floor(vis.length / 400));
    return vis.filter((_, i) => i === 0 || i === vis.length - 1 || i % step === 0)
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.enc).toFixed(1)} ${yScale(d.cdf).toFixed(1)}`).join(' ');
  };

  const hazardResult = () => {
    const changes = [];
    let prevP = null;
    for (const pt of vis) { if (pt.p !== prevP) { changes.push(pt); prevP = pt.p; } }
    if (!changes.length) return null;
    const maxP = Math.max(...changes.map(d => d.p));
    const yMax = maxP * 1.15;
    const yS = v => PAD.top + (1 - v / yMax) * plotH;
    let d = `M ${xScale(changes[0].enc).toFixed(1)} ${yS(changes[0].p).toFixed(1)}`;
    for (let i = 1; i < changes.length; i++) {
      d += ` H ${xScale(changes[i].enc).toFixed(1)} V ${yS(changes[i].p).toFixed(1)}`;
    }
    d += ` H ${xScale(graphMax).toFixed(1)}`;
    return { d, yS, hTicks: [0, maxP * 0.25, maxP * 0.5, maxP * 0.75, maxP] };
  };

  let mainPath, hz;
  if (graphMode === 'cdf') { mainPath = cdfPath(); }
  else { hz = hazardResult(); mainPath = hz?.d ?? ''; }

  const effY = graphMode === 'cdf' ? yScale : (hz?.yS ?? yScale);
  const effTicks = graphMode === 'cdf' ? yTicks : (hz?.hTicks ?? yTicks);
  const fmtY = v => graphMode === 'cdf' ? `${(v * 100).toFixed(0)}%` : v === 0 ? '0' : `1/${Math.round(1/v).toLocaleString()}`;

  const area = graphMode === 'cdf' && mainPath
    ? `${mainPath} L ${xScale(graphMax).toFixed(1)} ${PAD.top + plotH} L ${PAD.left} ${PAD.top + plotH} Z` : null;

  const resetMarkers = [];
  if (resetAt > 0) { let e = resetAt - chain; while (e <= graphMax) { if (e > 0) resetMarkers.push(e); e += resetAt; } }

  const milePoints = graphMode === 'cdf'
    ? [{ pt: m50, color: '#10b981', label: '50%' }, { pt: m63, color: accentColor, label: '63%' }, { pt: m90, color: '#f97316', label: '90%' }]
        .filter(m => m.pt && m.pt.enc > 0 && m.pt.enc <= graphMax) : [];

  const chainMarkers = [];
  for (let i = 0; i <= graphMax; i++) {
    const c = chainAt(chain, i, resetAt);
    if (c === 50 || c === 100) chainMarkers.push({ enc: i, type: c === 100 ? 'enc100' : 'enc50' });
  }

  const xTicks = Array.from({ length: 6 }, (_, i) => Math.round(graphMax / 5 * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '230px' }}>
      {effTicks.map((t, i) => (
        <line key={i} x1={PAD.left} y1={effY(t).toFixed(1)} x2={PAD.left + plotW} y2={effY(t).toFixed(1)} stroke="#1f2937" strokeWidth="0.5" strokeDasharray="3 3" />
      ))}
      {resetMarkers.map((e, i) => (
        <line key={i} x1={xScale(e).toFixed(1)} y1={PAD.top} x2={xScale(e).toFixed(1)} y2={PAD.top + plotH} stroke="#f59e0b" strokeWidth="1" strokeDasharray="5 3" opacity="0.4" />
      ))}
      {chainMarkers.map(({ enc, type }, i) => {
        const x = xScale(enc);
        const color = type === 'enc100' ? '#fbbf24' : '#34d399';
        return (
          <g key={i}>
            <line x1={x.toFixed(1)} y1={PAD.top} x2={x.toFixed(1)} y2={PAD.top + plotH} stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            <rect x={(x-8).toFixed(1)} y={(PAD.top+plotH+3).toFixed(1)} width="18" height="12" fill="#0d0f14" rx="2" />
            <text x={x.toFixed(1)} y={(PAD.top+plotH+12).toFixed(1)} textAnchor="middle" fontSize="8" fill={color} fontWeight="bold">{type === 'enc100' ? '100' : '50'}</text>
          </g>
        );
      })}
      {area && <path d={area} fill={accentColor} opacity="0.06" />}
      {mainPath && <path d={mainPath} fill="none" stroke={graphMode === 'cdf' ? accentColor : '#34d399'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {milePoints.map(({ pt, color, label }) => {
        const x = xScale(pt.enc), y = yScale(pt.cdf);
        return (
          <g key={label}>
            <line x1={x.toFixed(1)} y1={PAD.top} x2={x.toFixed(1)} y2={(PAD.top+plotH).toFixed(1)} stroke={color} strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6" />
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.5" fill={color} opacity="0.9" />
            <rect x={(x+4).toFixed(1)} y={(y-9.5).toFixed(1)} width={label.length*5.5+6} height={13} fill="#0d0f14" rx="2" opacity="0.85" />
            <text x={(x+7).toFixed(1)} y={(y+1).toFixed(1)} fontSize="8.5" fill={color} fontWeight="bold">{label}</text>
          </g>
        );
      })}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top+plotH} stroke="#374151" strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top+plotH} x2={PAD.left+plotW} y2={PAD.top+plotH} stroke="#374151" strokeWidth="1" />
      {effTicks.map((t, i) => <text key={i} x={PAD.left-5} y={(effY(t)+3).toFixed(1)} textAnchor="end" fontSize="9" fill="#4b5563">{fmtY(t)}</text>)}
      {xTicks.map((t, i) => <text key={i} x={xScale(t).toFixed(1)} y={(PAD.top+plotH+22).toFixed(1)} textAnchor="middle" fontSize="9" fill="#4b5563">{fmtEnc(t)}</text>)}
      <text x={(PAD.left+plotW/2).toFixed(1)} y={(H-3).toFixed(1)} textAnchor="middle" fontSize="8.5" fill="#374151">Encounters from now</text>
      <g>
        <line x1={PAD.left+plotW-120} y1={15} x2={PAD.left+plotW-110} y2={15} stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        <text x={PAD.left+plotW-106} y={18} fontSize="8" fill="#34d399" opacity="0.85">step 50</text>
        <line x1={PAD.left+plotW-120} y1={27} x2={PAD.left+plotW-110} y2={27} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        <text x={PAD.left+plotW-106} y={30} fontSize="8" fill="#fbbf24" opacity="0.85">step 100</text>
      </g>
    </svg>
  );
}

// ── SL Reference Table ────────────────────────────────────────────────────────
function SLReferenceTable({ shinyCharm, currentSL, accentColor }) {
  const table = shinyCharm ? TABLE_CHARM : TABLE_NO_CHARM;
  const currentRowIdx = table.findIndex(r => currentSL >= r[0] && currentSL <= r[1]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
      border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <h2 className="text-sm font-bold text-white">Search Level Reference</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {shinyCharm ? 'Shiny Charm active' : 'No Shiny Charm'} · every 5th step = boost · steps 50 & 100 = special bonuses
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[10px] font-bold uppercase tracking-wider text-gray-500"
              style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <th className="text-left px-4 py-2.5">SL range</th>
              <th className="text-right px-4 py-2.5">No boost</th>
              <th className="text-right px-4 py-2.5">Every 5th / 4% random</th>
              <th className="text-right px-4 py-2.5">Step 50 ★</th>
              <th className="text-right px-4 py-2.5">Step 100 ★</th>
            </tr>
          </thead>
          <tbody>
            {table.map(([slMin, slMax, std, boost, e50, e100], idx) => {
              const isActive = idx === currentRowIdx;
              const isLast = slMax === Infinity;
              const label = isLast ? `${slMin}+` : slMin === slMax ? String(slMin) : `${slMin}–${slMax}`;
              return (
                <tr key={idx} className="border-b transition-colors"
                  style={{ borderColor: 'rgba(255,255,255,0.04)', background: isActive ? 'rgba(96,165,250,0.08)' : undefined }}>
                  <td className="px-4 py-2 font-semibold tabular-nums" style={{ color: isActive ? accentColor : '#d1d5db' }}>
                    {label}{isActive && <span className="ml-1.5 text-xs font-normal" style={{ color: accentColor, opacity: 0.6 }}>◄ you</span>}
                  </td>
                  <td className="text-right px-4 py-2 text-gray-500 tabular-nums text-xs">1/{Math.round(std).toLocaleString()}</td>
                  <td className="text-right px-4 py-2 tabular-nums text-xs" style={{ color: '#38bdf8' }}>1/{Math.round(boost).toLocaleString()}</td>
                  <td className="text-right px-4 py-2 tabular-nums text-xs font-semibold" style={{ color: '#34d399' }}>1/{Math.round(e50).toLocaleString()}</td>
                  <td className="text-right px-4 py-2 tabular-nums text-xs font-semibold" style={{ color: '#fbbf24' }}>1/{Math.round(e100).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
