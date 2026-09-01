import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import ReconnectingPill from './ReconnectingPill';
import AchievementIcon from './AchievementIcon';
import StatIcon from './StatIcons';
import PokemonImage from './PokemonImage';
import { api } from '../services/api';
import { TIER_COLORS, TIER_LABELS, TIER_SHORT } from '../constants/tierColors';
import { SURFACE, GRADIENT, BORDER, ACCENT as ACCENT_TOKEN, SEMANTIC, BRAND } from '../constants/theme';

// ── Tokens ───────────────────────────────────────────────────────────────────
// Every colour here comes from docs/DESIGN_TOKENS.md via constants/theme.js.
// The rule that matters on this page: a `base` value is TEXT/ICON, a `strong`
// value is a FILL. Reversing them is what made the old palette fail contrast
// (#8b5cf6 as text was 3.80:1, #ef4444 as text was 4.27:1).
const CARD = {
  bg: GRADIENT.card,
  inner: GRADIENT.inset,
  border: BORDER.hairline,
  // Row dividers used to be a second, fainter alpha. Three border weights cover
  // the whole app; a card edge and a row rule are the same weight.
  borderSubtle: BORDER.hairline,
};
const ACCENT = ACCENT_TOKEN.base;         // accent text, icons, links
const ACCENT_FILL = ACCENT_TOKEN.strong;  // accent bars, dots, selected chips
// Gold's only remaining job on this page is the Total Shinies figure + bar in
// StatTile. Watch Out! used to be gold too, but every achievement icon in the
// product (AchievementIcon's default fill, the Leaderboard's per-user icons) is
// violet, so an achievement race rendered in gold was the one place on the site
// where that concept changed colour.
const WARN = SEMANTIC.warn.base;          // gold text/icons
const ACCENT_RGB = '167,139,250';         // accent, for tints only
const SUCCESS = SEMANTIC.success.base;
const DANGER = SEMANTIC.danger.base;
const RESTRICTED = BRAND.restricted;      // background only — 1.5:1

// ── Type + box primitives ────────────────────────────────────────────────────
// Two label levels and nothing else. The page used to set uppercase type seven
// different ways, and one of them (StatTile's label) was typographically
// identical to a section title — so "TOTAL SHINIES" and "OVERVIEW" read as the
// same kind of object and colour became the only hierarchy signal on the page.
// SECTION_LABEL names a section; MICRO_LABEL names anything *inside* a card.
const SECTION_LABEL = 'text-xs font-bold uppercase tracking-widest text-muted';
const MICRO_LABEL = 'text-[10px] font-bold uppercase tracking-widest text-muted';

// One padding value per box level. Hero is one step up from a panel — that gap
// is the tier signal, not drift. Rows keep p-2.5: a list item is a different
// object from a card.
const PANEL_PAD = 'p-4 sm:p-5';
const HERO_PAD = 'p-5 sm:p-6';

// Figure sizes carry tier: 3xl is the hero number (one per page), 2xl is a
// panel headline, everything below is body. text-4xl and text-xl are gone.
const HERO_FIGURE = 'text-3xl';
const PANEL_FIGURE = 'text-2xl';

// Native <option> elements ignore the parent select's gradient background.
const OPTION_STYLE = { backgroundColor: SURFACE.inset, color: '#ffffff' };

// Panels carry ids only; the full records live once each in stats.pokemon /
// stats.users. `monOf` returns an object shaped for <PokemonImage>.
const EMPTY_MON = { name: 'Unknown' };
const monOf = (dict, id) => dict?.[id] || EMPTY_MON;
const hunterOf = (dict, id) => dict?.[id] || 'Unknown';

// Bespoke skeletons: one shape per section, not a generic spinner
const Shimmer = ({ className = '' }) => <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />;

// Restricted mode used to be legible only in the toggle, so a viewer who
// scrolled past the page band had no way to tell which dataset they were
// reading — the two views are structurally identical.
//
// The word goes INTO the header ("Restricted Top Hunted"), it is not a chip
// beside it. A chip is a decoration the eye learns to skip, and it forced every
// header into a flex row whose height depended on the badge fitting the line
// box. As part of the title it is simply read, it survives truncation the same
// way the rest of the title does, and switching modes cannot change a header's
// height. There is a restricted icon available for surfaces that need a mark
// rather than a word — this is not one of them.
const restrictedTitle = (title, restricted) => (restricted ? `Restricted ${title}` : title);

// Tier 2 / Tier 3 wrapper. The tier difference is carried by where the section
// sits (full width vs a grid column) and by its content, not by shrinking the
// label — the two-level label system above is the thing that fixed the
// title-vs-stat-label collision and a third size would reopen it.
const SectionCard = ({ title, children, className = '', restricted = false }) => (
  <section className={`min-w-0 ${className}`}>
    <h2 className={`${SECTION_LABEL} mb-2 min-w-0`}>
      <span className="block truncate">{restrictedTitle(title, restricted)}</span>
    </h2>
    {children}
  </section>
);

// Tier 1. Two hero slots now: Watch Out! (violet, urgency — a live race) and
// Hunter Spotlight (gold, celebration — this month's standouts). Distinct
// tints keep them from reading as the same object despite sharing a shell.
// Everything else on the page stays untinted flat cards — the tint is still
// reserved for the two things worth stopping on before scrolling.
const GOLD_RGB = '251,191,36';
const HeroSection = ({ label, restricted = false, tint = ACCENT_RGB, children }) => (
  <section
    className={`rounded-xl border ${HERO_PAD} min-w-0 overflow-hidden`}
    style={{
      background: `linear-gradient(135deg, rgba(${tint},0.10) 0%, rgba(26,28,35,0.95) 45%)`,
      borderColor: `rgba(${tint},0.35)`,
    }}
  >
    <div className={`${MICRO_LABEL} mb-3 min-w-0`}>
      <span className="block truncate">{restrictedTitle(label, restricted)}</span>
    </div>
    {children}
  </section>
);

// Same box as a full panel so a bucket with no data doesn't change the page's
// rhythm when the toggle flips.
const EmptyCard = ({ className = '', children }) => (
  <div className={`rounded-xl ${PANEL_PAD} border text-center text-sm text-muted min-w-0 ${className}`} style={{ background: CARD.bg, borderColor: CARD.border }}>
    {children}
  </div>
);

// Skeletons mirror their real component's anatomy so the swap doesn't reflow.
// Where a section's height is data-dependent they assume the common case: one
// row of contender chips here, a handful of list rows below. Guessing wrong
// costs a small reflow, which is still better than the section popping in from
// nothing.
const HeroShellSkeleton = ({ tint = ACCENT_RGB, children }) => (
  <div
    className={`rounded-xl border ${HERO_PAD} min-w-0 overflow-hidden`}
    style={{
      background: `linear-gradient(135deg, rgba(${tint},0.10) 0%, rgba(26,28,35,0.95) 45%)`,
      borderColor: `rgba(${tint},0.35)`,
    }}
  >
    {/* The eyebrow now lives inside the hero, so the skeleton owns it too.
        15px is the measured height of a 10px MICRO_LABEL line; h-3 left every
        hero 3px short. */}
    <Shimmer className="h-[15px] w-24 mb-3" />
    {children}
  </div>
);

const WatchOutSkeleton = () => (
  <HeroShellSkeleton>
    <div className="flex items-center gap-3 sm:gap-4">
      <Shimmer className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2"><Shimmer className="h-7 w-40" /><Shimmer className="h-4 w-20" /></div>
      <div className="shrink-0 flex flex-col items-end gap-1.5"><Shimmer className="h-8 w-10" /><Shimmer className="h-3 w-16" /></div>
    </div>
    {/* One row of contender chips — the overwhelmingly common case. 33px is the
        measured chip height (py-1.5 around a text-xs name and a pts badge). */}
    <div className="flex flex-wrap gap-1.5 mt-4">
      <Shimmer className="h-[33px] w-28 rounded-full" />
      <Shimmer className="h-[33px] w-32 rounded-full" />
    </div>
  </HeroShellSkeleton>
);

// h-full + flex-col mirrors the real card, so it takes the same share of an
// equalised row and the swap doesn't reflow its neighbour.
const UniqueCatchSkeleton = () => (
  <div className="rounded-xl border overflow-hidden min-w-0 h-full flex flex-col" style={{ background: CARD.bg, borderColor: CARD.border }}>
    <div className={`${PANEL_PAD} flex-1 flex items-center gap-4`}>
      <Shimmer className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Shimmer className="h-6 w-32" /><Shimmer className="h-4 w-40 max-w-full" /><Shimmer className="h-4 w-28" />
      </div>
      <Shimmer className="h-8 sm:h-10 w-20 shrink-0" />
    </div>
    <div className="px-4 sm:px-5 py-2.5 border-t flex items-center justify-between" style={{ borderColor: CARD.borderSubtle, background: CARD.inner }}>
      <Shimmer className="h-4 w-56 max-w-[60%]" />
      <Shimmer className="h-1.5 w-12 rounded-full shrink-0" />
    </div>
  </div>
);

// Community Read swaps between a CTA, a callout card, two upset cards, and a
// notice, so the skeleton just holds a single card's worth of space.
const CardSkeleton = ({ className = 'h-[86px]' }) => (
  <div className={`rounded-xl border min-w-0 ${className}`} style={{ background: CARD.bg, borderColor: CARD.border }} />
);

// w-9/h-9 matches the 36px image tile the real rows use; the 32px circle it
// replaced left every list row 4px short, which compounds over six rows.
const ListSkeleton = ({ rows = 5 }) => (
  <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2.5 border-b last:border-b-0" style={{ borderColor: CARD.borderSubtle }}>
        <Shimmer className="w-9 h-9 rounded-lg shrink-0" />
        <Shimmer className="h-3 flex-1" style={{ maxWidth: `${70 - i * 8}%` }} />
        <Shimmer className="h-3 w-8 shrink-0" />
      </div>
    ))}
  </div>
);

// Catches by Game had no skeleton at all before it moved into a grid column;
// without one the right-hand column collapsed and the row reflowed on arrival.
const BarsSkeleton = ({ rows = 3 }) => (
  <div className={`rounded-xl ${PANEL_PAD} border space-y-2.5 min-w-0`} style={{ background: CARD.bg, borderColor: CARD.border }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 min-w-0">
        <Shimmer className="h-4 w-28 sm:w-44 shrink-0" />
        <Shimmer className="h-4 flex-1 rounded-full" />
      </div>
    ))}
  </div>
);

const RestrictedRateSkeleton = () => (
  <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
    <div className={`${PANEL_PAD} flex items-center gap-4 border-b`} style={{ borderColor: CARD.borderSubtle }}>
      <Shimmer className="h-6 w-16 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5"><Shimmer className="h-5 w-48 max-w-full" /><Shimmer className="h-4 w-32" /></div>
    </div>
    <div className={`${PANEL_PAD} space-y-2.5`}>
      <Shimmer className="h-3.5 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 min-w-0">
          <Shimmer className="h-4 w-28 sm:w-44 shrink-0" />
          <Shimmer className="h-4 flex-1 rounded-full" />
          <Shimmer className="h-4 w-20 shrink-0" />
        </div>
      ))}
    </div>
  </div>
);

// All / Restricted. Replaces the old Standard/Restricted pair: restricted
// catches also count toward the standard board, so the honest framing is a
// superset ("All") and the subset broken out of it, not two siblings.
// `showRestricted` is false on months with no restricted catches at all —
// restricted hunting launched partway through the site's history, so the two
// months before it have no restricted view to show. Derived from the data
// rather than hardcoded to a launch month, so it also holds for any future
// month that simply has none yet.
const ModeToggle = ({ mode, onChange, showRestricted }) => (
  <div className="flex rounded-lg overflow-hidden border divide-x flex-shrink-0" style={{ borderColor: CARD.border }}>
    <button
      type="button"
      onClick={() => onChange('all')}
      className={`px-4 py-1.5 text-xs font-semibold transition-colors ${mode === 'all' ? 'text-strong' : 'text-muted hover:text-strong'}`}
      style={{ background: mode === 'all' ? ACCENT_FILL : CARD.inner, borderColor: CARD.border }}
    >
      All
    </button>
    {showRestricted && (
      <button
        type="button"
        onClick={() => onChange('restricted')}
        className={`px-4 py-1.5 text-xs font-semibold transition-colors ${mode === 'restricted' ? 'text-strong' : 'text-muted hover:text-strong'}`}
        style={{ background: mode === 'restricted' ? RESTRICTED : CARD.inner, borderColor: CARD.border }}
      >
        Restricted
      </button>
    )}
  </div>
);

// ── Watch Out! ───────────────────────────────────────────────────────────────
// Only the single most-earnable achievement. The API pre-sorts by catches
// remaining, tie-broken easiest-first (row > column > x > blackout), so [0] is
// the one to show.
const WATCH_LABELS = { row: 'Row Bingo', column: 'Column Bingo', x: 'X Pattern', blackout: 'Blackout' };
const positionNoun = (type) => (type === 'row' ? 'Row' : 'Column');
const distinctPositions = (w) => [...new Set(w.contenders.flatMap(c => c.positions))].sort((a, b) => a - b);

// Renders the hero's *contents* only — HeroSection owns the card, so this can't
// nest a card inside a card.
const WatchOutHero = ({ item, emptyLabel, users }) => {
  if (!item) return <div className="text-sm text-muted">{emptyLabel}</div>;
  const positions = item.positioned ? distinctPositions(item) : [];
  // When tied players are closest on different lines the aggregate header
  // ("Rows 1, 4") can't say who is where — tag each chip instead.
  const perChipPosition = item.positioned && positions.length > 1;
  return (
    <>
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/* AchievementIcon's `color` is the container FILL behind a white SVG —
            so it takes accent-strong, matching the violet every other
            achievement icon in the app uses (AchievementIcon's own #9147ff
            default, the Leaderboard's per-user hex). */}
        <AchievementIcon type={item.type} color={ACCENT_FILL} containerClassName="w-12 h-12 sm:w-14 sm:h-14 shrink-0" svgClassName="w-7 h-7 sm:w-8 sm:h-8" />
        <div className="min-w-0 flex-1">
          {/* text-lg on mobile, not the PANEL_FIGURE 2xl — the hero packs an
              icon, this title, and a right-aligned figure into one row, and
              at 375px the 2xl size truncated "Column Bingo" to "Column
              Bin…" before the label ever had a chance to read. */}
          <div className="text-lg sm:text-2xl font-bold text-strong truncate">{WATCH_LABELS[item.type] || item.type}</div>
          {item.positioned && positions.length > 0 && (
            <div className="text-xs text-muted truncate">
              {positions.length > 1 ? `${positionNoun(item.type)}s` : positionNoun(item.type)} {positions.join(', ')}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`${HERO_FIGURE} font-bold leading-none`} style={{ color: ACCENT }}>{item.remaining}</div>
          <div className={`${MICRO_LABEL} mt-1`}>
            {item.remaining === 1 ? 'catch away' : 'catches away'}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {item.contenders.map(c => (
          <Link
            key={c.user_id}
            to={`/profile/${c.user_id}`}
            className="flex items-center gap-1.5 rounded-full pl-3 pr-2 py-1.5 max-w-full min-w-0 transition-colors hover:bg-white/[0.06]"
            style={{ background: CARD.inner, border: `1px solid ${CARD.border}` }}
          >
            <span className="text-xs text-body truncate">{hunterOf(users, c.user_id)}</span>
            {perChipPosition && (
              <span className="text-[10px] text-muted shrink-0">
                {positionNoun(item.type)} {c.positions.join('/')}
              </span>
            )}
            <span className="text-[10px] font-bold shrink-0 rounded-full px-1.5 py-0.5" style={{ background: `rgba(${ACCENT_RGB},0.15)`, color: ACCENT }}>
              {c.points} pts
            </span>
          </Link>
        ))}
      </div>
    </>
  );
};

// ── Month Champion ───────────────────────────────────────────────────────────
// Once a month is finished there is nothing left to race for, so the Watch
// Out! slot retires into a congratulations card for whoever led the
// leaderboard — same slot, same tint, a different job depending on whether
// the month is still live. Points are month-wide (not bucket-scoped), so this
// never carries a Restricted tag.
const MonthChampionHero = ({ winner, emptyLabel, users }) => {
  if (!winner) return <div className="text-sm text-muted">{emptyLabel}</div>;
  return (
    <>
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl shrink-0 flex items-center justify-center" style={{ background: CARD.inner }}>
          <StatIcon name="trophy" className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: ACCENT }} />
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/profile/${winner.user_id}`} className="text-lg sm:text-2xl font-bold text-strong truncate block hover:underline">
            {hunterOf(users, winner.user_id)}
          </Link>
          <div className="text-xs text-muted truncate">Topped the leaderboard this month</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`${HERO_FIGURE} font-bold leading-none`} style={{ color: ACCENT }}>{winner.points.toLocaleString()}</div>
          <div className={`${MICRO_LABEL} mt-1`}>points</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        <span className="rounded-full px-3 py-1.5 text-xs text-body" style={{ background: CARD.inner, border: `1px solid ${CARD.border}` }}>
          {winner.catches} {winner.catches === 1 ? 'catch' : 'catches'}
        </span>
        {winner.achievements > 0 && (
          <span className="rounded-full px-3 py-1.5 text-xs text-body" style={{ background: CARD.inner, border: `1px solid ${CARD.border}` }}>
            {winner.achievements} {winner.achievements === 1 ? 'achievement' : 'achievements'}
          </span>
        )}
        {winner.margin > 0 && (
          <span className="rounded-full px-3 py-1.5 text-xs font-bold shrink-0" style={{ background: `rgba(${ACCENT_RGB},0.15)`, color: ACCENT }}>
            +{winner.margin} pts ahead
          </span>
        )}
      </div>
    </>
  );
};

// ── Overview ─────────────────────────────────────────────────────────────────
// One card, not four floating tiles — a stat is a fact about the same month,
// not an object in its own right, so the four figures are cells inside a
// single card (divided by hairlines) rather than four nested cards.
// A progress bar has to be a part of a whole, or it is decoration. Both earlier
// attempts failed that test: sharing one max made Participants a permanent stub
// (participants can never exceed catches), and scaling an average against the
// top hunter compared a number to something it isn't part of.
// The bar is this month as a fraction of the best month on record, and the
// caption is the delta against the previous active month. Restricted is never
// mentioned — that split belongs to the toggle, not to a headline number.
//
// There is no past-month variant. Overview renders identically on a live month
// and a finished one.
const OverviewBarStat = ({ label, value, color, best, prev, prevLabel }) => {
  const pct = best > 0 ? Math.min(100, (value / best) * 100) : 0;
  const isRecord = best > 0 && value >= best;

  let caption;
  if (prev == null || prevLabel == null) {
    caption = 'First month on record';
  } else if (prev === 0) {
    caption = `No activity in ${prevLabel}`;
  } else {
    const delta = Math.round(((value - prev) / prev) * 100);
    const sign = delta > 0 ? '+' : '';
    caption = `${sign}${delta}% vs ${prevLabel}`;
  }

  return (
    <div className="flex flex-col h-full">
      <div className={`${MICRO_LABEL} mb-1`}>{label}</div>
      <div className={`${PANEL_FIGURE} font-bold mb-2 leading-none`} style={{ color }}>{value.toLocaleString()}</div>
      <div className="relative h-1.5 rounded-full overflow-hidden mt-auto" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 text-xs min-w-0">
        <span className="text-muted truncate">{caption}</span>
        <span className="text-muted shrink-0">
          {isRecord ? 'record' : best > 0 ? `best ${best.toLocaleString()}` : ''}
        </span>
      </div>
    </div>
  );
};

// A cell with no month-over-month trend behind it — Tier Lists Submitted and
// Badges Earned have no "best month on record" to bar-chart against, so they
// skip the bar and just sit as a number + one line of context.
const OverviewMetaStat = ({ label, value, color, caption }) => (
  <div className="flex flex-col justify-center h-full">
    <div className={`${MICRO_LABEL} mb-1`}>{label}</div>
    <div className={`${PANEL_FIGURE} font-bold leading-none`} style={{ color }}>{value.toLocaleString()}</div>
    {caption && <div className="text-xs text-muted mt-1.5 truncate">{caption}</div>}
  </div>
);

// Single combined card, one stat per row (4 rows, 1 column — not a grid).
// Sits under Most Unique Catch in a narrow left-hand column, so a wide 2x2
// stat block would have fought that column's width; a stacked list reads
// fine narrow and doesn't force the column any wider than the card above it.
const OverviewCard = ({ overview, trend, submissionCount, badgesCount, showTierLists }) => {
  const t = trend || {};
  const cells = [
    { key: 'shinies', node: <OverviewBarStat label="Total Shinies" value={overview.total_shinies} color={WARN} best={t.best_total || 0} prev={t.prev_total} prevLabel={t.prev_label} /> },
    { key: 'participants', node: <OverviewBarStat label="Participants" value={overview.participants} color={ACCENT} best={t.best_participants || 0} prev={t.prev_participants} prevLabel={t.prev_label} /> },
    { key: 'badges', node: <OverviewMetaStat label="Badges Earned" value={badgesCount} color={SUCCESS} caption="this month" /> },
  ];
  if (showTierLists) {
    cells.push({
      key: 'tierlists',
      node: (
        <OverviewMetaStat
          label="Tier Lists Submitted"
          value={submissionCount}
          color={ACCENT}
          caption={submissionCount >= 3 ? 'Community Read unlocked' : `${Math.max(0, 3 - submissionCount)} more to unlock`}
        />
      ),
    });
  }

  return (
    <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
      {/* Tighter than PANEL_PAD vertically (py-2.5, not p-4/p-5) — four
          stacked rows compound a full panel's worth of top/bottom padding
          fast, and each row's own label+figure+bar already carries plenty
          of internal rhythm without it. */}
      {cells.map((cell, i) => (
        <div key={cell.key} className={`px-4 sm:px-5 py-2.5 min-w-0 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: CARD.borderSubtle }}>
          {cell.node}
        </div>
      ))}
    </div>
  );
};

const OverviewCardSkeleton = ({ cellCount = 4 }) => (
  <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
    {Array.from({ length: cellCount }).map((_, i) => (
      <div key={i} className={`px-4 sm:px-5 py-2.5 min-w-0 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: CARD.borderSubtle }}>
        <Shimmer className="h-3.5 w-24 mb-1" />
        <Shimmer className="h-6 w-16 mb-2" />
        <Shimmer className="h-1.5 w-full" />
        <Shimmer className="h-4 w-32 max-w-full mt-1.5" />
      </div>
    ))}
  </div>
);

// ── Most Unique Catch ────────────────────────────────────────────────────────
// ── Carousel primitive ───────────────────────────────────────────────────────
// One scroll-snap track backs both Month Stats carousels (Most Unique Catch,
// Hunter Spotlight). Native horizontal swipe on touch comes free from the
// browser's CSS scroll-snap; on desktop the arrows and dots drive the same
// track via `scrollTo`. This replaced a JS `translateX(-active*100%)` slider,
// which had no native touch swipe.
//
// Auto-advance rotates ties until the viewer interacts — a swipe (pointerdown
// on the track), an arrow, or a dot all pause it for good, so a deliberate
// pick is never overridden. Same intent as the old `paused` flag.
const useSnapCarousel = (count, intervalMs, resetKey) => {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const indexFromScroll = () => {
    const el = trackRef.current;
    return el && el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : 0;
  };

  const scrollToIndex = useCallback((i, smooth = true) => {
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, count - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, [count]);

  // Native swipe and programmatic scroll both land here — keep `active` (which
  // drives the caption + dots) in step with wherever the track actually is.
  const syncActive = useCallback(() => {
    setActive(prev => {
      const i = indexFromScroll();
      return prev === i ? prev : i;
    });
  }, []);

  const pause = useCallback(() => setPaused(true), []);
  const goTo = useCallback((i) => { setPaused(true); scrollToIndex(i); }, [scrollToIndex]);
  const step = useCallback((delta) => { setPaused(true); scrollToIndex(indexFromScroll() + delta); }, [scrollToIndex]);

  // Snap back to the first slide (no animation) when the data swaps out — same
  // trigger the old `setIdx(0)` effects used.
  useEffect(() => {
    setPaused(false);
    setActive(0);
    scrollToIndex(0, false);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const t = setInterval(() => scrollToIndex((indexFromScroll() + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [count, paused, intervalMs, scrollToIndex]);

  return { trackRef, active: Math.min(active, Math.max(count - 1, 0)), syncActive, pause, goTo, step };
};

// Prev/next control. `overlay` (default) floats it on the edges of a roomy
// sliding region (Most Unique Catch — right side is empty). `inline` drops the
// absolute positioning so it can flank the dots instead, for a slide whose
// content runs edge-to-edge and would sit under an overlaid arrow (Hunter
// Spotlight — icon on the left, winner avatars on the right). Only rendered
// when there's more than one slide.
const CarouselArrow = ({ dir, onClick, color = ACCENT, variant = 'overlay' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={dir === 'prev' ? 'Previous' : 'Next'}
    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:brightness-125 shrink-0 ${
      variant === 'overlay' ? 'absolute top-1/2 -translate-y-1/2 z-10' : ''
    }`}
    style={{
      ...(variant === 'overlay' ? { [dir === 'prev' ? 'left' : 'right']: 6 } : null),
      background: 'rgba(13,15,20,0.66)',
      border: `1px solid ${CARD.border}`,
      color,
    }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  </button>
);

// The rarest (pokemon, game) pairing this month. Ties rotate through a carousel
// rather than picking arbitrarily: the whole card slides, so each tie reads as
// its own card rather than as one card whose contents mutate.
const UniqueCatch = ({ unique, emptyLabel, pokemon, users }) => {
  const items = unique?.items || [];
  const { trackRef, active, syncActive, pause, goTo, step } = useSnapCarousel(
    items.length, 6000, `${items.length}-${items[0]?.pokemon_id}`,
  );

  if (!unique?.available || !items.length) return <EmptyCard className="h-full">{emptyLabel}</EmptyCard>;

  const item = items[active];

  return (
    // One card frame. Only the upper region is a sliding track — the footer sits
    // outside it and stays put, so the dots it holds don't slide away with the
    // content they control.
    // h-full + flex-col: the card fills its grid row (equalised with Overview),
    // the track takes the slack, and the footer stays pinned to the bottom edge
    // instead of floating mid-card.
    <div className="rounded-xl border overflow-hidden min-w-0 h-full flex flex-col" style={{ background: CARD.bg, borderColor: CARD.border }}>
      <div className="relative flex-1 min-h-0">
        <div
          ref={trackRef}
          onScroll={syncActive}
          onPointerDown={pause}
          className="h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide overscroll-x-contain"
        >
          {items.map(it => (
            <div key={`${it.user_id}-${it.pokemon_id}`} className={`w-full shrink-0 snap-center min-w-0 flex items-center gap-3 ${items.length > 1 ? 'py-4 sm:py-5 px-11' : PANEL_PAD}`}>
              <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden" style={{ background: CARD.inner }}>
                <PokemonImage pokemon={monOf(pokemon, it.pokemon_id)} className="w-full h-full" disableCycling />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-strong truncate">{monOf(pokemon, it.pokemon_id).name}</div>
                <div className="text-xs text-muted truncate">{it.game_label}</div>
                <Link to={`/profile/${it.user_id}`} className="text-xs mt-1 inline-block truncate max-w-full hover:underline" style={{ color: ACCENT }}>
                  caught by {hunterOf(users, it.user_id)}
                </Link>
              </div>
            </div>
          ))}
        </div>
        {items.length > 1 && (
          <>
            <CarouselArrow dir="prev" onClick={() => step(-1)} />
            <CarouselArrow dir="next" onClick={() => step(1)} />
          </>
        )}
      </div>
      {/* Static footer: caption follows the active slide, dots never move. */}
      <div className="px-4 sm:px-5 py-2.5 border-t flex items-center justify-between gap-3 min-w-0" style={{ borderColor: CARD.borderSubtle, background: CARD.inner }}>
        <div className="text-xs text-muted truncate">
          {item.pair_count === 1
            ? 'No one else logged this Pokémon in this game this month'
            : `Logged ${item.pair_count} times this month`}
        </div>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {items.map((it, i) => (
              <button
                key={`${it.user_id}-${it.pokemon_id}`}
                type="button"
                aria-label={`Show ${monOf(pokemon, it.pokemon_id).name} on ${it.game_label}`}
                onClick={() => goTo(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === active ? 18 : 6, height: 6,
                  background: i === active ? ACCENT_FILL : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Hunter Spotlight ─────────────────────────────────────────────────────────
// Month-wide, not bucket-scoped (same treatment as Community Read) — one card
// per category, each naming 1-3 hunters rather than a single arbitrary winner.
// `entry.category` doubles as the StatIcon name — see StatIcons.jsx.

// Small avatar + name, parked beside the title instead of wrapping in a row
// below it — a 3-way tie used to add a whole extra row under the title,
// growing the card every time a category had multiple winners. Stacking the
// name under a bigger avatar keeps each winner to a ~56px-wide column, so up
// to three fit in the same vertical space the title block already occupies.
const SpotlightAvatar = ({ user }) => (
  <Link to={`/profile/${user.user_id}`} className="flex flex-col items-center gap-1 w-14 shrink-0 group">
    <div
      className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
      style={{ background: CARD.bg, border: `1px solid ${CARD.border}` }}
    >
      {user.avatar_url
        ? <img src={user.avatar_url} alt="" draggable="false" className="w-full h-full object-cover" />
        : <span className="text-xs font-bold text-muted">{(user.name || '?').charAt(0)}</span>}
    </div>
    <span className="text-[10px] leading-tight text-muted group-hover:text-strong truncate w-full text-center">{user.name}</span>
  </Link>
);

// Gold hero, second Tier-1 slot alongside Watch Out! — one category per
// slide, sliding like Most Unique Catch's carousel, except each slide names
// multiple hunters rather than a single catch.
const HunterSpotlight = ({ items }) => {
  // Stops overriding the viewer's choice once they've picked a category —
  // same reasoning as Most Unique Catch's carousel.
  const { trackRef, active, syncActive, pause, goTo, step } = useSnapCarousel(
    items.length, 7000, `${items.length}-${items[0]?.category}`,
  );

  // An empty message, not a vanished section — this hero shares a row with
  // Watch Out!/Month Champion, and disappearing would leave that card alone
  // against empty space instead of a matched pair.
  if (!items.length) {
    return (
      <HeroSection label="Hunter Spotlight" tint={GOLD_RGB}>
        <div className="text-sm text-muted">No standout performances yet this month — check back as more catches come in.</div>
      </HeroSection>
    );
  }

  return (
    <HeroSection label="Hunter Spotlight" tint={GOLD_RGB}>
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={syncActive}
          onPointerDown={pause}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide overscroll-x-contain"
        >
          {items.map(entry => (
            <div key={entry.category} className="w-full shrink-0 snap-center min-w-0 flex items-center gap-3">
              <StatIcon name={entry.category} className="w-7 h-7 shrink-0" style={{ color: WARN }} />
              <div className="min-w-0 flex-1">
                {/* Same fix as WatchOutHero/MonthChampionHero — HERO_FIGURE's
                    3xl truncated "Consistently Elite" to "Consistently
                    El…" at 375px once the emoji and blurb crowded the row. */}
                <div className="text-xl sm:text-3xl font-bold text-strong leading-tight truncate">{entry.title}</div>
                <div className="text-sm text-muted truncate">{entry.blurb}</div>
              </div>
              {/* Winners ride beside the title, not below it — see
                  SpotlightAvatar above for why. */}
              <div className="shrink-0 flex items-center gap-2">
                {entry.users.slice(0, 3).map(u => <SpotlightAvatar key={u.user_id} user={u} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {items.length > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <CarouselArrow dir="prev" variant="inline" color={WARN} onClick={() => step(-1)} />
          <div className="flex items-center gap-1.5">
            {items.map((entry, i) => (
              <button
                key={entry.category}
                type="button"
                aria-label={`Show ${entry.title}`}
                onClick={() => goTo(i)}
                className="rounded-full transition-all"
                style={{ width: i === active ? 18 : 6, height: 6, background: i === active ? WARN : 'rgba(255,255,255,0.2)' }}
              />
            ))}
          </div>
          <CarouselArrow dir="next" variant="inline" color={WARN} onClick={() => step(1)} />
        </div>
      )}
    </HeroSection>
  );
};

const HunterSpotlightSkeleton = () => (
  <HeroShellSkeleton tint={GOLD_RGB}>
    <div className="flex items-center gap-3">
      <Shimmer className="w-9 h-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2"><Shimmer className="h-6 w-40" /><Shimmer className="h-4 w-56 max-w-full" /></div>
      <div className="shrink-0 flex items-center gap-2">
        <Shimmer className="w-8 h-8 rounded-full" />
        <Shimmer className="w-8 h-8 rounded-full" />
      </div>
    </div>
  </HeroShellSkeleton>
);

// ── Badges Earned ────────────────────────────────────────────────────────────
// Earned-this-calendar-month feed, not scoped to badge type — see the API
// comment on `badges_this_month`. Secret badges credit the earner without
// naming the badge.
//
// Fixed-size card, 6 slots per page, paged with the same slide+dots mechanism
// as Most Unique Catch and Hunter Spotlight above — a wide feed used to grow
// the card indefinitely via "show more"; a busy month made this card the
// tallest thing on the page and dragged its neighbour's row down with it.
//
// A columnar scroll, not a pager: a fixed-height card holding a plain
// vertical list, scrolled with the wheel/touch rather than paged with dots.
// Simpler interaction for a feed that's read top-to-bottom (most recent
// first) rather than browsed in discrete batches.
const BADGE_VISIBLE_ROWS = 6;
const BADGE_ROW_HEIGHT = 54; // px — measured: 36px avatar + p-2.5 (10px top/bottom) + border
const BadgeRow = ({ b }) => (
  <Link
    to={`/profile/${b.user_id}`}
    className="flex items-center gap-3 p-2.5 border-b last:border-b-0 transition-colors hover:bg-white/5 min-w-0"
    style={{ borderColor: CARD.borderSubtle }}
  >
    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: CARD.inner }}>
      {b.avatar_url
        ? <img src={b.avatar_url} alt="" draggable="false" className="w-full h-full object-cover" />
        : <span className="text-xs font-bold text-muted">{(b.user_name || '?').charAt(0)}</span>}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm text-strong truncate">{b.user_name}</div>
      <div className="text-xs text-muted truncate">earned {b.is_secret ? 'a secret badge' : b.badge_name}</div>
    </div>
    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: CARD.inner }}>
      {!b.is_secret && b.badge_image
        ? <img src={b.badge_image} alt={b.badge_name} draggable="false" className="w-full h-full object-contain" />
        : <span className="text-xs" style={{ color: ACCENT }}>◆</span>}
    </div>
  </Link>
);

// `height`, not `maxHeight` — a max only caps growth, so a 2-badge month
// rendered a much shorter card than a 20-badge one and "standard sizing"
// broke the moment the count dropped below 6. A fixed height holds the card
// at exactly its 6-row footprint either way: short months just leave the
// unused rows blank, and busy ones scroll internally.
const BadgesThisMonth = ({ items, emptyLabel }) => {
  const boxStyle = { background: CARD.bg, borderColor: CARD.border, height: BADGE_ROW_HEIGHT * BADGE_VISIBLE_ROWS };
  if (!items.length) {
    return (
      <div className="rounded-xl border flex items-center justify-center text-center text-sm text-muted p-4 min-w-0" style={boxStyle}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="rounded-xl border overflow-y-auto min-w-0" style={boxStyle}>
      {items.map((b, i) => <BadgeRow key={`${b.user_id}-${b.badge_id}-${i}`} b={b} />)}
    </div>
  );
};

// ── Tier Upsets ──────────────────────────────────────────────────────────────
// The community's tier list vs what actually got caught. `accent` here is TEXT,
// so it takes the base half of a semantic pair (success/danger), never the fill
// half — #10b981 and #ef4444 both fail 4.5:1 at the bottom of the card gradient.
// The right-column blurb this card used to carry got dropped once this card
// started living in a 1-of-3 grid column instead of a half-width one — at
// that width it was squeezing the pct/catch-count line into an ellipsis, and
// the title above (Overachiever/Slept On/Most Disputed) already says what the
// blurb was spelling out.
const UpsetCard = ({ side, title, accent, pokemon }) => {
  if (!side) return null;
  const tierColor = TIER_COLORS[side.tier] || accent;
  return (
    <div className={`rounded-xl ${PANEL_PAD} border flex items-center gap-3 min-w-0`} style={{ background: CARD.bg, borderColor: CARD.border }}>
      <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
        <PokemonImage pokemon={monOf(pokemon, side.pokemon_id)} className="w-full h-full" disableCycling />
      </div>
      <div className="min-w-0 flex-1">
        <div className={`${MICRO_LABEL} mb-0.5`} style={{ color: accent }}>{title}</div>
        <div className="text-sm font-bold text-strong truncate">{monOf(pokemon, side.pokemon_id).name}</div>
        <div className="text-xs text-muted">
          <span style={{ color: tierColor }}>{side.pct}% voted {TIER_LABELS[side.tier] || side.tier}</span>
          {' · '}{side.catch_count} {side.catch_count === 1 ? 'catch' : 'catches'}
        </div>
      </div>
    </div>
  );
};

const TierUpsets = ({ upsets, pokemon }) => (
  <div className="grid grid-cols-1 gap-3">
    <UpsetCard side={upsets.overachiever} title="Overachiever" accent={SUCCESS} pokemon={pokemon} />
    <UpsetCard side={upsets.trap} title="Slept On" accent={DANGER} pokemon={pokemon} />
    <UpsetCard side={upsets.most_disputed} title="Most Disputed" accent={ACCENT} pokemon={pokemon} />
  </div>
);

// Prompts the viewer to rank this month's board. Only shown on the current
// month — `POST /api/tier-list` is a forward-looking guess, so there is nothing
// to call anyone to action about on a month that already played out.
const TierListCTA = ({ submissionCount, ranked, poolSize }) => {
  // A started-but-unfinished list gets a resume prompt with its progress, not a
  // cold "rank the board" that reads as if nothing was saved.
  const partial = ranked > 0 && poolSize > 0;
  return (
    <Link
      to="/tier-list"
      className={`rounded-xl ${PANEL_PAD} border flex items-center gap-4 min-w-0 transition-colors hover:bg-white/[0.04]`}
      // A tinted background is reserved for the hero; this earns its emphasis
      // from an accent border and the accent affordance on the right instead.
      style={{ background: CARD.bg, borderColor: `rgba(${ACCENT_RGB},0.35)` }}
    >
      <div className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center text-lg" style={{ background: CARD.inner, color: ACCENT }}>◆</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-strong">
          {partial ? 'Finish ranking this month’s board' : 'Rank this month’s board'}
        </div>
        <div className="text-xs text-muted">
          {partial
            ? `${ranked} of ${poolSize} ranked — a tier list only counts once the whole board is called.`
            : submissionCount > 0
              ? `${submissionCount} ${submissionCount === 1 ? 'hunter has' : 'hunters have'} called it so far — add yours before the results land.`
              : 'Call which Pokémon will be brutal before anyone catches them.'}
        </div>
      </div>
      <div className="shrink-0 text-xs font-semibold" style={{ color: ACCENT }}>{partial ? 'Finish →' : 'Open →'}</div>
    </Link>
  );
};

// Community Read has three states, chosen by submission count rather than a
// hardcoded "tier lists launched in month N" cutoff:
//   • enough submissions        → the upsets themselves
//   • current month, too few    → CTA (or a waiting note if already submitted)
//   • past month, too few       → a note that not enough hunters ranked it
// A past month with zero submissions predates the feature entirely and renders
// nothing at all — the caller drops the whole section.
const CommunityRead = ({ stats }) => {
  const tierList = stats.tier_list || { submission_count: 0, viewer_submitted: false };
  const isCurrent = Boolean(stats.month?.is_current);
  const upsets = stats.all.tier_upsets;

  if (!isCurrent && tierList.submission_count === 0) return null;

  return (
    <SectionCard title="Community Read">
      <div className="space-y-3">
        {stats.consensus_callout?.available && <ConsensusCallout callout={stats.consensus_callout} />}
        {upsets?.available ? (
          <TierUpsets upsets={upsets} pokemon={stats.pokemon} />
        ) : isCurrent && !tierList.viewer_submitted ? (
          <TierListCTA
            submissionCount={tierList.submission_count}
            ranked={tierList.viewer_ranked || 0}
            poolSize={tierList.pool_size || 0}
          />
        ) : (
          <EmptyCard>
            {isCurrent
              ? `Tier upsets unlock at 3 tier lists — ${tierList.submission_count} in so far. Yours is counted.`
              : 'Not enough hunters ranked this month for a community read.'}
          </EmptyCard>
        )}
      </div>
    </SectionCard>
  );
};

// Was a rounded-full pill — the only non-card in a column of cards, sitting
// directly above two rounded-xl UpsetCards inside the same section. It is a card
// now so Community Read reads as three consistent objects. The tier colour stays
// on the badge and the bar, where it means "Super Hard", not "look here".
const ConsensusCallout = ({ callout }) => {
  if (!callout?.available) return null;
  const tierColor = TIER_COLORS[callout.tier] || ACCENT;
  return (
    <div
      className={`rounded-xl ${PANEL_PAD} border flex items-center gap-3 min-w-0`}
      style={{ background: CARD.bg, borderColor: CARD.border }}
    >
      <div className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center font-bold text-lg" style={{ background: tierColor, color: SURFACE.page }}>
        {TIER_SHORT[callout.tier] || callout.tier}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`${MICRO_LABEL} mb-0.5`}>Community Fan Favorite</div>
        <div className="text-sm text-strong leading-snug break-words">
          <span className="font-bold">{callout.name}</span> placed {callout.percentage}% in {TIER_LABELS[callout.tier] || callout.tier} tier
        </div>
        <div className="text-xs text-muted truncate">{callout.submission_count} rankers</div>
      </div>
    </div>
  );
};

// ── Rarest Catches ───────────────────────────────────────────────────────────
// Mons exactly one hunter landed this month. Used to be a wrapping tile grid
// pinned full-width at the bottom of the page — that made it the one section
// that didn't belong to any column, and it read as bolted on rather than
// part of the dashboard. It now lives in the narrow rail alongside Badges
// Earned and Community Read, styled as the same row-list every other panel
// in that rail uses instead of a tile wall a narrow column can't fit well.
//
// Every item here is equally rare by the definition the header states —
// "caught by exactly one hunter" is categorical, not a ranking. An earlier
// version pulled the first (rarest-by-tiebreak) item into its own accent-lit
// callout, which read as arbitrarily crowning one hunter's catch over
// everyone else's when all of them cleared the same bar. Uniform list, no
// featured item.
const RarestCatches = ({ items, emptyLabel, pokemon, users }) => {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return <EmptyCard>{emptyLabel}</EmptyCard>;
  const LIMIT = 6;
  const shown = expanded ? items : items.slice(0, LIMIT);
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        {items.length} {items.length === 1 ? 'Pokémon was' : 'Pokémon were'} caught by exactly one hunter this month.
      </div>
      <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
        {shown.map(m => (
          <Link
            key={m.pokemon_id}
            to={`/profile/${m.user_id}`}
            className="flex items-center gap-3 p-2.5 border-b last:border-b-0 transition-colors hover:bg-white/5 min-w-0"
            style={{ borderColor: CARD.borderSubtle }}
          >
            <div className="w-9 h-9 shrink-0 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
              <PokemonImage pokemon={monOf(pokemon, m.pokemon_id)} className="w-full h-full" disableCycling />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-strong truncate">{monOf(pokemon, m.pokemon_id).name}</div>
              <div className="text-xs text-muted truncate">only {hunterOf(users, m.user_id)}</div>
            </div>
          </Link>
        ))}
        {items.length > LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className={`w-full py-2 ${MICRO_LABEL} hover:text-strong transition-colors border-t`}
            style={{ borderColor: CARD.borderSubtle }}
          >
            {expanded ? 'Show less' : `Show ${items.length - LIMIT} more`}
          </button>
        )}
      </div>
    </div>
  );
};

const RarestListSkeleton = () => (
  <div className="space-y-3">
    <Shimmer className="h-3.5 w-48 max-w-full" />
    <ListSkeleton rows={4} />
  </div>
);

// ── Restricted Rate ──────────────────────────────────────────────────────────
// Computed from every entry, not the active bucket, so the figure reads the same
// either way. Renders only in Restricted mode — the breakdowns are context for
// someone already looking at restricted hunting.
const RateBar = ({ label, total, restricted, pct }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="w-20 sm:w-44 shrink-0 text-xs text-muted truncate">{label}</div>
    <div className="flex-1 min-w-0 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, pct)}%`, background: RESTRICTED }} />
    </div>
    <div className="shrink-0 text-right text-xs whitespace-nowrap">
      <span className="font-bold text-strong">{pct}%</span>
      <span className="text-muted text-[10px] block">{restricted}/{total}</span>
    </div>
  </div>
);

const RestrictedRate = ({ rate, pokemon }) => {
  if (!rate || !rate.total) return <EmptyCard>No catches recorded yet this month.</EmptyCard>;
  return (
    <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
      <div className={`${PANEL_PAD} flex items-center gap-4 border-b min-w-0`} style={{ borderColor: CARD.borderSubtle }}>
        <div className={`${PANEL_FIGURE} font-bold leading-none shrink-0`} style={{ color: DANGER }}>{rate.pct}%</div>
        <div className="min-w-0">
          <div className="text-sm text-strong">of catches were hunted restricted</div>
          <div className="text-xs text-muted">{rate.restricted.toLocaleString()} of {rate.total.toLocaleString()} this month</div>
        </div>
      </div>
      {(rate.by_game.length > 0 || rate.by_pokemon.length > 0) && (
        <div className={`${PANEL_PAD} space-y-4`}>
          {rate.by_game.length > 0 && (
            <div className="space-y-2.5">
              <div className={MICRO_LABEL}>Hardest-played games</div>
              {rate.by_game.slice(0, 5).map(g => <RateBar key={g.game_key} label={g.label} {...g} />)}
            </div>
          )}
          {rate.by_pokemon.length > 0 && (
            <div className="space-y-2.5">
              <div className={MICRO_LABEL}>Most-restricted Pokémon</div>
              {rate.by_pokemon.map(p => <RateBar key={p.pokemon_id} label={monOf(pokemon, p.pokemon_id).name} {...p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Existing lists ───────────────────────────────────────────────────────────
// Tier 3. Both magnitude bars take the one accent fill: a bar's colour says
// "this is a quantity", and giving the two lists different hues said nothing
// except that they were written at different times.
const TopHunted = ({ items, emptyLabel, pokemon }) => {
  if (!items.length) return <EmptyCard>{emptyLabel}</EmptyCard>;
  const max = items[0]?.catch_count || 1;
  return (
    <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
      {items.map((mon, i) => (
        <div key={mon.pokemon_id} className="flex items-center gap-3 p-2.5 border-b last:border-b-0 min-w-0" style={{ borderColor: CARD.borderSubtle }}>
          <div className="w-5 text-center text-xs font-semibold text-muted shrink-0">{i + 1}</div>
          <div className="w-9 h-9 shrink-0 rounded-lg overflow-hidden" style={{ background: CARD.inner }}>
            <PokemonImage pokemon={monOf(pokemon, mon.pokemon_id)} className="w-full h-full" disableCycling />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-strong truncate">{monOf(pokemon, mon.pokemon_id).name}</div>
            <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round((mon.catch_count / max) * 100)}%`, backgroundColor: ACCENT_FILL }} />
            </div>
          </div>
          <div className="text-sm font-bold text-strong shrink-0 w-10 text-right">{mon.catch_count}</div>
        </div>
      ))}
    </div>
  );
};

const MostActive = ({ items, emptyLabel, users }) => {
  if (!items.length) return <EmptyCard>{emptyLabel}</EmptyCard>;
  const max = items[0]?.catch_count || 1;
  return (
    <div className="rounded-xl border overflow-hidden min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
      {items.map((u, i) => (
        <Link
          key={u.user_id}
          to={`/profile/${u.user_id}`}
          className="flex items-center gap-3 p-2.5 border-b last:border-b-0 transition-colors hover:bg-white/5 min-w-0"
          style={{ borderColor: CARD.borderSubtle }}
        >
          <div className="w-5 text-center text-xs font-semibold text-muted shrink-0">{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-strong truncate">{hunterOf(users, u.user_id)}</div>
            <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round((u.catch_count / max) * 100)}%`, backgroundColor: ACCENT_FILL }} />
            </div>
          </div>
          <div className="text-sm font-bold text-strong shrink-0 w-10 text-right">{u.catch_count}</div>
        </Link>
      ))}
    </div>
  );
};

// A list that could run to twenty-odd games had no ceiling on its own height,
// which is exactly the shape that used to fight Most Active Hunters for space
// in a three-up row. A donut has a fixed footprint regardless of how many
// games were played — the overflow goes into an "N more games" slice and the
// legend scrolls internally instead of pushing the card taller.
const GAME_CHART_COLORS = [ACCENT_FILL, WARN, SUCCESS, DANGER, '#38bdf8', '#f472b6', '#fb923c', '#94a3b8'];
const CHART_TOP_N = 6;
// viewBox is 0-100; a `<g>` rotated -90deg (SVG's own transform attribute,
// not CSS — CSS transform-origin on <svg> defaults to the top-left corner in
// most browsers and would spin the ring off-center) puts the first slice at
// 12 o'clock instead of 3, matching the old conic-gradient's start point.
const DONUT_R = 38;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const DONUT_STROKE = 15;

const CatchesByGame = ({ items, emptyLabel }) => {
  // Hover previews a slice when nothing is pinned; a click pins one (and
  // un-pins it on a second click). Once something is pinned it wins over
  // hover — mousing across the rest of the chart used to steal the
  // highlight away from a slice the viewer deliberately selected.
  //
  // Hover is tracked from pointer events, not mouse events, and filtered to
  // `pointerType === 'mouse'` — touch fires a synthetic hover on tap with no
  // reliable leave event, which left `hovered` stuck and made a second tap
  // on mobile look like it did nothing (pinned toggled off underneath, but
  // hover still forced the slice to render highlighted).
  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const onPointerEnter = (key) => (e) => { if (e.pointerType === 'mouse') setHovered(key); };
  const onPointerLeave = (e) => { if (e.pointerType === 'mouse') setHovered(null); };
  if (!items.length) return <EmptyCard className="h-full">{emptyLabel}</EmptyCard>;
  const total = items.reduce((n, g) => n + g.catch_count, 0);
  const top = items.slice(0, CHART_TOP_N);
  const rest = items.slice(CHART_TOP_N);
  const restCount = rest.reduce((n, g) => n + g.catch_count, 0);
  const slices = restCount > 0
    ? [...top, { game_key: '__other', label: `${rest.length} more ${rest.length === 1 ? 'game' : 'games'}`, catch_count: restCount }]
    : top;

  let cursor = 0;
  const stops = slices.map((s, i) => {
    const pct = total > 0 ? (s.catch_count / total) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return { ...s, color: GAME_CHART_COLORS[i % GAME_CHART_COLORS.length], start, end: cursor, pct: Math.round(pct) };
  });

  const active = pinned ?? hovered;
  const activeStop = active ? stops.find(s => s.game_key === active) : null;
  const toggle = (key) => setPinned(p => (p === key ? null : key));

  // Donut beside the legend, not stacked above it — this card now gets a
  // full column to itself instead of squeezing beside Most Active Hunters,
  // so the extra width goes into a bigger donut with the key running down
  // its side rather than into a taller card.
  return (
    <div className={`rounded-xl ${PANEL_PAD} border min-w-0 flex flex-col sm:flex-row sm:items-center gap-6`} style={{ background: CARD.bg, borderColor: CARD.border }}>
      {/* ~33% larger than the first pass (160/176px -> 213/234px) — this card
          has a full column to itself now, so the donut is the thing worth
          spending that width on rather than capping it to match a neighbour
          it no longer shares a row with. */}
      <div className="relative w-[213px] h-[213px] sm:w-[234px] sm:h-[234px] shrink-0 mx-auto sm:mx-0">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <g transform="rotate(-90 50 50)">
            {stops.map(s => {
              const dash = (s.pct / 100) * DONUT_CIRC;
              return (
                <circle
                  key={s.game_key}
                  cx="50"
                  cy="50"
                  r={DONUT_R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${dash} ${DONUT_CIRC - dash}`}
                  strokeDashoffset={-(s.start / 100) * DONUT_CIRC}
                  opacity={active && active !== s.game_key ? 0.2 : 1}
                  className="cursor-pointer transition-opacity duration-150"
                  onPointerEnter={onPointerEnter(s.game_key)}
                  onPointerLeave={onPointerLeave}
                  onClick={() => toggle(s.game_key)}
                />
              );
            })}
          </g>
        </svg>
        <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <div className="text-3xl font-bold text-strong leading-none">{(activeStop?.catch_count ?? total).toLocaleString()}</div>
          <div className="text-xs text-muted uppercase tracking-widest mt-1.5 truncate max-w-full">{activeStop ? activeStop.label : 'catches'}</div>
        </div>
      </div>
      <div className="flex-1 min-w-0 w-full space-y-1.5">
        {stops.map(s => (
          <div
            key={s.game_key}
            role="button"
            tabIndex={0}
            onPointerEnter={onPointerEnter(s.game_key)}
            onPointerLeave={onPointerLeave}
            onClick={() => toggle(s.game_key)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.game_key); } }}
            className="flex items-center gap-2 min-w-0 -mx-1.5 px-1.5 py-1 rounded-lg cursor-pointer transition-all duration-150 hover:bg-white/5"
            style={{ opacity: active && active !== s.game_key ? 0.4 : 1 }}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-xs text-body truncate flex-1 min-w-0">{s.label}</span>
            <span className="text-xs font-semibold text-strong shrink-0">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const PieSkeleton = () => (
  <div className={`rounded-xl ${PANEL_PAD} border min-w-0 flex flex-col sm:flex-row sm:items-center gap-6`} style={{ background: CARD.bg, borderColor: CARD.border }}>
    <Shimmer className="w-[213px] h-[213px] sm:w-[234px] sm:h-[234px] rounded-full mx-auto sm:mx-0 shrink-0" />
    <div className="flex-1 w-full space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-3.5" style={{ width: `${80 - i * 12}%` }} />)}
    </div>
  </div>
);

// Whole-page state, not a panel — it keeps its own generous padding.
const EmptyMonth = ({ showIcon = true, title = 'No submissions yet this month, check back soon!', message = 'Stats will populate as hunters start submitting catches.' }) => (
  <div className="rounded-xl p-10 border text-center min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
    {showIcon && <StatIcon name="calendar" className="w-9 h-9 mx-auto mb-3 text-muted" />}
    <p className="text-body font-medium">{title}</p>
    {message && <p className="text-muted text-sm mt-1">{message}</p>}
  </div>
);

const MonthStats = () => {
  const [periods, setPeriods] = useState(null);
  const [monthId, setMonthId] = useState(null); // null = active month
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('all'); // all | restricted
  const retryTimer = useRef(null);
  const retryAttempt = useRef(0);

  useEffect(() => {
    api.getLeaderboardPeriods().then(setPeriods).catch(() => {});
  }, []);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  useEffect(() => {
    let cancelled = false;
    retryAttempt.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setLoading(true);
    setError(null);

    const load = () => {
      api.getMonthStats(monthId)
        .then(data => {
          if (cancelled) return;
          setStats(data);
          setError(null);
          setLoading(false);
        })
        .catch(err => {
          if (cancelled) return;
          if (err?.status === 404) {
            setStats(null);
            setError('not_found');
            setLoading(false);
            return;
          }
          setError('reconnecting');
          const delay = Math.min(30000, 5000 * Math.pow(1.5, retryAttempt.current));
          retryAttempt.current += 1;
          retryTimer.current = setTimeout(load, delay);
        });
    };
    load();
    return () => { cancelled = true; };
  }, [monthId]);

  const monthLabel = stats?.month?.label || periods?.months?.find(m => m.id === monthId)?.label || '';
  // Whole-month emptiness drives the big empty state; per-section emptiness for
  // the active mode is handled inline by each panel via its own emptyLabel.
  const isEmpty = stats && stats.overview.total_shinies === 0;
  // Months with no restricted catches at all get no Restricted toggle —
  // restricted hunting launched partway through the site's history, so the
  // earliest months have nothing to switch to. Derived rather than hardcoded to
  // a launch month.
  const showRestricted = (stats?.restricted?.overview?.total_shinies || 0) > 0;
  // If the toggle disappears under a viewer who had it selected (e.g. they
  // switch to a pre-launch month), fall back to All rather than render an
  // unreachable empty view.
  const effectiveMode = mode === 'restricted' && !showRestricted ? 'all' : mode;
  const bucket = stats ? (effectiveMode === 'restricted' ? stats.restricted : stats.all) : null;
  const modeLabel = effectiveMode === 'restricted' ? 'restricted ' : '';
  const watchTop = useMemo(() => bucket?.watch_out?.[0] || null, [bucket]);

  // The hero row is unconditional now — a live month shows Watch Out!, a
  // finished one shows Month Champion instead, so the slot never needs to
  // predict what's coming to avoid a vanish-on-arrival skeleton the way the
  // old Watch-Out-only version did.
  const isCurrentMonth = Boolean(stats?.month?.is_current);

  // The All/Restricted toggle is the only thing that says which dataset is on
  // screen, and the two views are near-identical, so every bucket-scoped
  // section header carries a Restricted tag while it's on. Restricted Rate is
  // deliberately excluded: it is computed month-wide and reads the same in both
  // modes. Community Read is excluded too — Tier Upsets is bucket-scoped but the
  // consensus callout and submission counts above it are month-wide, so tagging
  // the section would over-claim.
  const isRestricted = effectiveMode === 'restricted';

  // Same gate Community Read uses internally: a live month always has tier
  // lists available; a finished one only carries the stat if it actually saw
  // submissions. Kept in sync here so the Overview card doesn't show a
  // "Tier Lists Submitted" cell for a month that predates the feature.
  const tierListsActive = isCurrentMonth || (stats?.tier_list?.submission_count || 0) > 0;

  // One line of page-level context. The controls row used to open the page with
  // no title at all, so it read as an unlabeled section rather than as chrome.
  const summary = bucket
    ? `${bucket.overview.total_shinies.toLocaleString()} ${modeLabel}${bucket.overview.total_shinies === 1 ? 'shiny' : 'shinies'} · ${bucket.overview.participants.toLocaleString()} ${bucket.overview.participants === 1 ? 'hunter' : 'hunters'}`
    : ' ';

  return (
    <div className="min-h-screen" style={{ background: SURFACE.page }}>
      <PageBackground />
      {/* No subtitle — the month is named in the page band below. */}
      <PageHeader title="Month Statistics" />

      {/* No max-w cap — TierList.jsx sets the precedent for a full-width
          dashboard page in this app; a fixed-column grid of cards fills wide
          monitors better than centering in a 1280px column with dead margins
          on either side. */}
      <main className="px-4 sm:px-6 py-5 space-y-6 min-w-0">
        {/* Page band: the month being viewed, a one-line read of it, and the two
            controls that govern the whole page. The border-b gives it its own
            boundary so `space-y-6` stops making it look like section #1. */}
        <div className="flex items-end justify-between gap-3 flex-wrap pb-4 border-b" style={{ borderColor: CARD.border }}>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong truncate">{monthLabel || ' '}</h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ModeToggle mode={effectiveMode} onChange={setMode} showRestricted={showRestricted} />
            <select
              value={monthId ?? ''}
              onChange={e => setMonthId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="px-3 py-2 rounded-lg text-sm text-strong outline-none border max-w-full truncate"
              // colorScheme: 'dark' is what actually darkens the native option
              // popup — the gradient `background` only ever styles the closed
              // control, leaving the expanded list white on Windows Chrome. The
              // per-option colors cover browsers that ignore color-scheme.
              style={{ background: CARD.inner, borderColor: CARD.border, colorScheme: 'dark' }}
            >
              <option value="" style={OPTION_STYLE}>Current Month{periods?.months?.[0] ? ` (${periods.months[0].label})` : ''}</option>
              {(periods?.months || []).filter(m => m.id !== periods?.months?.[0]?.id).map(m => (
                <option key={m.id} value={m.id} style={OPTION_STYLE}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error === 'reconnecting' && <div className="relative h-8"><ReconnectingPill label="Reconnecting to stats…" /></div>}

        {error === 'not_found' ? (
          <EmptyMonth showIcon={false} title="That month could not be found." message={null} />
        ) : loading ? (
          <div className="space-y-6">
            {/* Section order and grouping mirror the loaded layout exactly, so
                nothing shifts vertically or horizontally when the data lands.
                The hero row is unconditional — whichever of Watch Out! /
                Month Champion actually renders, the skeleton pair covers it. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
              <WatchOutSkeleton />
              <HunterSpotlightSkeleton />
            </div>

            {/* Three deliberately unequal columns, not a symmetric grid — a
                middle divider down an even split read as flat. Col 1 carries
                Overview + Top Hunted; col 2 (slightly wider) carries Most
                Unique Catch + Most Active Hunters + the bigger Catches by
                Game chart; col 3 is a narrow rail for Badges Earned,
                Community Read, and Rarest Catches. Nothing is meant to line
                up row-for-row across columns. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.7fr)] gap-6 items-start">
              <div className="space-y-6 min-w-0">
                <SectionCard title="Overview" restricted={isRestricted}><OverviewCardSkeleton cellCount={4} /></SectionCard>
                <SectionCard title="Top Hunted" restricted={isRestricted}><ListSkeleton rows={10} /></SectionCard>
              </div>
              <div className="space-y-6 min-w-0">
                <SectionCard title="Most Unique Catch" restricted={isRestricted}><UniqueCatchSkeleton /></SectionCard>
                <SectionCard title="Most Active Hunters" restricted={isRestricted}><ListSkeleton rows={5} /></SectionCard>
                <SectionCard title="Catches by Game" restricted={isRestricted}><PieSkeleton /></SectionCard>
              </div>
              <div className="space-y-6 min-w-0">
                <SectionCard title="Badges Earned"><ListSkeleton rows={5} /></SectionCard>
                <SectionCard title="Community Read"><CardSkeleton /></SectionCard>
                <SectionCard title="Rarest Catches" restricted={isRestricted}><RarestListSkeleton /></SectionCard>
              </div>
            </div>

            {mode === 'restricted' && (
              <SectionCard title="Restricted Rate"><RestrictedRateSkeleton /></SectionCard>
            )}
          </div>
        ) : !stats || !bucket ? null : isEmpty ? (
          <EmptyMonth />
        ) : (
          <>
            {/* Tier 1 — a matched hero pair. Watch Out! is the live race on a
                current month; Month Champion takes the same slot once the
                month is finished. Hunter Spotlight sits beside it either
                way — it's month-wide, not tied to whether the month is
                still live. */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
              <HeroSection label={isCurrentMonth ? 'Watch Out!' : 'Month Champion'} restricted={isCurrentMonth && isRestricted}>
                {isCurrentMonth ? (
                  <WatchOutHero
                    users={stats.users}
                    item={watchTop}
                    emptyLabel={`Every ${modeLabel}achievement has already been claimed this month.`}
                  />
                ) : (
                  <MonthChampionHero winner={stats.month_winner} users={stats.users} emptyLabel="No points were recorded this month." />
                )}
              </HeroSection>
              <HunterSpotlight items={stats.hunter_spotlight || []} />
            </div>

            {/* Three deliberately unequal columns, not a symmetric grid — an
                even split down the middle of a full-width page read flat.
                Col 1: Overview, then Top Hunted below it. Col 2 (slightly
                wider, since Catches by Game wants room for a bigger donut
                beside its key): Most Unique Catch, Most Active Hunters,
                Catches by Game. Col 3: a narrow rail — Badges Earned (fixed
                height), Community Read, then Rarest Catches, which used to
                sit orphaned in its own full-width row at the bottom of the
                page and now reads as one more panel in this rail instead —
                nothing here is meant to line up row-for-row with the other
                two columns. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.7fr)] gap-6 items-start">
              <div className="space-y-6 min-w-0">
                <SectionCard title="Overview" restricted={isRestricted}>
                  <OverviewCard
                    overview={bucket.overview}
                    trend={bucket.trend}
                    submissionCount={stats.tier_list?.submission_count || 0}
                    badgesCount={(stats.badges_this_month || []).length}
                    showTierLists={tierListsActive}
                  />
                </SectionCard>
                <SectionCard title="Top Hunted" restricted={isRestricted}>
                  <TopHunted items={bucket.top_hunted} pokemon={stats.pokemon} emptyLabel={`No ${modeLabel}catches recorded yet.`} />
                </SectionCard>
              </div>

              <div className="space-y-6 min-w-0">
                <SectionCard title="Most Unique Catch" restricted={isRestricted}>
                  <UniqueCatch
                    pokemon={stats.pokemon}
                    users={stats.users}
                    unique={bucket.unique_catch}
                    emptyLabel={`No ${modeLabel}catches with a recorded game yet this month.`}
                  />
                </SectionCard>
                <SectionCard title="Most Active Hunters" restricted={isRestricted}>
                  <MostActive items={bucket.most_active} users={stats.users} emptyLabel={`No ${modeLabel}hunters yet this month.`} />
                </SectionCard>
                <SectionCard title="Catches by Game" restricted={isRestricted}>
                  <CatchesByGame items={bucket.catches_by_game} emptyLabel={`No ${modeLabel}catches recorded yet.`} />
                </SectionCard>
              </div>

              <div className="space-y-6 min-w-0">
                <SectionCard title="Badges Earned">
                  <BadgesThisMonth items={stats.badges_this_month || []} emptyLabel="No badges earned yet this month." />
                </SectionCard>
                {tierListsActive && <CommunityRead stats={stats} />}
                <SectionCard title="Rarest Catches" restricted={isRestricted}>
                  <RarestCatches
                    pokemon={stats.pokemon}
                    users={stats.users}
                    items={bucket.rarest_catches || []}
                    emptyLabel={`Every ${modeLabel}Pokémon caught this month has been caught by more than one hunter.`}
                  />
                </SectionCard>
              </div>
            </div>

            {/* In Restricted mode this is 100% by definition, so it only renders
                for the Restricted view — the breakdowns are context for someone
                already looking at restricted hunting. */}
            {effectiveMode === 'restricted' && (
              <SectionCard title="Restricted Rate">
                <RestrictedRate rate={stats.restricted_rate} pokemon={stats.pokemon} />
              </SectionCard>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MonthStats;
