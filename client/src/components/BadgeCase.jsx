import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders } from '../services/api';
import BadgePickerModal from './BadgePickerModal';

const TOTAL_SLOTS = 8;
const LEADERBOARD_SLOTS = 3;

const CARD_BG    = 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)';
const CARD_INNER = 'linear-gradient(160deg, #13151a 0%, #181a21 100%)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

// playAnimation — true only on the user's first visit to the Badges tab this session
export default function BadgeCase({ userId, isOwnProfile, playAnimation = false, onPlayed }) {
  const [slots, setSlots] = useState(Array(TOTAL_SLOTS).fill(null));
  const [pickerSlot, setPickerSlot] = useState(null);
  const [viewingBadge, setViewingBadge] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lidOpen, setLidOpen]           = useState(false);
  const [slotsVisible, setSlotsVisible] = useState(!playAnimation);
  const [lidGone, setLidGone]           = useState(!playAnimation);
  const [dragSlot, setDragSlot]         = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  useEffect(() => {
    if (userId) loadSlots();
  }, [userId]);

  useEffect(() => {
    if (!playAnimation) return;
    const t1 = setTimeout(() => setLidOpen(true), 80);
    const t2 = setTimeout(() => { setSlotsVisible(true); onPlayed?.(); }, 620);
    const t3 = setTimeout(() => setLidGone(true), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [playAnimation]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSlots = async () => {
    try {
      const res = await fetch(`/api/users/${userId}/badge-slots`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const arr = Array(TOTAL_SLOTS).fill(null);
      data.forEach(({ slot, badges }) => {
        if (slot >= 1 && slot <= TOTAL_SLOTS) arr[slot - 1] = badges;
      });
      setSlots(arr);
    } catch (e) {
      console.error('Failed to load badge slots', e);
    }
  };

  const saveSlots = useCallback(async (newSlots) => {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = newSlots
        .map((badge, i) => ({ slot: i + 1, badge_id: badge?.id ?? null }))
        .filter(s => s.badge_id);
      await fetch(`/api/users/${userId}/badge-slots`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ slots: payload }),
      });
    } catch (e) {
      console.error('Failed to save badge slots', e);
    } finally {
      setSaving(false);
    }
  }, [userId]);

  const compact = (arr) => {
    const filled = arr.filter(Boolean);
    return [...filled, ...Array(TOTAL_SLOTS - filled.length).fill(null)];
  };

  const handlePickBadge = (badge) => {
    if (pickerSlot === null) return;
    const newSlots = [...slots];
    const existingIdx = newSlots.findIndex(b => b?.id === badge.id);
    if (existingIdx !== -1) newSlots[existingIdx] = null;
    newSlots[pickerSlot] = badge;
    const compacted = compact(newSlots);
    setSlots(compacted);
    setPickerSlot(null);
    saveSlots(compacted);
  };

  const handleClearSlot = (slotIdx, e) => {
    e.stopPropagation();
    const newSlots = [...slots];
    newSlots[slotIdx] = null;
    const compacted = compact(newSlots);
    setSlots(compacted);
    saveSlots(compacted);
  };

  const handleDragStart = (slotIdx) => setDragSlot(slotIdx);
  const handleDragEnd   = () => { setDragSlot(null); setDragOverSlot(null); };
  const handleDragOver  = (e, slotIdx) => { e.preventDefault(); setDragOverSlot(slotIdx); };
  const handleDragLeave = () => setDragOverSlot(null);
  const handleDrop      = (e, toSlot) => {
    e.preventDefault();
    setDragSlot(null);
    setDragOverSlot(null);
    if (dragSlot === null || dragSlot === toSlot) return;
    const newSlots = [...slots];
    [newSlots[dragSlot], newSlots[toSlot]] = [newSlots[toSlot], newSlots[dragSlot]];
    setSlots(newSlots);
    saveSlots(newSlots);
  };

  const slottedBadgeIds = new Set(slots.filter(Boolean).map(b => b.id));

  return (
    <>
      <div className="relative rounded-xl shadow-xl overflow-hidden border border-yellow-500/20" style={{ background: CARD_BG }}>
        {/* Lid overlay — covers the full card, slides up and fades out */}
        {!lidGone && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              pointerEvents: 'none',
              borderRadius: 'inherit',
              background: 'linear-gradient(160deg, #1e2028 0%, #13151a 100%)',
              border: '1px solid rgba(250,204,21,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transformOrigin: 'top center',
              transform: lidOpen ? 'translateY(-110%)' : 'translateY(0)',
              opacity: lidOpen ? 0 : 1,
              transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease 0.15s',
            }}
          >
            <div className="text-center select-none">
              <div className="text-yellow-400/50 text-2xl mb-1">◆</div>
              <div className="text-gray-500 text-xs tracking-widest uppercase font-semibold">Badge Case</div>
            </div>
          </div>
        )}

        {/* Gold accent top */}
        <div className="h-1.5 bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500" />

        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
          <span className="text-yellow-300 text-xs font-bold tracking-widest uppercase">◆ Badge Case ◆</span>
          {saving && <span className="text-gray-500 text-xs">Saving…</span>}
        </div>

        {/* Case body */}
        <div className="relative p-4 space-y-2">

          {/* Slots — fade in after lid opens */}
          <div style={{ opacity: slotsVisible ? 1 : 0, transition: 'opacity 0.25s ease' }}>
            <div className="grid grid-cols-4 gap-2">
              {slots.slice(0, 4).map((badge, i) => (
                <SlotButton
                  key={i}
                  badge={badge}
                  slotNumber={i + 1}
                  isLeaderboard={i < LEADERBOARD_SLOTS}
                  isOwnProfile={isOwnProfile}
                  onClick={() => badge ? setViewingBadge(badge) : (isOwnProfile && setPickerSlot(i))}
                  onClear={(e) => handleClearSlot(i, e)}
                  isDragging={dragSlot === i}
                  isDragOver={dragOverSlot === i}
                  onDragStart={() => handleDragStart(i)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i)}
                />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {slots.slice(4).map((badge, i) => (
                <SlotButton
                  key={i + 4}
                  badge={badge}
                  slotNumber={i + 5}
                  isLeaderboard={false}
                  isOwnProfile={isOwnProfile}
                  onClick={() => badge ? setViewingBadge(badge) : (isOwnProfile && setPickerSlot(i + 4))}
                  onClear={(e) => handleClearSlot(i + 4, e)}
                  isDragging={dragSlot === i + 4}
                  isDragOver={dragOverSlot === i + 4}
                  onDragStart={() => handleDragStart(i + 4)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, i + 4)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, i + 4)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Badge detail view */}
      {viewingBadge && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 60 }}
          onClick={() => setViewingBadge(null)}
        >
          <div
            className="flex flex-col items-center rounded-2xl border shadow-2xl p-5 sm:p-8 gap-4"
            style={{ background: CARD_INNER, borderColor: CARD_BORDER, maxWidth: '320px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <img
              src={viewingBadge.image_url}
              alt={viewingBadge.name}
              draggable="false"
              className="object-contain"
              style={{ width: '160px', height: '160px' }}
            />
            <div className="text-center">
              <div className="text-white font-bold text-lg">{viewingBadge.name}</div>
              {viewingBadge.description && (
                <div className="text-gray-400 text-sm mt-1">{viewingBadge.description}</div>
              )}
              {viewingBadge.hint && (
                <div className="text-yellow-400/80 text-xs mt-2 italic">{viewingBadge.hint}</div>
              )}
              {viewingBadge.earned_percent != null && (
                <div className="text-gray-500 text-xs mt-2">Earned by {viewingBadge.earned_percent}% of players</div>
              )}
            </div>
            {isOwnProfile && (
              <button
                onClick={() => {
                  const idx = slots.findIndex(b => b?.id === viewingBadge.id);
                  setViewingBadge(null);
                  if (idx !== -1) setPickerSlot(idx);
                }}
                className="px-4 py-1.5 rounded-lg text-sm transition-colors text-gray-300 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${CARD_BORDER}` }}
              >
                Change slot
              </button>
            )}
          </div>
        </div>
      )}

      {pickerSlot !== null && (
        <BadgePickerModal
          slotNumber={pickerSlot + 1}
          slottedBadgeIds={slottedBadgeIds}
          currentSlotBadgeId={slots[pickerSlot]?.id ?? null}
          userId={userId}
          onSelect={handlePickBadge}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </>
  );
}

function SlotButton({ badge, slotNumber, isLeaderboard, isOwnProfile, onClick, onClear,
  isDragging, isDragOver, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }) {
  const btnRef = useRef(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  const handleMouseEnter = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setTooltipPos({
      x: Math.max(108, Math.min(rect.left + rect.width / 2, window.innerWidth - 108)),
      y: rect.top,
    });
  };

  const draggable = !!(badge && isOwnProfile);

  const borderColor = isDragOver
    ? 'rgba(168,85,247,0.7)'
    : isLeaderboard ? 'rgba(234,179,8,0.4)' : 'rgba(255,255,255,0.05)';

  return (
    <div
      className="relative group"
      ref={btnRef}
      draggable={draggable}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setTooltipPos(null)}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={isOwnProfile ? onDragOver : undefined}
      onDragLeave={isOwnProfile ? onDragLeave : undefined}
      onDrop={isOwnProfile ? onDrop : undefined}
      style={{ opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}
    >
      <button
        onClick={onClick}
        disabled={!isOwnProfile && !badge}
        className={[
          'w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all duration-150',
          (isOwnProfile || badge) ? 'cursor-pointer hover:border-purple-400/60' : 'cursor-default',
          isDragOver ? 'scale-105' : '',
        ].join(' ')}
        style={{
          background: badge ? 'transparent' : 'rgba(255,255,255,0.03)',
          borderColor,
          transition: 'border-color 0.15s, transform 0.15s',
        }}
      >
        {badge ? (
          <img src={badge.image_url} alt={badge.name} className="w-full h-full object-contain p-1.5" draggable="false" />
        ) : (
          <span className="text-white/10 text-xl select-none">+</span>
        )}
      </button>

      {badge && isOwnProfile && (
        <button
          onClick={onClear}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-gray-400 hover:text-white hover:bg-red-600/80 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 leading-none"
          style={{ background: '#13151a', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          ×
        </button>
      )}

      {tooltipPos && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y - 6,
            transform: 'translateX(-50%) translateY(-100%)',
            zIndex: 9999,
            maxWidth: 216,
            pointerEvents: 'none',
            backgroundColor: '#0d0e10',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          className="px-2.5 py-1.5 rounded-lg text-xs shadow-xl"
        >
          {badge ? (
            <>
              <div className="font-semibold text-white">{badge.name}</div>
              {badge.hint
                ? <div className="text-gray-400 mt-0.5">{badge.hint}</div>
                : <div className="text-gray-600 mt-0.5 italic">No hint available</div>
              }
            </>
          ) : (
            <div className="text-gray-500">
              {isOwnProfile ? `Click to assign slot ${slotNumber}` : `Slot ${slotNumber} — empty`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
