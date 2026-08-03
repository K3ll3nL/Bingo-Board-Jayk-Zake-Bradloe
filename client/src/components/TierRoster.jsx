import React, { useState, useMemo } from 'react';
import PokemonImage from './PokemonImage';
import { TIER_CODES, TIER_COLORS, TIER_LABELS, TIER_ORDER } from '../constants/tierColors';
import { GRADIENT, BORDER, TEXT, SEMANTIC } from '../constants/theme';

const CARD = { bg: GRADIENT.card, inner: GRADIENT.inset, border: BORDER.hairline };

// Tier-distribution bar: horizontal stacked bar showing count breakdown per tier.
// Fixed width (160px) — each segment's width = (count / total) * 160px.
const DistributionBar = ({ tiers, poolIds }) => {
  const counts = {};
  TIER_CODES.forEach(t => { counts[t] = 0; });
  (poolIds || []).forEach(id => {
    const tier = tiers[String(id)];
    if (tier && tier in counts) counts[tier] += 1;
  });
  const total = poolIds?.length || 1;
  return (
    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-white/10 w-40">
      {TIER_ORDER.map(tierKey => {
        const count = counts[tierKey];
        const pct = (count / total) * 100;
        return pct > 0 ? (
          <div
            key={tierKey}
            style={{
              width: `${pct}%`,
              backgroundColor: TIER_COLORS[tierKey],
            }}
            title={`${count} ${TIER_LABELS[tierKey]}`}
          />
        ) : null;
      })}
    </div>
  );
};

// Tier rows — reused from the old expanded view (TierRowShell + StaticChip pattern).
// Shows the full placement for a selected hunter.
const ExpandedTierRows = ({ byTier, poolById }) => {
  return (
    <div className="space-y-2 mt-2">
      {TIER_ORDER.map(tierKey => (
        <div key={tierKey} className="rounded-xl overflow-hidden border flex transition-colors min-w-0"
          style={{ borderColor: CARD.border, background: CARD.bg }}>
          <div className="w-2 shrink-0" style={{ backgroundColor: TIER_COLORS[tierKey] }} />
          <div className="flex flex-col items-center justify-center gap-1 py-2 px-1.5 shrink-0 w-16 sm:w-20">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-extrabold text-base sm:text-lg"
              style={{ backgroundColor: TIER_COLORS[tierKey], color: '#0d0f14' }}>
              {tierKey === 'unranked' ? '?' : tierKey[0].toUpperCase()}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-center leading-tight"
              style={{ color: TIER_COLORS[tierKey] }}>
              {TIER_LABELS[tierKey]}
            </span>
          </div>
          <div className="flex-1 min-w-0 flex flex-wrap items-start content-start gap-1.5 p-2 min-h-[64px]">
            {byTier[tierKey]?.length === 0 && <span className="text-xs text-gray-400 italic px-2">—</span>}
            {byTier[tierKey]?.map(id => (
              <div key={id} className="relative shrink-0 w-14 flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
                  <PokemonImage pokemon={poolById[id]} className="w-full h-full" disableCycling />
                </div>
                <span className="text-[10px] text-gray-300 truncate w-full text-center leading-tight">
                  {poolById[id]?.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Same definition as TierCompareGrid's agreementPct: of the Pokémon both
// sides have actually ranked, what share landed in the same tier. Duplicated
// rather than imported because the two components compute it over different
// shapes (one hunter here vs. the single comparingUser there) and neither
// needs the other's rendering.
const matchPct = (pool, tiersA, tiersB) => {
  const both = (pool || []).filter(p => tiersA[String(p.pokemon_id)] && tiersB[String(p.pokemon_id)]);
  if (!both.length) return null;
  const same = both.filter(p => tiersA[String(p.pokemon_id)] === tiersB[String(p.pokemon_id)]);
  return Math.round((same.length / both.length) * 100);
};

// TierRoster — scannable list of hunters with tier-distribution bars and compare CTAs.
const TierRoster = ({ roster, pool, viewerTiers, onCompare, viewingUserId, onViewingChange }) => {
  const poolById = useMemo(
    () => Object.fromEntries((pool || []).map(p => [String(p.pokemon_id), p])),
    [pool]
  );

  // Separate viewer's row, complete lists first, then by rank count
  const ordered = useMemo(() => {
    const mine = roster.filter(r => r.is_viewer);
    const others = roster.filter(r => !r.is_viewer)
      .sort((a, b) => (b.complete - a.complete) || (b.ranked - a.ranked));
    return [...mine, ...others];
  }, [roster]);

  const groupByTier = (tiers) => {
    const grouped = Object.fromEntries(TIER_CODES.map(t => [t, []]));
    grouped.unranked = [];
    (pool || []).forEach(p => {
      const id = String(p.pokemon_id);
      const tier = tiers[id];
      if (tier) (grouped[tier] = grouped[tier] || []).push(id);
      else grouped.unranked.push(id);
    });
    return grouped;
  };

  if (!ordered.length) {
    return (
      <div className="rounded-xl p-8 border text-center" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-gray-300 font-medium">No lists yet this month.</p>
        <p className="text-gray-400 text-sm mt-1">Rank yours and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ordered.map(sub => {
        const byTier = groupByTier(sub.tiers || {});
        const pct = sub.is_viewer ? null : matchPct(pool, viewerTiers || {}, sub.tiers || {});

        return (
          <div
            key={sub.user_id}
            className="rounded-xl border overflow-hidden p-3 space-y-2"
            style={{ background: CARD.bg, borderColor: CARD.border }}
          >
            {/* Header: avatar, name, stats, compare button */}
            <div className="flex items-center gap-3 min-w-0">
              {sub.avatar_url
                ? <img src={sub.avatar_url} alt="" draggable="false" className="w-8 h-8 rounded-full shrink-0" />
                : <div className="w-8 h-8 rounded-full shrink-0" style={{ background: CARD.inner }} />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {sub.is_viewer ? 'Your list' : sub.display_name}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {sub.ranked} / {sub.pool_size} ranked
                </div>
              </div>
              {!sub.is_viewer && (
                <div className="flex items-center gap-2 shrink-0">
                  {pct !== null && (
                    <div className="text-center leading-none" title="Tier agreement with your list">
                      <div className="text-sm font-bold tabular-nums" style={{ color: SEMANTIC.success.base }}>{pct}%</div>
                      <div className="text-[9px] text-gray-400 mt-0.5">match</div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onCompare(sub.user_id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white border shrink-0"
                    style={{ borderColor: BORDER.edge, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                  >
                    Compare
                  </button>
                </div>
              )}
            </div>

            {/* Tier distribution bar */}
            <div>
              <DistributionBar tiers={sub.tiers || {}} poolIds={(pool || []).map(p => String(p.pokemon_id))} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TierRoster;
