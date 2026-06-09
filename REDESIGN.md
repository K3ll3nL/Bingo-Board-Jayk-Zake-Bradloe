# Site-Wide UI Consistency Redesign

## Context
The site was built component-by-component with no shared design system. The result is 5 different dark background hex values, 90+ inline `style={{}}` overrides, no button variants, no card abstraction, and inconsistent typography hierarchy across every page. The goal is a consistency cleanup — same dark aesthetic, same purple brand — but everything unified so it looks intentional.

User priorities: keep purple accent, more polished cards, better typography hierarchy, tighter nav.

---

## Progress Tracking

- [ ] Phase 1 — Design tokens (`tailwind.config.js` + `index.css`)
- [ ] Phase 2a — `App.jsx` nav + home shell
- [ ] Phase 2b — `Leaderboard.jsx`
- [ ] Phase 2c — `Profile.jsx`
- [ ] Phase 2d — `Upload.jsx`
- [ ] Phase 2e — `About.jsx`
- [ ] Phase 2f — Modals (Feedback, Pokemon, BadgeCase, BadgePicker, BannerManager)
- [ ] Phase 2g — `BingoGrid.jsx` cell color constants
- [ ] Phase 3 — Typography audit (Profile + Leaderboard)
- [ ] Phase 4 — Nav/header polish

---

## Phase 1 — Design Tokens (do first, everything else references these)

### 1a. `client/tailwind.config.js` — extend theme colors

Replace the thin `primary`/`secondary` extension with a full semantic palette:

```js
colors: {
  // Backgrounds (3 levels, not 5)
  surface: {
    base:    '#212326',   // page background (was scattered as #212326, #1e1f22)
    raised:  '#2b2d31',   // cards, panels (consolidates #35373b / #2b2d31)
    overlay: '#1a1c1f',   // modals, dropdowns (was #1a1c1f)
  },
  // Borders
  border: {
    subtle:  '#3a3d42',   // faint dividers
    DEFAULT: '#4a4d54',   // standard card border
    strong:  '#5a5d64',   // hover / active border
  },
  // Text
  text: {
    primary:   '#f2f2f3',
    secondary: '#a0a3ab',
    muted:     '#636670',
  },
  // Brand / accents (keep purple, keep pink)
  brand: {
    DEFAULT: '#8b5cf6',
    hover:   '#7c3aed',
    muted:   'rgba(139,92,246,0.15)',
  },
  pink: {
    DEFAULT: '#ec4899',
  },
  // Semantic state colors
  state: {
    success:    '#16a34a',
    pending:    '#ca8a04',
    restricted: '#2563eb',
    danger:     '#dc2626',
  },
}
```

Keep the safelist for dynamic `text-*-400` classes (StatCard).

### 1b. `client/src/index.css` — CSS variables + `@layer components`

Add CSS variables for JS-accessible colors (inline styles that must remain dynamic, e.g. canvas/chart):

```css
:root {
  --color-surface-base:    #212326;
  --color-surface-raised:  #2b2d31;
  --color-surface-overlay: #1a1c1f;
  --color-border:          #4a4d54;
  --color-brand:           #8b5cf6;
}
```

Add `@layer components` utility classes to replace the most-repeated inline patterns:

```css
@layer components {
  /* Cards */
  .card {
    @apply bg-surface-raised border border-border rounded-xl shadow-lg;
  }
  .card-padded {
    @apply card p-5;
  }

  /* Buttons */
  .btn {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm;
  }
  .btn-primary {
    @apply btn bg-brand text-white hover:bg-brand-hover;
  }
  .btn-secondary {
    @apply btn bg-surface-overlay text-text-primary border border-border hover:border-border-strong;
  }
  .btn-ghost {
    @apply btn text-text-secondary hover:text-text-primary hover:bg-surface-overlay;
  }
  .btn-danger {
    @apply btn bg-state-danger text-white hover:bg-red-700;
  }

  /* Inputs */
  .input {
    @apply w-full bg-surface-overlay border border-border rounded-lg px-3 py-2 text-sm text-text-primary
           placeholder-text-muted focus:outline-none focus:border-brand transition-colors;
  }

  /* Page layout */
  .page-container {
    @apply max-w-6xl mx-auto px-4 py-8;
  }

  /* Section header */
  .section-title {
    @apply text-lg font-semibold text-text-primary tracking-tight;
  }

  /* Modals */
  .modal-backdrop {
    @apply fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4;
  }
  .modal-card {
    @apply bg-surface-overlay border border-border rounded-2xl shadow-2xl w-full max-w-lg;
  }
  .modal-header {
    @apply flex items-center justify-between px-6 py-4 border-b border-border;
  }
}
```

---

## Phase 2 — Apply tokens to components (page by page)

### 2a. `client/src/App.jsx` — Nav + home shell
- Header: replace `style={{ backgroundColor: '#35373b' }}` → `className="bg-surface-raised"`
- Hamburger dropdown: same swap
- Nav items: replace custom hover colors → `btn-ghost`
- Discord login button: keep `bg-[#5865F2]` (brand color, intentional exception)
- Home page cards: replace inline bg + border combos → `card-padded`
- Page wrapper: `min-h-screen bg-surface-base`
- `max-w-7xl mx-auto px-4` — keep as-is (home has side-by-side board + leaderboard)

### 2b. `client/src/components/Leaderboard.jsx`
- Container: replace inline `backgroundColor: '#212326'` → `bg-surface-base`
- Row hover: replace `hover:bg-gray-700` → `hover:bg-surface-overlay`
- Mode switcher tabs: standardize to `btn-ghost` selected/unselected states
- Row dividers: `divide-y divide-border`

### 2c. `client/src/components/Profile.jsx`
- Hero card: `card-padded` (biggest cleanup — 15+ inline styles)
- All stat cards: `card-padded` + remove individual inline `style={{ backgroundColor }}`
- Section headers: `section-title`
- Stat values: keep `text-brand` (purple numbers are intentional brand language)
- Points chart wrapper: `card-padded`
- Container: standardize to `page-container` (`max-w-6xl mx-auto px-4 py-8 space-y-6`)

### 2d. `client/src/components/Upload.jsx`
- Section panels: `card-padded` (20+ inline styles)
- All `<select>` and `<input>` elements: `input` class
- Submit/cancel buttons: `btn-primary` / `btn-secondary`
- Tab toggles (Current Month / Historical): use consistent `btn-ghost` selected pattern

### 2e. `client/src/components/About.jsx`
- Section cards: `card-padded`
- Exception accordion items: `border border-border rounded-xl` with `bg-surface-raised`
- Replace `rgba(145,71,255,0.08)` tinted cards → `bg-brand-muted border border-brand/20 rounded-xl`

### 2f. Modal components
All five modals share the same structure — apply uniformly:
- **`FeedbackModal.jsx`**: backdrop → `modal-backdrop`, card → `modal-card`, header → `modal-header`, inputs → `input`, buttons → `btn-primary` / `btn-secondary`
- **`PokemonModal.jsx`**: same pattern
- **`BadgeCaseModal.jsx`**: keep gradient top strip (intentional premium feel); swap card bg → `bg-surface-overlay`; keep yellow accent for slot 1–3 border
- **`BadgePickerModal.jsx`**: swap bg → `bg-surface-overlay`; align with BadgeCaseModal
- **`BannerManagerModal.jsx`**: `modal-card` pattern

### 2g. `client/src/components/BingoGrid.jsx`
- Cell state colors are functional — consolidate into a named constant at top of file:
  ```js
  const CELL_COLORS = {
    unchecked:  'var(--color-surface-base)',
    approved:   '#16a34a',
    pending:    '#854d0e',
    restricted: '#1e3a5f',
  };
  ```

---

## Phase 3 — Typography system

Define a consistent type scale used across all components:

| Role | Classes |
|---|---|
| Page title | `text-2xl font-bold text-text-primary` |
| Section title | `text-lg font-semibold text-text-primary` (= `.section-title`) |
| Label / stat name | `text-xs font-medium text-text-secondary uppercase tracking-wide` |
| Body | `text-sm text-text-primary` |
| Caption / muted | `text-xs text-text-muted` |
| Stat value | `text-3xl font-bold text-brand` |

Primary audit targets: `Profile.jsx` (has `text-s` typo, `text-5xl` jumps) and `Leaderboard.jsx`.

---

## Phase 4 — Nav / header polish

`App.jsx` header is the frame for every page:
- Consistent `py-3` padding on both home and sub-pages (currently `py-2 md:py-4` vs `py-2`)
- Mobile menu: `rounded-xl` corners, `w-56` width, `shadow-2xl border border-border`
- Menu item active state: left `border-l-2 border-brand` indicator
- Avatar ring: `ring-2 ring-brand` when logged in

---

## Critical Files

| File | What changes |
|---|---|
| `client/tailwind.config.js` | Add semantic color tokens |
| `client/src/index.css` | CSS vars + `@layer components` utilities |
| `client/src/App.jsx` | Nav, home shell, page wrapper |
| `client/src/components/Profile.jsx` | Biggest inline style cleanup |
| `client/src/components/Upload.jsx` | Form inputs, section panels |
| `client/src/components/Leaderboard.jsx` | Row styles, container |
| `client/src/components/About.jsx` | Section cards |
| `client/src/components/FeedbackModal.jsx` | Modal pattern |
| `client/src/components/PokemonModal.jsx` | Modal pattern |
| `client/src/components/BadgeCaseModal.jsx` | Modal pattern (keep gradient) |
| `client/src/components/BadgePickerModal.jsx` | Modal pattern |
| `client/src/components/BannerManagerModal.jsx` | Modal pattern |
| `client/src/components/BingoGrid.jsx` | Cell color constants |

---

## Verification

After Phase 1: site still renders, no visual change expected. Grep for `style={{` to track inline style count going down.

After each Phase 2 section, verify in browser (`localhost:5173`):
- Cards have consistent background, border, and radius
- No white flash from missing background
- Buttons have consistent size and hover
- Inputs have consistent focus ring

Final check: open Home, Leaderboard, Profile, Upload, About, trigger a modal on each — all backgrounds from the 3-level system, no stray inline hex colors.
