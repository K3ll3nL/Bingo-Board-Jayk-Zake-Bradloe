import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, pointerWithin, rectIntersection } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import ReconnectingPill from './ReconnectingPill';
import TierRoster from './TierRoster';
import TierCompareGrid from './TierCompareGrid';
import TierRankModal from './TierRankModal';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { TIER_CODES } from '../constants/tierColors';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC } from '../constants/theme';

const CARD = { bg: GRADIENT.card, inner: GRADIENT.inset, border: BORDER.hairline };

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

// Order-sensitive: a same-tier drag reorder must register as dirty, which a
// flat tier-map comparison can't see (position isn't part of that map).
const sameBuckets = (a, b) => {
  const keys = [...TIER_CODES, 'unranked'];
  return keys.every(k => {
    const av = a?.[k] || [];
    const bv = b?.[k] || [];
    return av.length === bv.length && av.every((id, i) => id === bv[i]);
  });
};

// Group a { pokemon_id: tier } map into tier rows. `tierOrder` (when present)
// supplies each tier's saved id sequence; any tiered id missing from it
// (a pre-bucket-format row, or a mon whose tier changed since) falls back to
// pool order, appended after the explicit ones.
const groupByTier = (pool, tiers, tierOrder) => {
  const grouped = emptyBuckets();
  const tiersMap = tiers || {};
  const orderMap = tierOrder || {};
  const poolIds = (pool || []).map(p => String(p.pokemon_id));
  const poolIdSet = new Set(poolIds);

  TIER_CODES.forEach(t => {
    const explicit = (orderMap[t] || []).map(String).filter(id => poolIdSet.has(id) && tiersMap[id] === t);
    const seen = new Set(explicit);
    poolIds.forEach(id => { if (tiersMap[id] === t && !seen.has(id)) explicit.push(id); });
    grouped[t] = explicit;
  });

  poolIds.forEach(id => { if (!TIER_CODES.includes(tiersMap[id])) grouped.unranked.push(id); });

  return grouped;
};

const TierListSkeleton = () => (
  <div className="space-y-2">
    <div className="h-16 rounded-xl border animate-pulse" style={{ borderColor: CARD.border, background: CARD.bg }} />
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-20 rounded-xl border animate-pulse" style={{ borderColor: CARD.border, background: CARD.bg }} />
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

// TierList — the Community page shell. Once you're signed in and fully
// ranked, the page is ALWAYS the roster + comparison grid; there's no
// separate "My List" tab whose layout has to be hand-matched against the
// comparison view. Editing your own list happens in TierRankModal, a
// full-screen overlay that owns its own layout entirely.
const TierList = () => {
  const { user } = useAuth();
  const mode = 'standard';
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'quick' : 'board'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buckets, setBuckets] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null);
  const [lastSavedBuckets, setLastSavedBuckets] = useState(emptyBuckets());
  // Community comparison state: null = no one selected, userId = comparing
  const [communityView, setCommunityView] = useState(null);
  const [roster, setRoster] = useState([]);
  const retryTimer = useRef(null);
  const retryAttempt = useRef(0);
  const saveTimer = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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
    load(mode);
  }, [load]);

  // Every submitted list for this mode, boards included — the roster/compare
  // grid renders all of them from this one response, tiers included, so no
  // per-hunter fetch is needed when comparing.
  useEffect(() => {
    let cancelled = false;
    setRoster([]);
    api.getTierListSubmissions(null, mode, true)
      .then(r => { if (!cancelled) setRoster(r.submissions || []); })
      .catch(() => { if (!cancelled) setRoster([]); });
    return () => { cancelled = true; };
  }, [saveState]);

  // Seed local editable state whenever fresh data arrives.
  useEffect(() => {
    if (!data) return;
    const viewerTiers = data.viewer_submission?.tiers || {};
    const viewerBuckets = data.viewer_submission?.tier_buckets || {};
    const grouped = groupByTier(data.pool, viewerTiers, viewerBuckets);
    setBuckets(grouped);
    setLastSavedBuckets(grouped);
  }, [data]);

  const poolById = useMemo(() => {
    const map = {};
    (data?.pool || []).forEach(p => { map[String(p.pokemon_id)] = p; });
    return map;
  }, [data]);

  const tierById = useMemo(() => (buckets ? computeTiersFromBuckets(buckets) : {}), [buckets]);

  const isDirty = useMemo(() => {
    if (!buckets) return false;
    return !sameBuckets(buckets, lastSavedBuckets);
  }, [buckets, lastSavedBuckets]);

  const doSave = useCallback(async () => {
    if (!buckets || !data) return;
    const tiers = buckets;
    setSaveState('saving');
    setSaveError(null);
    try {
      await api.saveTierList(data.month.id, tiers, mode);
      setLastSavedBuckets(tiers);
      setSaveState('saved');
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err) {
      setSaveState('error');
      setSaveError(err?.message || 'Failed to save');
    }
  }, [buckets, data]);

  // Autosave: with tap-to-assign a user makes 24 small edits, and any of them
  // being silently unsaved is the failure mode that matters. Debounced so a
  // burst of taps is one request.
  useEffect(() => {
    if (!user || !isDirty || !data) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { doSave(); }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDirty, buckets, user, data, doSave]);

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

    setBuckets(prev => ({
      ...prev,
      [from]: prev[from].filter(id => id !== active.id),
      [to]: [...prev[to], active.id],
    }));
  };

  const monthLabel = data?.month?.label || '';
  const poolSize = data?.pool?.length || 0;
  const rankedCount = buckets ? TIER_CODES.reduce((sum, t) => sum + buckets[t].length, 0) : 0;

  const hasSavedAnything = TIER_CODES.some(t => (lastSavedBuckets[t] || []).length > 0);
  const saveLabel = {
    idle: isDirty ? 'Unsaved…' : (hasSavedAnything ? 'Saved' : 'Not started'),
    saving: 'Saving…',
    saved: 'Saved',
    error: saveError || 'Save failed',
  }[saveState];
  const saveColor = saveState === 'error' ? SEMANTIC.danger.base : saveState === 'saved' ? SEMANTIC.success.base : TEXT.muted;

  const pct = poolSize ? Math.round((rankedCount / poolSize) * 100) : 0;
  const isComplete = poolSize > 0 && rankedCount === poolSize;

  return (
    <div className="min-h-screen" style={{ background: '#0d0f14' }}>
      <PageBackground />
      <PageHeader title="Community Tier List" subtitle={monthLabel} />

      <main className="px-4 sm:px-6 py-5 space-y-4 min-w-0">
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

            {user && (
              <div
                className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-b backdrop-blur min-w-0 flex items-center justify-between gap-4 flex-wrap"
                style={{ background: 'rgba(13,15,20,0.92)', borderColor: CARD.border }}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] shrink-0" style={{ color: saveColor }}>{saveLabel}</span>
                  <div className="mt-1.5 flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0 max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, background: isComplete ? SEMANTIC.success.strong : ACCENT.strong }}
                      />
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{rankedCount} / {poolSize} ranked</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold leading-5 text-white border transition-colors shrink-0"
                  style={{ borderColor: 'rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.15)' }}
                >
                  <span aria-hidden="true">⚡</span> {isComplete ? 'Edit My List' : 'Rank Now'}
                </button>
              </div>
            )}

            {!user ? null : !isComplete ? (
              <div className="rounded-xl p-8 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
                <p className="text-gray-300 font-medium">Rank all {poolSize} to unlock the Community comparison.</p>
                <p className="text-gray-400 text-sm mt-1">{rankedCount} / {poolSize} ranked so far.</p>
                <button
                  onClick={() => setEditModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white border transition-colors"
                  style={{ borderColor: 'rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.15)' }}
                >
                  Start Ranking
                </button>
              </div>
            ) : (
              <div className="lg:grid lg:grid-cols-[360px_1fr] gap-8 min-w-0 space-y-4 lg:space-y-0">
                <div className="lg:sticky lg:top-[140px] h-fit">
                  <TierRoster
                    roster={roster}
                    pool={data.pool}
                    viewerTiers={data.viewer_submission?.tiers || {}}
                    onCompare={setCommunityView}
                    viewingUserId={null}
                  />
                </div>
                <TierCompareGrid
                  viewerUser={user}
                  viewerTiers={data.viewer_submission?.tiers || {}}
                  viewerTierBuckets={data.viewer_submission?.tier_buckets || {}}
                  rankedCount={rankedCount}
                  poolSize={poolSize}
                  comparingUserId={communityView}
                  roster={roster}
                  pool={data.pool}
                />
              </div>
            )}

            {editModalOpen && buckets && (
              <TierRankModal
                pool={data.pool}
                tierById={tierById}
                buckets={buckets}
                poolById={poolById}
                onAssign={assign}
                handleDragEnd={handleDragEnd}
                activeId={activeId}
                setActiveId={setActiveId}
                sensors={sensors}
                collisionDetectionStrategy={collisionDetectionStrategy}
                view={view}
                setView={setView}
                rankedCount={rankedCount}
                poolSize={poolSize}
                saveLabel={saveLabel}
                saveColor={saveColor}
                onClose={() => setEditModalOpen(false)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TierList;
