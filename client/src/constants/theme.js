// Design tokens as JS constants — the same values declared in
// client/tailwind.config.js, for the many places that build a colour into an
// inline `style={{}}` (gradients especially) where a Tailwind class can't reach.
// See docs/DESIGN_TOKENS.md for the spec, contrast table, and migration map.
//
// Prefer the Tailwind class when the value goes straight onto `className`
// (`text-muted`, `bg-surface-card`, `border-hairline`). Reach for these when the
// value is composed — a gradient string, a computed `color`, a chart series.
// If you change a value here, change it in tailwind.config.js in the same edit.

// ── Surfaces ────────────────────────────────────────────────────────────────
// Three levels and no more: page, card, well. `*_ALT` is the far stop of a
// gradient and is never correct on its own — use GRADIENT below.
export const SURFACE = {
  page: '#0d0f14',
  card: '#1a1c23',
  cardAlt: '#1f2128',
  inset: '#13151a',
  insetAlt: '#181a21',
};

// The two canonical fills. These exact strings appear inline in dozens of
// components today; import them instead of retyping the 160deg literal.
export const GRADIENT = {
  card: `linear-gradient(160deg, ${SURFACE.card} 0%, ${SURFACE.cardAlt} 100%)`,
  inset: `linear-gradient(160deg, ${SURFACE.inset} 0%, ${SURFACE.insetAlt} 100%)`,
};

// ── Borders ─────────────────────────────────────────────────────────────────
// White at low alpha, not opaque gray: an opaque border reads as a different
// weight at each end of a card gradient, a translucent one doesn't.
export const BORDER = {
  hairline: 'rgba(255,255,255,0.06)', // card edges, dividers, rules — ~90% of borders
  edge: 'rgba(255,255,255,0.12)',     // inputs, buttons, hover states
  outline: 'rgba(255,255,255,0.24)',  // focus rings, selected/active outlines
};

// ── Text ────────────────────────────────────────────────────────────────────
// `faint` is 2.1–4.0:1 against our surfaces and is DECORATIVE ONLY — icon
// strokes, chevrons, disabled controls. Never a character the user must read;
// `muted` is the floor for that. See DESIGN_TOKENS.md §5.
export const TEXT = {
  strong: '#ffffff',
  body: '#d1d5db',
  muted: '#9ca3af',
  faint: '#6b7280',
};

// ── Accent ──────────────────────────────────────────────────────────────────
// One family. `accent` is the text/icon value; `strong` is a FILL and fails
// 4.5:1 as text — that pairing is the point, not an oversight.
export const ACCENT = {
  base: '#a78bfa',
  strong: '#8b5cf6',
};

// ── Semantic ────────────────────────────────────────────────────────────────
// Same rule as ACCENT throughout: `base` for text and icons, `strong` for fills
// and bars.
export const SEMANTIC = {
  success: { base: '#34d399', strong: '#10b981' },
  warn: { base: '#fbbf24', strong: '#f59e0b' },
  danger: { base: '#f87171', strong: '#ef4444' },
};

// ── Brand + domain ──────────────────────────────────────────────────────────
// `twitch` and `discord` are logo/fill values and both sit near 3.5:1 — use
// `twitchText` for Twitch-tinted copy. `restricted` is a background; text on it
// must be TEXT.strong (11.0:1).
export const BRAND = {
  twitch: '#9147ff',
  twitchText: '#a98ff3',
  discord: '#5865f2',
  restricted: '#78150a',
};

// ── Type scale ──────────────────────────────────────────────────────────────
// Seven steps. 9px/11px/16px were dropped deliberately: they aren't
// distinguishable enough from their neighbours to read as intent rather than
// drift. `micro` almost always ships as an eyebrow — see EYEBROW below.
export const TEXT_SIZE = {
  micro: '10px', // uppercase eyebrows, chip counters
  xs: '12px',    // captions, metadata, dense cells
  sm: '14px',    // default body — the workhorse
  lg: '18px',    // card titles, section headings
  xl2: '24px',   // stat numbers, panel headline figures
  xl3: '30px',   // page hero figure
};

// Three weights. Rubik is variable (100–900) so more are free to render, but not
// free to reason about — `medium` is indistinguishable from `normal` at 12px,
// which is where most of its uses were.
export const FONT_WEIGHT = {
  normal: 400,
  semibold: 600,
  bold: 700,
};

// The one composite type style worth naming: it appears ~150 times as three
// utilities repeated side by side.
export const EYEBROW = {
  fontSize: TEXT_SIZE.micro,
  fontWeight: FONT_WEIGHT.bold,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: TEXT.muted,
};

// ── Radius ──────────────────────────────────────────────────────────────────
// The card-vs-control distinction (12 vs 8) is the only radius choice that
// carries information; everything else collapses into it.
export const RADIUS = {
  sm: '4px',      // chips, tags, tiny inline elements
  md: '8px',      // buttons, inputs, list rows, inner wells
  lg: '12px',     // cards and panels
  full: '9999px', // avatars, pills, dots
};

// ── Spacing ─────────────────────────────────────────────────────────────────
// Six steps, no half-steps: a 2px gap adjustment isn't visible, but it does make
// two adjacent components look accidentally different.
export const SPACE = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
};
