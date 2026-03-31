import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthHeaders } from '../services/api';
import BadgePickerModal from './BadgePickerModal';
import BadgeCaseModal from './BadgeCaseModal';

const TOTAL_SLOTS = 8;
const LEADERBOARD_SLOTS = 3;

export default function BadgeCase({ userId, isOwnProfile }) {
  const [slots, setSlots] = useState(Array(TOTAL_SLOTS).fill(null));
  const [pickerSlot, setPickerSlot] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) loadSlots();
  }, [userId]);

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

  const slottedBadgeIds = new Set(slots.filter(Boolean).map(b => b.id));

  return (
    <>
      <div className="rounded-xl shadow-xl border border-yellow-500/20 overflow-hidden" style={{ backgroundColor: '#35373b' }}>
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500" />

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between">
          <span className="text-yellow-300 text-xs font-bold tracking-widest uppercase">◆ Badge Case ◆</span>
          <div className="flex items-center gap-2">
            {saving && <span className="text-gray-500 text-xs">Saving…</span>}
            <button
              onClick={() => setModalOpen(true)}
              title="Expand badge case"
              className="text-gray-500 hover:text-yellow-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Slots */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {slots.slice(0, 4).map((badge, i) => (
              <SlotButton
                key={i}
                badge={badge}
                slotNumber={i + 1}
                isLeaderboard={i < LEADERBOARD_SLOTS}
                isOwnProfile={isOwnProfile}
                onClick={() => isOwnProfile && setPickerSlot(i)}
                onClear={(e) => handleClearSlot(i, e)}
              />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {slots.slice(4).map((badge, i) => (
              <SlotButton
                key={i + 4}
                badge={badge}
                slotNumber={i + 5}
                isLeaderboard={false}
                isOwnProfile={isOwnProfile}
                onClick={() => isOwnProfile && setPickerSlot(i + 4)}
                onClear={(e) => handleClearSlot(i + 4, e)}
              />
            ))}
          </div>
        </div>
      </div>

      <BadgeCaseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        isOwnProfile={isOwnProfile}
      />

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

function SlotButton({ badge, slotNumber, isLeaderboard, isOwnProfile, onClick, onClear }) {
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

  return (
    <div
      className="relative group"
      ref={btnRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <button
        onClick={onClick}
        disabled={!isOwnProfile}
        className={[
          'w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-all duration-150',
          isLeaderboard ? 'border-yellow-500/50' : 'border-gray-700',
          isOwnProfile
            ? 'cursor-pointer hover:border-purple-400 hover:bg-gray-700/40'
            : 'cursor-default',
          !badge ? 'bg-gray-800/50' : '',
        ].join(' ')}
      >
        {badge ? (
          <img
            src={badge.image_url}
            alt={badge.name}
            className="w-full h-full object-contain p-1.5"
          />
        ) : (
          <span className="text-gray-700 text-xl select-none">+</span>
        )}
      </button>

      {badge && isOwnProfile && (
        <button
          onClick={onClear}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 text-gray-400 hover:text-white hover:bg-red-600/80 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 leading-none"
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
