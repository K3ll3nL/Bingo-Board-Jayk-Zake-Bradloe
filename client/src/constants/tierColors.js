// Tier-list color system — used ONLY for tier rows/badges (Community Tier List,
// Month Stats consensus callout). Per gan-harness/spec.md these are intentionally
// NOT added to tailwind.config.js (applied as inline style hex values instead) —
// they're already covered by the existing Tailwind safelist referenced in CLAUDE.md.
//
// `sleeper` is one of the five tiers. Making it an orthogonal flag was proposed
// (docs/TIER_LIST_PLAN.md Q4) and reversed by the owner on 2026-08-02.
export const TIER_CODES = ['easy', 'medium', 'hard', 'super_hard', 'sleeper'];

export const TIER_COLORS = {
  easy: '#10b981',       // emerald-500
  medium: '#eab308',     // yellow-500
  hard: '#f59e0b',       // amber-500
  super_hard: '#ef4444', // red-500
  sleeper: '#8b5cf6',    // violet-500
};

// Full display name for each tier code.
export const TIER_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  super_hard: 'Super Hard',
  sleeper: 'Sleeper',
};

// Compact 1-2 letter glyph for the 48x48 tier badge (full names don't fit).
export const TIER_SHORT = {
  easy: 'E',
  medium: 'M',
  hard: 'H',
  super_hard: 'SH',
  sleeper: 'SL',
};

// Dark text reads better than white on these mid/light tier colors.
export const TIER_TEXT_ON_BADGE = '#0d0f14';
