import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeaders } from '../services/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

// Profile → Badges tab. The case and the All Badges grid share one slot state
// so a badge can be dragged (mouse) or tapped-then-placed (touch) from the grid
// straight into a case slot.

const TOTAL_SLOTS = 8;
const LEADERBOARD_SLOTS = 3;
const DRAG_THRESHOLD = 5;

const CARD = {
  bg: '#1a1c23',
  inner: '#13151a',
  border: 'rgba(255,255,255,0.07)',
  borderSubtle: 'rgba(255,255,255,0.04)',
};
const GOLD = 'rgba(250,204,21,';
const VIOLET = 'rgba(14,163,176,';

// ── Slot transforms ───────────────────────────────────────────
// `from` is the badge's current slot index, or -1 when it isn't in the case.
// Already in the case → swap with whatever sits at `to`. New → replace it.
const placeBadge = (slots, badge, to, from) => {
  const next = [...slots];
  if (from === to) return next;
  if (from >= 0) [next[from], next[to]] = [next[to], next[from]];
  else next[to] = badge;
  return next;
};
const removeBadge = (slots, from) => slots.map((b, i) => (i === from ? null : b));

// Grid rows come as `ub` ({ badge_id, badges }); slots hold the badge object itself.
const toBadge = (ub) => ({ ...ub.badges, id: ub.badge_id });

// ── Shared hover tooltip (fixed so overflow-hidden parents can't clip it) ──
function useTip(ref) {
  const [pos, setPos] = useState(null);
  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.max(108, Math.min(r.left + r.width / 2, window.innerWidth - 108)), y: r.top });
  };
  return [pos, show, () => setPos(null)];
}

function Tip({ pos, children }) {
  if (!pos) return null;
  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y - 6,
        transform: 'translateX(-50%) translateY(-100%)', zIndex: 9999, maxWidth: 216,
        pointerEvents: 'none', backgroundColor: '#0d0e10', border: '1px solid rgba(255,255,255,0.08)',
      }}
      className="px-2.5 py-2 rounded-lg text-xs shadow-xl"
    >
      {children}
    </div>
  );
}

function BadgeTipBody({ badge, earnedAt }) {
  return (
    <>
      <div className="font-semibold text-white leading-tight">{badge.name}</div>
      {/* Earned badges show the description; unearned show only the hint. Never both. */}
      {badge.viewer_earned
        ? badge.description && <div className="text-gray-400 mt-0.5 leading-tight">{badge.description}</div>
        : badge.hint && <div className="text-yellow-400/80 mt-1 italic leading-tight">{badge.hint}</div>}
      {badge.earned_percent != null && (
        <div className="text-gray-500 mt-1 leading-tight">Earned by {badge.earned_percent}% of players</div>
      )}
      {earnedAt && (
        <div className="text-gray-600 mt-1 text-[10px]">
          {new Date(earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </>
  );
}

const EjectIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

// ── Case slot ─────────────────────────────────────────────────
function CaseSlot({ index, badge, interactive, dragActive, isTarget, isSource, isPreview, isHeld, armed,
  onPress, onKey, onRemove }) {
  const ref = useRef(null);
  const [tip, showTip, hideTip] = useTip(ref);
  const leaderboard = index < LEADERBOARD_SLOTS;

  const borderColor = isTarget ? `${VIOLET}0.9)`
    : isHeld ? `${VIOLET}0.9)`
    : isPreview ? `${VIOLET}0.6)`
    : (dragActive || armed) ? `${VIOLET}0.35)`
    : leaderboard ? `${GOLD}0.45)` : 'rgba(255,255,255,0.06)';

  return (
    <div
      ref={ref}
      data-drop={`slot-${index}`}
      className="relative group select-none"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
    >
      <div
        role={interactive || badge ? 'button' : undefined}
        tabIndex={interactive || badge ? 0 : undefined}
        aria-label={badge ? `Slot ${index + 1}: ${badge.name}` : `Slot ${index + 1}, empty`}
        onPointerDown={onPress}
        onKeyDown={onKey}
        className={[
          'w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden',
          'transition-[border-color,transform,box-shadow,background-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-lagoon-400/60',
          interactive ? (badge ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer') : badge ? 'cursor-pointer' : 'cursor-default',
          interactive && !dragActive ? 'hover:border-lagoon-400/60' : '',
          isTarget || isHeld ? 'scale-105' : '',
        ].join(' ')}
        style={{
          borderColor,
          borderStyle: (dragActive || armed) && !badge && !isTarget ? 'dashed' : 'solid',
          background: isTarget ? `${VIOLET}0.12)` : badge ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.025)',
          boxShadow: isTarget || isHeld ? `0 0 14px ${VIOLET}0.35)` : leaderboard && badge ? `inset 0 0 12px ${GOLD}0.08)` : undefined,
        }}
      >
        {badge ? (
          <img
            src={badge.image_url}
            alt={badge.name}
            draggable="false"
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full object-contain p-1.5 pointer-events-none"
            style={{ opacity: isSource ? 0.3 : 1, transition: 'opacity 0.15s' }}
          />
        ) : (
          <span className="text-xl leading-none" style={{ color: armed ? `${VIOLET}0.8)` : 'rgba(255,255,255,0.1)' }}>+</span>
        )}
      </div>

      {badge && interactive && !dragActive && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${badge.name} from slot ${index + 1}`}
          className={[
            'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-gray-400 hover:text-white hover:bg-red-600/80 text-xs',
            'flex items-center justify-center transition-opacity z-10 leading-none',
            isHeld ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          ].join(' ')}
          style={{ background: '#13151a', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          ×
        </button>
      )}

      {!dragActive && badge && <Tip pos={tip}><BadgeTipBody badge={badge} /></Tip>}
    </div>
  );
}

// ── All Badges cell ───────────────────────────────────────────
function GridCell({ ub, earned, isNew, onSeen, interactive, dragActive, isHeld, isSource, armed, onPress, onKey }) {
  const ref = useRef(null);
  const [tip, showTip, hideTip] = useTip(ref);

  const enter = () => { showTip(); if (isNew) onSeen?.(ub.badge_id); };

  return (
    <div
      ref={ref}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ub.badges?.name}
      onPointerDown={interactive ? onPress : undefined}
      onKeyDown={interactive ? onKey : undefined}
      onMouseEnter={enter}
      onMouseLeave={hideTip}
      className={[
        'relative aspect-square rounded-lg p-1 select-none outline-none focus-visible:ring-2 focus-visible:ring-lagoon-400/60',
        'transition-[border-color,box-shadow,transform,opacity] duration-150',
        interactive ? 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5' : '',
        isHeld ? 'scale-110' : '',
      ].join(' ')}
      style={{
        background: CARD.inner,
        border: isHeld ? `1px solid ${VIOLET}0.9)`
          : isNew ? `1px solid ${GOLD}0.7)`
          : armed && interactive ? `1px solid ${VIOLET}0.4)`
          : `1px solid ${CARD.borderSubtle}`,
        boxShadow: isHeld ? `0 0 12px ${VIOLET}0.45)`
          : isNew ? `0 0 10px 1px ${GOLD}0.55), inset 0 0 8px ${GOLD}0.25)` : undefined,
        opacity: isSource ? 0.35 : 1,
      }}
    >
      {ub.badges?.image_url
        ? <img src={ub.badges.image_url} alt={ub.badges.name} draggable="false" onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full object-contain pointer-events-none"
            style={earned ? undefined : { filter: 'brightness(0)', opacity: 0.55 }} />
        : <div className="w-full h-full rounded bg-gray-700/50" />}

      {!dragActive && ub.badges && <Tip pos={tip}><BadgeTipBody badge={ub.badges} earnedAt={ub.earned_at} /></Tip>}
    </div>
  );
}

// ── Badges tab ────────────────────────────────────────────────
export default function ProfileBadges({ userId, isOwnProfile, accentColor, playAnimation, onAnimationPlayed, markBadgeSeen, seenBadgeIds }) {
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [allBadges, setAllBadges] = useState(null); // null = not yet fetched
  const [allLoading, setAllLoading] = useState(false);

  const [slots, setSlots] = useState(Array(TOTAL_SLOTS).fill(null));
  const [saving, setSaving] = useState(false);
  const [viewingBadge, setViewingBadge] = useState(null);

  // Mouse drag: { badge, from, x, y, over } — over is a slot index, 'grid', or null.
  const [drag, setDrag] = useState(null);
  // Tap-to-place (touch + click): a picked-up badge, or an armed slot waiting for a badge.
  const [held, setHeld] = useState(null); // { kind: 'badge', badge, from } | { kind: 'slot', index }

  // Lid animation — first visit to the tab this session only.
  const [lidOpen, setLidOpen] = useState(false);
  const [slotsVisible, setSlotsVisible] = useState(!playAnimation);
  const [lidGone, setLidGone] = useState(!playAnimation);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const pressRef = useRef(null);

  useBodyScrollLock(!!viewingBadge);

  useEffect(() => {
    if (!playAnimation) return;
    const t1 = setTimeout(() => setLidOpen(true), 80);
    const t2 = setTimeout(() => { setSlotsVisible(true); onAnimationPlayed?.(); }, 620);
    const t3 = setTimeout(() => setLidGone(true), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [playAnimation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Earned badges + case slots. Auth headers let the API flag viewer_earned
  // (description vs hint in tooltips).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHeld(null);
    getAuthHeaders().then(headers => Promise.all([
      fetch(`/api/users/${userId}/badges`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`/api/users/${userId}/badge-slots`, { headers }).then(r => (r.ok ? r.json() : [])).catch(() => []),
    ])).then(([badges, slotRows]) => {
      if (cancelled) return;
      setEarnedBadges(Array.isArray(badges) ? badges : []);
      const arr = Array(TOTAL_SLOTS).fill(null);
      (Array.isArray(slotRows) ? slotRows : []).forEach(({ slot, badges: b }) => {
        if (slot >= 1 && slot <= TOTAL_SLOTS && b) arr[slot - 1] = b;
      });
      setSlots(arr);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => { setShowAll(false); setAllBadges(null); }, [userId]);

  // Lazy-fetch the full catalogue (silhouettes for unearned) on first "Show all".
  useEffect(() => {
    if (!showAll || allBadges !== null) return;
    setAllLoading(true);
    getAuthHeaders()
      .then(headers => Promise.all([
        fetch(`/api/badges?userId=${userId}`, { headers }).then(r => r.json()),
        fetch('/api/badge-families').then(r => r.json()),
      ]))
      .then(([badges, families]) => {
        const order = {};
        (families || []).forEach(f => { order[f.id] = f.display_order; });
        // Hide secret-unearned (API returns image_url: null for them).
        const visible = (Array.isArray(badges) ? badges : []).filter(b => b.is_earned || (!b.is_secret && b.image_url));
        visible.sort((a, b) => {
          const fa = a.family ? (order[a.family] ?? 999) : 1000;
          const fb = b.family ? (order[b.family] ?? 999) : 1000;
          if (fa !== fb) return fa - fb;
          return (a.family_order ?? 99) - (b.family_order ?? 99);
        });
        setAllBadges(visible.map(b => ({
          badge_id: b.id, earned_at: null, seen: true, is_earned: b.is_earned,
          badges: { ...b, viewer_earned: b.is_earned },
        })));
      })
      .catch(() => setAllBadges([]))
      .finally(() => setAllLoading(false));
  }, [showAll, allBadges, userId]);

  // Optimistic save; roll back if the server refuses.
  const commit = useCallback(async (next) => {
    const prev = slotsRef.current;
    if (next.every((b, i) => b?.id === prev[i]?.id)) return;
    setSlots(next);
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/users/${userId}/badge-slots`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          slots: next.map((b, i) => ({ slot: i + 1, badge_id: b?.id ?? null })).filter(s => s.badge_id),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error('Failed to save badge slots', e);
      setSlots(prev);
    } finally {
      setSaving(false);
    }
  }, [userId]);

  const slotOf = (badgeId) => slotsRef.current.findIndex(b => b?.id === badgeId);

  // ── Taps ──
  const tapGridBadge = (badge) => {
    const from = slotOf(badge.id);
    if (held?.kind === 'slot') {
      commit(placeBadge(slotsRef.current, badge, held.index, from));
      setHeld(null);
    } else if (held?.kind === 'badge' && held.badge.id === badge.id) {
      setHeld(null);
    } else {
      setHeld({ kind: 'badge', badge, from });
    }
  };

  const tapSlot = (index) => {
    const badge = slotsRef.current[index];
    if (!isOwnProfile) { if (badge) setViewingBadge(badge); return; }
    if (held?.kind === 'badge') {
      commit(placeBadge(slotsRef.current, held.badge, index, slotOf(held.badge.id)));
      setHeld(null);
    } else if (held?.kind === 'slot') {
      if (held.index !== index) commit(placeBadge(slotsRef.current, slotsRef.current[held.index], index, held.index));
      setHeld(null);
    } else if (badge) {
      setHeld({ kind: 'badge', badge, from: index });
    } else {
      setHeld({ kind: 'slot', index });
    }
  };

  // ── Pointer: mouse drags past a small threshold; anything else is a tap.
  // Touch never drags (it would fight page scroll) — touch uses tap-to-place.
  // `origin` is where the drag started: only a badge pulled out of the case
  // ('case') can be dropped on the grid to take it out.
  const press = (onTap, badge, origin) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'mouse') e.preventDefault(); // no text selection while dragging
    pressRef.current = { onTap, badge, origin, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, type: e.pointerType, dragging: false, over: null };
  };
  const keyTap = (onTap) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
  };

  useEffect(() => {
    const EDGE = 70;
    let raf = 0;
    const targetAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
      if (!el) return null;
      const v = el.getAttribute('data-drop');
      return v === 'grid' ? 'grid' : Number(v.slice(5));
    };
    const sync = (p) => {
      p.over = targetAt(p.x, p.y);
      setDrag({ badge: p.badge, from: slotOf(p.badge.id), origin: p.origin, x: p.x, y: p.y, over: p.over });
    };
    // Scroll the page while the badge is held near the top/bottom edge, so the
    // case stays reachable from anywhere in a long grid.
    const autoScroll = () => {
      const p = pressRef.current;
      if (!p?.dragging) { raf = 0; return; }
      const dy = p.y < EDGE ? -(EDGE - p.y) : p.y > window.innerHeight - EDGE ? p.y - (window.innerHeight - EDGE) : 0;
      if (dy) { window.scrollBy(0, Math.round(dy / 4)); sync(p); }
      raf = requestAnimationFrame(autoScroll);
    };
    const move = (e) => {
      const p = pressRef.current;
      if (!p || p.type === 'touch' || !p.badge) return;
      p.x = e.clientX; p.y = e.clientY;
      if (!p.dragging) {
        if (Math.hypot(p.x - p.x0, p.y - p.y0) < DRAG_THRESHOLD) return;
        p.dragging = true;
        setHeld(null);
        document.body.style.cursor = 'grabbing';
        if (!raf) raf = requestAnimationFrame(autoScroll);
      }
      sync(p);
    };
    const up = () => {
      const p = pressRef.current;
      pressRef.current = null;
      if (!p) return;
      if (!p.dragging) { p.onTap(); return; }
      document.body.style.cursor = '';
      setDrag(null);
      const from = slotOf(p.badge.id);
      if (typeof p.over === 'number') commit(placeBadge(slotsRef.current, p.badge, p.over, from));
      else if (p.over === 'grid' && p.origin === 'case' && from >= 0) commit(removeBadge(slotsRef.current, from));
    };
    const cancel = () => {
      pressRef.current = null;
      document.body.style.cursor = '';
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelAnimationFrame(raf);
    };
  }, [commit]);

  // Esc or a press outside the badge UI drops whatever is held.
  useEffect(() => {
    if (!held) return;
    const onKey = (e) => { if (e.key === 'Escape') setHeld(null); };
    const onDown = (e) => { if (!e.target.closest?.('[data-badge-ui]')) setHeld(null); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, [held]);

  // ── Derived view ──
  // While dragging over a slot (or the grid), render the case as it will be after the drop.
  const dragFrom = drag?.from ?? -1;
  const shown = !drag ? slots
    : typeof drag.over === 'number' ? placeBadge(slots, drag.badge, drag.over, dragFrom)
    : drag.over === 'grid' && drag.origin === 'case' && dragFrom >= 0 ? removeBadge(slots, dragFrom)
    : slots;

  const sorted = [...earnedBadges].sort((a, b) => {
    const ordA = a.badges?.badge_families?.display_order ?? 999;
    const ordB = b.badges?.badge_families?.display_order ?? 999;
    if (ordA !== ordB) return ordA - ordB;
    return (a.badges?.family_order ?? 99) - (b.badges?.family_order ?? 99);
  });
  const busy = showAll ? (allLoading && allBadges === null) : loading;
  const items = showAll ? (allBadges || []) : sorted;
  const removing = drag?.origin === 'case';
  const armed = held?.kind === 'slot';
  const heldBadgeId = held?.kind === 'badge' ? held.badge.id : null;

  return (
    <div data-badge-ui className="space-y-3">
      {/* ── Case ── */}
      <div>
        <div className="relative rounded-xl shadow-xl overflow-hidden border border-yellow-500/20" style={{ background: CARD.bg }}>
          {!lidGone && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', borderRadius: 'inherit',
                background: '#1e2028', border: `1px solid ${GOLD}0.25)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: lidOpen ? 'translateY(-110%)' : 'translateY(0)', opacity: lidOpen ? 0 : 1,
                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease 0.15s',
              }}
            >
              <div className="text-center select-none">
                <div className="text-yellow-400/50 text-2xl mb-1">◆</div>
                <div className="text-gray-500 text-xs font-semibold">Badge Case</div>
              </div>
            </div>
          )}

          <div className="h-1.5 bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500" />
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD.border }}>
            <span className="text-yellow-300 text-xs font-bold">◆ Badge Case ◆</span>
            {saving && <span className="text-gray-500 text-xs">Saving…</span>}
          </div>

          <div className="p-4" style={{ opacity: slotsVisible ? 1 : 0, transition: 'opacity 0.25s ease' }}>
            <div className="grid grid-cols-4 gap-2">
              {shown.map((badge, i) => (
                <CaseSlot
                  key={i}
                  index={i}
                  badge={badge}
                  interactive={isOwnProfile}
                  dragActive={!!drag}
                  isTarget={drag?.over === i}
                  isSource={!!drag && drag.over == null && dragFrom === i}
                  isPreview={!!drag && badge?.id !== slots[i]?.id}
                  isHeld={(held?.kind === 'badge' && held.from === i) || (held?.kind === 'slot' && held.index === i)}
                  armed={held?.kind === 'badge' || (armed && held.index === i)}
                  onPress={press(() => tapSlot(i), isOwnProfile ? slots[i] : null, 'case')}
                  onKey={keyTap(() => tapSlot(i))}
                  onRemove={() => { setHeld(null); commit(removeBadge(slotsRef.current, i)); }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── All badges ── */}
      <div
        data-drop="grid"
        className="relative min-w-0 rounded-xl border overflow-hidden"
        style={{ background: CARD.bg, borderColor: CARD.border }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: CARD.borderSubtle }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>All Badges</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{earnedBadges.length} earned</span>
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{
                color: showAll ? accentColor : 'rgba(255,255,255,0.5)',
                border: `1px solid ${showAll ? accentColor + '60' : CARD.border}`,
                backgroundColor: showAll ? accentColor + '14' : 'transparent',
              }}
            >
              {showAll ? 'Earned only' : 'Show all'}
            </button>
          </div>
        </div>

        {busy ? (
          <div className="p-6 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-gray-700 border-t-lagoon-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">
            {showAll ? 'No badges available' : 'No badges earned yet'}
          </div>
        ) : (
          <div className="p-3">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-2">
              {items.map(ub => {
                const earned = showAll ? ub.is_earned : true;
                const interactive = isOwnProfile && earned;
                const badge = interactive ? toBadge(ub) : null;
                return (
                  <GridCell
                    key={ub.badge_id}
                    ub={ub}
                    earned={earned}
                    isNew={!showAll && isOwnProfile && ub.seen === false && !seenBadgeIds.has(ub.badge_id)}
                    onSeen={markBadgeSeen}
                    interactive={interactive}
                    dragActive={!!drag}
                    isHeld={heldBadgeId === ub.badge_id}
                    isSource={drag?.badge.id === ub.badge_id}
                    armed={armed}
                    onPress={badge ? press(() => tapGridBadge(badge), badge, 'grid') : undefined}
                    onKey={badge ? keyTap(() => tapGridBadge(badge)) : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Dragging a badge out of the case: drop anywhere here to take it out */}
        {removing && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl pointer-events-none transition-colors"
            style={{
              background: drag.over === 'grid' ? 'rgba(239,68,68,0.16)' : 'rgba(13,14,16,0.55)',
              border: `2px dashed ${drag.over === 'grid' ? 'rgba(248,113,113,0.8)' : 'rgba(255,255,255,0.15)'}`,
              color: drag.over === 'grid' ? '#fca5a5' : 'rgba(255,255,255,0.45)',
            }}
          >
            <EjectIcon className="w-7 h-7" />
          </div>
        )}
      </div>

      {/* Drag ghost */}
      {drag && (
        <img
          src={drag.badge.image_url}
          alt=""
          className="fixed pointer-events-none object-contain"
          style={{
            left: drag.x, top: drag.y, width: 64, height: 64, zIndex: 9999,
            transform: `translate(-50%, -50%) scale(${drag.over != null ? 0.85 : 1.1}) rotate(-4deg)`,
            filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.6))',
            transition: 'transform 0.12s ease',
          }}
        />
      )}

      {/* Detail view — tapping a slot on someone else's case */}
      {viewingBadge && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 60 }}
          onClick={() => setViewingBadge(null)}
        >
          <div
            className="flex flex-col items-center rounded-2xl border shadow-2xl p-5 sm:p-8 gap-4"
            style={{ background: CARD.inner, borderColor: CARD.border, maxWidth: '320px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <img src={viewingBadge.image_url} alt={viewingBadge.name} draggable="false" onContextMenu={(e) => e.preventDefault()}
              className="object-contain" style={{ width: 160, height: 160 }} />
            <div className="text-center">
              <div className="text-white font-bold text-lg">{viewingBadge.name}</div>
              {viewingBadge.viewer_earned
                ? viewingBadge.description && <div className="text-gray-400 text-sm mt-1">{viewingBadge.description}</div>
                : viewingBadge.hint && <div className="text-yellow-400/80 text-xs mt-2 italic">{viewingBadge.hint}</div>}
              {viewingBadge.earned_percent != null && (
                <div className="text-gray-500 text-xs mt-2">Earned by {viewingBadge.earned_percent}% of players</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
