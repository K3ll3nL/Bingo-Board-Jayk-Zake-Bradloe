import React, { useMemo } from 'react';
import PokemonImage from './PokemonImage';
import { TIER_COLORS, TIER_LABELS, TIER_ORDER } from '../constants/tierColors';
import { GRADIENT, BORDER, SEMANTIC } from '../constants/theme';

const CARD = { bg: GRADIENT.card, inner: GRADIENT.inset, border: BORDER.hairline };

const groupByTier = (pool, tiers) => {
  const grouped = {};
  TIER_ORDER.forEach(t => { grouped[t] = []; });
  (pool || []).forEach(p => {
    const id = String(p.pokemon_id);
    const tier = tiers[id];
    if (tier && tier in grouped) grouped[tier].push(id);
  });
  return grouped;
};

// One tier row, used for BOTH the viewer's column and the comparing hunter's
// column — a single renderer is what keeps the two sides structurally
// identical. When `compareAgainst` (an id -> tier map for the OTHER side) is
// passed, each card gets a chevron showing how this row's tier differs from
// that other side's placement for the same Pokémon.
const TierRow = ({ tierKey, ids, poolById, compareAgainst }) => {
  const tierColor = TIER_COLORS[tierKey];
  const tierIdx = TIER_ORDER.indexOf(tierKey);

  return (
    <div className="rounded-xl overflow-hidden border flex transition-colors min-w-0"
      style={{ borderColor: CARD.border, background: CARD.bg }}>
      <div className="w-2 shrink-0" style={{ backgroundColor: tierColor }} />
      <div className="flex flex-col items-center justify-center gap-1 py-3 px-2 shrink-0 w-20">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center font-extrabold text-lg"
          style={{ backgroundColor: tierColor, color: '#0d0f14' }}>
          {TIER_LABELS[tierKey][0]}
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-center leading-tight"
          style={{ color: tierColor }}>
          {TIER_LABELS[tierKey]}
        </span>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap items-start content-start gap-2 p-3 min-h-[80px]">
        {ids.length === 0 && <span className="text-xs text-gray-400 italic px-2">—</span>}
        {ids.map(id => {
          let chevronDir = null;
          let chevronColor = null;
          const otherTier = compareAgainst?.[id];
          if (otherTier) {
            const otherIdx = TIER_ORDER.indexOf(otherTier);
            if (tierIdx < otherIdx) {
              // This side ranked it harder/more sleeper than the other side.
              chevronDir = 'up';
              chevronColor = SEMANTIC.danger.base;
            } else if (tierIdx > otherIdx) {
              chevronDir = 'down';
              chevronColor = SEMANTIC.success.base;
            }
          }

          return (
            <div key={id} className="relative shrink-0 w-16 flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
                <PokemonImage pokemon={poolById[id]} className="w-full h-full" disableCycling />
              </div>
              {chevronDir && (
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path
                      d={chevronDir === 'up' ? 'M2.5 8L6 4.2L9.5 8' : 'M2.5 4L6 7.8L9.5 4'}
                      stroke={chevronColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
              <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">
                {poolById[id]?.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// TierCompareGrid — the whole comparison view. Always shows your rankings on
// the left; the right side is either a hunter picked from TierRoster or a
// prompt to pick one. One grid owns both the header and the tier rows, so
// the two sides are structurally guaranteed to line up — there is no second
// hand-written copy of this layout anywhere else in the codebase.
const TierCompareGrid = ({ viewerUser, viewerTiers, rankedCount, poolSize, comparingUserId, roster, pool }) => {
  const poolById = useMemo(
    () => Object.fromEntries((pool || []).map(p => [String(p.pokemon_id), p])),
    [pool]
  );
  const viewerByTier = useMemo(() => groupByTier(pool, viewerTiers), [pool, viewerTiers]);

  const comparingUser = comparingUserId ? roster.find(r => r.user_id === comparingUserId) : null;
  const otherTiers = comparingUser?.tiers || {};
  const otherByTier = useMemo(() => groupByTier(pool, otherTiers), [pool, otherTiers]);

  const agreementPct = useMemo(() => {
    if (!comparingUser) return 0;
    const both = (pool || []).filter(p => viewerTiers[String(p.pokemon_id)] && otherTiers[String(p.pokemon_id)]);
    const same = both.filter(p => viewerTiers[String(p.pokemon_id)] === otherTiers[String(p.pokemon_id)]);
    return both.length > 0 ? Math.round((same.length / both.length) * 100) : 0;
  }, [comparingUser, pool, viewerTiers, otherTiers]);

  return (
    <div className="min-w-0">
      {/* Unified header — one grid, two cells. Can't drift apart because
          it's the same element tree regardless of comparison state. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 min-w-0">
        <div className="flex items-center gap-4 min-w-0">
          {comparingUser && (
            <div className="text-center shrink-0">
              <div className="text-2xl font-bold" style={{ color: SEMANTIC.success.base }}>{agreementPct}%</div>
              <div className="text-xs text-gray-400 mt-1">match</div>
            </div>
          )}
          <div className="flex items-center gap-3 min-w-0">
            {viewerUser?.avatar_url
              ? <img src={viewerUser.avatar_url} alt="" className="w-10 h-10 rounded-full shrink-0" />
              : <div className="w-10 h-10 rounded-full shrink-0" style={{ background: CARD.inner }} />}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Your list</div>
              <div className="text-xs text-gray-400">{rankedCount} / {poolSize} ranked</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {comparingUser ? (
            <>
              {comparingUser.avatar_url
                ? <img src={comparingUser.avatar_url} alt="" className="w-10 h-10 rounded-full shrink-0" />
                : <div className="w-10 h-10 rounded-full shrink-0" style={{ background: CARD.inner }} />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">{comparingUser.display_name}</div>
                <div className="text-xs text-gray-400">{comparingUser.ranked} ranked</div>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-400">Select a hunter from the roster to compare →</div>
          )}
        </div>
      </div>

      {/* Two-column tier grid — same TierRow renderer on both sides */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 min-w-0">
        <div className="space-y-2 min-w-0">
          {TIER_ORDER.map(tierKey => (
            <TierRow key={tierKey} tierKey={tierKey} ids={viewerByTier[tierKey]} poolById={poolById} />
          ))}
        </div>
        <div className="space-y-2 min-w-0">
          {comparingUser ? (
            TIER_ORDER.map(tierKey => (
              <TierRow
                key={tierKey}
                tierKey={tierKey}
                ids={otherByTier[tierKey]}
                poolById={poolById}
                compareAgainst={viewerTiers}
              />
            ))
          ) : (
            <div className="rounded-xl border p-8 text-center flex flex-col items-center justify-center h-full min-h-[200px]"
              style={{ background: CARD.bg, borderColor: CARD.border }}>
              <div className="text-4xl mb-3">🎯</div>
              <p className="text-gray-300 font-medium">Pick a hunter to compare</p>
              <p className="text-gray-400 text-sm mt-1">See how your rankings stack up</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TierCompareGrid;
