import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import PokemonImage from './PokemonImage';
import { GRADIENT, BORDER } from '../constants/theme';
import { TIER_COLORS } from '../constants/tierColors';

// Layout note (per gan-harness/spec.md, implementer's choice documented here):
// `HomeHighlights` (default export, the 3-card teaser row) renders BELOW the
// Board/Leaderboard grid. It is intentionally
// low-height/secondary so Board+Leaderboard stay the dominant, top-most
// elements at every viewport width.
//
// The old `PromoBanner` export (a hardcoded tier-list pill) was removed when the
// banner system took over conditional promos — that prompt is now a `banners`
// row with condition = 'tier_list_incomplete'. See BannerBar.jsx.
//
// Colour note (docs/DESIGN_TOKENS.md §3): this row used to invent a
// per-destination accent scheme (violet / red / pink) that existed nowhere else
// in the app, and whose "Shiny Tools" pink didn't even agree with the nav's
// yellow. That scheme is deleted. All three eyebrows are `text-muted`; the cards
// take their visual interest from their CONTENT, which already means something.
// The Tier List chip's red is `TIER_COLORS.super_hard` — there red means
// "Super Hard", not "this link goes to the tier list."

const CARD = {
  bg: GRADIENT.card,
  inner: GRADIENT.inset,
  border: BORDER.hairline,
};

// `justify-start` + `gap-2`, NOT `justify-between`: with a fixed minHeight a
// space-between column pushes a short body to the floor of the card and leaves a
// visible hole under the eyebrow (LAYOUT_AUDIT priority 4b). minHeight stays so
// the three cards keep an even row.
// `compact`: the caption sentences are what made these tall — at a ~180px
// column "submitted of those that have appeared" wraps to three lines and drags
// the whole row down. Compact drops the fixed minHeight and the captions, and
// the figure carries its unit inline on a single non-wrapping line instead.
const TeaserShell = ({ to, label, labelClass = 'text-muted', compact = false, children }) => (
  <Link
    to={to}
    className={`min-w-0 rounded-xl border flex flex-col justify-start transition-colors hover:bg-white/[0.03] ${compact ? 'p-3 gap-1.5' : 'p-4 gap-2'}`}
    style={{ background: CARD.bg, borderColor: CARD.border, minHeight: compact ? undefined : 108 }}
  >
    <div className="flex items-center justify-between">
      <span className={`text-[10px] font-bold uppercase tracking-widest ${labelClass}`}>{label}</span>
      <svg className="w-3.5 h-3.5 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
    <div className="min-w-0">{children}</div>
  </Link>
);

const Figure = ({ value, unit, muted }) => (
  <div className="flex items-baseline gap-1.5 min-w-0">
    <span className="text-xl font-bold text-white leading-none tabular-nums shrink-0">
      {value}
      {muted != null && <span className="text-muted font-normal">{muted}</span>}
    </span>
    <span className="text-xs text-muted truncate">{unit}</span>
  </div>
);

const CardSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    <div className="h-3 w-24 rounded bg-white/5" />
    <div className="h-6 w-16 rounded bg-white/5" />
  </div>
);

const MonthStatsTeaser = ({ compact }) => {
  const [state, setState] = useState({ loading: true, catches: null });

  useEffect(() => {
    let cancelled = false;
    api.getMonthStats()
      .then(data => { if (!cancelled) setState({ loading: false, catches: data.overview.total_shinies }); })
      .catch(() => { if (!cancelled) setState({ loading: false, catches: null }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <TeaserShell to="/stats" label="Month Stats" compact={compact}>
      {state.loading ? <CardSkeleton /> : compact ? (
        <Figure value={state.catches ?? '—'} unit="shinies" />
      ) : (
        <>
          <div className="text-2xl font-bold text-white leading-none">{state.catches ?? '—'}</div>
          <div className="text-xs text-muted mt-1">shinies logged this month</div>
        </>
      )}
    </TeaserShell>
  );
};

const TierListTeaser = ({ compact }) => {
  const [state, setState] = useState({ loading: true, mon: null });

  useEffect(() => {
    let cancelled = false;
    api.getTierList()
      .then(data => {
        if (cancelled) return;
        let best = null;
        (data.consensus || []).forEach(entry => {
          const s = entry.distribution?.super_hard || 0;
          if (s > 0 && (!best || s > best.count)) best = { pokemonId: String(entry.pokemon_id), count: s };
        });
        const mon = best ? (data.pool || []).find(p => String(p.pokemon_id) === best.pokemonId) : null;
        setState({ loading: false, mon: mon || null });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, mon: null }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <TeaserShell to="/tier-list" label="Tier List" compact={compact}>
      {state.loading ? <CardSkeleton /> : state.mon ? (
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} shrink-0 rounded-lg overflow-hidden border`}
            style={{ background: CARD.inner, borderColor: TIER_COLORS.super_hard }}
          >
            <PokemonImage pokemon={state.mon} className="w-full h-full" disableCycling />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{state.mon.name}</div>
            <div className="text-xs text-muted truncate">{compact ? 'hardest hunt' : "community's #1 Super Hard pick"}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-2xl font-bold text-white leading-none">—</div>
          <div className="text-xs text-muted mt-1">be the first to rank this month</div>
        </>
      )}
    </TeaserShell>
  );
};

// Opt-in fourth card. v1 and v2 render the original three, so this is gated
// behind a prop rather than changing their layout underneath them.
const PokedexTeaser = ({ compact }) => {
  const [state, setState] = useState({ loading: true, caught: null, appeared: null });

  useEffect(() => {
    let cancelled = false;
    api.getPokedexCounts()
      .then(d => { if (!cancelled) setState({ loading: false, caught: d.caughtCount, appeared: d.appearedCount }); })
      // 401 for signed-out visitors — fall through to the static line below.
      .catch(() => { if (!cancelled) setState({ loading: false, caught: null, appeared: null }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <TeaserShell to="/pokedex" label="Pokédex" compact={compact}>
      {state.loading ? <CardSkeleton /> : state.caught != null && state.appeared ? (
        compact ? (
          <Figure value={state.caught} muted={` / ${state.appeared}`} unit="seen" />
        ) : (
        <>
          <div className="text-2xl font-bold text-white leading-none tabular-nums">
            {state.caught}
            <span className="text-muted font-normal"> / {state.appeared}</span>
          </div>
          <div className="text-xs text-muted mt-1">submitted of those that have appeared</div>
        </>
        )
      ) : (
        <>
          <div className="text-sm font-bold text-white">Every shiny you've logged</div>
          <div className="text-xs text-muted mt-1">Browse the full living dex</div>
        </>
      )}
    </TeaserShell>
  );
};

const ToolsTeaser = ({ compact }) => (
  <TeaserShell to="/tools" label="Shiny Tools" labelClass="text-warn" compact={compact}>
    {compact ? (
      <div className="text-sm font-bold text-white">Tools, radars, &amp;&nbsp;calculators</div>
    ) : (
      <>
        <div className="text-sm font-bold text-white">Tools, radars, &amp;&nbsp;calculators</div>
        <div className="text-xs text-muted mt-1">Everything to plan your next hunt</div>
      </>
    )}
  </TeaserShell>
);

// `gap-6` matches the Board/Leaderboard grid directly above it, so the three
// teasers read as related to each other rather than to the panel above.
// Vertical spacing is the parent's job (LAYOUT_AUDIT priority 3).
const HomeHighlights = ({ includePokedex = false, compact = false, className = 'gap-6' }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${includePokedex ? 'lg:grid-cols-4' : 'sm:grid-cols-3'} ${className}`}>
    <MonthStatsTeaser compact={compact} />
    <TierListTeaser compact={compact} />
    {includePokedex && <PokedexTeaser compact={compact} />}
    <ToolsTeaser compact={compact} />
  </div>
);

export default HomeHighlights;
