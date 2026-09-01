// Tier-list color system — used ONLY for tier rows/badges (Community Tier List,
// Month Stats consensus callout). Per gan-harness/spec.md these are intentionally
// NOT added to tailwind.config.js (applied as inline style hex values instead) —
// they're already covered by the existing Tailwind safelist referenced in CLAUDE.md.
//
// `sleeper` is one of the tiers. Making it an orthogonal flag was proposed
// (docs/TIER_LIST_PLAN.md Q4) and reversed by the owner on 2026-08-02.
//
// `cant_get` ("Can't Get") is an OFF-SCALE tier: it renders as its own row
// below Easy but is NOT part of the difficulty ordering. It is deliberately
// excluded from every ordering-based comparison — it is neither above nor
// below any other tier. Concretely: it never appears in the difficulty-ordered
// analytics (OVERACHIEVER_TIERS / TRAP_TIERS in api/_routes/stats.js), and the
// compare-view chevron in TierCompareGrid.jsx skips any card whose tier is
// `cant_get` on either side rather than reading its TIER_ORDER index. Keep it
// LAST in TIER_CODES so the ordered slice `TIER_CODES.slice(0, -1)` yields just
// the difficulty scale when a caller needs that.
export const TIER_CODES = ['easy', 'medium', 'hard', 'super_hard', 'sleeper', 'cant_get'];

// Tiers that form the difficulty scale (everything except the off-scale
// `cant_get`). Use this, not TIER_CODES, wherever order carries meaning.
export const DIFFICULTY_TIER_CODES = ['easy', 'medium', 'hard', 'super_hard', 'sleeper'];

// Off-scale tiers — rendered as rows but never ordered against the scale.
export const OFF_SCALE_TIER_CODES = ['cant_get'];

// Display order (top -> bottom): Sleeper at top, Easy at the bottom of the
// difficulty scale, then the off-scale Can't Get pinned below everything.
export const TIER_ORDER = [...DIFFICULTY_TIER_CODES].reverse().concat(OFF_SCALE_TIER_CODES);

export const TIER_COLORS = {
  easy: '#10b981',       // emerald-500
  medium: '#eab308',     // yellow-500
  hard: '#f59e0b',       // amber-500
  super_hard: '#ef4444', // red-500
  sleeper: '#8b5cf6',    // violet-500
  cant_get: '#6b7280',   // gray-500 — neutral, signals "off the difficulty scale"
};

// Full display name for each tier code.
export const TIER_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  super_hard: 'Super Hard',
  sleeper: 'Sleeper',
  cant_get: "Can't Get",
};

// Compact 1-2 letter glyph for the 48x48 tier badge (full names don't fit).
export const TIER_SHORT = {
  easy: 'E',
  medium: 'M',
  hard: 'H',
  super_hard: 'SH',
  sleeper: 'SL',
  cant_get: 'CG',
};

// Dark text reads better than white on these mid/light tier colors.
export const TIER_TEXT_ON_BADGE = '#0d0f14';
