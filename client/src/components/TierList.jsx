import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, pointerWithin, rectIntersection, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import ReconnectingPill from './ReconnectingPill';
import PokemonImage from './PokemonImage';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { TIER_CODES, TIER_COLORS, TIER_LABELS, TIER_SHORT } from '../constants/tierColors';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC } from '../constants/theme';

const CARD = { bg: GRADIENT.card, inner: GRADIENT.inset, border: BORDER.hairline };
const UNRANKED_COLOR = TEXT.faint;

// Two independent rankings of the SAME 24 board mons. Restricted is completely
// optional — it is never required, never gated behind Standard, and nothing on
// this page nags about it.
const MODES = [
  { id: 'standard', label: 'Standard' },
];

// Display order only — Sleeper at the top, Easy at the bottom, Unranked last.
// Sleeper is a normal tier (the proposal to make it an orthogonal flag,
// docs/TIER_LIST_PLAN.md Q4, was reversed by the owner on 2026-08-02).
const ROWS = [...TIER_CODES].reverse().concat('unranked');

const rowColor = (tierKey) => (tierKey === 'unranked' ? UNRANKED_COLOR : TIER_COLORS[tierKey]);

// Custom collision detection: prefer whatever the pointer is directly over so an
// empty tier lane is just as easy to hit as one already full of tiles; fall back
// to rectIntersection so a drag that ends just outside every droppable resolves.
const collisionDetectionStrategy = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

const emptyBuckets = () => ({ easy: [], medium: [], hard: [], super_hard: [], sleeper: [], unranked: [] });

const computeTiersFromBuckets = (buckets) => {
  const out = {};
  TIER_CODES.forEach(t => { (buckets[t] || []).forEach(id => { out[id] = t; }); });
  return out;
};

const sameTierMap = (a, b) => {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  return ak.every(k => a[k] === b[k]);
};

// Group a { pokemon_id: tier } map into tier rows, in pool order.
const groupByTier = (pool, tiers) => {
  const grouped = emptyBuckets();
  (pool || []).forEach(p => {
    const id = String(p.pokemon_id);
    const t = (tiers || {})[id];
    (grouped[t] ? grouped[t] : grouped.unranked).push(id);
  });
  return grouped;
};

// ── Loading skeleton: dimmed tier rows in the real tier colors ───────────────
const TierListSkeleton = () => (
  <div className="space-y-2">
    <div className="h-16 rounded-xl border animate-pulse" style={{ borderColor: CARD.border, background: CARD.bg }} />
    {ROWS.map(tierKey => (
      <div key={tierKey} className="rounded-xl overflow-hidden border flex animate-pulse" style={{ borderColor: CARD.border, background: CARD.bg }}>
        <div className="w-2 shrink-0" style={{ backgroundColor: rowColor(tierKey), opacity: 0.5 }} />
        <div className="w-12 h-12 m-2 shrink-0 rounded-lg" style={{ backgroundColor: rowColor(tierKey), opacity: 0.3 }} />
        <div className="flex-1 min-w-0 flex items-center gap-2 p-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-12 h-12 rounded-lg bg-white/5 shrink-0" />)}
        </div>
      </div>
    ))}
  </div>
);

const EmptyPool = () => (
  <div className="rounded-xl p-10 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
    <div className="text-3xl mb-2">🫙</div>
    <p className="text-gray-300 font-medium">No board Pokémon to rank yet this month.</p>
    <p className="text-gray-400 text-sm mt-1">Check back once this month's board pool is set.</p>
  </div>
);

const SignInBanner = () => (
  <Link
    to="/login"
    className="block rounded-xl p-4 text-center border transition-colors hover:bg-white/5"
    style={{ background: CARD.bg, borderColor: 'rgba(139,92,246,0.35)' }}
  >
    <p className="text-purple-300 text-sm">
      Sign in to rank this month's Pokémon and add your voice to the Community Consensus →
    </p>
  </Link>
);

// ── Draggable chip (Board view — editable) ──────────────────────────────────
const DraggableChip = ({ id, pokemon }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className="relative shrink-0 w-14 flex flex-col items-center gap-1 select-none cursor-grab active:cursor-grabbing touch-none"
    >
      <div
        className="w-12 h-12 rounded-lg overflow-hidden transition-opacity duration-150"
        style={{ background: CARD.inner, opacity: isDragging ? 0.35 : 1 }}
      >
        <PokemonImage pokemon={pokemon} className="w-full h-full pointer-events-none" disableCycling />
      </div>
      <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">{pokemon?.name}</span>
    </div>
  );
};

const ChipPreview = ({ pokemon }) => (
  <div className="w-14 flex flex-col items-center gap-1">
    <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: CARD.inner, transform: 'scale(1.05)', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' }}>
      <PokemonImage pokemon={pokemon} className="w-full h-full" disableCycling />
    </div>
    <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">{pokemon?.name}</span>
  </div>
);

// A static (non-drag) chip — used by the Consensus rows and by someone else's list.
const StaticChip = ({ pokemon }) => (
  <div className="relative shrink-0 w-14 flex flex-col items-center gap-1">
    <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
      <PokemonImage pokemon={pokemon} className="w-full h-full" disableCycling />
    </div>
    <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">{pokemon?.name}</span>
  </div>
);

// ── Read-only chip with a distribution popover (Community Consensus) ─────────
const ConsensusChip = ({ pokemon, entry, viewerTier }) => {
  const [open, setOpen] = useState(false);
  const dist = entry.distribution || {};
  const lines = TIER_CODES.filter(t => dist[t] > 0)
    .sort((a, b) => dist[b] - dist[a])
    .map(t => `${dist[t]} user${dist[t] === 1 ? '' : 's'}: ${TIER_LABELS[t]}`);
  return (
    <div
      className="relative shrink-0 w-14 flex flex-col items-center gap-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(o => !o)}
    >
      <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
        <PokemonImage pokemon={pokemon} className="w-full h-full" disableCycling />
      </div>
      {/* Your own pick, inline on the community's chip — the comparison is the
          reason to come back to this tab after submitting. */}
      {viewerTier && (
        <span
          className="absolute top-0 -left-1 w-3 h-3 rounded-full border"
          style={{ backgroundColor: TIER_COLORS[viewerTier], borderColor: '#0d0f14' }}
          title={`You said ${TIER_LABELS[viewerTier]}`}
        />
      )}
      <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">{pokemon?.name}</span>
      {open && (
        <div
          className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-20 rounded-lg px-2.5 py-1.5 text-[10px] text-white whitespace-nowrap shadow-xl border"
          style={{ background: CARD.inner, borderColor: CARD.border }}
        >
          {lines.length ? lines.join(' · ') : 'No votes yet'}
        </div>
      )}
    </div>
  );
};

// Tier lane. Contents WRAP — the old `overflow-x-auto` lane put a horizontal
// scroller inside a vertical drag surface, which is the single worst drag
// affordance on touch and hid 18 of 23 mons at 390px.
const TierRowShell = ({ tierKey, children, droppable = false }) => {
  const color = rowColor(tierKey);
  // Always called (rule of hooks) — outside a <DndContext> this hook is inert
  // (dnd-kit provides safe no-op defaults), so isOver stays false.
  const { setNodeRef, isOver } = useDroppable({ id: tierKey, disabled: !droppable });
  const active = droppable && isOver;
  return (
    <div
      ref={droppable ? setNodeRef : undefined}
      className="rounded-xl overflow-hidden border flex transition-colors min-w-0"
      style={{
        borderColor: active ? color : CARD.border,
        background: CARD.bg,
        boxShadow: active ? `0 0 0 2px ${color}66 inset` : 'none',
      }}
    >
      <div className="w-2 shrink-0" style={{ backgroundColor: color }} />
      <div className="flex flex-col items-center justify-center gap-1 py-2 px-1.5 shrink-0 w-[64px] sm:w-[76px]">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-extrabold text-base sm:text-lg" style={{ backgroundColor: color, color: '#0d0f14' }}>
          {tierKey === 'unranked' ? '?' : TIER_SHORT[tierKey]}
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-center leading-tight" style={{ color }}>
          {tierKey === 'unranked' ? 'Unranked' : TIER_LABELS[tierKey]}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-start content-start gap-1.5 p-2 min-h-[64px]">
        {children}
      </div>
    </div>
  );
};

// ── Quick Rank: tap-to-assign, a guided flow rather than a peer view ────────
// One mon at a time, full-width tier buttons, no drag and no horizontal scroll.
//
// This is a one-way task, not a second way of looking at your list: the board is
// the canonical rendering (it is what the consensus view, other hunters' lists
// and Month Stats all show), and Quick Rank exists to get 24 mons ranked fast.
//
// Entering and leaving both happen from ONE header slot that flips its label
// ("⚡ Quick Rank" ⇄ "← Board"). An exit inside the card was tried and removed:
// it duplicated the header control and moved the way out to a different place
// than the way in. `onExit` is still used by the completion CTA below, which is
// a different thing — finishing the task, not abandoning it.
//
// The label says "Board" and never just "Done", because on mobile (where this is
// the landing view) it is the only thing that tells you a drag board exists at
// all, and reordering WITHIN a tier is board-only.
const QuickRank = ({ pool, tierById, onAssign, onExit }) => {
  const [index, setIndex] = useState(0);
  const ids = useMemo(() => pool.map(p => String(p.pokemon_id)), [pool]);
  const byId = useMemo(() => Object.fromEntries(pool.map(p => [String(p.pokemon_id), p])), [pool]);

  // Land on the first unranked mon when the list loads or the mode flips.
  useEffect(() => {
    const first = ids.findIndex(id => !tierById[id]);
    setIndex(first === -1 ? 0 : first);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback((from) => {
    const next = ids.findIndex((id, i) => i > from && !tierById[id]);
    if (next !== -1) return setIndex(next);
    const anyLeft = ids.findIndex(id => !tierById[id]);
    setIndex(anyLeft === -1 ? Math.min(from + 1, ids.length - 1) : anyLeft);
  }, [ids, tierById]);

  const currentId = ids[index];
  const current = byId[currentId];
  const rankedCount = ids.filter(id => tierById[id]).length;
  const done = rankedCount === ids.length;

  if (!current) return null;

  return (
    <div className="rounded-xl border p-4 min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          onClick={() => setIndex(i => Math.max(0, i - 1))}
          disabled={index === 0}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 border disabled:opacity-30"
          style={{ borderColor: BORDER.edge, background: CARD.inner }}
        >
          ← Back
        </button>
        <span className="text-xs text-gray-400">{index + 1} of {ids.length}</span>
        <button
          onClick={() => advance(index)}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 border"
          style={{ borderColor: BORDER.edge, background: CARD.inner }}
        >
          Skip →
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="w-28 h-28 rounded-xl overflow-hidden" style={{ background: CARD.inner }}>
          <PokemonImage pokemon={current} className="w-full h-full" disableCycling />
        </div>
        <div className="text-base font-semibold text-white text-center">{current.name}</div>
        {tierById[currentId] && (
          <div className="text-[11px] font-medium" style={{ color: TIER_COLORS[tierById[currentId]] }}>
            Currently: {TIER_LABELS[tierById[currentId]]}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 min-w-0">
        {TIER_CODES.map(t => {
          const selected = tierById[currentId] === t;
          return (
            <button
              key={t}
              onClick={() => { onAssign(currentId, t); advance(index); }}
              className="min-w-0 px-2 py-3 rounded-lg text-sm font-bold transition-all"
              style={{
                background: selected ? TIER_COLORS[t] : 'rgba(255,255,255,0.04)',
                color: selected ? '#0d0f14' : TIER_COLORS[t],
                border: `1px solid ${TIER_COLORS[t]}${selected ? '' : '66'}`,
              }}
            >
              {TIER_LABELS[t]}
            </button>
          );
        })}
      </div>

      {done && (
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold" style={{ color: SEMANTIC.success.base }}>
            All {ids.length} ranked — your list counts toward the community consensus.
          </p>
          {/* Finishing is what earns the roster, so completion hands you
              straight to it. Ranking blind first is the whole reason the
              Community tab is a reward rather than the landing view. */}
          <button
            onClick={onExit}
            className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white border transition-colors"
            style={{ borderColor: BORDER.edge, background: CARD.inner }}
          >
            See everyone's lists <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ── Community: every submitted board for the active mode ────────────────────
// One card per hunter, each drawn with the same tier rows as your own list so a
// board means the same thing wherever you meet it. Complete lists sort first
// (the endpoint does that), and the viewer's own card is pinned to the top —
// seeing where you sit is the first thing anyone wants here.
const CommunityBoards = ({ roster, pool, mode }) => {
  const poolById = useMemo(
    () => Object.fromEntries((pool || []).map(p => [String(p.pokemon_id), p])),
    [pool],
  );
  const ordered = useMemo(() => {
    const mine = roster.filter(r => r.is_viewer);
    return [...mine, ...roster.filter(r => !r.is_viewer)];
  }, [roster]);

  // One board open at a time: two expanded boards already reintroduce the
  // scrolling this was meant to fix, and comparing beyond a pair is what the
  // collapsed strips are for. The viewer's own opens by default.
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    setExpanded(roster.find(r => r.is_viewer)?.user_id ?? null);
  }, [roster]);

  if (!ordered.length) {
    return (
      <div className="rounded-xl p-8 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-gray-300 font-medium">No {mode} lists yet this month.</p>
        <p className="text-gray-400 text-sm mt-1">Rank yours and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {ordered.map(sub => {
        const byTier = groupByTier(pool || [], sub.tiers || {});
        const open = expanded === sub.user_id;
        return (
          <div
            key={sub.user_id}
            className="rounded-xl border p-3 space-y-2 min-w-0 overflow-hidden"
            style={{
              background: CARD.bg,
              borderColor: sub.is_viewer ? ACCENT.strong : CARD.border,
            }}
          >
            {/* The whole header is the toggle — a hunter's name is the obvious
                thing to click to read their list. */}
            <button
              type="button"
              onClick={() => setExpanded(open ? null : sub.user_id)}
              aria-expanded={open}
              className="w-full flex items-center gap-2.5 min-w-0 text-left"
            >
              {sub.avatar_url
                ? <img src={sub.avatar_url} alt="" draggable="false" className="w-8 h-8 rounded-full shrink-0" />
                : <div className="w-8 h-8 rounded-full shrink-0" style={{ background: CARD.inner }} />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {sub.is_viewer ? 'Your list' : sub.display_name}
                </div>
                <div className="text-[11px] text-gray-400">
                  {sub.ranked} / {sub.pool_size} ranked{sub.complete ? ' · complete' : ' · in progress'}
                </div>
              </div>
              <span className="text-xs text-gray-400 shrink-0" aria-hidden="true">{open ? '▾' : '▸'}</span>
            </button>
            {/* Collapsed, a hunter is ONE line: all 24 mons in tier order, each
                tinted by the tier it was put in. Stacking full boards made the
                page unreadable past a few hunters, and collapsing to just a name
                would have meant you can only find someone you already knew to
                look for. The strip keeps the whole opinion legible at a glance —
                you can spot who ranked a mon Sleeper without opening anything.
                `unranked` is dropped either way: on a finished board it is always
                empty, and on a partial one the "n / 24" line already says so. */}
            {!open && (
              <div className="flex flex-wrap gap-1 min-w-0">
                {ROWS.filter(t => t !== 'unranked').flatMap(tierKey =>
                  byTier[tierKey].map(id => (
                    <div
                      key={id}
                      title={`${poolById[id]?.name} — ${TIER_LABELS[tierKey]}`}
                      className="w-7 h-7 rounded overflow-hidden shrink-0 border"
                      style={{ background: CARD.inner, borderColor: TIER_COLORS[tierKey] }}
                    >
                      <PokemonImage pokemon={poolById[id]} className="w-full h-full" disableCycling />
                    </div>
                  )),
                )}
              </div>
            )}

            {open && ROWS.filter(t => t !== 'unranked').map(tierKey => (
              <TierRowShell key={tierKey} tierKey={tierKey}>
                {byTier[tierKey].length === 0 && <span className="text-xs text-gray-400 italic px-2">—</span>}
                {byTier[tierKey].map(id => (
                  <StaticChip key={id} pokemon={poolById[id]} />
                ))}
              </TierRowShell>
            ))}
          </div>
        );
      })}
    </div>
  );
};

const TierList = () => {
  const { user } = useAuth();
  const [mode, setMode] = useState('standard');
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'quick' : 'board'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buckets, setBuckets] = useState(null);
  const [tab, setTab] = useState('mine');
  const [activeId, setActiveId] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null);
  // State, not a ref: `isDirty` is a useMemo, so the saved baseline has to be a
  // dependency it can see change — otherwise the bar reads "Unsaved" forever
  // after a successful autosave.
  const [lastSaved, setLastSaved] = useState({});
  // Viewing someone else's list happens IN PLACE on this page (null = your own).
  const [viewingUserId, setViewingUserId] = useState(null);
  const [otherList, setOtherList] = useState(null);
  const [roster, setRoster] = useState([]);
  const retryTimer = useRef(null);
  const retryAttempt = useRef(0);
  const saveTimer = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 120ms rather than 200ms: the lane no longer scrolls horizontally, so there
    // is no gesture to disambiguate from and the delay can be much shorter.
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const load = useCallback((forMode) => {
    api.getTierList(null, forMode)
      .then(fresh => {
        setData(fresh);
        setError(null);
        setLoading(false);
        retryAttempt.current = 0;
      })
      .catch(err => {
        if (err?.status === 404) { setError('not_found'); setLoading(false); return; }
        setError('reconnecting');
        const delay = Math.min(30000, 5000 * Math.pow(1.5, retryAttempt.current));
        retryAttempt.current += 1;
        retryTimer.current = setTimeout(() => load(forMode), delay);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setBuckets(null);
    setSaveState('idle');
    setSaveError(null);
    setViewingUserId(null);
    setOtherList(null);
    load(mode);
  }, [mode, load]);

  // Every submitted list for this mode, boards included — the Community tab
  // renders all of them from this one response rather than a request per
  // hunter. The count also feeds the tab's badge, so it is fetched on both tabs.
  useEffect(() => {
    let cancelled = false;
    setRoster([]);
    api.getTierListSubmissions(null, mode, true)
      .then(r => { if (!cancelled) setRoster(r.submissions || []); })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
  }, [mode, saveState]);

  // Seed local editable state whenever fresh data arrives.
  useEffect(() => {
    if (!data) return;
    const viewerTiers = data.viewer_submission?.tiers || {};
    setBuckets(groupByTier(data.pool, viewerTiers));
    setLastSaved({ ...viewerTiers });
    // Signed out there is no list of your own to edit, so the roster is the
    // whole page.
    setTab(t => (user ? t : 'community'));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load whoever the viewer selected. Rendered by the same tier rows as your
  // own list — it is the same page showing a different author, not a new screen.
  useEffect(() => {
    if (!viewingUserId) { setOtherList(null); return undefined; }
    let cancelled = false;
    setOtherList('loading');
    api.getUserTierList(viewingUserId, data?.month?.id || null, mode)
      .then(r => { if (!cancelled) setOtherList(r); })
      .catch(() => { if (!cancelled) setOtherList('error'); });
    return () => { cancelled = true; };
  }, [viewingUserId, mode, data?.month?.id]);

  const poolById = useMemo(() => {
    const map = {};
    (data?.pool || []).forEach(p => { map[String(p.pokemon_id)] = p; });
    return map;
  }, [data]);

  const tierById = useMemo(() => (buckets ? computeTiersFromBuckets(buckets) : {}), [buckets]);

  const isDirty = useMemo(() => {
    if (!buckets) return false;
    return !sameTierMap(tierById, lastSaved);
  }, [tierById, buckets, lastSaved]);

  const doSave = useCallback(async () => {
    if (!buckets || !data) return;
    // buckets already has order implicit in the array: { tier: [id, id, ...], ... }
    const tiers = buckets;
    setSaveState('saving');
    setSaveError(null);
    try {
      await api.saveTierList(data.month.id, tiers, mode);
      setLastSaved({ ...tiers });
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err) {
      setSaveState('error');
      setSaveError(err?.message || 'Failed to save');
    }
  }, [buckets, data, mode]);

  // Autosave replaces the old pulsing manual Save button: with tap-to-assign a
  // user makes 24 small edits, and any of them being silently unsaved is the
  // failure mode that matters. Debounced so a burst of taps is one request.
  useEffect(() => {
    if (!user || !isDirty || !data || viewingUserId) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDirty, tierById, user, data, viewingUserId, doSave]);

  const assign = (id, tier) => {
    setBuckets(prev => {
      if (!prev) return prev;
      const next = {};
      Object.keys(prev).forEach(k => { next[k] = prev[k].filter(x => x !== id); });
      next[tier] = [...next[tier], id];
      return next;
    });
  };

  const findContainer = (id) => {
    if (!buckets) return null;
    if (id in buckets) return id;
    return Object.keys(buckets).find(key => buckets[key].includes(id));
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to) return;

    // Reordering within the same tier
    if (from === to) {
      const fromIndex = buckets[from].indexOf(active.id);
      const toIndex = buckets[to].indexOf(over.id);
      if (fromIndex !== -1 && toIndex !== -1) {
        setBuckets(prev => ({
          ...prev,
          [from]: arrayMove(prev[from], fromIndex, toIndex),
        }));
      }
      return;
    }

    // Moving between tiers — add to end of target tier
    setBuckets(prev => ({
      ...prev,
      [from]: prev[from].filter(id => id !== active.id),
      [to]: [...prev[to], active.id],
    }));
  };

  const monthLabel = data?.month?.label || '';
  const poolSize = data?.pool?.length || 0;
  const rankedCount = buckets ? TIER_CODES.reduce((sum, t) => sum + buckets[t].length, 0) : 0;
  const progress = data?.viewer_progress || {};
  // Community Consensus stays locked for signed-in users until they've placed
  // every Pokemon in the pool. Logged-out visitors only ever see Consensus.
  const canViewConsensus = !user || (poolSize > 0 && rankedCount === poolSize);
  const schemaReady = data ? data.schema_ready !== false : true;
  const isViewingOther = Boolean(viewingUserId);

  const consensusByTier = useMemo(() => {
    const grouped = emptyBuckets();
    (data?.consensus || []).forEach(entry => {
      const key = entry.majority_tier && grouped[entry.majority_tier] ? entry.majority_tier : 'unranked';
      const pokemon = poolById[String(entry.pokemon_id)];
      if (pokemon) grouped[key].push({ pokemon, entry });
    });
    return grouped;
  }, [data, poolById]);

  const otherByTier = useMemo(() => {
    if (!otherList || otherList === 'loading' || otherList === 'error') return null;
    return groupByTier(otherList.pool, otherList.tiers);
  }, [otherList]);

  const saveLabel = {
    idle: isDirty ? 'Unsaved…' : (Object.keys(lastSaved).length ? 'Saved' : 'Not started'),
    saving: 'Saving…',
    saved: 'Saved',
    error: saveError || 'Save failed',
  }[saveState];
  const saveColor = saveState === 'error' ? SEMANTIC.danger.base : saveState === 'saved' ? SEMANTIC.success.base : TEXT.muted;

  const pct = poolSize ? Math.round((rankedCount / poolSize) * 100) : 0;
  const otherRoster = roster.filter(r => !r.is_viewer);

  return (
    <div className="min-h-screen" style={{ background: '#0d0f14' }}>
      <PageBackground />
      <PageHeader title="Community Tier List" subtitle={monthLabel} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4 min-w-0">
        <p className="text-xs text-gray-400">
          Rank this month's board Pokémon, then see how the whole community voted.
        </p>

        {error === 'reconnecting' && <div className="relative h-8"><ReconnectingPill label="Reconnecting to tier list..." /></div>}

        {error === 'not_found' ? (
          <div className="rounded-xl p-10 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
            <p className="text-gray-300 font-medium">No active month found.</p>
          </div>
        ) : loading ? (
          <TierListSkeleton />
        ) : !data ? null : poolSize === 0 ? (
          <EmptyPool />
        ) : (
          <>
            {!user && <SignInBanner />}

            <div
              className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2.5 border-b backdrop-blur min-w-0"
              style={{ background: 'rgba(13,15,20,0.92)', borderColor: CARD.border }}
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <div className="flex items-center gap-1 rounded-lg p-1 min-w-0" style={{ background: CARD.inner }}>
                {[
                  { id: 'mine', label: 'My List' },
                  { id: 'community', label: `Community${roster.length ? ` (${roster.length})` : ''}` },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold leading-5 transition-colors ${
                      tab === t.id ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
                {user && tab === 'mine' && (
                  <button
                    onClick={() => setView(v => (v === 'board' ? 'quick' : 'board'))}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold leading-5 text-gray-300 border transition-colors hover:text-white"
                    style={{ borderColor: BORDER.edge, background: CARD.inner }}
                  >
                    {view === 'board' ? (
                      <>
                        <span aria-hidden="true">⚡</span>
                        {/* Once every mon is placed the flow has nothing left to
                            offer, so it stops advertising itself as the next step. */}
                        {poolSize > 0 && rankedCount === poolSize ? 'Re-rank' : 'Quick Rank'}
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">←</span>
                        Board
                      </>
                    )}
                  </button>
                )}

                {user && (
                  <span className="text-[11px] shrink-0" style={{ color: saveColor }}>{saveLabel}</span>
                )}
              </div>

              {user && (
                <div className="mt-2 flex items-center gap-2 min-w-0">
                  <div className="flex-1 min-w-0 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, background: rankedCount === poolSize ? SEMANTIC.success.strong : ACCENT.strong }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{rankedCount} / {poolSize} ranked</span>
                </div>
              )}
              {user && rankedCount < poolSize && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Rank all {poolSize} for your list to count toward the community consensus.
                </p>
              )}
            </div>

            {/* Someone else's list — same rows, read-only, in place. */}
            {tab === 'mine' && isViewingOther && (
              otherList === 'loading' ? (
                <TierListSkeleton />
              ) : otherList === 'error' || !otherByTier ? (
                <div className="rounded-xl p-8 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
                  <p className="text-gray-300">That hunter hasn't ranked {mode === 'restricted' ? 'Restricted' : 'Standard'} this month.</p>
                  <button onClick={() => setViewingUserId(null)} className="mt-3 text-xs text-purple-300 underline">Back to my list</button>
                </div>
              ) : (
                <div className="space-y-2 min-w-0">
                  <div className="rounded-xl border p-3 flex items-center gap-3 min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
                    {otherList.user.avatar_url
                      ? <img src={otherList.user.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
                      : <div className="w-8 h-8 rounded-full shrink-0" style={{ background: CARD.inner }} />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{otherList.user.display_name}'s list</div>
                      <div className="text-[11px] text-gray-400">
                        {otherList.ranked} / {otherList.pool_size} ranked{otherList.complete ? ' · complete' : ' · in progress'}
                      </div>
                    </div>
                    {user && (
                      <button
                        onClick={() => setViewingUserId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-300 border shrink-0"
                        style={{ borderColor: BORDER.edge, background: CARD.inner }}
                      >
                        My list
                      </button>
                    )}
                  </div>
                  {ROWS.map(tierKey => (
                    <TierRowShell key={tierKey} tierKey={tierKey}>
                      {otherByTier[tierKey].length === 0 && <span className="text-xs text-gray-400 italic px-2">—</span>}
                      {otherByTier[tierKey].map(id => (
                        <StaticChip key={id} pokemon={poolById[id]} />
                      ))}
                    </TierRowShell>
                  ))}
                </div>
              )
            )}

            {!user && tab === 'mine' && (
              <div className="rounded-xl p-8 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
                <p className="text-gray-300 font-medium">Sign in to rank this month's board.</p>
                <p className="text-gray-400 text-sm mt-1">Community shows every list already submitted.</p>
              </div>
            )}

            {/* My list — Quick Rank (tap) or Board (drag) */}
            {user && tab === 'mine' && buckets && view === 'quick' && (
              <QuickRank pool={data.pool} tierById={tierById} onAssign={assign} onExit={() => setTab('community')} />
            )}

            {user && tab === 'mine' && buckets && view === 'board' && (
              <DndContext
                sensors={sensors}
                collisionDetection={collisionDetectionStrategy}
                onDragStart={({ active }) => setActiveId(active.id)}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-2 min-w-0">
                  {ROWS.map(tierKey => (
                    <SortableContext key={tierKey} id={tierKey} items={buckets[tierKey]} strategy={rectSortingStrategy}>
                      <TierRowShell tierKey={tierKey} droppable>
                        {buckets[tierKey].length === 0 && (
                          <span className="text-xs text-gray-400 italic px-2">
                            {tierKey === 'unranked' ? 'All ranked!' : 'Drag a Pokémon here'}
                          </span>
                        )}
                        {buckets[tierKey].map(id => (
                          <DraggableChip key={id} id={id} pokemon={poolById[id]} />
                        ))}
                      </TierRowShell>
                    </SortableContext>
                  ))}
                </div>
                <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
                  {activeId ? <ChipPreview pokemon={poolById[activeId]} /> : null}
                </DragOverlay>
              </DndContext>
            )}

            {/* Community Consensus (read-only) */}
            {tab === 'community' && (
              <CommunityBoards roster={roster} pool={data.pool} mode={mode} />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TierList;
