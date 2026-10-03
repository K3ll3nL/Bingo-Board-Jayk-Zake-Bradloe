import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../services/supabaseClient';
import { ALLOWED_GAMES, GAMES_BY_MANAGER_ORDER } from '../constants/games';
import { EXEMPTIBLE_RULES } from '../constants/huntPrep';
import PokemonImage from './PokemonImage';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

// ── Theme ──────────────────────────────────────────────────────────────────────
const C = {
  bg:         '#0d0f14',
  card:       'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  header:     'linear-gradient(160deg, #13151a 0%, #181a21 100%)',
  input:      '#0d0f14',
  border:     'rgba(255,255,255,0.07)',
  borderSubt: 'rgba(255,255,255,0.04)',
  rowAlt:     'rgba(255,255,255,0.02)',
  rowHover:   'rgba(255,255,255,0.04)',
};

// ── Column definitions ─────────────────────────────────────────────────────────
// Always-visible: checkbox, sprite, name, spacer, save.
// 'slugs' is a paired entry - toggling it shows/hides both slug columns together.
const COLUMN_DEFS = [
  { id: 'slugs',       label: 'Slug Columns',  dot: '#a855f7', widths: ['200px', '200px'] },
  { id: 'shiny',       label: 'Shiny',          dot: '#facc15', width: '90px'  },
  { id: 'properties',  label: 'Properties',     dot: '#f472b6', width: '190px' },
  { id: 'copy_paste',  label: 'Copy / Paste',   dot: null,      width: '72px'  },
];

const ALL_COLUMNS = new Set(COLUMN_DEFS.map(c => c.id));
const DEFAULT_VISIBLE = ALL_COLUMNS;

const buildGrid = (visible) => {
  const cols = ['32px', '52px', 'minmax(150px,1fr)']; // checkbox, sprite, name (minmax: a long name must not shift its row)
  for (const def of COLUMN_DEFS) {
    if (!visible.has(def.id)) continue;
    if (def.widths) cols.push(...def.widths);
    else cols.push(def.width);
  }
  cols.push('minmax(0,1fr)'); // spacer so table always fills container
  cols.push('24px');          // save indicator
  return cols.join(' ');
};

// ── Shared portal dropdown helper ──────────────────────────────────────────────
const usePortalDropdown = (onClose) => {
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onScroll = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const toggle = (width = 240) => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const openUp = rect.bottom > window.innerHeight * 0.55;
      const ideal = rect.left + rect.width / 2 - width / 2;
      const left = Math.max(8, Math.min(ideal, window.innerWidth - width - 8));
      setStyle(openUp
        ? { position: 'fixed', width, left, bottom: window.innerHeight - rect.top + 4, zIndex: 9999 }
        : { position: 'fixed', width, left, top: rect.bottom + 4, zIndex: 9999 }
      );
    }
    setOpen(o => !o);
  };

  return { btnRef, panelRef, open, setOpen, style, toggle };
};

// ── Panel chrome (shared between dropdowns) ────────────────────────────────────
const PanelBox = React.forwardRef(({ style, children, maxH = 400 }, ref) => (
  <div ref={ref} style={{ ...style, maxHeight: maxH }}
    className="rounded-xl border overflow-y-auto shadow-2xl"
    style={{ ...style, maxHeight: maxH, background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: C.border }}>
    {children}
  </div>
));
PanelBox.displayName = 'PanelBox';

// ── Column visibility dropdown ─────────────────────────────────────────────────
const ColumnsDropdown = ({ visible, setVisible }) => {
  const { btnRef, panelRef, open, style, toggle } = usePortalDropdown();
  const hiddenCount = COLUMN_DEFS.length - visible.size;

  const panel = (
    <div ref={panelRef} style={{ ...style, width: 220, maxHeight: 400, background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: C.border }}
      className="rounded-xl border overflow-y-auto shadow-2xl">
      <div className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest text-gray-500"
        style={{ borderColor: C.border }}>Columns</div>
      <div className="p-2 space-y-0.5">
        {COLUMN_DEFS.map(col => {
          const on = visible.has(col.id);
          return (
            <label key={col.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors hover:bg-white/[0.04]">
              <input type="checkbox" checked={on}
                onChange={() => setVisible(prev => {
                  const next = new Set(prev);
                  on ? next.delete(col.id) : next.add(col.id);
                  return next;
                })}
                className="w-3.5 h-3.5 rounded accent-purple-500 flex-shrink-0" />
              {col.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.dot }} />}
              <span className="text-sm text-gray-300">{col.label}</span>
            </label>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t flex gap-3" style={{ borderColor: C.border }}>
        <button type="button" onClick={() => setVisible(ALL_COLUMNS)}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Show all</button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => toggle(220)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border"
        style={{
          background: hiddenCount > 0 ? 'rgba(147,51,234,0.12)' : C.input,
          borderColor: hiddenCount > 0 ? 'rgba(147,51,234,0.4)' : C.border,
          color: hiddenCount > 0 ? '#c084fc' : 'rgba(255,255,255,0.5)',
        }}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Columns
        {hiddenCount > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
            {hiddenCount} hidden
          </span>
        )}
        <svg className={`w-3.5 h-3.5 transition-transform text-gray-500 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && createPortal(panel, document.body)}
    </div>
  );
};

// ── Slug Dropdown ──────────────────────────────────────────────────────────────
const SLUG_PANEL_WIDTH = 960;

const SlugDropdown = ({ pokemonId, field, value, onChange, matchValue, reversed }) => {
  const { btnRef, panelRef, open, style, toggle } = usePortalDropdown();
  const isRestricted = field === 'restricted_game_slugs';

  const toggleSlug = (key) => {
    const next = value.includes(key) ? value.filter(k => k !== key) : [...value, key];
    onChange(pokemonId, field, next);
  };

  const label = value.length === 0
    ? <span style={{ color: 'rgba(255,255,255,0.25)' }}>None</span>
    : <span className="text-white">{value.length} game{value.length !== 1 ? 's' : ''}</span>;

  const panel = (
    <div ref={panelRef} style={{ ...style, width: SLUG_PANEL_WIDTH, maxHeight: 360, background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: C.border }}
      className="rounded-xl border overflow-y-auto shadow-2xl">
      <div className="flex gap-3 px-3 py-2.5 border-b flex-wrap" style={{ borderColor: C.border }}>
        <button type="button" onClick={() => onChange(pokemonId, field, ALLOWED_GAMES.map(g => g.key))}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors">Select all</button>
        <span className="text-gray-700">·</span>
        <button type="button" onClick={() => onChange(pokemonId, field, [])}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Clear</button>
        {isRestricted && matchValue && (
          <>
            <span className="text-gray-700">·</span>
            <button type="button" onClick={() => onChange(pokemonId, field, [...matchValue])}
              className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">Match games</button>
          </>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {(reversed ? [...GAMES_BY_MANAGER_ORDER].reverse() : GAMES_BY_MANAGER_ORDER).map((g) => {
          const checked = value.includes(g.key);
          return (
            <label key={g.key}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors"
              style={{
                borderColor: checked ? 'rgba(147,51,234,0.5)' : 'transparent',
                background: checked ? 'rgba(147,51,234,0.1)' : 'transparent',
              }}
              onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent'; }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggleSlug(g.key)}
                className="w-3.5 h-3.5 rounded accent-purple-500 flex-shrink-0" />
              <div className="flex items-center justify-center gap-1" style={{ width: '90px', flexShrink: 0 }}>
                {(g.img_urls ?? []).slice(0, 3).map((url, i) => (
                  <img key={i} src={url} alt="" className="object-contain" style={{ height: '27px', maxWidth: '40px' }} />
                ))}
              </div>
              <span className="text-xs text-gray-300 leading-tight">{g.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => toggle(SLUG_PANEL_WIDTH)}
        className="flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg border text-sm transition-colors"
        style={{
          background: C.input,
          borderColor: isRestricted ? 'rgba(248,113,113,0.2)' : C.border,
          color: 'inherit',
        }}>
        {label}
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-gray-600 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && createPortal(panel, document.body)}
    </div>
  );
};

// ── Categories (edited in the Properties card) ────────────────────────────────
const CATEGORIES = [
  { key: 'legendary',       label: 'Legendary' },
  { key: 'baby',            label: 'Baby' },
  { key: 'ultra_beast',     label: 'Ultra Beast' },
  { key: 'paradox',         label: 'Paradox' },
  { key: 'starter',         label: 'Starter' },
  { key: 'fossil',          label: 'Fossil' },
  { key: 'regional_alt',    label: 'Regional Variant' },
  { key: 'pseudo_legendary',label: 'Pseudo-Legendary' },
  { key: 'pla',             label: 'PLA' },
];

// ── Properties ─────────────────────────────────────────────────────────────────
// Per-mon data that Hunt Prep and the board builder read from pokemon_master:
// forms_count, categories, family_id, evolution links (evolves_from_id, both directions)
// and the Restricted rules the mon ignores (rule_exemptions). One cell, one card.
const PINK  = '#f472b6';
const AMBER = '#fbbf24';
const MINT  = '#34d399';
const BLUE  = '#60a5fa';

const SectionHead = ({ color, label, right }) => (
  <div className="flex items-center justify-between gap-2 mb-2">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
    {right}
  </div>
);

const MonTile = ({ mon, on, color, onPick, title }) => (
  <button type="button" onClick={onPick} title={title ?? (mon ? `${mon.name} #${mon.national_dex_id}` : 'None')}
    className="min-w-0 flex flex-col items-center gap-0.5 p-1 rounded-lg border transition-colors hover:bg-white/[0.05]"
    style={{ borderColor: on ? `${color}b3` : 'transparent', background: on ? `${color}1f` : 'transparent' }}>
    {mon
      ? <PokemonImage pokemon={mon} className="w-10 h-10" disableCycling />
      : <span className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center text-gray-500"
          style={{ borderColor: 'rgba(255,255,255,0.2)' }}>✕</span>}
    <span className={`text-[10px] leading-tight truncate w-full text-center ${on ? 'text-white' : 'text-gray-500'}`}>
      {mon ? mon.name : 'None'}
    </span>
  </button>
);

const Arrow = ({ className = 'w-4 h-4' }) => (
  <svg className={`${className} flex-shrink-0`} style={{ color: PINK }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-6-6l6 6-6 6" />
  </svg>
);

const EmptySlot = () => (
  <span className="w-10 h-10 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />
);

const Switch = ({ on }) => (
  <span className="relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors"
    style={{ background: on ? AMBER : 'rgba(255,255,255,0.12)' }}>
    <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[14px]' : ''}`} />
  </span>
);

const NO_KIDS = [];
const Mini = ({ mon }) => mon
  ? <PokemonImage pokemon={mon} className="w-7 h-7" disableCycling />
  : <span className="w-5 h-5 mx-1 rounded-full border border-dashed flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />;

const PropertiesCell = ({ p, data, rosterById, childrenOf, familyOf, onForms, onCategory, onFamily, onParent, onExemptions }) => {
  const { btnRef, panelRef, open, style, toggle } = usePortalDropdown();
  const parent = data.evolves_from_id != null ? rosterById.get(data.evolves_from_id) : null;
  const exemptions = data.rule_exemptions ?? [];
  const catCount = CATEGORIES.filter(c => data[c.key]).length;
  const forms = data.forms_count ?? 1;

  // Everything below is only needed while the card is open.
  const view = useMemo(() => {
    if (!open) return null;
    const family = familyOf(p.family_id);
    const others = family.filter(m => m.id !== p.id);
    // Ancestors / descendants within the roster, so a pick can never make a cycle.
    const ancestors = new Set();
    for (let cur = rosterById.get(p.evolves_from_id); cur && !ancestors.has(cur.id) && cur.id !== p.id; cur = rosterById.get(cur.evolves_from_id)) ancestors.add(cur.id);
    const descendants = new Set();
    const queue = [p.id];
    while (queue.length) {
      const id = queue.shift();
      for (const m of family) if (m.evolves_from_id === id && !descendants.has(m.id) && m.id !== p.id) { descendants.add(m.id); queue.push(m.id); }
    }
    let maxFamily = 0;
    for (const m of rosterById.values()) if (m.family_id > maxFamily) maxFamily = m.family_id;
    return {
      family,
      fromOptions: others.filter(m => !descendants.has(m.id)),
      toOptions: others.filter(m => !ancestors.has(m.id)),
      children: others.filter(m => m.evolves_from_id === p.id),
      maxFamily,
    };
  }, [open, p, rosterById, familyOf]);

  const width = Math.min(400, window.innerWidth - 16);
  const room = (() => {
    if (!open || !btnRef.current) return 600;
    const r = btnRef.current.getBoundingClientRect();
    return Math.max(240, (style.bottom != null ? r.top : window.innerHeight - r.bottom) - 12);
  })();

  const setFamily = (fid) => onFamily(p.id, fid);
  const toggleRule = (id) => onExemptions(p.id, exemptions.includes(id) ? exemptions.filter(r => r !== id) : [...exemptions, id]);

  const panel = view && (
    <div ref={panelRef} style={{ ...style, width, maxHeight: room, background: C.header, borderColor: C.border }}
      className="rounded-xl border overflow-y-auto shadow-2xl">

      {/* Identity */}
      <div className="flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-10" style={{ borderColor: C.border, background: '#13151a' }}>
        <PokemonImage pokemon={{ ...p, forms_count: forms }} className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">{p.name}</div>
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>#{String(p.national_dex_id).padStart(4, '0')}</div>
        </div>
        {/* Forms: the sprite beside it cycles through them live */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
            <span className="w-2 h-2 rounded-full" style={{ background: BLUE }} />Forms
          </span>
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: C.border, background: C.input }}>
            <button type="button" onClick={() => onForms(p.id, Math.max(1, forms - 1))} disabled={forms <= 1}
              className="w-7 h-7 text-gray-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:hover:bg-transparent transition-colors">−</button>
            <span className="w-7 text-center text-sm text-white tabular-nums">{forms}</span>
            <button type="button" onClick={() => onForms(p.id, forms + 1)}
              className="w-7 h-7 text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors">+</button>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
        <SectionHead color={MINT} label="Categories" />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => {
            const on = !!data[cat.key];
            return (
              <button type="button" key={cat.key} onClick={() => onCategory(p.id, cat.key, !on)}
                className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${on ? 'text-emerald-200' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'}`}
                style={{ borderColor: on ? 'rgba(52,211,153,0.55)' : C.border, background: on ? 'rgba(52,211,153,0.15)' : 'transparent' }}>
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Family */}
      <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
        <SectionHead color="#a78bfa" label="Family" right={
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: C.border, background: C.input }}>
              <button type="button" onClick={() => setFamily(Math.max(0, (p.family_id ?? 1) - 1))}
                className="w-7 h-7 text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors">−</button>
              <input type="number" min="0" value={p.family_id ?? ''} placeholder="-"
                onChange={e => { const n = parseInt(e.target.value, 10); setFamily(Number.isInteger(n) && n >= 0 ? n : null); }}
                className="w-14 h-7 bg-transparent text-center text-sm text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
              <button type="button" onClick={() => setFamily((p.family_id ?? 0) + 1)}
                className="w-7 h-7 text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors">+</button>
            </div>
            <button type="button" onClick={() => setFamily(view.maxFamily + 1)} title={`New family #${view.maxFamily + 1}`}
              className="h-7 px-2 rounded-lg border text-xs text-violet-300 hover:text-white hover:bg-violet-500/20 transition-colors"
              style={{ borderColor: 'rgba(167,139,250,0.35)' }}>New</button>
          </div>
        } />
        <div className="flex flex-wrap gap-1">
          {(view.family.length ? view.family : [p]).map(m => (
            <span key={m.id} title={m.name} className="rounded-lg p-0.5"
              style={{ background: m.id === p.id ? 'rgba(167,139,250,0.18)' : 'transparent', outline: m.id === p.id ? '1px solid rgba(167,139,250,0.6)' : 'none' }}>
              <PokemonImage pokemon={m} className="w-9 h-9" disableCycling />
            </span>
          ))}
        </div>
      </div>

      {/* Evolution */}
      <div className="px-4 py-3 border-b" style={{ borderColor: C.border }}>
        <SectionHead color={PINK} label="Evolution" />
        {/* Chain at a glance: parent → this → children */}
        <div className="flex items-center justify-center gap-2 mb-3 py-2 rounded-lg" style={{ background: 'rgba(244,114,182,0.06)' }}>
          {parent ? <PokemonImage pokemon={parent} className="w-10 h-10" disableCycling /> : <EmptySlot />}
          <Arrow />
          <span className="rounded-full p-1" style={{ outline: `2px solid ${PINK}` }}>
            <PokemonImage pokemon={p} className="w-11 h-11" disableCycling />
          </span>
          <Arrow />
          {view.children.length
            ? <div className="flex -space-x-2">{view.children.map(c => <PokemonImage key={c.id} pokemon={c} className="w-10 h-10" disableCycling />)}</div>
            : <EmptySlot />}
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
          From <Arrow className="w-3 h-3" />
        </div>
        <div className="grid grid-cols-5 gap-1 mb-2">
          <MonTile mon={null} on={data.evolves_from_id == null} color={PINK} title="First stage"
            onPick={() => onParent(p.id, null)} />
          {view.fromOptions.map(m => (
            <MonTile key={m.id} mon={m} on={m.id === data.evolves_from_id} color={PINK}
              onPick={() => onParent(p.id, m.id === data.evolves_from_id ? null : m.id)} />
          ))}
        </div>

        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
          <Arrow className="w-3 h-3" /> To
        </div>
        {view.toOptions.length ? (
          <div className="grid grid-cols-5 gap-1">
            {view.toOptions.map(m => {
              const on = m.evolves_from_id === p.id;
              return <MonTile key={m.id} mon={m} on={on} color={PINK} onPick={() => onParent(m.id, on ? null : p.id)} />;
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-600 py-2">-</div>
        )}
      </div>

      {/* Ignores */}
      <div className="px-4 py-3">
        <SectionHead color={AMBER} label="Ignores" right={exemptions.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.15)', color: AMBER }}>{exemptions.length}</span>
        )} />
        <div className="space-y-0.5">
          {EXEMPTIBLE_RULES.map(rule => {
            const on = exemptions.includes(rule.id);
            return (
              <button type="button" key={rule.id} onClick={() => toggleRule(rule.id)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors hover:bg-white/[0.04] text-left"
                style={{ background: on ? 'rgba(251,191,36,0.08)' : undefined }}>
                <span className="flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 22 }}>
                  {rule.game?.img_urls?.[0]
                    ? <img src={rule.game.img_urls[0]} alt={rule.game.label} title={rule.game.label} className="object-contain" style={{ maxHeight: 22, maxWidth: 44 }} />
                    : <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">All</span>}
                </span>
                <span className={`flex-1 min-w-0 truncate text-sm ${on ? 'text-amber-300 line-through decoration-amber-400/70' : 'text-gray-300'}`}>
                  {rule.short}
                </span>
                <Switch on={on} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Collapsed: the same parent → this → children chain as the card, in
  // miniature. The pink dot is this row; dashed ends are "none".
  const kids = childrenOf.get(p.id) ?? NO_KIDS;
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={() => toggle(width)}
        title={[parent && `From ${parent.name}`, kids.length && `To ${kids.map(k => k.name).join(', ')}`].filter(Boolean).join(' · ') || undefined}
        className="flex items-center justify-between gap-1 w-full h-9 px-1.5 rounded-lg border transition-colors hover:bg-white/[0.03]"
        style={{ background: C.input, borderColor: open ? 'rgba(244,114,182,0.5)' : C.border }}>
        <span className="flex items-center gap-0.5 min-w-0">
          <Mini mon={parent} />
          <Arrow className={`w-3 h-3 ${parent ? '' : 'opacity-30'}`} />
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PINK, boxShadow: '0 0 0 3px rgba(244,114,182,0.2)' }} />
          <Arrow className={`w-3 h-3 ${kids.length ? '' : 'opacity-30'}`} />
          <Mini mon={kids[0]} />
          {kids.length > 1 && <span className="text-[10px] text-gray-400">+{kids.length - 1}</span>}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {forms > 1 && (
            <span title={`${forms} forms`}
              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.15)', color: BLUE }}>
              {forms}
            </span>
          )}
          {catCount > 0 && (
            <span title={CATEGORIES.filter(c => data[c.key]).map(c => c.label).join(', ')}
              className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.15)', color: MINT }}>
              {catCount}
            </span>
          )}
          {exemptions.length > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.15)', color: AMBER }}>
              {exemptions.length}
            </span>
          )}
        </span>
      </button>
      {open && createPortal(panel, document.body)}
    </div>
  );
};

// ── Save indicator ─────────────────────────────────────────────────────────────
const SaveIndicator = ({ status }) => {
  if (status === 'saving') return (
    <svg className="w-4 h-4 text-gray-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
  if (status === 'saved') return (
    <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
  if (status === 'error') return (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  return <div className="w-4 h-4 flex-shrink-0" />;
};

// ── Pokemon Row ────────────────────────────────────────────────────────────────
const PokemonRow = React.memo(({
  p, i, data, status, isSelected,
  visible, toggleSelected, handleSlugChange, handleShinyToggle,
  handleFormsCountChange, handleCategoryToggle, handleFamily, handleEvolvesFrom, handleExemptions,
  rosterById, childrenOf, familyOf, clipboard, setClipboard, reversed, grid,
}) => (
  <div
    className="grid gap-3 items-center px-4 py-2.5 transition-colors"
    style={{
      gridTemplateColumns: grid,
      backgroundColor: i % 2 === 0 ? 'transparent' : C.rowAlt,
      borderBottom: `1px solid ${C.borderSubt}`,
    }}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = C.rowHover; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : C.rowAlt; }}
  >
    {/* Checkbox */}
    <div className="flex items-center justify-center">
      <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(p.id)}
        className="w-4 h-4 rounded accent-purple-500" />
    </div>

    {/* Sprite */}
    <PokemonImage pokemon={{ ...p, forms_count: data.forms_count }} className="w-11 h-11" />

    {/* Name */}
    <div className="min-w-0">
      <a
        href={`https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(p.name.replace(/^(Alolan|Galarian|Hisuian|Paldean) /, ''))}_(Pok%C3%A9mon)#Game_locations`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open on Bulbapedia"
        className="block truncate text-white text-sm font-medium leading-tight hover:text-purple-300 hover:underline transition-colors"
      >
        {p.name}
      </a>
      <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
        #{String(p.national_dex_id).padStart(4, '0')}
      </div>
    </div>

    {/* Slug columns - always paired */}
    {visible.has('slugs') && (
      <SlugDropdown pokemonId={p.id} field="game_slugs" value={data.game_slugs}
        onChange={handleSlugChange} reversed={reversed} />
    )}
    {visible.has('slugs') && (
      <SlugDropdown pokemonId={p.id} field="restricted_game_slugs" value={data.restricted_game_slugs}
        onChange={handleSlugChange} matchValue={data.game_slugs} reversed={reversed} />
    )}
    {visible.has('shiny') && (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <div className="relative" onClick={() => handleShinyToggle(p.id)}>
          <div className={`w-9 h-5 rounded-full transition-colors ${data.shiny_available ? 'bg-yellow-500' : 'bg-gray-700'}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${data.shiny_available ? 'translate-x-4' : ''}`} />
        </div>
      </label>
    )}
    {visible.has('properties') && (
      <PropertiesCell p={p} data={data} rosterById={rosterById} childrenOf={childrenOf} familyOf={familyOf}
        onForms={handleFormsCountChange} onCategory={handleCategoryToggle} onFamily={handleFamily} onParent={handleEvolvesFrom} onExemptions={handleExemptions} />
    )}
    {visible.has('copy_paste') && (
      <div className="flex items-center gap-1">
        <button type="button" title="Copy slugs"
          onClick={() => setClipboard({ fromId: p.id, game_slugs: [...data.game_slugs], restricted_game_slugs: [...data.restricted_game_slugs] })}
          className="p-1.5 rounded-lg transition-colors text-sm"
          style={{
            background: clipboard?.fromId === p.id ? 'rgba(147,51,234,0.3)' : 'transparent',
            color: clipboard?.fromId === p.id ? '#fff' : 'rgba(255,255,255,0.3)',
          }}>📋</button>
        {clipboard && clipboard.fromId !== p.id && (
          <button type="button" title="Paste slugs"
            onClick={() => {
              handleSlugChange(p.id, 'game_slugs', clipboard.game_slugs);
              handleSlugChange(p.id, 'restricted_game_slugs', clipboard.restricted_game_slugs);
            }}
            className="p-1.5 rounded-lg text-sm text-emerald-400 hover:text-white transition-colors"
            style={{ background: 'transparent' }}>📥</button>
        )}
      </div>
    )}

    {/* Spacer */}
    <div />

    {/* Save indicator - always shown */}
    <div className="flex items-center justify-center">
      <SaveIndicator status={status} />
    </div>
  </div>
), (prev, next) =>
  prev.isSelected === next.isSelected &&
  prev.data === next.data &&
  prev.status === next.status &&
  prev.clipboard?.fromId === next.clipboard?.fromId &&
  prev.i === next.i &&
  prev.visible === next.visible &&
  prev.grid === next.grid &&
  prev.rosterById === next.rosterById
);

PokemonRow.displayName = 'PokemonRow';

// ── Main component ─────────────────────────────────────────────────────────────
const PokemonGameManager = () => {
  const [pokemon,    setPokemon]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [reversed,   setReversed]   = useState(false);
  const [clipboard,  setClipboard]  = useState(null);
  const [selected,   setSelected]   = useState(new Set());
  const [localData,  setLocalData]  = useState({});
  const [saveState,  setSaveState]  = useState({});
  const [visible,    setVisible]    = useState(DEFAULT_VISIBLE);

  const selectedRef  = useRef(new Set());
  const saveTimers   = useRef({});
  const localDataRef = useRef(localData);
  useEffect(() => { localDataRef.current = localData; }, [localData]);
  // Per-session id echoed in save PATCH body and broadcast payload so this
  // client can ignore its own broadcast echo (avoids stomping on active typing).
  const editorIdRef  = useRef((crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2));
  // Snapshot of saveState for the realtime callback (which runs outside React render).
  const saveStateRef = useRef(saveState);
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);

  const grid = useMemo(() => buildGrid(visible), [visible]);

  // Lookups for the Properties card. family_id and evolves_from_id edits are
  // mirrored into `pokemon` (syncRoster) so these stay live while editing.
  const rosterById = useMemo(() => new Map(pokemon.map(p => [p.id, p])), [pokemon]);
  const childrenOf = useMemo(() => {
    const m = new Map();
    for (const p of pokemon) if (p.evolves_from_id != null) {
      if (!m.has(p.evolves_from_id)) m.set(p.evolves_from_id, []);
      m.get(p.evolves_from_id).push(p);
    }
    return m;
  }, [pokemon]);
  const familyOf = useCallback((fid) => (fid == null ? [] : pokemon.filter(m => m.family_id === fid)), [pokemon]);
  const ROSTER_FIELDS = ['family_id', 'evolves_from_id'];
  const syncRoster = (ids, field, value) => {
    if (!ROSTER_FIELDS.includes(field)) return;
    const set = new Set(ids);
    setPokemon(prev => prev.map(p => (set.has(p.id) && !(field === 'evolves_from_id' && p.id === value)) ? { ...p, [field]: value } : p));
  };

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/pokemon-game-slugs', {
          headers: { Authorization: await getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setPokemon(data);
        const init = {};
        for (const p of data) {
          init[p.id] = {
            game_slugs:           p.game_slugs ?? [],
            restricted_game_slugs: p.restricted_game_slugs ?? [],
            shiny_available:      p.shiny_available ?? false,
            forms_count:          p.forms_count ?? 1,
            legendary:            p.legendary ?? false,
            baby:                 p.baby ?? false,
            ultra_beast:          p.ultra_beast ?? false,
            paradox:              p.paradox ?? false,
            starter:              p.starter ?? false,
            fossil:               p.fossil ?? false,
            regional_alt:         p.regional_alt ?? false,
            pseudo_legendary:     p.pseudo_legendary ?? false,
            pla:                  p.pla ?? false,
            family_id:            p.family_id ?? null,
            evolves_from_id:      p.evolves_from_id ?? null,
            rule_exemptions:      p.rule_exemptions ?? [],
          };
        }
        setLocalData(init);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const save = useCallback(async (pokemonId) => {
    setSaveState(prev => ({ ...prev, [pokemonId]: 'saving' }));
    try {
      const res = await fetch(`/api/admin/pokemon/${pokemonId}/game-slugs`, {
        method: 'PATCH',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...localDataRef.current[pokemonId], editor_id: editorIdRef.current }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveState(prev => ({ ...prev, [pokemonId]: 'saved' }));
      setTimeout(() => setSaveState(prev => ({ ...prev, [pokemonId]: 'idle' })), 2000);
    } catch {
      setSaveState(prev => ({ ...prev, [pokemonId]: 'error' }));
    }
  }, []);

  const scheduleSave = (pokemonId) => {
    setSaveState(prev => ({ ...prev, [pokemonId]: 'saving' }));
    if (saveTimers.current[pokemonId]) clearTimeout(saveTimers.current[pokemonId]);
    saveTimers.current[pokemonId] = setTimeout(() => save(pokemonId), 800);
  };

  // ── Field handlers ─────────────────────────────────────────────────────────
  const handleSlugChange = (pokemonId, field, newValue) => {
    const oldValue = localData[pokemonId]?.[field] ?? [];
    setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], [field]: newValue } }));
    selected.has(pokemonId) ? applyToSelected(pokemonId, field, newValue, oldValue) : scheduleSave(pokemonId);
  };

  const handleShinyToggle = (pokemonId) => {
    const newValue = !localData[pokemonId]?.shiny_available;
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, 'shiny_available', newValue);
    } else {
      setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], shiny_available: newValue } }));
      scheduleSave(pokemonId);
    }
  };

  const handleFormsCountChange = (pokemonId, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1);
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, 'forms_count', n);
    } else {
      setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], forms_count: n } }));
      scheduleSave(pokemonId);
    }
  };

  const handleCategoryToggle = (pokemonId, category, value) => {
    const oldValue = localData[pokemonId]?.[category] ?? false;
    setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], [category]: value } }));
    selected.has(pokemonId) ? applyToSelected(pokemonId, category, value, oldValue) : scheduleSave(pokemonId);
  };

  // Scalar roster field: bulk-applies when the row is selected.
  const setRosterField = (pokemonId, field, value) => {
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, field, value);
    } else {
      setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], [field]: value } }));
      syncRoster([pokemonId], field, value);
      scheduleSave(pokemonId);
    }
  };
  const handleFamily = (pokemonId, familyId) => setRosterField(pokemonId, 'family_id', familyId);
  const handleEvolvesFrom = (pokemonId, parentId) => setRosterField(pokemonId, 'evolves_from_id', parentId);

  const handleExemptions = (pokemonId, newValue) => {
    const oldValue = localData[pokemonId]?.rule_exemptions ?? [];
    setLocalData(prev => ({ ...prev, [pokemonId]: { ...prev[pokemonId], rule_exemptions: newValue } }));
    selected.has(pokemonId) ? applyToSelected(pokemonId, 'rule_exemptions', newValue, oldValue) : scheduleSave(pokemonId);
  };

  // ── Bulk selection ─────────────────────────────────────────────────────────
  const toggleSelected = (pokemonId) => {
    selectedRef.current.has(pokemonId) ? selectedRef.current.delete(pokemonId) : selectedRef.current.add(pokemonId);
    setSelected(new Set(selectedRef.current));
  };

  const selectAll = () => {
    selectedRef.current = new Set(filtered.map(p => p.id));
    setSelected(new Set(selectedRef.current));
  };

  const clearSelection = () => {
    selectedRef.current = new Set();
    setSelected(new Set());
  };

  const applyToSelected = (pokemonId, field, newValue, oldValue) => {
    if (!selectedRef.current.has(pokemonId) || selectedRef.current.size === 0) return;
    const ids = Array.from(selectedRef.current);
    // Array fields merge the diff into each selected row rather than overwrite it.
    const isSlug = Array.isArray(newValue);

    setLocalData(prev => {
      const next = { ...prev };
      if (isSlug) {
        const added   = newValue.filter(s => !oldValue.includes(s));
        const removed = oldValue.filter(s => !newValue.includes(s));
        for (const id of ids) {
          let cur = [...(next[id]?.[field] ?? [])];
          for (const s of added)   if (!cur.includes(s)) cur.push(s);
          for (const s of removed) cur = cur.filter(x => x !== s);
          next[id] = { ...(next[id] ?? {}), [field]: cur };
        }
      } else {
        for (const id of ids) {
          if (field === 'evolves_from_id' && id === newValue) continue; // never its own parent
          next[id] = { ...(next[id] ?? {}), [field]: newValue };
        }
      }
      return next;
    });
    if (!isSlug) syncRoster(ids, field, newValue);
    for (const id of ids) scheduleSave(id);
  };

  // ── Realtime: apply updates from other moderators ─────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('pokemon-game-manager')
      .on('broadcast', { event: 'pokemon-updated' }, ({ payload }) => {
        if (!payload || payload.editor_id === editorIdRef.current) return;
        const { id, updates } = payload;
        if (!id || !updates) return;
        // Don't clobber a row this user is actively editing (pending debounced
        // save or in-flight save) — their next save wins.
        if (saveTimers.current[id] || saveStateRef.current[id] === 'saving') return;
        setPokemon(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
        setLocalData(prev => prev[id] ? { ...prev, [id]: { ...prev[id], ...updates } } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Filter ─────────────────────────────────────────────────────────────────
  // Space-separated tokens. A token prefixed with "-" is an exclusion: any
  // pokemon whose name, dex number, or game slug matches that term is dropped.
  // Bare tokens are inclusions (all must match, as before).
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return pokemon;
    const includes = [], excludes = [];
    for (const t of q.split(/\s+/)) {
      if (t.startsWith('-') && t.length > 1) excludes.push(t.slice(1));
      else if (t) includes.push(t);
    }
    const matches = (p, term) =>
      p.name.toLowerCase().includes(term)
      || String(p.national_dex_id).includes(term)
      || (p.game_slugs || []).some(s => s.toLowerCase().includes(term))
      || (p.restricted_game_slugs || []).some(s => s.toLowerCase().includes(term));
    return pokemon.filter(p =>
      includes.every(t => matches(p, t)) && !excludes.some(t => matches(p, t))
    );
  }, [pokemon, search]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Pokémon Game Manager" badge="mod" />

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-4">
        <div className="max-w-7xl mx-auto h-full flex flex-col">

          {/* Toolbar */}
          <div className="mb-4 flex items-center gap-3 flex-wrap">

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'rgba(255,255,255,0.3)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, dex #, or slug (prefix with - to exclude)"
                className="pl-9 pr-4 py-2 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none transition-colors"
                style={{ background: C.input, border: `1px solid ${C.border}`, width: 240 }}
                onFocus={e => e.target.style.borderColor = 'rgba(147,51,234,0.5)'}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>

            {/* Columns picker */}
            <ColumnsDropdown visible={visible} setVisible={setVisible} />

            {/* Reverse order */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm transition-colors"
              style={{ color: reversed ? '#c084fc' : 'rgba(255,255,255,0.4)' }}>
              <input type="checkbox" checked={reversed} onChange={e => setReversed(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-500" />
              Reverse order
            </label>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Clipboard chip */}
            {clipboard && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border"
                style={{ background: 'rgba(147,51,234,0.12)', borderColor: 'rgba(147,51,234,0.3)', color: '#c084fc' }}>
                <span>📋</span>
                <span>{clipboard.game_slugs.length ? `${clipboard.game_slugs.length} game${clipboard.game_slugs.length !== 1 ? 's' : ''}` : 'empty'}</span>
                <button type="button" onClick={() => setClipboard(null)}
                  className="ml-1 hover:text-white transition-colors">×</button>
              </div>
            )}

            {/* Selection count */}
            <div className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {selected.size > 0 && (
                <>
                  <span style={{ color: '#c084fc' }}>{selected.size} selected</span>
                  <button type="button" onClick={clearSelection}
                    className="ml-2 text-xs hover:text-white transition-colors" style={{ color: '#a855f7' }}>Clear</button>
                  <span className="mx-2 text-gray-700">·</span>
                </>
              )}
              <span>{filtered.length} / {pokemon.length}</span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto rounded-xl border" style={{ borderColor: C.border, background: C.card }}>

            {/* Column headers */}
            <div className="grid gap-3 px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap border-b sticky top-0 z-10 rounded-t-xl"
              style={{ gridTemplateColumns: grid, background: C.header, borderColor: C.border }}>
              <div className="flex items-center justify-center">
                <input type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onChange={() => selected.size === filtered.length ? clearSelection() : selectAll()}
                  className="w-4 h-4 rounded accent-purple-500" />
              </div>
              <div />
              <div>Pokémon</div>
              {visible.has('slugs') && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                  Game Slugs
                </div>
              )}
              {visible.has('slugs') && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  Restricted Slugs
                </div>
              )}
              {visible.has('shiny') && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                  Shiny
                </div>
              )}
              {visible.has('properties') && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-pink-400 inline-block" />
                  Properties
                </div>
              )}
              {visible.has('copy_paste') && <div />}
              <div />{/* spacer */}
              <div />
            </div>

            {/* Rows */}
            {loading ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <div className="w-6 h-6 border-2 border-gray-700 border-t-purple-500 rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Loading…</span>
              </div>
            ) : error ? (
              <div className="text-red-400 text-sm py-12 text-center">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-gray-600 text-sm py-12 text-center">No Pokémon found</div>
            ) : filtered.map((p, i) => {
              const data = localData[p.id] ?? {
                game_slugs: [], restricted_game_slugs: [], shiny_available: false, forms_count: 1,
                legendary: false, baby: false, ultra_beast: false, paradox: false,
                starter: false, fossil: false, regional_alt: false, pseudo_legendary: false, pla: false,
                family_id: null, evolves_from_id: null, rule_exemptions: [],
              };
              return (
                <PokemonRow
                  key={p.id}
                  p={p} i={i} data={data}
                  status={saveState[p.id] ?? 'idle'}
                  isSelected={selected.has(p.id)}
                  visible={visible} grid={grid}
                  toggleSelected={toggleSelected}
                  handleSlugChange={handleSlugChange}
                  handleShinyToggle={handleShinyToggle}
                  handleFormsCountChange={handleFormsCountChange}
                  handleCategoryToggle={handleCategoryToggle}
                  handleFamily={handleFamily}
                  handleEvolvesFrom={handleEvolvesFrom}
                  handleExemptions={handleExemptions}
                  rosterById={rosterById}
                  childrenOf={childrenOf}
                  familyOf={familyOf}
                  clipboard={clipboard}
                  setClipboard={setClipboard}
                  reversed={reversed}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonGameManager;
