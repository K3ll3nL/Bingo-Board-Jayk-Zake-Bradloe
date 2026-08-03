import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import ReconnectingPill from './ReconnectingPill';
import AchievementIcon from './AchievementIcon';
import PokemonImage from './PokemonImage';
import { api } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
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

// Game logos live in ALLOWED_GAMES keyed by slug; the API resolves entries.game
// (which stores the label, not the slug) into game_key for exactly this lookup.
const GAME_BY_KEY = Object.fromEntries(ALLOWED_GAMES.map(g => [g.key, g]));

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
//
// `stretch` opts a section into filling its grid row: the section becomes a
// flex column and its panel gets the leftover height. Only Overview and Most
// Unique Catch use it — they share a row and were the most visibly ragged pair
// on the page. Equalising via the grid (items-stretch is the default) rather
// than a hardcoded height keeps it correct when the carousel holds a long
// Pokémon name or a two-line caption.
const SectionCard = ({ title, children, className = '', restricted = false, stretch = false }) => (
  <section className={`min-w-0 ${stretch ? 'flex flex-col' : ''} ${className}`}>
    <h2 className={`${SECTION_LABEL} mb-2 min-w-0`}>
      <span className="block truncate">{restrictedTitle(title, restricted)}</span>
    </h2>
    {stretch ? <div className="flex-1 min-w-0 flex flex-col">{children}</div> : children}
  </section>
);

// Tier 1. Watch Out! only, and only while a month is live. A finished month has
// no race left, so the hero slot is simply empty there — a past month is
// otherwise structurally identical to a live one, which is why Overview stays a
// Tier-2 panel in both cases rather than being promoted and restyled.
// The eyebrow lives *inside* the card so the hero reads as one object, and it is
// the only section on the page with a tinted background — that tint is the
// reward for being the lead, which is why nothing else gets one.
const HeroSection = ({ label, restricted = false, children }) => (
  <section
    className={`rounded-xl border ${HERO_PAD} min-w-0 overflow-hidden`}
    style={{
      background: `linear-gradient(135deg, rgba(${ACCENT_RGB},0.10) 0%, rgba(26,28,35,0.95) 45%)`,
      borderColor: `rgba(${ACCENT_RGB},0.35)`,
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
const HeroShellSkeleton = ({ children }) => (
  <div
    className={`rounded-xl border ${HERO_PAD} min-w-0 overflow-hidden`}
    style={{
      background: `linear-gradient(135deg, rgba(${ACCENT_RGB},0.10) 0%, rgba(26,28,35,0.95) 45%)`,
      borderColor: `rgba(${ACCENT_RGB},0.35)`,
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

// Mirrors StatTile's anatomy line for line — label, figure, bar, caption. The
// caption row is easy to forget and is worth ~13px per tile on its own.
const StatTileSkeleton = () => (
  <div className={`rounded-xl ${PANEL_PAD} border min-w-0`} style={{ background: CARD.bg, borderColor: CARD.border }}>
    <Shimmer className="h-3.5 w-24 mb-1" />
    <Shimmer className="h-6 w-16 mb-2" />
    <Shimmer className="h-1.5 w-full" />
    <Shimmer className="h-4 w-40 max-w-full mt-1.5" />
  </div>
);

const OverviewSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
    <StatTileSkeleton />
    <StatTileSkeleton />
  </div>
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
          <div className={`${PANEL_FIGURE} font-bold text-strong truncate`}>{WATCH_LABELS[item.type] || item.type}</div>
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

// ── Overview ─────────────────────────────────────────────────────────────────
// A progress bar has to be a part of a whole, or it is decoration. Both earlier
// attempts failed that test: sharing one max made Participants a permanent stub
// (participants can never exceed catches), and scaling an average against the
// top hunter compared a number to something it isn't part of.
// The bar is this month as a fraction of the best month on record, and the
// caption is the delta against the previous active month. Restricted is never
// mentioned — that split belongs to the toggle, not to a headline number.
//
// There is no past-month variant. Overview renders identically on a live month
// and a finished one; the only structural difference between the two is that a
// finished month has no Watch Out! hero above it.
const StatTile = ({ label, value, color, best, prev, prevLabel, inProgress }) => {
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
    caption = `${sign}${delta}% vs ${prevLabel}${inProgress ? ' so far' : ''}`;
  }

  return (
    // flex-col + mt-auto on the bar: when the tile is stretched to match its
    // row partner the slack lands between the figure and the bar, so the label/
    // figure stay top-aligned and the bar/caption stay bottom-aligned. At
    // natural height (mobile, or when Overview is the taller half) it renders
    // identically to a plain block.
    <div className={`rounded-xl ${PANEL_PAD} border min-w-0 flex flex-col`} style={{ background: CARD.bg, borderColor: CARD.border }}>
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

// h-full so the two tiles absorb the slack when Most Unique Catch (its row
// partner) is the taller of the pair.
const OverviewRow = ({ overview, trend }) => {
  const t = trend || {};
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
      <StatTile
        label="Total Shinies"
        value={overview.total_shinies}
        color={WARN}
        best={t.best_total || 0}
        prev={t.prev_total}
        prevLabel={t.prev_label}
        inProgress={t.in_progress}
      />
      <StatTile
        label="Participants"
        value={overview.participants}
        color={ACCENT}
        best={t.best_participants || 0}
        prev={t.prev_participants}
        prevLabel={t.prev_label}
        inProgress={t.in_progress}
      />
    </div>
  );
};

// ── Most Unique Catch ────────────────────────────────────────────────────────
// The rarest (pokemon, game) pairing this month. Ties rotate through a carousel
// rather than picking arbitrarily: the whole card slides, so each tie reads as
// its own card rather than as one card whose contents mutate.
const GameLogos = ({ gameKey, label }) => {
  const urls = GAME_BY_KEY[gameKey]?.img_urls || [];
  if (!urls.length) return <div className="text-xs text-muted truncate">{label}</div>;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {urls.map(u => (
        <img key={u} src={u} alt={label} title={label} draggable="false" className="h-8 sm:h-10 w-auto object-contain" />
      ))}
    </div>
  );
};

const UniqueCatch = ({ unique, emptyLabel, pokemon, users }) => {
  const [idx, setIdx] = useState(0);
  const items = unique?.items || [];

  // Reset when the bucket/month swaps out from under a non-zero index.
  useEffect(() => { setIdx(0); }, [items.length, items[0]?.pokemon_id]);

  // Auto-advance ties so all of them get seen without the user hunting for
  // controls; pauses at a single item since there is nothing to rotate.
  useEffect(() => {
    if (items.length < 2) return undefined;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [items.length]);

  if (!unique?.available || !items.length) return <EmptyCard className="h-full">{emptyLabel}</EmptyCard>;
  const active = Math.min(idx, items.length - 1);

  const item = items[active];

  return (
    // One card frame. Only the upper region is a sliding track — the footer sits
    // outside it and stays put, so the dots it holds don't slide away with the
    // content they control.
    // h-full + flex-col: the card fills its grid row (equalised with Overview),
    // the track takes the slack, and the footer stays pinned to the bottom edge
    // instead of floating mid-card.
    <div className="rounded-xl border overflow-hidden min-w-0 h-full flex flex-col" style={{ background: CARD.bg, borderColor: CARD.border }}>
      <div className="overflow-hidden flex-1">
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {items.map(it => (
            <div key={`${it.user_id}-${it.pokemon_id}`} className={`w-full shrink-0 min-w-0 ${PANEL_PAD} flex items-center gap-4`}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden" style={{ background: CARD.inner }}>
                <PokemonImage pokemon={monOf(pokemon, it.pokemon_id)} className="w-full h-full" disableCycling />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-strong truncate">{monOf(pokemon, it.pokemon_id).name}</div>
                <div className="text-xs text-muted truncate">{it.game_label}</div>
                <Link to={`/profile/${it.user_id}`} className="text-xs mt-1 inline-block truncate max-w-full hover:underline" style={{ color: ACCENT }}>
                  caught by {hunterOf(users, it.user_id)}
                </Link>
              </div>
              <GameLogos gameKey={it.game_key} label={it.game_label} />
            </div>
          ))}
        </div>
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
                onClick={() => setIdx(i)}
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

// ── Tier Upsets ──────────────────────────────────────────────────────────────
// The community's tier list vs what actually got caught. `accent` here is TEXT,
// so it takes the base half of a semantic pair (success/danger), never the fill
// half — #10b981 and #ef4444 both fail 4.5:1 at the bottom of the card gradient.
const UpsetCard = ({ side, title, blurb, accent, pokemon }) => {
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
        <div className="text-xs text-muted truncate">
          <span style={{ color: tierColor }}>{side.pct}% voted {TIER_LABELS[side.tier] || side.tier}</span>
          {' · '}{side.catch_count} {side.catch_count === 1 ? 'catch' : 'catches'}
        </div>
      </div>
      <div className="hidden sm:block shrink-0 text-right text-xs text-muted max-w-[7.5rem]">{blurb}</div>
    </div>
  );
};

const TierUpsets = ({ upsets, pokemon }) => (
  <div className="grid grid-cols-1 gap-3">
    <UpsetCard side={upsets.overachiever} title="Overachiever" blurb="Voted brutal, caught anyway" accent={SUCCESS} pokemon={pokemon} />
    <UpsetCard side={upsets.trap} title="The Trap" blurb="Voted easy, nobody landed it" accent={DANGER} pokemon={pokemon} />
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
const CommunityRead = ({ stats, bucket }) => {
  const tierList = stats.tier_list || { submission_count: 0, viewer_submitted: false };
  const isCurrent = Boolean(stats.month?.is_current);
  const upsets = bucket.tier_upsets;

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
        <div className="text-sm text-strong truncate">
          <span className="font-bold">{callout.name}</span> placed {callout.percentage}% in {TIER_LABELS[callout.tier] || callout.tier} tier
        </div>
        <div className="text-xs text-muted truncate">{callout.submission_count} rankers</div>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 w-28">
        <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: `${callout.percentage}%`, backgroundColor: tierColor }} />
        </div>
      </div>
    </div>
  );
};

// ── Rarest Catches ───────────────────────────────────────────────────────────
// Mons exactly one hunter landed this month.
const RarestCatches = ({ items, emptyLabel, pokemon, users }) => {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return <EmptyCard>{emptyLabel}</EmptyCard>;
  const LIMIT = 6;
  const shown = expanded ? items : items.slice(0, LIMIT);
  return (
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
  );
};

// ── Restricted Rate ──────────────────────────────────────────────────────────
// Computed from every entry, not the active bucket, so the figure reads the same
// either way. Renders only in Restricted mode — the breakdowns are context for
// someone already looking at restricted hunting.
const RateBar = ({ label, total, restricted, pct }) => (
  <div className="flex items-center gap-3 min-w-0">
    <div className="w-28 sm:w-44 shrink-0 text-xs text-muted truncate">{label}</div>
    <div className="flex-1 min-w-0 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, pct)}%`, background: RESTRICTED }} />
    </div>
    <div className="shrink-0 w-20 text-right text-xs">
      <span className="font-bold text-strong">{pct}%</span>
      <span className="text-muted"> · {restricted}/{total}</span>
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

const CatchesByGame = ({ items, emptyLabel }) => {
  if (!items.length) return <EmptyCard>{emptyLabel}</EmptyCard>;
  const max = items[0]?.catch_count || 1;
  return (
    <div className={`rounded-xl ${PANEL_PAD} border space-y-2.5 min-w-0`} style={{ background: CARD.bg, borderColor: CARD.border }}>
      {items.map(g => (
        <div key={g.game_key} className="flex items-center gap-3 min-w-0">
          <div className="w-28 sm:w-44 shrink-0 text-xs text-muted truncate">{g.label}</div>
          <div className="flex-1 min-w-0 h-4 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full flex items-center justify-end px-2 transition-all duration-500"
              style={{ width: `${Math.max(6, Math.round((g.catch_count / max) * 100))}%`, background: ACCENT_FILL }}
            >
              <span className="text-[10px] font-bold text-strong leading-none">{g.catch_count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Whole-page state, not a panel — it keeps its own generous padding.
const EmptyMonth = ({ icon = '🗓️', title = 'No submissions yet this month, check back soon!', message = 'Stats will populate as hunters start submitting catches.' }) => (
  <div className="rounded-xl p-10 border text-center min-w-0" style={{ background: CARD.bg, borderColor: CARD.border }}>
    {icon && <div className="text-3xl mb-2">{icon}</div>}
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

  // Watch Out! only exists on the current month, and that is knowable before the
  // response lands: `monthId === null` *is* the current month, and any explicit
  // id can be compared against the newest period. Predicting it keeps the
  // skeleton from rendering a Watch Out! card that then vanishes on arrival.
  // `stats.month.is_current` stays authoritative once loaded.
  // While a fetch is in flight `stats` still holds the *previous* month, so its
  // is_current would answer for the wrong month — hence the prediction wins
  // until the matching response lands.
  const activeMonthId = periods?.months?.[0]?.id ?? null;
  const expectsWatchOut = monthId === null || (activeMonthId !== null && monthId === activeMonthId);
  const showWatchOut = !loading && stats?.month ? Boolean(stats.month.is_current) : expectsWatchOut;
  // A past month is structurally identical to a live one, minus Watch Out!. The
  // hero slot is simply empty there — Overview is NOT promoted into it. An
  // earlier revision did promote and restyle it, which made a finished month
  // read as a different page rather than the same page with one section retired.
  // The hero is a plain sibling in the `space-y-6` column, so omitting it leaves
  // no hole and no ragged row.

  // The All/Restricted toggle is the only thing that says which dataset is on
  // screen, and the two views are near-identical, so every bucket-scoped
  // section header carries a Restricted tag while it's on. Restricted Rate is
  // deliberately excluded: it is computed month-wide and reads the same in both
  // modes. Community Read is excluded too — Tier Upsets is bucket-scoped but the
  // consensus callout and submission counts above it are month-wide, so tagging
  // the section would over-claim.
  const isRestricted = effectiveMode === 'restricted';

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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-6">
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
              className="px-3 py-2 rounded-lg text-sm text-strong outline-none border"
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
          <EmptyMonth icon={null} title="That month could not be found." message={null} />
        ) : loading ? (
          <div className="space-y-6">
            {/* Section order and grouping mirror the loaded layout exactly, so
                nothing shifts vertically or horizontally when the data lands. */}
            {/* Hero slot only when a race is expected. On a past month it is
                absent entirely — the skeleton has no past-month hero branch
                because the loaded layout no longer has one either. */}
            {showWatchOut && <WatchOutSkeleton />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Overview" restricted={isRestricted} stretch><OverviewSkeleton /></SectionCard>
              <SectionCard title="Most Unique Catch" restricted={isRestricted} stretch>
                <UniqueCatchSkeleton />
              </SectionCard>
            </div>

            {/* Community Read always renders something on the current month (a
                CTA at minimum) but disappears on a past month that predates
                tier lists — which is most of them. Same prediction as Watch
                Out!: reserve the space only when we expect the current month. */}
            {expectsWatchOut && <SectionCard title="Community Read"><CardSkeleton /></SectionCard>}

            {/* Predictable-height panels first. Both guesses below split on
                whether the month is finished, which is knowable before the
                response (same prediction as Watch Out!). */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <SectionCard title="Top Hunted" restricted={isRestricted}><ListSkeleton rows={expectsWatchOut ? 8 : 10} /></SectionCard>
              <SectionCard title="Most Active Hunters" restricted={isRestricted}><ListSkeleton rows={5} /></SectionCard>
            </div>

            {/* Then the two panels whose height nobody can predict, at the
                bottom where a wrong guess costs the least. Catches by Game runs
                1–13 bars; Rarest Catches runs 1–24 rows (capped at 6 before
                "show more") and shrinks as a month matures. 3 stays a deliberate
                under-guess: undershooting nudges content down a little,
                overshooting drops it a long way. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <SectionCard title="Catches by Game" restricted={isRestricted}><BarsSkeleton rows={expectsWatchOut ? 3 : 8} /></SectionCard>
              <SectionCard title="Rarest Catches" restricted={isRestricted}><ListSkeleton rows={3} /></SectionCard>
            </div>

            {mode === 'restricted' && (
              <SectionCard title="Restricted Rate"><RestrictedRateSkeleton /></SectionCard>
            )}
          </div>
        ) : !stats || !bucket ? null : isEmpty ? (
          <EmptyMonth />
        ) : (
          <>
            {/* Tier 1 — Watch Out! and nothing else. It leads a live month
                because it is the only section with stakes. A finished month has
                nothing left to claim (the API returns watch_out: []), so the
                slot is simply empty and the page below it is unchanged. */}
            {showWatchOut && (
              <HeroSection label="Watch Out!" restricted={isRestricted}>
                <WatchOutHero
                  users={stats.users}
                  item={watchTop}
                  emptyLabel={`Every ${modeLabel}achievement has already been claimed this month.`}
                />
              </HeroSection>
            )}

            {/* Tier 2 — what happened this month. Both halves are `stretch`, so
                whichever is taller sets the row and the other fills to match. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard title="Overview" restricted={isRestricted} stretch>
                <OverviewRow overview={bucket.overview} trend={bucket.trend} />
              </SectionCard>
              <SectionCard title="Most Unique Catch" restricted={isRestricted} stretch>
                <UniqueCatch
                  pokemon={stats.pokemon}
                  users={stats.users}
                  unique={bucket.unique_catch}
                  emptyLabel={`No ${modeLabel}catches with a recorded game yet this month.`}
                />
              </SectionCard>
            </div>

            <CommunityRead stats={stats} bucket={bucket} />

            {/* Tier 3 — reference lists, ordered by how predictable their
                height is rather than by topic. Top Hunted and Most Active are
                API-capped and land on the same row counts every month, so they
                pair cleanly and can sit directly under the Tier-2 block. The two
                variable panels go last: Catches by Game runs 1–13 bars and
                Rarest Catches 1–24 rows, so wherever they sit they will be
                ragged against their neighbour — at the bottom that costs
                nothing, higher up it pushes everything below them around. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <SectionCard title="Top Hunted" restricted={isRestricted}>
                <TopHunted items={bucket.top_hunted} pokemon={stats.pokemon} emptyLabel={`No ${modeLabel}catches recorded yet.`} />
              </SectionCard>
              <SectionCard title="Most Active Hunters" restricted={isRestricted}>
                <MostActive items={bucket.most_active} users={stats.users} emptyLabel={`No ${modeLabel}hunters yet this month.`} />
              </SectionCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <SectionCard title="Catches by Game" restricted={isRestricted}>
                <CatchesByGame items={bucket.catches_by_game} emptyLabel={`No ${modeLabel}catches recorded yet.`} />
              </SectionCard>
              <SectionCard title="Rarest Catches" restricted={isRestricted}>
                <RarestCatches
                  pokemon={stats.pokemon}
                  users={stats.users}
                  items={bucket.rarest_catches || []}
                  emptyLabel={`Every ${modeLabel}Pokémon caught this month has been caught by more than one hunter.`}
                />
              </SectionCard>
            </div>

            {/* In Restricted mode this is 100% by definition, so it only renders
                for the Restricted view — the breakdowns are context for someone
                already looking at restricted hunting. Full width because its
                rows are label + bar + figure and it is the one Tier-3 panel that
                actually uses the space. */}
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
