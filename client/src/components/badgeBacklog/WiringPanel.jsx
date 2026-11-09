import React, { useEffect, useRef, useState } from 'react';
import { CHECK_TYPES_BY_TRIGGER, describeBadgeCheck } from '../../constants/badgeCheckTypes';
import { GAMES_BY_MANAGER_ORDER } from '../../constants/games';
import { C, api, Icon, Alert, inputCls, inputStyle } from './ui';
import { histogram, TIMING_LABEL, CODE_STATUS, TIER_COLORS, PERCENT_CHECKS, HOUR_CHECKS } from './sim';

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
// approved_count: "<mode>[:<game key>,...]" — which catches count, and in which games
// (several = distinct species caught in any of them). games_count uses the modes alone.
const APPROVED_MODES = [
  { value: 'any',        label: 'All',        icon: 'layers', color: '#a78bfa' },
  { value: 'standard',   label: 'Standard',   icon: 'check',  color: '#12bfce' },
  { value: 'restricted', label: 'Restricted', icon: 'shield', color: '#e2553f' },
];
const allowsRestricted = (g) => (g.restricted_checklist?.length ?? 0) > 0;
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

function Qualifier({ p, save, collections }) {
  const [text, setText] = useState(p.check_qualifier || '');
  const timer = useRef(null);
  useEffect(() => setText(p.check_qualifier || ''), [p.check_qualifier, p.check_type]);
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
          {collections?.map(c => (
            <Tile key={c.slug} active={q === c.slug} icon="layers" onClick={() => save({ check_qualifier: c.slug })}>
              {c.slug}
              {c.bonus_count > 0 && <span className="ml-1.5 text-[11px] font-semibold text-amber-400 tabular-nums" title={`${c.bonus_count} bonus games set`}>★{c.bonus_count}</span>}
            </Tile>
          ))}
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
    case 'approved_count': {
      const [m, list] = q.split(':');
      const mode = m === 'standard' || m === 'restricted' ? m : 'any';
      const picked = new Set((list || '').split(',').filter(Boolean));
      const game = picked.size > 0;
      const games = GAMES_BY_MANAGER_ORDER.filter(x => mode !== 'restricted' || allowsRestricted(x));
      const set = (nm, keys) => {
        // Games that take no Restricted catches drop out when Restricted is picked.
        // Stored in Game Manager order so the same set always saves the same string.
        const kept = GAMES_BY_MANAGER_ORDER
          .filter(x => keys.has(x.key) && (nm !== 'restricted' || allowsRestricted(x))).map(x => x.key);
        const next = kept.length ? `${nm}:${kept.join(',')}` : nm === 'any' ? null : nm;
        if (next !== (p.check_qualifier || null)) save({ check_qualifier: next });
      };
      const toggle = (key) => { const n = new Set(picked); n.has(key) ? n.delete(key) : n.add(key); set(mode, n); };
      const color = APPROVED_MODES.find(x => x.value === mode).color;
      return (
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {APPROVED_MODES.map(x => (
              <Tile key={x.value} active={mode === x.value} icon={x.icon} color={x.color} onClick={() => set(x.value, picked)}>{x.label}</Tile>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => set(mode, new Set())} aria-pressed={!game}
              className={`h-10 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${game ? 'border-white/10 text-gray-500 hover:text-white' : 'text-white'}`}
              style={!game ? { borderColor: color, background: `${color}1f` } : undefined}>
              <Icon name="grid" size={14} style={!game ? { color } : undefined} />Any game
            </button>
            {games.map(x => {
              const on = picked.has(x.key);
              return (
                <button key={x.key} type="button" title={x.label.replace(/^Pokémon /, '')} aria-label={x.label} aria-pressed={on}
                  onClick={() => toggle(x.key)}
                  className="h-10 w-14 rounded-lg border flex items-center justify-center transition-all"
                  style={{
                    borderColor: on ? color : 'rgba(255,255,255,0.08)',
                    background: on ? `${color}1f` : 'rgba(255,255,255,0.02)',
                    opacity: game && !on ? 0.6 : 1, filter: game && !on ? 'grayscale(1)' : 'none',
                  }}>
                  {x.img_urls?.[0]
                    ? <img src={x.img_urls[0]} alt="" className="object-contain" style={{ maxHeight: 24, maxWidth: 44 }} />
                    : <span className="text-[9px] text-gray-400 leading-none">{x.key}</span>}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'games_count':
    case 'hours_left_in_month': {
      const mode = q === 'standard' || q === 'restricted' ? q : 'any';
      return (
        <div className="flex flex-wrap gap-1.5">
          {APPROVED_MODES.map(x => (
            <Tile key={x.value} active={mode === x.value} icon={x.icon} color={x.color}
              onClick={() => save({ check_qualifier: x.value === 'any' ? null : x.value })}>{x.label}</Tile>
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

// ── Per-badge owner chips ─────────────────────────────────────────────────────

export const BONUS_COLOR = '#fbbf24';
export const SECRET_COLOR = '#a78bfa';
export const MODE_CHECKS = new Set(['approved_count', 'games_count', 'hours_left_in_month']);
const modeOf = (q) => { const m = String(q || '').split(':')[0]; return m === 'standard' || m === 'restricted' ? m : 'any'; };
const MODE_SHORT = { any: 'All', standard: 'Std', restricted: 'Rst' };
const MODE_COLOR = { any: '#a78bfa', standard: '#12bfce', restricted: '#e2553f' };
export const effectiveMode = (p, t) => t.mode || modeOf(p.check_qualifier);

// The simulation that applies to one badge: its bonus, its own mode, or the family's.
export function tierSim(p, t) {
  if (p.check_type === 'collection_complete' && t.bonus && p.bonus_sim) return p.bonus_sim;
  if (t.mode && p.mode_sims?.[t.mode]) return p.mode_sims[t.mode];
  return p.sim;
}

function TierFlag({ on, icon, color, title, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={on}
      className={`w-6 h-6 rounded-md flex items-center justify-center border transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${on ? '' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/25'}`}
      style={on ? { borderColor: color, background: `${color}26`, color } : undefined}>
      <Icon name={icon} size={13} />
    </button>
  );
}

// Sits under a badge tile: Standard/Restricted/All (cycles), Bonus, Secret.
export function OwnerChips({ p, t, collections, save }) {
  const modeCheck = MODE_CHECKS.has(p.check_type);
  const isCollection = p.check_type === 'collection_complete' && !!p.check_qualifier;
  const bonusCount = collections?.find(c => c.slug === p.check_qualifier)?.bonus_count ?? 0;
  const mode = effectiveMode(p, t);
  const next = { any: 'standard', standard: 'restricted', restricted: 'any' }[mode];
  const tp = (patch) => (q) => ({ ...q, tiers: q.tiers.map(x => (x.id === t.id ? { ...x, ...patch } : x)) });
  return (
    <div className="flex items-center justify-center gap-1 mt-1">
      {modeCheck && (
        <button type="button" onClick={() => save({ tier_mode: { [t.id]: next } }, tp({ mode: next }))}
          title={`Counts ${mode === 'any' ? 'all' : mode} catches (tap for ${next === 'any' ? 'all' : next})`}
          className="h-6 px-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: `${MODE_COLOR[mode]}88`, background: `${MODE_COLOR[mode]}1f`, color: MODE_COLOR[mode] }}>
          {MODE_SHORT[mode]}
        </button>
      )}
      {isCollection && (
        <TierFlag on={!!t.bonus} icon="star" color={BONUS_COLOR} disabled={!t.bonus && bonusCount === 0}
          title={t.bonus ? 'Bonus tier (tap to undo)' : bonusCount ? `Make this the bonus tier (${bonusCount} bonus games)` : 'No bonus games on this collection yet'}
          onClick={() => save({ tier_bonus: { [t.id]: !t.bonus } }, tp({ bonus: !t.bonus }))} />
      )}
      <TierFlag on={!!t.is_secret} icon={t.is_secret ? 'eyeOff' : 'eye'} color={SECRET_COLOR}
        title={t.is_secret ? 'Secret: hidden until earned (tap to undo)' : 'Make this a secret badge'}
        onClick={() => save({ tier_secret: { [t.id]: !t.is_secret } }, tp({ is_secret: !t.is_secret }))} />
    </div>
  );
}

// ── Distribution strip with tier markers ──────────────────────────────────────

export function Histogram({ p }) {
  const sim = p.sim;
  if (!sim) return null;
  if (!sim.evaluable) {
    return <Alert type="info">Can't simulate this check yet{sim.reason ? `: ${sim.reason.replace(/_/g, ' ')}` : ''}.</Alert>;
  }
  if (sim.direction === 'fixed') return null;
  const percent = PERCENT_CHECKS.has(p.check_type);
  const tiers = p.tiers.filter(t => !t.badge_id);
  const upTo = Math.max(percent ? 100 : 0, ...tiers.map(t => Number(t.threshold) || 0));
  const { bars, min, max, width } = histogram(sim, 40, sim.direction === 'lte' ? 0 : upTo);
  if (!bars.length) return null;
  const fmt = (v) => `${Math.round(v * 10) / 10}${percent ? '%' : HOUR_CHECKS.has(p.check_type) ? 'h' : ''}`;
  const peak = Math.max(1, ...bars.map(b => b.count));
  const pct = (v) => (max === min ? 0 : ((v - min) / (max - min + width)) * 100);
  return (
    <div className="relative pt-5 min-w-0">
      <div className="flex items-end gap-px h-12">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 min-w-0 rounded-t-sm bg-white/15" title={`${b.from === b.to ? fmt(b.from) : `${fmt(b.from)}–${fmt(b.to)}`}: ${b.count}`}
            style={{ height: `${Math.max(b.count ? 4 : 0, (b.count / peak) * 100)}%` }} />
        ))}
      </div>
      {tiers.map(t => !t.bonus && t.threshold != null && Number(t.threshold) >= min && Number(t.threshold) <= max + width && (
        <div key={t.id} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${pct(Number(t.threshold))}%` }}>
          <div className="absolute top-0 -translate-x-1/2 text-[10px] font-bold tabular-nums px-1 rounded" style={{ background: TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length], color: '#111' }}>
            {fmt(Number(t.threshold))}
          </div>
          <div className="absolute top-4 bottom-0 w-0.5" style={{ background: TIER_COLORS[(t.tier_order - 1) % TIER_COLORS.length] }} />
        </div>
      ))}
      <div className="flex justify-between text-[10px] text-gray-600 tabular-nums mt-1">
        <span>{fmt(min)}</span>
        <span className="flex items-center gap-1"><Icon name="clock" size={11} />{TIMING_LABEL[sim.timing] || sim.timing}</span>
        <span>{fmt(max)}</span>
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


// ── Wiring state shared by the rule line and the badge chips ──────────────────

export function useWiring(p, onChanged, enabled, onPatch) {
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [collections, setCollections] = useState(null);
  useEffect(() => {
    if (!enabled || p.check_type !== 'collection_complete' || collections) return;
    api('/api/admin/collections')
      .then(d => setCollections((d || []).map(x => (typeof x === 'string' ? { slug: x, bonus_count: 0 } : x))))
      .catch(() => setCollections([]));
  }, [enabled, p.check_type, collections]);
  // optimistic: a local patch applied before the request, so the chip moves at once.
  // The server's numbers (sims) are pulled in the background afterwards.
  const save = async (body, optimistic) => {
    setErr(null);
    if (optimistic && onPatch) onPatch(optimistic); else setSaving(true);
    try {
      await api(`/api/admin/backlog/${p.id}/wiring`, { method: 'PATCH', body });
      if (optimistic && onPatch) onChanged(); else await onChanged();
    } catch (e) { setErr(e.message); await onChanged(); } finally { setSaving(false); }
  };
  return { save, saving, err, setErr, collections };
}

// ── The rule, as one sentence ─────────────────────────────────────────────────
// Mods read it. The owner taps it to change the check and its filter in a popover
// that sits over the card, so nothing underneath moves.

export function RuleLine({ p, isOwner, wiring }) {
  const { save, saving, collections } = wiring;
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState(p.trigger || TRIGGER_OF[p.check_type] || null);
  const box = useRef(null);
  useEffect(() => { if (p.trigger) setTrigger(p.trigger); }, [p.trigger]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const sentence = p.check_type
    ? describeBadgeCheck({ check_type: p.check_type, check_value: 'N', check_qualifier: p.check_qualifier })
    : 'Not wired to a check yet';
  const checks = trigger ? CHECK_TYPES_BY_TRIGGER[trigger] || [] : [];
  const pickCheck = (ct) => save({ check_type: ct, check_qualifier: ct === 'bingo_achievement_count' ? 'any' : null });

  if (!isOwner) {
    return p.check_type ? <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5"><Icon name="target" size={12} />{sentence}</p> : null;
  }

  return (
    <div className="relative mt-1.5" ref={box}>
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className={`flex items-center gap-1.5 max-w-full text-left text-xs px-2.5 py-1 rounded-lg border transition-colors ${open ? 'border-lagoon-500/50 text-white bg-lagoon-500/10' : p.check_type ? 'border-white/10 text-gray-300 hover:border-white/25' : 'border-dashed border-amber-400/50 text-amber-300'}`}>
        <Icon name="wrench" size={12} className="shrink-0" /><span className="truncate">{sentence}</span>
        <Icon name="edit" size={11} className="shrink-0 text-gray-500" />
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-1 z-30 w-[min(34rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border p-3 space-y-4 shadow-2xl ${saving ? 'opacity-70' : ''}`}
          style={{ background: C.card, borderColor: C.border }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {TRIGGERS.map(t => (
              <Tile key={t.value} icon={t.icon} active={trigger === t.value}
                onClick={() => { setTrigger(t.value); const list = CHECK_TYPES_BY_TRIGGER[t.value]; if (list.length === 1) pickCheck(list[0].value); }}>
                {t.label}
              </Tile>
            ))}
          </div>
          {trigger && checks.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {checks.map(c => <Tile key={c.value} icon="target" active={p.check_type === c.value} onClick={() => pickCheck(c.value)}>{c.label}</Tile>)}
            </div>
          )}
          {p.check_type && TRIGGER_OF[p.check_type] === trigger && <Qualifier p={p} save={save} collections={collections} />}
        </div>
      )}
    </div>
  );
}

// ── Code status: a dot the owner can cycle ────────────────────────────────────

export function StatusPill({ p, isOwner, save }) {
  const status = CODE_STATUS[p.code_status] || CODE_STATUS.unreviewed;
  const keys = Object.keys(CODE_STATUS);
  const next = keys[(keys.indexOf(p.code_status) + 1) % keys.length] || keys[0];
  const body = <><span className="w-2 h-2 rounded-full" style={{ background: status.color }} />{status.label}</>;
  const cls = 'flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0';
  const style = { color: status.color, borderColor: `${status.color}55`, background: `${status.color}14` };
  return isOwner && p.status === 'open'
    ? <button type="button" onClick={() => save({ code_status: next }, (q) => ({ ...q, code_status: next }))} className={cls} style={style} title="Code status (tap to change)">{body}</button>
    : <span className={cls} style={style} title="Code status (owner sets it)">{body}</span>;
}

export { Publish };
