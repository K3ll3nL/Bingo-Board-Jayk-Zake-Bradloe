import React, { useState, useMemo } from 'react';

// ── Serebii lookup table ──────────────────────────────────────────────────────
// Source: serebii.net/omegarubyalphasapphire/dexnav.shtml
//
// Each row: [slMin, slMax, standard, boost4pct, enc50, enc100]
//   standard  = baseline odds when NOT in a chain (denominator of 1/X)
//   boost4pct = odds when the random 4% per-encounter boost triggers
//   enc50     = guaranteed odds at exactly chain step 50
//   enc100    = guaranteed odds at exactly chain step 100
//
// Per-encounter effective P = 0.96 × (1/standard) + 0.04 × (1/boost4pct)
// At chain 50: P = 1/enc50  |  At chain 100: P = 1/enc100

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

// Per-encounter shiny probability given SL, chain position, and Shiny Charm.
//
// DexNav boost mechanic (Bulbapedia-verified):
//   - Every multiple of 5 in the chain: GUARANTEED boost (+4 extra shiny checks)
//   - Any encounter (including non-multiples): independent 4% random chance of the same boost
//   - Chain 50: guaranteed boost PLUS +5 extra milestone checks (stacks → enc50 column)
//   - Chain 100: guaranteed boost PLUS +10 extra milestone checks (stacks → enc100 column)
//
// Serebii enc50/enc100 values already reflect the full stacked probability.
// At non-multiples of 5: P = 0.96×P_std + 0.04×P_boost (random 4% boost).
// At multiples of 5 (not 50/100): P = P_boost (guaranteed; random 4% can't stack higher).
function prob(sl, chain, charm) {
  const [, , std, boost, e50, e100] = slRow(sl, charm);
  if (chain === 100)                 return 1 / e100;       // boost + 10 milestone checks
  if (chain === 50)                  return 1 / e50;        // boost + 5 milestone checks
  if (chain > 0 && chain % 5 === 0) return 1 / boost;      // guaranteed boost at mult of 5
  return 0.96 / std + 0.04 / boost;                         // 4% random boost otherwise
}

// The denominator (1/X) values for display
function oddsNums(sl, charm) {
  const [, , std, boost, e50, e100] = slRow(sl, charm);
  return { std, boost, e50, e100 };
}

// Chain value at a given encounter offset, with optional "reset after" threshold.
// "reset after N" means the chain reaches N (triggering enc50/enc100 if applicable),
// then resets to 0. Cycle length is N+1 (values 0 through N inclusive).
function chainAt(start, offset, resetAt) {
  if (resetAt <= 0) return start + offset;
  return (start + offset) % (resetAt + 1);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtOdds(p)    { return `1 in ${Math.round(1 / p).toLocaleString()}`; }
function fmtDenom(d)   { return `1 in ${Math.round(d).toLocaleString()}`; }
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

// ── StatCard ──────────────────────────────────────────────────────────────────
const CCLS = {
  indigo: 'text-indigo-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
  violet: 'text-violet-400', sky: 'text-sky-400',         orange: 'text-orange-400',
  pink:   'text-pink-400',   yellow: 'text-yellow-300',   red: 'text-red-400',
};
function StatCard({ label, value, color = 'indigo', sub, note }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold leading-tight ${CCLS[color] ?? 'text-white'}`}>{value}</p>
      {sub  && <p className={`text-sm font-semibold leading-tight ${CCLS[color] ?? ''} opacity-60`}>{sub}</p>}
      {note && <p className="text-xs text-gray-500 mt-1 leading-snug">{note}</p>}
    </div>
  );
}

// ── CounterBox ────────────────────────────────────────────────────────────────
function CounterBox({ label, sublabel, value, onChange, color = 'indigo' }) {
  const [raw, setRaw] = React.useState(String(value));

  // Sync display when value changes externally (button clicks, resets, etc.)
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
            const v = isNaN(n) ? 0 : Math.max(0, n);
            onChange(v);
            setRaw(String(v));
          }}
          className={`flex-1 min-w-0 bg-transparent text-3xl font-bold text-center focus:outline-none ${CCLS[color] ?? 'text-white'}`}
        />
        <button
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-lg font-bold transition-colors shrink-0"
        >+</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DexNavCalculator() {
  const [chain, setChain]               = useState(0);
  const [searchLevel, setSearchLevel]   = useState(0);
  const [shinyCharm, setShinyCharm]     = useState(false);
  const [resetAtStr, setResetAtStr]     = useState('');
  const [secsStr, setSecsStr]           = useState('');
  const [graphMode, setGraphMode]       = useState('cdf');

  const resetAt    = resetAtStr ? Math.max(1, parseInt(resetAtStr)  || 0) : 0;
  const secsPerEnc = secsStr    ? Math.max(1, parseFloat(secsStr)   || 10) : null;

  // Advance chain (+SL or not).
  // "reset after N" → chain reaches N, then next advance resets to 0.
  const advance = (alsoSL) => {
    setChain(c => {
      const next = c + 1;
      return (resetAt > 0 && next > resetAt) ? 0 : next;
    });
    if (alsoSL) setSearchLevel(s => s + 1);
  };
  const handleSetChain = v => {
    setChain(Math.max(0, resetAt > 0 ? Math.min(v, resetAt) : v));
  };

  // ── Computed ─────────────────────────────────────────────────────────────
  const comp = useMemo(() => {
    // `chain` = encounters completed. The NEXT encounter is chain+1.
    // All probability display and projections use chain+1 as the reference point.
    const nextChain = chain + 1;

    const currentP  = prob(searchLevel, nextChain, shinyCharm);
    const { std, boost, e50, e100 } = oddsNums(searchLevel, shinyCharm);
    // Long-run per-encounter average (post-milestone, ignoring 50/100):
    //   1/5 encounters are mult-of-5 → guaranteed boost
    //   4/5 encounters → 96% standard + 4% random boost
    // = 0.2/boost + (4/5)*(0.96/std + 0.04/boost) = 0.768/std + 0.232/boost
    const effectiveP = 0.768 / std + 0.232 / boost;

    // Encounters until Step 50 / Step 100 land on the upcoming encounter (0 = next IS the milestone)
    const distTo50  = Math.max(0, 50  - nextChain);
    const distTo100 = Math.max(0, 100 - nextChain);

    // Projected SL and odds AT each milestone (SL increases once per on-target encounter)
    const slAt50  = searchLevel + distTo50;
    const slAt100 = searchLevel + distTo100;
    const pAt50   = prob(slAt50,  50,  shinyCharm);
    const pAt100  = prob(slAt100, 100, shinyCharm);

    // Graph range: show through Step 100 + 100 buffer, min 200
    const graphMax = Math.min(1200,
      Math.max(200, distTo100 + 100, Math.ceil(1 / effectiveP * 1.5))
    );

    // Full range for milestone computation
    const fullMax = Math.min(20000, Math.max(graphMax, Math.ceil(1 / effectiveP * 5)));

    // Build CDF points — i=0 is the very next encounter (chain = nextChain)
    const points = [];
    let cumNotShiny = 1;
    for (let i = 0; i <= fullMax; i++) {
      const c  = chainAt(nextChain, i, resetAt);
      const sl = searchLevel + i;   // SL increases each on-target encounter
      const p  = prob(sl, c, shinyCharm);
      points.push({ enc: i, cdf: 1 - cumNotShiny, p, chain: c, sl });
      cumNotShiny *= (1 - p);
    }

    // Milestones from CDF
    const find = target => {
      for (const pt of points) if (pt.cdf >= target) return pt;
      return points[points.length - 1];
    };
    const m50 = find(0.500);
    const m63 = find(0.632);
    const m75 = find(0.750);
    const m90 = find(0.900);
    const m99 = find(0.990);

    // True expected encounters: sum of survival function from the next encounter forward.
    // E[T] = Σ S(i) where S(i) = P(not found in first i encounters from now).
    let expectedEnc = 0;
    {
      let survival = 1;
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

    return {
      currentP, effectiveP, std, boost, e50, e100,
      distTo50, distTo100, slAt50, slAt100, pAt50, pAt100,
      graphMax, fullMax, points,
      m50, m63, m75, m90, m99,
      expectedEnc,
    };
  }, [chain, searchLevel, shinyCharm, resetAt]);

  const {
    currentP, effectiveP, std, boost, e50, e100,
    distTo50, distTo100, slAt50, slAt100, pAt50, pAt100,
    graphMax, points,
    m50, m63, m75, m90, m99,
    expectedEnc,
  } = comp;

  // State of the NEXT (upcoming) encounter
  const nextChain   = chain + 1;
  const atMilestone = nextChain === 50  ? 'enc50'
                    : nextChain === 100 ? 'enc100'
                    : nextChain % 5 === 0 ? 'boost'
                    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 text-white">
      <h1 className="text-2xl font-bold mb-0.5">DexNav Shiny Calculator</h1>
      <p className="text-gray-400 text-sm mb-4">
        Omega Ruby / Alpha Sapphire · odds sourced from{' '}
        <a href="https://www.serebii.net/omegarubyalphasapphire/dexnav.shtml"
          target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
          Serebii
        </a>
        {' '}· SL = total encounters with this species
      </p>

      {/* ── Settings ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="shrink-0">
            <p className="text-xs font-semibold text-gray-400 mb-1.5">Shiny Charm</p>
            <button
              onClick={() => setShinyCharm(v => !v)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${
                shinyCharm
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-gray-700/40 border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              {shinyCharm ? '✦ Active' : 'None'}
            </button>
          </div>
          <div className="w-36">
            <p className="text-xs font-semibold text-gray-400 mb-1.5">
              Reset chain after <span className="text-gray-600 font-normal">(optional)</span>
            </p>
            <input type="number" min={1} value={resetAtStr}
              onChange={e => setResetAtStr(e.target.value)} placeholder="no reset"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="w-36">
            <p className="text-xs font-semibold text-gray-400 mb-1.5">
              Sec / encounter <span className="text-gray-600 font-normal">(optional)</span>
            </p>
            <input type="number" min={1} max={300} value={secsStr}
              onChange={e => setSecsStr(e.target.value)} placeholder="—"
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* ── Live Tracker ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Live Tracker</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <CounterBox
            label="Chain"
            sublabel={resetAtStr ? `resets after ${resetAtStr}` : 'consecutive encounters · resets on break'}
            value={chain}
            onChange={handleSetChain}
            color="indigo"
          />
          <CounterBox
            label="Search Level"
            sublabel="total encounters ever with this species · never resets"
            value={searchLevel}
            onChange={v => setSearchLevel(Math.max(0, v))}
            color="emerald"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => advance(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-emerald-600/20 border border-emerald-600/40 hover:bg-emerald-600/30 transition-colors active:scale-95">
            <span className="text-lg leading-none">🎯</span>
            <span className="text-sm font-bold text-emerald-300">On-Target</span>
            <span className="text-[10px] text-emerald-600 font-mono">chain+1 · SL+1</span>
          </button>
          <button onClick={() => advance(false)}
            className="flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-amber-600/20 border border-amber-600/40 hover:bg-amber-600/30 transition-colors active:scale-95">
            <span className="text-lg leading-none">↪️</span>
            <span className="text-sm font-bold text-amber-300">Off-Target</span>
            <span className="text-[10px] text-amber-600 font-mono">chain+1 · SL stays</span>
          </button>
          <button onClick={() => setChain(0)}
            className="flex flex-col items-center justify-center gap-0.5 py-3 px-2 rounded-xl bg-gray-700/40 border border-gray-600/60 hover:bg-gray-700/70 transition-colors active:scale-95">
            <span className="text-lg leading-none">↩</span>
            <span className="text-sm font-bold text-gray-300">Reset Chain</span>
            <span className="text-[10px] text-gray-600 font-mono">SL unchanged</span>
          </button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className={`border rounded-xl p-4 mb-4 ${
        atMilestone === 'enc100' ? 'bg-yellow-950/40 border-yellow-500/50' :
        atMilestone === 'enc50'  ? 'bg-emerald-950/40 border-emerald-500/50' :
        atMilestone === 'boost'  ? 'bg-sky-950/40 border-sky-500/40' :
                                   'bg-indigo-950/50 border-indigo-500/40'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: odds */}
          <div>
            {atMilestone === 'enc100' && <p className="text-xs font-bold uppercase tracking-wider mb-1 text-yellow-400">★ Chain 100 — Best Odds!</p>}
            {atMilestone === 'enc50'  && <p className="text-xs font-bold uppercase tracking-wider mb-1 text-emerald-400">★ Chain 50 — Bonus Encounter!</p>}
            {atMilestone === 'boost'  && <p className="text-xs font-bold uppercase tracking-wider mb-1 text-sky-400">✦ Chain {chain} — Every 5th Step Boost</p>}
            <p className="text-gray-400 text-sm">
              {atMilestone === 'enc100' ? `next encounter is chain 100 — SL ${searchLevel}` :
               atMilestone === 'enc50'  ? `next encounter is chain 50 — SL ${searchLevel}` :
               atMilestone === 'boost'  ? `next encounter is chain ${nextChain} (every 5th step) — SL ${searchLevel}` :
               chain === 0 ? `no chain yet — next is chain 1, SL ${searchLevel}` :
               `next encounter is chain ${nextChain} — 96% standard / 4% random boost, SL ${searchLevel}`}
            </p>
            <p className={`text-4xl font-bold mt-0.5 ${
              atMilestone === 'enc100' ? 'text-yellow-300' :
              atMilestone === 'enc50'  ? 'text-emerald-300' :
              atMilestone === 'boost'  ? 'text-sky-300' :
                                         'text-indigo-300'
            }`}>
              {fmtOdds(currentP)}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {atMilestone === 'boost' || atMilestone === 'enc50' || atMilestone === 'enc100'
                ? `${fmtPct(currentP, 4)} this encounter`
                : `${fmtPct(1/std, 4)} standard · ${fmtPct(1/boost, 4)} if boost triggers`}
            </p>
            {atMilestone !== 'enc100' && (
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                {distTo50 > 0 && <span>Chain 50 → <span className="text-emerald-400 font-semibold">{fmtDenom(1/pAt50)}</span></span>}
                {distTo100 > 0 && <span>Chain 100 → <span className="text-yellow-400 font-semibold">{fmtDenom(1/pAt100)}</span></span>}
              </div>
            )}
          </div>

          {/* Right: all 4 column odds for current SL */}
          <div className="bg-gray-900/60 rounded-lg px-4 py-3 shrink-0 self-start text-xs">
            <p className="text-gray-500 font-bold uppercase tracking-wider mb-2">SL {searchLevel} odds</p>
            <div className="space-y-1 font-mono">
              {[
                { label: 'No boost',               denom: std,   color: 'text-gray-400',
                  active: !atMilestone || atMilestone === null,
                  note: chain > 0 && !atMilestone ? ' (96% of enc.)' : '' },
                { label: 'Every 5th step / 4% random', denom: boost, color: 'text-sky-400',
                  active: atMilestone === 'boost',
                  note: chain > 0 && !atMilestone ? ' (4% of enc.)' : '' },
                { label: 'Step 50 bonus',          denom: e50,   color: 'text-emerald-400',
                  active: atMilestone === 'enc50',  note: '' },
                { label: 'Step 100 bonus',         denom: e100,  color: 'text-yellow-400',
                  active: atMilestone === 'enc100', note: '' },
              ].map(({ label, denom, color, active, note }) => (
                <div key={label} className={`flex justify-between gap-4 ${active ? 'font-bold' : 'opacity-50'}`}>
                  <span className="text-gray-500">{label}{note}<span className={active ? color : ''}>{active ? ' ◄' : ''}</span></span>
                  <span className={color}>1/{Math.round(denom).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {(() => {
          // enc50 is unreachable if the chain resets before reaching 50
          const enc50Reachable = resetAt <= 0 || resetAt >= 50;
          if (!enc50Reachable) {
            return (
              <StatCard
                label="Step 50 Bonus"
                value="Unreachable"
                color="indigo"
                note={`Chain resets after ${resetAt} — set reset threshold to 50 or higher to hit this bonus`}
              />
            );
          }
          if (distTo50 === 0) {
            return (
              <StatCard
                label="Step 50 Bonus ★ NEXT"
                value={fmtDenom(1 / pAt50)}
                color="emerald"
                sub={fmtPct(pAt50, 4)}
                note={`SL ${slAt50} · your next encounter`}
              />
            );
          }
          return (
            <StatCard
              label="Step 50 Bonus"
              value={fmtDenom(1 / pAt50)}
              color="emerald"
              sub={`in ${distTo50} enc${secsPerEnc ? ` · ${fmtTime(distTo50 * secsPerEnc)}` : ''}`}
              note={`SL ${slAt50} projected at that point`}
            />
          );
        })()}
        {(() => {
          // enc100 is unreachable if the chain resets before reaching 100
          const enc100Reachable = resetAt <= 0 || resetAt >= 100;
          if (!enc100Reachable) {
            return (
              <StatCard
                label="Step 100 Bonus"
                value="Unreachable"
                color="indigo"
                note={`Chain resets after ${resetAt} — set reset threshold to 100 or higher to hit this bonus`}
              />
            );
          }
          if (distTo100 === 0) {
            return (
              <StatCard
                label="Step 100 Bonus ★ NEXT"
                value={fmtDenom(1 / pAt100)}
                color="yellow"
                sub={fmtPct(pAt100, 4)}
                note={`SL ${slAt100} · your next encounter`}
              />
            );
          }
          return (
            <StatCard
              label="Step 100 Bonus"
              value={fmtDenom(1 / pAt100)}
              color="yellow"
              sub={`in ${distTo100} enc${secsPerEnc ? ` · ${fmtTime(distTo100 * secsPerEnc)}` : ''}`}
              note={`SL ${slAt100} projected at that point`}
            />
          );
        })()}
        <StatCard
          label="Expected encounters"
          value={expectedEnc.toLocaleString()}
          color="amber"
          sub={secsPerEnc ? `≈ ${fmtTime(expectedEnc * secsPerEnc)}` : undefined}
          note="projected from now · SL growth + milestones + 4% boost included"
        />
      </div>

      {/* ── Graph ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-300">
              {graphMode === 'cdf' ? 'Cumulative Shiny Probability' : 'Per-Encounter Shiny Rate'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {graphMode === 'cdf'
                ? 'Spikes at chain 50 & 100 — slope increases at guaranteed milestones'
                : 'Step spikes at chain 50 & 100 — flat baseline with SL-driven slow rise'}
            </p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs font-semibold shrink-0">
            <button onClick={() => setGraphMode('cdf')}
              className={`px-3 py-1.5 transition-colors ${graphMode === 'cdf' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              CDF
            </button>
            <button onClick={() => setGraphMode('hazard')}
              className={`px-3 py-1.5 transition-colors ${graphMode === 'hazard' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              Per-Enc
            </button>
          </div>
        </div>
        <div className="p-3">
          <DexNavGraph
            points={points}
            graphMode={graphMode}
            graphMax={graphMax}
            chain={chain}
            resetAt={resetAt}
            m50={m50} m63={m63} m90={m90}
          />
        </div>
      </div>

      {/* ── Milestones table ── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-gray-300">Probability Milestones</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Encounter counts from now · SL increases with each on-target encounter
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900/30 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-2.5">Target</th>
                <th className="text-right px-4 py-2.5">Encounter #</th>
                <th className="text-right px-4 py-2.5">Chain / SL</th>
                {secsPerEnc && <th className="text-right px-4 py-2.5">Est. time</th>}
              </tr>
            </thead>
            <tbody>
              {[
                { label: '50%',           m: m50, color: 'text-emerald-400' },
                { label: '63.2% (1 avg)', m: m63, color: 'text-indigo-400'  },
                { label: '75%',           m: m75, color: 'text-amber-400'   },
                { label: '90%',           m: m90, color: 'text-orange-400'  },
                { label: '99%',           m: m99, color: 'text-red-400'     },
              ].map(({ label, m, color }) => (
                <tr key={label} className="border-b border-gray-700/40 hover:bg-gray-700/20">
                  <td className={`px-4 py-2.5 font-semibold ${color}`}>{label}</td>
                  <td className="text-right px-4 py-2.5 text-gray-300 tabular-nums font-mono">
                    {m?.enc.toLocaleString() ?? '—'}
                  </td>
                  <td className="text-right px-4 py-2.5 text-gray-500 tabular-nums text-xs">
                    {m ? <>chain {m.chain} · SL {m.sl.toLocaleString()}</> : '—'}
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

      {/* ── SL reference table ── */}
      <SLReferenceTable shinyCharm={shinyCharm} currentSL={searchLevel} />

      <p className="text-xs text-gray-600 mt-4 text-center">
        Odds from Serebii · every 5th chain step = guaranteed boost · all others = 96% standard / 4% random boost ·
        steps 50 &amp; 100 = special higher bonuses · SL = search level (never resets)
      </p>
    </div>
  );
}

// ── Graph ─────────────────────────────────────────────────────────────────────

function DexNavGraph({ points, graphMode, graphMax, chain, resetAt, m50, m63, m90 }) {
  const W = 580, H = 230;
  const PAD = { top: 12, right: 20, bottom: 38, left: 52 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const vis = points.filter(p => p.enc <= graphMax);
  if (!vis.length) return null;

  const xScale = enc => PAD.left + (enc / graphMax) * plotW;

  // ── Y scale ───────────────────────────────────────────────────────────────
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

  // ── CDF path (sampled) ────────────────────────────────────────────────────
  const cdfPath = () => {
    const step = Math.max(1, Math.floor(vis.length / 400));
    return vis
      .filter((_, i) => i === 0 || i === vis.length - 1 || i % step === 0)
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.enc).toFixed(1)} ${yScale(d.cdf).toFixed(1)}`)
      .join(' ');
  };

  // ── Hazard (step-function) path ───────────────────────────────────────────
  const hazardResult = () => {
    const changes = [];
    let prevP = null;
    for (const pt of vis) {
      if (pt.p !== prevP) { changes.push(pt); prevP = pt.p; }
    }
    if (!changes.length) return null;

    const maxP = Math.max(...changes.map(d => d.p));
    const yMax = maxP * 1.15;
    const yS   = v => PAD.top + (1 - v / yMax) * plotH;

    let d = `M ${xScale(changes[0].enc).toFixed(1)} ${yS(changes[0].p).toFixed(1)}`;
    for (let i = 1; i < changes.length; i++) {
      d += ` H ${xScale(changes[i].enc).toFixed(1)} V ${yS(changes[i].p).toFixed(1)}`;
    }
    d += ` H ${xScale(graphMax).toFixed(1)}`;
    const hTicks = [0, maxP * 0.25, maxP * 0.5, maxP * 0.75, maxP];
    return { d, yS, hTicks };
  };

  let mainPath, hz;
  if (graphMode === 'cdf') {
    mainPath = cdfPath();
  } else {
    hz = hazardResult();
    mainPath = hz?.d ?? '';
  }

  const effY = graphMode === 'cdf' ? yScale : (hz?.yS ?? yScale);
  const effTicks = graphMode === 'cdf' ? yTicks : (hz?.hTicks ?? yTicks);

  const fmtY = v => graphMode === 'cdf'
    ? `${(v * 100).toFixed(0)}%`
    : v === 0 ? '0' : `1/${Math.round(1 / v).toLocaleString()}`;

  // Area fill (CDF)
  const area = graphMode === 'cdf' && mainPath
    ? `${mainPath} L ${xScale(graphMax).toFixed(1)} ${PAD.top + plotH} L ${PAD.left} ${PAD.top + plotH} Z`
    : null;

  // Chain reset markers
  const resetMarkers = [];
  if (resetAt > 0) {
    let e = resetAt - chain;
    while (e <= graphMax) { if (e > 0) resetMarkers.push(e); e += resetAt; }
  }

  // Milestone dots (CDF only)
  const milePoints = graphMode === 'cdf'
    ? [ { pt: m50, color: '#10b981', label: '50%' },
        { pt: m63, color: '#818cf8', label: '63%' },
        { pt: m90, color: '#f97316', label: '90%' },
      ].filter(m => m.pt && m.pt.enc > 0 && m.pt.enc <= graphMax)
    : [];

  // Chain-50 and chain-100 vertical markers
  const chainMarkers = [];
  for (let i = 0; i <= graphMax; i++) {
    const c = chainAt(chain, i, resetAt);
    if (c === 50 || c === 100) {
      chainMarkers.push({ enc: i, type: c === 100 ? 'enc100' : 'enc50' });
    }
  }

  const xTicks = Array.from({ length: 6 }, (_, i) => Math.round(graphMax / 5 * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '230px' }}>
      {/* Grid */}
      {effTicks.map((t, i) => (
        <line key={i}
          x1={PAD.left} y1={effY(t).toFixed(1)} x2={PAD.left + plotW} y2={effY(t).toFixed(1)}
          stroke="#374151" strokeWidth="0.5" strokeDasharray="3 3"
        />
      ))}

      {/* Chain reset markers */}
      {resetMarkers.map((e, i) => (
        <line key={i}
          x1={xScale(e).toFixed(1)} y1={PAD.top} x2={xScale(e).toFixed(1)} y2={PAD.top + plotH}
          stroke="#f59e0b" strokeWidth="1" strokeDasharray="5 3" opacity="0.4"
        />
      ))}

      {/* Chain 50 / Chain 100 milestone markers */}
      {chainMarkers.map(({ enc, type }, i) => {
        const x = xScale(enc);
        const color = type === 'enc100' ? '#fbbf24' : '#34d399';
        const label = type === 'enc100' ? '100' : '50';
        return (
          <g key={i}>
            <line x1={x.toFixed(1)} y1={PAD.top} x2={x.toFixed(1)} y2={PAD.top + plotH}
              stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
            <rect x={(x - 8).toFixed(1)} y={(PAD.top + plotH + 3).toFixed(1)}
              width="18" height="12" fill="#111827" rx="2" />
            <text x={x.toFixed(1)} y={(PAD.top + plotH + 12).toFixed(1)}
              textAnchor="middle" fontSize="8" fill={color} fontWeight="bold">{label}</text>
          </g>
        );
      })}

      {/* Area */}
      {area && <path d={area} fill="#6366f1" opacity="0.07" />}

      {/* Main curve */}
      {mainPath && (
        <path d={mainPath} fill="none"
          stroke={graphMode === 'cdf' ? '#818cf8' : '#34d399'}
          strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        />
      )}

      {/* Milestone dots */}
      {milePoints.map(({ pt, color, label }) => {
        const x = xScale(pt.enc), y = yScale(pt.cdf);
        return (
          <g key={label}>
            <line x1={x.toFixed(1)} y1={PAD.top} x2={x.toFixed(1)} y2={(PAD.top + plotH).toFixed(1)}
              stroke={color} strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6" />
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.5" fill={color} opacity="0.9" />
            <rect x={(x + 4).toFixed(1)} y={(y - 9.5).toFixed(1)} width={label.length * 5.5 + 6} height={13}
              fill="#111827" rx="2" opacity="0.85" />
            <text x={(x + 7).toFixed(1)} y={(y + 1).toFixed(1)} fontSize="8.5" fill={color} fontWeight="bold">
              {label}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#4b5563" strokeWidth="1" />
      <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#4b5563" strokeWidth="1" />

      {/* Y labels */}
      {effTicks.map((t, i) => (
        <text key={i} x={PAD.left - 5} y={(effY(t) + 3).toFixed(1)}
          textAnchor="end" fontSize="9" fill="#6b7280">{fmtY(t)}</text>
      ))}

      {/* X labels */}
      {xTicks.map((t, i) => (
        <text key={i} x={xScale(t).toFixed(1)} y={(PAD.top + plotH + 22).toFixed(1)}
          textAnchor="middle" fontSize="9" fill="#6b7280">{fmtEnc(t)}</text>
      ))}

      <text x={(PAD.left + plotW / 2).toFixed(1)} y={(H - 3).toFixed(1)}
        textAnchor="middle" fontSize="8.5" fill="#4b5563">Encounters from now</text>

      {/* Legend */}
      <g>
        <line x1={PAD.left + plotW - 120} y1={15} x2={PAD.left + plotW - 110} y2={15}
          stroke="#34d399" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        <text x={PAD.left + plotW - 106} y={18} fontSize="8" fill="#34d399" opacity="0.85">step 50 bonus</text>
        <line x1={PAD.left + plotW - 120} y1={27} x2={PAD.left + plotW - 110} y2={27}
          stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
        <text x={PAD.left + plotW - 106} y={30} fontSize="8" fill="#fbbf24" opacity="0.85">step 100 bonus</text>
      </g>
    </svg>
  );
}

// ── Search Level reference table ──────────────────────────────────────────────

function SLReferenceTable({ shinyCharm, currentSL }) {
  const table = shinyCharm ? TABLE_CHARM : TABLE_NO_CHARM;
  const currentRowIdx = table.findIndex(r => currentSL >= r[0] && currentSL <= r[1]);

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-bold text-gray-300">Search Level Reference</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {shinyCharm ? 'Shiny Charm active' : 'No Shiny Charm'} ·
          every 5th chain step gets the boosted odds ·
          steps 50 and 100 have special higher bonuses
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900/30 text-gray-400 text-xs font-semibold uppercase tracking-wide">
              <th className="text-left px-4 py-2.5">SL range</th>
              <th className="text-right px-4 py-2.5">No boost</th>
              <th className="text-right px-4 py-2.5">Every 5th step / 4% random</th>
              <th className="text-right px-4 py-2.5">Step 50 ★</th>
              <th className="text-right px-4 py-2.5">Step 100 ★</th>
            </tr>
          </thead>
          <tbody>
            {table.map(([slMin, slMax, std, boost, e50, e100], idx) => {
              const isActive = idx === currentRowIdx;
              const isLast   = slMax === Infinity;
              const label    = isLast ? `${slMin}+` : slMin === slMax ? String(slMin) : `${slMin}–${slMax}`;
              return (
                <tr key={idx}
                  className={`border-b border-gray-700/40 transition-colors ${
                    isActive ? 'bg-indigo-900/25' : 'hover:bg-gray-700/20'
                  }`}
                >
                  <td className={`px-4 py-2 font-semibold tabular-nums ${isActive ? 'text-indigo-300' : 'text-gray-300'}`}>
                    {label}
                    {isActive && <span className="ml-1.5 text-indigo-400 text-xs font-normal">◄ you</span>}
                  </td>
                  <td className="text-right px-4 py-2 text-gray-400 tabular-nums text-xs">
                    1/{Math.round(std).toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2 text-indigo-400 tabular-nums text-xs">
                    1/{Math.round(boost).toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2 text-emerald-400 tabular-nums text-xs font-semibold">
                    1/{Math.round(e50).toLocaleString()}
                  </td>
                  <td className="text-right px-4 py-2 text-yellow-400 tabular-nums text-xs font-semibold">
                    1/{Math.round(e100).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
