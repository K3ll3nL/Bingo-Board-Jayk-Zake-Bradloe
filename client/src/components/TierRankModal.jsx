import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DndContext, DragOverlay, useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PokemonImage from './PokemonImage';
import { TIER_CODES, TIER_COLORS, TIER_LABELS, TIER_SHORT, TIER_ORDER } from '../constants/tierColors';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC } from '../constants/theme';

const CARD = { bg: GRADIENT.card, inner: GRADIENT.inset, border: BORDER.hairline };
const UNRANKED_COLOR = TEXT.faint;
const ROWS = TIER_ORDER.concat('unranked');
const rowColor = (tierKey) => (tierKey === 'unranked' ? UNRANKED_COLOR : TIER_COLORS[tierKey]);

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

// Tier lane. Contents WRAP — the old `overflow-x-auto` lane put a horizontal
// scroller inside a vertical drag surface, which is the single worst drag
// affordance on touch and hid 18 of 23 mons at 390px.
const TierRowShell = ({ tierKey, children, droppable = false }) => {
  const color = rowColor(tierKey);
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
const QuickRank = ({ pool, tierById, onAssign, onExit }) => {
  const [index, setIndex] = useState(0);
  const ids = useMemo(() => pool.map(p => String(p.pokemon_id)), [pool]);
  const byId = useMemo(() => Object.fromEntries(pool.map(p => [String(p.pokemon_id), p])), [pool]);

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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 min-w-0">
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

// TierRankModal — full-screen overlay for editing your own list (Quick Rank
// tap-flow or the drag Board). Fully self-contained: nothing on the page
// behind it has to visually agree with anything in here.
const TierRankModal = ({
  pool, tierById, buckets, poolById, onAssign,
  handleDragEnd, activeId, setActiveId, sensors, collisionDetectionStrategy,
  view, setView, rankedCount, poolSize, saveLabel, saveColor, onClose,
}) => {
  const pct = poolSize ? Math.round((rankedCount / poolSize) * 100) : 0;
  const isComplete = poolSize > 0 && rankedCount === poolSize;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.95)' }}>
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b backdrop-blur" style={{ background: 'rgba(13,15,20,0.92)', borderColor: CARD.border }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white">Rank Your List</h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 border"
            style={{ borderColor: BORDER.edge, background: CARD.inner }}
          >
            ✕ Close
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button
            onClick={() => setView(v => (v === 'board' ? 'quick' : 'board'))}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold leading-5 text-gray-300 border transition-colors hover:text-white"
            style={{ borderColor: BORDER.edge, background: CARD.inner }}
          >
            {view === 'board' ? (
              <>
                <span aria-hidden="true">⚡</span> {isComplete ? 'Re-rank' : 'Quick Rank'}
              </>
            ) : (
              <>
                <span aria-hidden="true">←</span> Board
              </>
            )}
          </button>
          <span className="text-[11px] shrink-0" style={{ color: saveColor }}>{saveLabel}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: isComplete ? SEMANTIC.success.strong : ACCENT.strong }}
            />
          </div>
          <span className="text-[11px] text-gray-400 shrink-0">{rankedCount} / {poolSize} ranked</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {view === 'quick' ? (
          <QuickRank pool={pool} tierById={tierById} onAssign={onAssign} onExit={onClose} />
        ) : (
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
      </div>
    </div>
  );
};

export default TierRankModal;
