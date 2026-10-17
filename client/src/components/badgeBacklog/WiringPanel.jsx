import React, { useEffect, useRef, useState } from 'react';
import { CHECK_TYPES_BY_TRIGGER } from '../../constants/badgeCheckTypes';
import { C, api, Icon, Alert, inputCls, inputStyle } from './ui';
import { countAt, histogram, TIMING_LABEL, CODE_STATUS, TIER_COLORS, FIXED_CHECKS, PERCENT_CHECKS } from './sim';

const TRIGGERS = [
  { value: 'approved',          label: 'Approved',     icon: 'check' },
  { value: 'submission',        label: 'Submitted',    icon: 'send' },
  { value: 'rejected',          label: 'Rejected',     icon: 'ban' },
  { value: 'monthly_active',    label: 'Active month', icon: 'calendar' },
  { value: 'period_end',        label: 'Period end',   icon: 'trophy' },
  { value: 'bingo_achievement', label: 'Bingo',        icon: 'grid' },
  { value: 'date_award',        label: 'On a date',    icon: 'star' },
  { value: 'account_age',       label: 'Account age',  icon: 'cake' },
];
const TRIGGER_OF = Object.fromEntries(Object.entries(CHECK_TYPES_BY_TRIGGER).flatMap(([t, list]) => list.map(c => [c.value, t])));

const TYPE_COLORS = {
  normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C', ice: '#96D9D6',
  fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A',
  rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746', steel: '#B7B7C5', fairy: '#D685AD',
};
const GENERATIONS = [['1', 'Kanto'], ['2', 'Johto'], ['3', 'Hoenn'], ['4', 'Sinnoh'], ['5', 'Unova'], ['6', 'Kalos'], ['7', 'Alola'], ['8', 'Galar'], ['8.5', 'Hisui'], ['9', 'Paldea']];
const BINGO_TYPES = ['row', 'column', 'x', 'blackout'];
// first_of_species_count: which catches race for each mon's first of the month.
const FIRST_MODES = [
  { value: 'any',        label: 'Either',     icon: 'layers', color: '#a78bfa' },
  { value: 'standard',   label: 'Normal',     icon: 'check',  color: '#12bfce' },
  { value: 'restricted', label: 'Restricted', icon: 'shield', color: '#e2553f' },
];
const PERIOD_CHECKS = {
  approved_count_in_month: 'month', top_placement_month: 'month',
  approved_count_in_season: 'season', top_placement_season: 'season',
  approved_count_in_year: 'year', top_placement_year: 'year',
};

function Tile({ active, onClick, icon, children, color }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm transition-colors min-w-0 ${active ? 'text-white' : 'text-gray-400 hover:text-white border-white/10 hover:border-white/20'}`}
      style={active ? { borderColor: color || '#12bfce', background: `${color || '#12bfce'}1f` } : undefined}>
      {icon && <Icon name={icon} size={15} style={active ? { color: color || '#12bfce' } : undefined} />}
      <span className="min-w-0 leading-tight">{children}</span>
    </button>
  );
}

function Section({ n, title, children }) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
        <span className="w-5 h-5 rounded-full bg-white/[0.06] text-gray-300 flex items-center justify-center text-[11px] tabular-nums">{n}</span>{title}
      </div>
      {children}
    </div>
  );
}

// ── Qualifier inputs, one per check shape ─────────────────────────────────────

function Qualifier({ p, save }) {
  const [text, setText] = useState(p.check_qualifier || '');
  const [collections, setCollections] = useState(null);
  const timer = useRef(null);
  useEffect(() => setText(p.check_qualifier || ''), [p.check_qualifier, p.check_type]);
  useEffect(() => {
    if (p.check_type !== 'collection_complete' || collections) return;
    api('/api/admin/collections')
      .then(d => setCollections((d || []).map(x => (typeof x === 'string' ? x : x.slug))))
      .catch(() => setCollections([]));
  }, [p.check_type, collections]);
  const debounced = (v) => { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => save({ check_qualifier: v }), 500); };
  const q = p.check_qualifier || '';

  switch (p.check_type) {
    case 'type_percentage':
      return (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(TYPE_COLORS).map(([t, c]) => (
            <button key={t} onClick={() => save({ check_qualifier: t })}
              className="px-2.5 py-1 rounded-full text-xs font-semibold capitalize border-2 transition-opacity"
              style={{ background: q === t ? c : `${c}22`, borderColor: q === t ? '#fff' : 'transparent', color: q === t ? '#111' : c, opacity: q && q !== t ? 0.55 : 1 }}>
              {t}
            </button>
          ))}
        </div>
      );
    case 'generation_percentage':
      return (
        <div className="flex flex-wrap gap-1.5">
          {GENERATIONS.map(([g, region]) => (
            <Tile key={g} active={q === g} onClick={() => save({ check_qualifier: g })}>
              <span className="font-bold tabular-nums">{g}</span> <span className="text-xs text-gray-500">{region}</span>
            </Tile>
          ))}
        </div>
      );
    case 'collection_complete':
      return (
        <div className="flex flex-wrap gap-1.5">
          {collections == null && <span className="h-8 w-40 rounded-lg bg-white/[0.04] animate-pulse" />}
          {collections?.map(s => <Tile key={s} active={q === s} icon="layers" onClick={() => save({ check_qualifier: s })}>{s}</Tile>)}
          {collections?.length === 0 && <span className="text-xs text-gray-500">No collections yet (Collections tab)</span>}
        </div>
      );
    case 'first_of_species_count': {
      const mode = q === 'standard' || q === 'restricted' ? q : 'any';
      return (
        <div className="flex flex-wrap gap-1.5">
          {FIRST_MODES.map(m => (
            <Tile key={m.value} active={mode === m.value} icon={m.icon} color={m.color}
              onClick={() => save({ check_qualifier: m.value })}>{m.label}</Tile>
          ))}
        </div>
      );
    }
    case 'date_award':
      return (
        <input type="date" className={`${inputCls} !w-auto`} style={{ ...inputStyle, colorScheme: 'dark' }}
          value={text} onChange={e => { setText(e.target.value); save({ check_qualifier: e.target.value }); }} />
      );
    case 'bingo_achievement_count': {
      const on = q === 'any' || !q ? BINGO_TYPES : q.split(',').filter(Boolean);
      const toggle = (t) => {
        const next = on.includes(t) ? on.filter(x => x !== t) : [...on, t];
        if (!next.length) return;
        save({ check_qualifier: next.length === 4 ? 'any' : BINGO_TYPES.filter(x => next.includes(x)).join(',') });
      };
      return (
        <div className="flex flex-wrap gap-1.5">
          {BINGO_TYPES.map(t => (
            <Tile key={t} active={on.includes(t)} onClick={() => toggle(t)}>
              <span className="flex items-center gap-2"><BingoGlyph type={t} on={on.includes(t)} /><span className="capitalize">{t}</span></span>
            </Tile>
          ))}
        </div>
      );
    }
    default:
      if (PERIOD_CHECKS[p.check_type]) {
        const unit = PERIOD_CHECKS[p.check_type];
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Tile active={!text} icon="clock" onClick={() => { setText(''); save({ check_qualifier: '' }); }}>Any {unit}</Tile>
            <input type="number" min="1" className={`${inputCls} !w-36`} style={inputStyle} placeholder={`${unit} id`}
              value={text} onChange={e => debounced(e.target.value)} />
          </div>
        );
      }
      return null;
  }
}

function BingoGlyph({ type, on }) {
  const cells = Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    return type === 'row' ? r === 1 : type === 'column' ? c === 1 : type === 'x' ? r === c || r + c === 2 : true;
  });
  return (
    <span className="grid grid-cols-3 gap-[1.5px]">
      {cells.map((f, i) => <span key={i} className="w-[5px] h-[5px] rounded-[1px]" style={{ background: f ? (on ? '#12bfce' : '#6b7280') : 'rgba(255,255,255,0.1)' }} />)}
    </span>
  );
}

// ── Histogram with tier markers ───────────────────────────────────────────────

function Histogram({ p }) {
  const sim = p.sim;
  if (!sim) return null;
  if (!sim.evaluable) {
    return <Alert type="info">Can't simulate this check yet{sim.reason ? `: ${sim.reason.replace(/_/g, ' ')}` : ''}.</Alert>;
  }
  const fixed = sim.direction === 'fixed';
  const total = sim.total_users || 0;
  const percent = PERCENT_CHECKS.has(p.check_type);
  const tiers = p.tiers.filter(t => !t.badge_id);
  const upTo = Math.max(percent ? 100 : 0, ...tiers.map(t => Number(t.threshold) || 0));
  const { bars, min, max, width } = histogram(sim, 40, sim.direction === 'lte' ? 0 : upTo);
  const fmt = (v) => `${Math.round(v * 10) / 10}${percent ? '%' : ''}`;
  const peak = Math.max(1, ...bars.map(b => b.count));
  const pct = (v) => (max === min ? 0 : ((v - min) / (max - min + width)) * 100);

  return (
    <div className="space-y-3 min-w-0">
      {!fixed && bars.length > 0 && (
        <div className="relative pt-5 min-w-0">
          <div className="flex items-end gap-px h-24">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 min-w-0 rounded-t-sm bg-white/15" title={`${b.from === b.to ? fmt(b.from) : `${fmt(b.from)}–${fmt(b.to)}`}: ${b.count}`}
                style={{ height: `${Math.max(b.count ? 4 : 0, (b.count / peak) * 100)}%` }} />
            ))}
          </div>
          {tiers.map(t => t.threshold != null && Number(t.threshold) >= min && Number(t.threshold) <= max + width && (
            <div key={t.id} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${pct(Number(t.threshold))}%` }}>
              <div className="absolute top-0 -translate-x-1/2 text-[10px] font-bold tabular-nums px-1 rounded" style={{ background: TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length], color: '#111' }}>
                {fmt(Number(t.threshold))}
              </div>
              <div className="absolute top-4 bottom-0 w-0.5" style={{ background: TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length] }} />
            </div>
          ))}
          <div className="flex justify-between text-[10px] text-gray-600 tabular-nums mt-1"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tiers.map(t => {
          const color = TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length];
          const n = countAt(sim, t.threshold);
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border min-w-0" style={{ borderColor: `${color}44` }}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-xs text-gray-300 truncate max-w-[8rem]">{t.name || `Tier ${t.tier_order}`}</span>
              <Icon name="user" size={12} className="text-gray-500" />
              <span className="text-sm font-bold text-white tabular-nums">{n ?? '?'}</span>
              <span className="text-[11px] text-gray-600 tabular-nums">/ {total}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Icon name="clock" size={13} />{TIMING_LABEL[sim.timing] || sim.timing}
        {sim.note && <span className="text-gray-600">· {sim.note}</span>}
      </div>
    </div>
  );
}

// ── Publish ───────────────────────────────────────────────────────────────────

function Publish({ p, onPublished }) {
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const tierName = (id) => { const t = p.tiers.find(x => x.id === id); return t?.name || `Tier ${t?.tier_order ?? 0}`; };

  const dry = async () => {
    setBusy(true); setErr(null);
    try { setCheck(await api(`/api/admin/backlog/${p.id}/publish?dryRun=1`, { method: 'POST' })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const go = async () => {
    setBusy(true); setErr(null);
    try { const r = await api(`/api/admin/backlog/${p.id}/publish`, { method: 'POST' }); onPublished?.(r); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const awardNow = check?.tiers?.filter(t => t.timing === 'now').reduce((s, t) => s + t.count, 0) ?? 0;

  return (
    <div className="space-y-2">
      {!check && (
        <button onClick={dry} disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-lagoon-500/40 text-lagoon-300 hover:bg-lagoon-500/10 disabled:opacity-40">
          <Icon name="stamp" size={15} />{busy ? 'Checking…' : 'Check for publish'}
        </button>
      )}
      {check && (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: check.ok ? 'rgba(74,222,128,0.35)' : 'rgba(226,85,63,0.35)' }}>
          {check.problems.map(pr => (
            <div key={pr} className="flex items-center gap-2 text-sm text-red-300"><Icon name="x" size={14} strokeWidth={3} />{pr}</div>
          ))}
          {check.tiers.map(t => (
            <div key={t.tier_id} className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
              <Icon name="check" size={14} strokeWidth={3} className="text-green-400" />
              <span className="truncate">{tierName(t.tier_id)}</span>
              <span className="ml-auto flex items-center gap-1 tabular-nums shrink-0"><Icon name="user" size={12} className="text-gray-500" /><b className="text-white">{t.count}</b></span>
              <span className="text-[11px] text-gray-500 shrink-0">{TIMING_LABEL[t.timing]}</span>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setCheck(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white">Back</button>
            <button onClick={dry} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs text-gray-400 border border-white/10 hover:text-white">Re-check</button>
            {check.ok && (
              <button onClick={go} disabled={busy}
                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white disabled:opacity-40">
                <Icon name="stamp" size={14} />{busy ? 'Publishing…' : awardNow ? `Publish & award ${awardNow}` : 'Publish'}
              </button>
            )}
          </div>
        </div>
      )}
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function WiringPanel({ p, onChanged, onPublished }) {
  const [trigger, setTrigger] = useState(p.trigger || TRIGGER_OF[p.check_type] || null);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (p.trigger) setTrigger(p.trigger); }, [p.trigger]);

  const save = async (body) => {
    setSaving(true); setErr(null);
    try { await api(`/api/admin/backlog/${p.id}/wiring`, { method: 'PATCH', body }); await onChanged(); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const pickCheck = (ct) => save({ check_type: ct, check_qualifier: ct === 'bingo_achievement_count' ? 'any' : null });
  const checks = trigger ? CHECK_TYPES_BY_TRIGGER[trigger] || [] : [];

  return (
    <div className="border-t px-3 sm:px-4 py-4 space-y-5 min-w-0" style={{ borderColor: C.border, background: C.inner }}>
      <Section n={1} title="Fires on">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {TRIGGERS.map(t => (
            <Tile key={t.value} icon={t.icon} active={trigger === t.value}
              onClick={() => { setTrigger(t.value); const list = CHECK_TYPES_BY_TRIGGER[t.value]; if (list.length === 1) pickCheck(list[0].value); }}>
              {t.label}
            </Tile>
          ))}
        </div>
      </Section>

      {trigger && checks.length > 1 && (
        <Section n={2} title="Counts">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {checks.map(c => <Tile key={c.value} icon="target" active={p.check_type === c.value} onClick={() => pickCheck(c.value)}>{c.label}</Tile>)}
          </div>
        </Section>
      )}

      {p.check_type && TRIGGER_OF[p.check_type] === trigger && (
        <>
          <Qualifier p={p} save={save} />
          <Section n={checks.length > 1 ? 3 : 2} title={FIXED_CHECKS.has(p.check_type) ? 'Who earns it' : 'Who earns each tier'}>
            <div className={saving ? 'opacity-50 transition-opacity' : 'transition-opacity'}><Histogram p={p} /></div>
          </Section>
        </>
      )}

      <Section n="✓" title="Code">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {Object.entries(CODE_STATUS).map(([k, s]) => (
            <Tile key={k} active={p.code_status === k} color={s.color} onClick={() => save({ code_status: k })}>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
            </Tile>
          ))}
        </div>
      </Section>

      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <Publish p={p} onPublished={onPublished} />
    </div>
  );
}
