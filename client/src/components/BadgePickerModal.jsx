import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../services/api';

export default function BadgePickerModal({
  slotNumber,
  slottedBadgeIds,
  currentSlotBadgeId,
  userId,
  onSelect,
  onClose,
}) {
  const [sortedBadges, setSortedBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const [badgesRes, familiesRes] = await Promise.all([
          fetch('/api/badges', { headers }),
          fetch('/api/badge-families'),
        ]);
        const [badgeData, familyData] = await Promise.all([
          badgesRes.json(),
          familiesRes.json(),
        ]);

        // Build family display_order lookup
        const familyOrder = {};
        (familyData || []).forEach(f => { familyOrder[f.id] = f.display_order; });

        // Filter: hide secret unearned (API returns image_url: null for them)
        const visible = (badgeData || []).filter(b => b.is_earned || !b.is_secret);

        // Sort: by family display_order, then family_order within family
        visible.sort((a, b) => {
          const aFam = a.family ? (familyOrder[a.family] ?? 999) : 1000;
          const bFam = b.family ? (familyOrder[b.family] ?? 999) : 1000;
          if (aFam !== bFam) return aFam - bFam;
          return (a.family_order ?? 0) - (b.family_order ?? 0);
        });

        setSortedBadges(visible);
      } catch (e) {
        console.error('Failed to load badges', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col rounded-2xl border border-gray-600 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#1a1c1f', maxWidth: '520px', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400 flex-shrink-0" />

        {/* Header */}
        <div className="relative flex items-center justify-center px-10 py-3 border-b border-gray-700/60 flex-shrink-0">
          <span className="text-white font-semibold text-sm">
            Pick badge for slot {slotNumber}
            {slotNumber <= 3 && (
              <span className="ml-2 text-yellow-400/80 text-xs font-normal">◆ Leaderboard</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="absolute right-4 text-gray-500 hover:text-white text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Badge grid — one contiguous flow, no family headers */}
        <div className="overflow-y-auto flex-1 p-5">
          {loading ? (
            <div className="text-gray-400 text-center py-10 text-sm">Loading badges…</div>
          ) : sortedBadges.length === 0 ? (
            <div className="text-gray-500 text-center py-10 text-sm">No badges available</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortedBadges.map(badge => (
                <BadgePickerItem
                  key={badge.id}
                  badge={badge}
                  isCurrentSlot={badge.id === currentSlotBadgeId}
                  isOtherSlot={slottedBadgeIds.has(badge.id) && badge.id !== currentSlotBadgeId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-700/60 flex-shrink-0">
          <p className="text-gray-600 text-xs text-center">
            Black silhouettes are not yet earned · Secret badges are hidden until unlocked
          </p>
        </div>
      </div>
    </div>
  );
}

function BadgePickerItem({ badge, isCurrentSlot, isOtherSlot, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const isEarned = badge.is_earned;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => isEarned && onSelect(badge)}
        disabled={!isEarned}
        className={[
          'w-14 h-14 rounded-lg border-2 p-1 transition-all duration-150 overflow-hidden',
          isEarned
            ? isCurrentSlot
              ? 'border-yellow-400 cursor-pointer'
              : isOtherSlot
              ? 'border-purple-400/60 cursor-pointer hover:border-purple-400'
              : 'border-gray-600 cursor-pointer hover:border-purple-400 hover:bg-gray-700/40'
            : 'border-gray-700/40 cursor-not-allowed',
        ].join(' ')}
        style={{ backgroundColor: isCurrentSlot ? 'rgba(250,204,21,0.08)' : '#35373b' }}
      >
        {badge.image_url ? (
          <img
            src={badge.image_url}
            alt={badge.name}
            className="w-full h-full object-contain"
            // Unearned = true black silhouette (classic Pokemon style)
            style={!isEarned ? { filter: 'brightness(0)' } : undefined}
          />
        ) : (
          <span className="text-gray-600 text-lg flex items-center justify-center w-full h-full">?</span>
        )}

        {isCurrentSlot && (
          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-yellow-400 flex items-center justify-center pointer-events-none">
            <span className="text-black text-[8px] font-bold leading-none">✓</span>
          </div>
        )}
        {isOtherSlot && (
          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-purple-400 flex items-center justify-center pointer-events-none">
            <span className="text-white text-[8px] font-bold leading-none">↕</span>
          </div>
        )}
      </button>

      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-lg text-xs text-white whitespace-nowrap pointer-events-none z-10 shadow-xl"
          style={{ backgroundColor: '#0d0e10', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {isEarned ? badge.name : badge.is_secret ? '???' : badge.name}
          {!isEarned && <span className="text-gray-500 ml-1">— not earned</span>}
        </div>
      )}
    </div>
  );
}
