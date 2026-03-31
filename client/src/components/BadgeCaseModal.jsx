import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../services/api';
import BadgePickerModal from './BadgePickerModal';

const TOTAL_SLOTS = 8;
const LEADERBOARD_SLOTS = 3;

export default function BadgeCaseModal({ isOpen, onClose, userId, isOwnProfile }) {
  const [slots, setSlots] = useState(Array(TOTAL_SLOTS).fill(null));
  const [pickerSlot, setPickerSlot] = useState(null);
  const [viewingBadge, setViewingBadge] = useState(null);
  const [lidOpen, setLidOpen] = useState(false);
  const [slotsVisible, setSlotsVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setLidOpen(false);
      setSlotsVisible(false);
      return;
    }
    loadSlots();
    const lidTimer = setTimeout(() => setLidOpen(true), 80);
    const slotsTimer = setTimeout(() => setSlotsVisible(true), 620);
    return () => {
      clearTimeout(lidTimer);
      clearTimeout(slotsTimer);
    };
  }, [isOpen, userId]);

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

  if (!isOpen) return null;

  const slottedBadgeIds = new Set(slots.filter(Boolean).map(b => b.id));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={onClose}
      >
        {/* Card */}
        <div
          className="relative w-full rounded-2xl overflow-hidden border border-gray-600 shadow-2xl transition-all duration-300"
          style={{ backgroundColor: '#1a1c1f', maxWidth: 'min(860px, 92vw)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top accent strip */}
          <div className="h-1.5 bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500" />

          {/* Header — title centered, buttons absolutely right */}
          <div className="relative flex items-center justify-center px-5 py-3 border-b border-gray-700/60">
            <span className="text-yellow-300 text-xs font-bold tracking-widest uppercase">
              ◆ Badge Case ◆
            </span>
            {saving && (
              <span className="absolute left-5 text-gray-500 text-xs">Saving…</span>
            )}
            <div className="absolute right-0 top-0 flex items-stretch h-full">
              {/* Close button */}
              <button
                onClick={onClose}
                className="px-4 text-gray-500 hover:text-white text-lg leading-none transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Case body */}
          <div className="relative px-6 py-5" style={{ perspective: '700px' }}>

            {/* Lid — flips backward (away from viewer) to reveal slots */}
            <div
              style={{
                position: 'absolute',
                inset: '24px 24px 24px 24px',
                transformOrigin: 'top center',
                transform: lidOpen ? 'rotateX(95deg)' : 'rotateX(0deg)',
                transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                backfaceVisibility: 'hidden',
                zIndex: 10,
                pointerEvents: lidOpen ? 'none' : 'auto',
                borderRadius: '12px',
                background: 'linear-gradient(160deg, #2e3136 0%, #1a1c1f 100%)',
                border: '1px solid rgba(250, 204, 21, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div className="text-center">
                <div className="text-yellow-400/50 text-2xl mb-1">◆</div>
                <div className="text-gray-500 text-xs tracking-widest uppercase font-semibold">
                  Badge Case
                </div>
              </div>
            </div>

            {/* Slots — fade in after lid flips away */}
            <div
              style={{
                opacity: slotsVisible ? 1 : 0,
                transition: 'opacity 0.25s ease',
              }}
            >
              {/* Top row */}
              <div className="grid grid-cols-4 gap-5 mb-5">
                {slots.slice(0, 4).map((badge, i) => (
                  <SlotButton
                    key={i}
                    badge={badge}
                    slotNumber={i + 1}
                    isLeaderboard={i < LEADERBOARD_SLOTS}
                    isOwnProfile={isOwnProfile}
                    onClick={() => badge ? setViewingBadge(badge) : (isOwnProfile && setPickerSlot(i))}
                    onClear={(e) => handleClearSlot(i, e)}
                  />
                ))}
              </div>

              {/* Bottom row */}
              <div className="grid grid-cols-4 gap-5">
                {slots.slice(4).map((badge, i) => (
                  <SlotButton
                    key={i + 4}
                    badge={badge}
                    slotNumber={i + 5}
                    isLeaderboard={false}
                    isOwnProfile={isOwnProfile}
                    onClick={() => badge ? setViewingBadge(badge) : (isOwnProfile && setPickerSlot(i + 4))}
                    onClear={(e) => handleClearSlot(i + 4, e)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {viewingBadge && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 60 }}
          onClick={() => setViewingBadge(null)}
        >
          <div
            className="flex flex-col items-center rounded-2xl border border-gray-600 shadow-2xl p-8 gap-4"
            style={{ backgroundColor: '#1a1c1f', maxWidth: '320px', width: '100%' }}
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
            </div>
            {isOwnProfile && (
              <button
                onClick={() => {
                  const idx = slots.findIndex(b => b?.id === viewingBadge.id);
                  setViewingBadge(null);
                  if (idx !== -1) setPickerSlot(idx);
                }}
                className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
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

function SlotButton({ badge, slotNumber, isLeaderboard, isOwnProfile, onClick, onClear }) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={!badge && !isOwnProfile}
        title={badge ? badge.name : isOwnProfile ? `Assign slot ${slotNumber}` : `Slot ${slotNumber} empty`}
        style={{ width: '160px', height: '160px' }}
        className={[
          'rounded-2xl border-2',
          'flex items-center justify-center overflow-hidden transition-all duration-150',
          isLeaderboard ? 'border-yellow-500/50' : 'border-gray-700',
          badge || isOwnProfile
            ? 'cursor-pointer hover:border-purple-400 hover:bg-gray-700/40'
            : 'cursor-default',
          !badge ? 'bg-gray-800/50' : '',
        ].join(' ')}
      >
        {badge ? (
          <img
            src={badge.image_url}
            alt={badge.name}
            draggable="false"
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
      {badge && (
        <div className="mt-2 text-center">
          <div className="text-white text-xs font-medium truncate" style={{ maxWidth: '160px' }}>{badge.name}</div>
          {isLeaderboard && <div className="text-yellow-400/70 text-[10px]">◆ Leaderboard</div>}
        </div>
      )}
    </div>
  );
}
