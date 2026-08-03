/** @type {import('tailwindcss').Config} */

// Design tokens — see docs/DESIGN_TOKENS.md for the full spec, the contrast
// table, and the old-hex → token migration map.
//
// These are the SAME values exported from src/constants/theme.js. Use the
// Tailwind classes here for `className`; import from theme.js for the inline
// `style={{}}` gradients Tailwind can't express. Do not let the two drift.
//
// Naming note: keys are chosen so the GENERATED class reads correctly. Text
// levels are top-level keys (`strong` → `text-strong`) rather than nested under
// a `text` key, which would emit `text-text-strong`. Border levels are named
// `hairline`/`edge`/`outline` for the same reason — a `strong` border key would
// collide with the `strong` text key on `border-strong`/`text-strong`.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Surfaces: three levels — page, card, well. That's the whole hierarchy.
        // The `-alt` values are the far stop of a 160deg gradient and are NEVER
        // used on their own; reach for GRADIENT.card / GRADIENT.inset in theme.js.
        surface: {
          DEFAULT: '#0d0f14',      // bg-surface           — the page, once per route
          card: '#1a1c23',         // bg-surface-card      — anything sitting on the page
          'card-alt': '#1f2128',   // gradient partner for `card`
          inset: '#13151a',        // bg-surface-inset     — nested well; also the sticky header
          'inset-alt': '#181a21',  // gradient partner for `inset`
        },

        // ── Borders. White at low alpha so they composite correctly over the
        // card gradients — opaque grays read a different weight at each end.
        hairline: 'rgba(255,255,255,0.06)', // border-hairline — default: card edges, dividers
        edge: 'rgba(255,255,255,0.12)',     // border-edge     — inputs, buttons, hover
        outline: 'rgba(255,255,255,0.24)',  // border-outline  — focus rings, selected

        // ── Text. `faint` is decorative-only — it is 2.1–4.0:1 and must never
        // carry a character the user has to read. See DESIGN_TOKENS.md §5.
        strong: '#ffffff', // text-strong — headings, key numbers
        body: '#d1d5db',   // text-body   — sentences and labels
        muted: '#9ca3af',  // text-muted  — captions, eyebrows, metadata; the floor for text
        faint: '#6b7280',  // text-faint  — icon strokes, chevrons, disabled. NOT text.

        // ── Accent. One family. `accent` is for text/icons (5.91:1 worst case),
        // `accent-strong` is for fills only (3.80:1 — illegal as text).
        accent: {
          DEFAULT: '#a78bfa',
          strong: '#8b5cf6',
        },

        // ── Semantic. Base = text, `-strong` = fill. That split is what makes
        // the contrast table pass; it is not a stylistic preference.
        success: { DEFAULT: '#34d399', strong: '#10b981' },
        warn: { DEFAULT: '#fbbf24', strong: '#f59e0b' },
        danger: { DEFAULT: '#f87171', strong: '#ef4444' },

        // ── Brand + domain. All fills except `twitch-text`.
        twitch: {
          DEFAULT: '#9147ff',  // logo/fill only — 3.48:1
          text: '#a98ff3',     // Twitch-tinted text, live badge label
        },
        discord: '#5865f2',    // logo/fill only — 3.49:1
        restricted: '#78150a', // Restricted-challenge fill. Text on it: text-strong.

        // Deprecated aliases, kept so nothing breaks mid-migration.
        // Delete once DESIGN_TOKENS.md §6.4 has been applied everywhere.
        primary: '#8b5cf6',
        secondary: '#ec4899',
      },
    },
  },
  safelist: [
    // BDSPRadar StatCard dynamic color lookup (COLOR_MAP)
    'text-emerald-400',
    'text-yellow-400',
    'text-red-400',
    'text-amber-400',
    'text-pink-400',
    'text-violet-400',
    // BDSPRadar range slider accent
    'accent-indigo-500',
  ],
  plugins: [],
}
