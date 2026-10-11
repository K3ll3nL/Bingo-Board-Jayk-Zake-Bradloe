import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useRepairedAvatar } from '../services/avatarRepair';
import { useAuth } from '../contexts/AuthContext';
import BannerBar from './BannerBar';
import BingoBoard from './BingoBoard';
import Leaderboard from './Leaderboard';
import HomeHighlights from './HomeHighlights';
import AchievementIcon from './AchievementIcon';
import { SURFACE, GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC, BRAND } from '../constants/theme';

/*
  HOME — board first, badges as the carrot.
  Shipped as the default home page; v1 and v2 were deleted with it.

  THE BRIEF
    · The board's 5x5 grid is the most important thing; bounties sit next to it.
    · Badges are the carrot on a stick — the mid-month hunting incentive.
    · The leaderboard keeps people competitive.
    · Streamers are a fun bonus, not the spine. Most users are not streamers.
    · The site must never DICTATE. No headline narrating the month, no blocks of
      prose. It shows state; the reader draws the conclusion.
    · It should read as its own thing — a competition riding on Pokémon games —
      and be worth opening often because what is on it is interesting.

  WHAT IS ACTUALLY NEW
    "Upcoming Badges" — the badges you are CLOSEST to earning, with the exact count
    remaining. The badge case shows what you have won; this shows what is nearly
    in reach, which is what gets someone hunting on day 14.
    (New route: GET /api/badges/progress.)

  Everything else is state, ranked, with no editorial voice.
*/

const Eyebrow = ({ children, className = '', style }) => (
  <span className={`text-xs font-semibold ${className}`} style={{ color: TEXT.muted, ...style }}>
    {children}
  </span>
);

const Panel = ({ children, className = '' }) => (
  <section className={`min-w-0 rounded-xl border shadow-xl ${className}`}
           style={{ background: GRADIENT.card, borderColor: BORDER.hairline }}>
    {children}
  </section>
);

// ── Upcoming Badges — the carrot ───────────────────────────────────────────────
// Sorted by how few are left, not by prestige. The number is the point.
// The panel always reserves four rows so the rail below it does not jump as
// badges are earned and the list shortens.
const LADDER_SLOTS = 4;
const ROW_H = 40;   // avatar height, and therefore the row height
const ROW_GAP = 12; // gap-3
const LADDER_MIN_H = LADDER_SLOTS * ROW_H + (LADDER_SLOTS - 1) * ROW_GAP;

const BadgeRow = ({ badge: b }) => (
  <div className="flex items-center gap-3 min-w-0" style={{ height: ROW_H }}>
    <div className="w-10 h-10 rounded-lg shrink-0 overflow-hidden border flex items-center justify-center"
         style={{ background: GRADIENT.inset, borderColor: BORDER.hairline }}>
      {b.image_url
        ? <img src={b.image_url} alt="" draggable={false} className="w-full h-full object-contain"
               style={{ filter: 'grayscale(1)', opacity: 0.75 }} />
        : <span className="text-[10px] font-bold" style={{ color: TEXT.faint }}>?</span>}
    </div>

    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
      <span className="text-xs font-semibold truncate" style={{ color: TEXT.body }} title={b.name}>{b.name}</span>

      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full w-full rounded-full origin-left"
             style={{ transform: `scaleX(${b.pct / 100})`, background: ACCENT.strong }} />
      </div>

      {/* Under the bar, and deliberately NOT violet: on this panel violet is
          reserved for the one thing worth clicking, the Case link. A count that
          competes with it steals the pull. */}
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] tabular-nums truncate" style={{ color: TEXT.faint }}>
          {b.current} / {b.target} {b.unit}
          {b.earned_percent != null && ` · ${b.earned_percent}% have it`}
        </span>
        <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: TEXT.muted }}>
          {b.remaining} to go
        </span>
      </div>
    </div>
  </div>
);

// Panel chrome, shared by the real ladder and the pre-auth placeholder so the
// two are pixel-identical and nothing shifts when one replaces the other.
const LadderShell = ({ children }) => (
  <Panel className="p-4 flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <Eyebrow>Upcoming Badges</Eyebrow>
      <Link to="/profile?tab=badges" className="text-[10px] font-bold shrink-0 transition-colors hover:opacity-80"
            style={{ color: ACCENT.base }}>Case</Link>
    </div>
    {/* Constant height whether it holds four badges, one, or none. */}
    <div className="flex flex-col gap-3" style={{ minHeight: LADDER_MIN_H }}>
      {children}
    </div>
  </Panel>
);

const LadderSkeleton = () => (
  <div className="flex flex-col gap-3 animate-pulse">
    {Array.from({ length: LADDER_SLOTS }).map((_, i) => (
      <div key={i} className="flex items-center gap-3" style={{ height: ROW_H }}>
        <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0" />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="h-3 w-28 rounded bg-white/5" />
          <div className="h-1 w-full rounded-full bg-white/5" />
        </div>
      </div>
    ))}
  </div>
);

// Supabase restores the session from localStorage asynchronously, so on first
// paint `user` is null even for a signed-in visitor. Reading the stored token
// synchronously tells us which way that is about to resolve, which is what lets
// this panel reserve its space immediately instead of popping in afterwards.
// Only ever used to decide whether to render a skeleton — never as auth.
const hasStoredSession = () => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch { /* private mode / blocked storage: fall through to "no" */ }
  return false;
};

const BadgeLadder = () => {
  const { user, leaderboardVersion, loading: authLoading } = useAuth();
  const [state, setState] = useState({ loading: true, badges: [] });

  useEffect(() => {
    // While auth is still resolving, STAY loading — clearing it here is what made
    // the panel render its empty state for a frame before the real fetch began.
    if (authLoading) { setState(s => ({ ...s, loading: true })); return; }
    if (!user) { setState({ loading: false, badges: [] }); return; }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    api.getBadgeProgress(LADDER_SLOTS)
      .then(d => { if (!cancelled) setState({ loading: false, badges: d.badges || [] }); })
      .catch(() => { if (!cancelled) setState({ loading: false, badges: [] }); });
    return () => { cancelled = true; };
  }, [user, authLoading, leaderboardVersion]);

  // Returning null here while auth was still loading is what caused the flash:
  // the panel was absent from the layout on first paint, then appeared and
  // shoved the rest of the rail down. Hold the space instead — but only for a
  // visitor who actually has a stored session, so a logged-out visitor does not
  // get a skeleton that then vanishes.
  if (authLoading) return hasStoredSession() ? <LadderShell><LadderSkeleton /></LadderShell> : null;
  if (!user) return null;

  const badges = state.badges.slice(0, LADDER_SLOTS);
  const blanks = Math.max(0, LADDER_SLOTS - badges.length);

  return (
    <LadderShell>
      {state.loading ? (
        <LadderSkeleton />
      ) : badges.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center">
          <p className="text-xs" style={{ color: TEXT.muted }}>Start hunting to earn badges!</p>
        </div>
      ) : (
        <>
          {badges.map(b => <BadgeRow key={b.id} badge={b} />)}
          {Array.from({ length: blanks }).map((_, i) => (
            <div key={`blank-${i}`} style={{ height: ROW_H }} aria-hidden="true" />
          ))}
        </>
      )}
    </LadderShell>
  );
};

// ── Bounties ────────────────────────────────────────────────────────────────
const RACE_TYPES = ['row', 'column', 'x', 'blackout'];
const RACE_LABELS = { row: 'Row', column: 'Column', x: 'X', blackout: 'Blackout' };

// Highlight ring on the board per ruleset. Not green (Caught) or blue (a
// Restricted cell) — the ring has to read as "need this" on top of either.
const RACE_TONE = { standard: ACCENT.base, restricted: '#e2553f' };

// Mirrors WATCH_SHAPES in api/_lib/core.js — the viewer's own distance must be
// measured exactly the way the server measures the contenders', or "you: 2"
// and "2 away" could disagree about the same board.
const RACE_SHAPES = {
  row: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]],
  column: [[1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24], [5, 10, 15, 20, 25]],
  x: [[1, 7, 13, 19, 25, 5, 9, 17, 21]],
  blackout: [Array.from({ length: 25 }, (_, i) => i + 1)],
};

// The viewer's nearest shape for every bounty, in both rulesets:
// { row: { remaining, shape, missing }, row_restricted: {...}, ... }.
// Same counting rules as buildWatchOut: the free space is filled, historical
// catches are not (the server's contender query excludes them).
const myRaces = (board) => {
  const filled = { standard: new Set([13]), restricted: new Set([13]) };
  board.forEach(c => {
    if (c.position === 13 || c.is_historical) return;
    if (c.is_checked) filled.standard.add(c.position);
    if (c.is_restricted) filled.restricted.add(c.position);
  });
  const out = {};
  RACE_TYPES.forEach(t => {
    ['standard', 'restricted'].forEach(mode => {
      let best = null;
      RACE_SHAPES[t].forEach(cells => {
        const missing = cells.filter(p => !filled[mode].has(p));
        if (!best || missing.length < best.missing.length) best = { cells, missing };
      });
      out[mode === 'restricted' ? `${t}_restricted` : t] = {
        remaining: best.missing.length,
        shape: new Set(best.cells),
        missing: new Set(best.missing),
        tone: RACE_TONE[mode],
      };
    });
  });
  return out;
};

// The inset disc is the skeleton while the picture loads (or a dead Discord URL is
// repaired), and the initial is the fallback if it never does.
const Avatar = ({ url, name, size = 18, ring }) => {
  const { status, imgProps } = useRepairedAvatar(url);
  return (
    <span className="relative rounded-full shrink-0 flex items-center justify-center font-bold overflow-hidden"
          title={name}
          style={{ width: size, height: size, fontSize: size * 0.5, background: GRADIENT.inset,
                   color: TEXT.muted, boxShadow: `0 0 0 1px ${ring || BORDER.edge}` }}>
      {status === 'failed'
        ? (name || '?').charAt(0).toUpperCase()
        : <img {...imgProps} alt="" draggable={false}
               className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${status === 'loaded' ? '' : 'opacity-0'}`} />}
    </span>
  );
};

// One bounty in one mode. Claimed is a FILLED violet block; open is an empty
// well. Inside a 4-row matrix that contrast is instant, where eight sibling
// cards with status chips were not.
// The viewer's own distance, as a chip at the cell's right edge. Filled when
// you are (jointly) closest — you are the contender — outlined otherwise.
const YouChip = ({ mine, leading, restricted }) => {
  const tone = restricted ? RACE_TONE.restricted : RACE_TONE.standard;
  return (
    <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none"
          style={leading
            ? { background: tone, color: '#0b0d12' }
            : { boxShadow: `inset 0 0 0 1px ${tone}`, color: tone }}>
      you {mine.remaining}
    </span>
  );
};

// Wraps an OPEN bounty so pointing at it lights the viewer's nearest shape on
// the board. Mouse previews on hover; touch toggles on tap (a tap also fires a
// synthetic mouseenter, so hover is gated on the real pointer type); keyboard
// gets it on focus.
const RaceTarget = ({ id, active, onFocusRace, children, className, style, title }) => {
  const pointer = useRef('mouse');
  return (
    <div role="button" tabIndex={0} aria-pressed={active} title={title}
         className={`${className} cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/40 transition-colors hover:bg-white/[0.05]`}
         style={{ ...style, ...(active ? { background: 'rgba(255,255,255,0.07)' } : null) }}
         onPointerDown={e => { pointer.current = e.pointerType; }}
         onPointerEnter={e => { if (e.pointerType === 'mouse') onFocusRace(id); }}
         onPointerLeave={e => { if (e.pointerType === 'mouse') onFocusRace(null); }}
         onClick={() => { if (pointer.current !== 'mouse') onFocusRace(active ? null : id); }}
         onFocus={() => onFocusRace(id)}
         onBlur={() => onFocusRace(null)}>
      {children}
    </div>
  );
};

const BountyState = ({ bounty, restricted = false, id, mine, focus, onFocusRace }) => {
  const held = !!bounty?.holder;
  const contenders = bounty?.contenders || [];

  if (held) {
    // The two rulesets light up in their own colours: violet is the product's
    // "earned" accent, oxblood is Restricted's own. Oxblood is a BACKGROUND
    // value (1.5:1), so the name on it stays Ink Strong either way.
    const fill = restricted
      ? { background: 'rgba(120,21,10,0.85)',
          boxShadow: 'inset 0 0 0 1px rgba(192,57,43,0.55)' }
      : { background: 'rgba(14,163,176,0.26)',
          boxShadow: 'inset 0 0 0 1px rgba(18,191,206,0.4)' };
    return (
      <div className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 h-9" style={fill}>
        <Avatar url={bounty.holder.avatar_url} name={bounty.holder.display_name} size={20}
                ring={restricted ? 'rgba(192,57,43,0.75)' : ACCENT.base} />
        <span className="text-xs font-bold truncate" style={{ color: TEXT.strong }}
              title={bounty.holder.display_name}>
          {bounty.holder.display_name}
        </span>
      </div>
    );
  }

  // Open bounty. With a viewer, the cell becomes a target that lights their
  // nearest shape on the board; signed out, it stays a plain read-out.
  // Stable element types only — an inline arrow component here would remount
  // the cell on every render and drop keyboard focus with it.
  const Cell = mine ? RaceTarget : 'div';
  const cellProps = mine ? { id, active: focus === id, onFocusRace } : {};
  const leading = mine && (bounty?.remaining == null || mine.remaining <= bounty.remaining);
  const chip = mine && <YouChip mine={mine} leading={leading} restricted={restricted} />;

  if (!contenders.length) {
    return (
      <Cell {...cellProps} className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 h-9"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-xs truncate min-w-0" style={{ color: TEXT.faint }}>No one in range</span>
        {chip}
      </Cell>
    );
  }

  return (
    <Cell {...cellProps} className={`flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 h-9 ${mine ? 'race-cell' : ''}`}
         style={{ background: 'rgba(255,255,255,0.02)' }}
         title={contenders.map(c => c.display_name).join(', ')}>
      {/* The distance leads: on an open bounty it is the only number that
          matters, and it makes the column scannable top to bottom. */}
      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: TEXT.body }}>
        {bounty.remaining}
        <span className="font-normal" style={{ color: TEXT.faint }}> away</span>
      </span>
      <span className="race-sep w-px h-3.5 shrink-0" style={{ background: BORDER.hairline }} />
      {/* No avatar on a contender. A strong hunter is legitimately closest on
          several bounties at once, so faces here repeated down the column and
          made correct data look like a rendering bug. A face now means exactly
          one thing — you hold this — which is also the distinction the panel is
          built around. */}
      <span className="race-name text-xs truncate min-w-0" style={{ color: TEXT.muted }}>
        {contenders[0].display_name}
        {contenders.length > 1 && <span style={{ color: TEXT.faint }}>{` +${contenders.length - 1}`}</span>}
      </span>
      {chip}
    </Cell>
  );
};

const Bounties = ({ bounties, loading, mine, focus, onFocusRace }) => {
  if (loading) {
    return (
      // Same grid as the loaded card: heading, column labels, four icon+label rows.
      <Panel className="p-4 flex flex-col gap-2.5">
        <Eyebrow>Bounties</Eyebrow>
        <div className="grid gap-x-3 gap-y-1.5 min-w-0 animate-pulse"
             style={{ gridTemplateColumns: 'minmax(84px, auto) minmax(0,1fr) minmax(0,1fr)' }}>
          <span />
          <Eyebrow className="px-2">Standard</Eyebrow>
          <Eyebrow className="px-2">Restricted</Eyebrow>
          {RACE_TYPES.map(t => (
            <React.Fragment key={t}>
              <div className="flex items-center gap-2 h-9">
                <div className="w-6 h-6 rounded-md bg-white/5 shrink-0" />
                <div className="h-2.5 w-10 rounded bg-white/5" />
              </div>
              <div className="h-9 rounded-md bg-white/5" />
              <div className="h-9 rounded-md bg-white/5" />
            </React.Fragment>
          ))}
        </div>
      </Panel>
    );
  }

  const b = bounties || {};
  const open = RACE_TYPES.reduce(
    (n, t) => n + (b[t]?.holder ? 0 : 1) + (b[`${t}_restricted`]?.holder ? 0 : 1), 0
  );

  return (
    <Panel className="p-4 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Eyebrow>Bounties</Eyebrow>
      </div>

      {/* Four rows, two columns: each bounty is named ONCE and its two modes sit
          side by side, instead of eight cards repeating every label twice. */}
      <div className="grid gap-x-3 gap-y-1.5 min-w-0"
           style={{ gridTemplateColumns: 'minmax(84px, auto) minmax(0,1fr) minmax(0,1fr)' }}>
        <span />
        <Eyebrow className="px-2">Standard</Eyebrow>
        <Eyebrow className="px-2">Restricted</Eyebrow>

        {RACE_TYPES.map(t => (
          <React.Fragment key={t}>
            <div className="flex items-center gap-2 min-w-0 h-9">
              <AchievementIcon
                type={t}
                claimed={!!(b[t]?.holder || b[`${t}_restricted`]?.holder)}
                color={ACCENT.strong}
                containerClassName="w-6 h-6 rounded-md shrink-0"
                svgClassName={t === 'blackout' ? 'w-6 h-6' : 'w-3.5 h-3.5'}
              />
              <span className="text-[10px] font-bold truncate"
                    style={{ color: TEXT.muted }}>
                {RACE_LABELS[t]}
              </span>
            </div>
            <BountyState bounty={b[t]} id={t} mine={mine?.[t]}
                         focus={focus} onFocusRace={onFocusRace} />
            <BountyState bounty={b[`${t}_restricted`]} restricted id={`${t}_restricted`}
                         mine={mine?.[`${t}_restricted`]} focus={focus} onFocusRace={onFocusRace} />
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
};

// ── Board bar — the month, who is in it, and the way in ─────────────────────
// Replaces the board's centred title. The one call to action on the page, and
// it changes with the viewer rather than adding a second button per state:
//   signed out          → Prep + Join the hunt            (/prep, /login)
//   signed in, unranked → Prep + Submit your first catch  (/prep, /upload)
//   ranked              → Submit                          (/upload)
// Prep rides along for everyone who hasn't caught yet: /prep is public and is
// the first stop for a new player, and until now nothing on this page led to it.
// The faces are the social proof — real hunters this month, not a bare count.
const FACES = 5;
const DAY_MS = 86400000;

// Clipboard with a tick — the Hunt Prep checklist.
const PrepGlyph = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const UploadGlyph = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

// Stale Discord avatar URLs 404 — useRepairedAvatar fetches the current one; the
// initial shows only if that finds nothing. Until then the face's tinted disc shows.
const HunterFace = ({ url, name }) => {
  const { status, imgProps } = useRepairedAvatar(url);
  return status === 'failed'
    ? (name || '?').slice(0, 1).toUpperCase()
    : <img {...imgProps} alt="" draggable={false}
           className={`w-full h-full object-cover transition-opacity duration-150 ${status === 'loaded' ? '' : 'opacity-0'}`} />;
};

const HunterFaces = ({ rows }) => {
  const shown = rows.slice(0, FACES);
  const extra = rows.length - shown.length;
  return (
    // Count sits under the faces (mirroring month / days left) so the month row
    // is only as wide as the faces — it fits a 390px phone without shrinking them.
    <div className="flex flex-col items-end gap-1 min-w-0">
      {rows.length > 0 && (
        <div className="flex -space-x-2 shrink-0">
          {shown.map(r => (
            <span key={r.user_id} title={r.display_name}
                  className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold"
                  style={{ boxShadow: `0 0 0 2px ${SURFACE.card}`, background: 'rgba(255,255,255,0.08)', color: TEXT.muted }}>
              <HunterFace url={r.avatar_url} name={r.display_name} />
            </span>
          ))}
          {extra > 0 && (
            // z-10: the faces' <img> fades in via opacity, which can promote it to its own
            // layer; without an explicit z-index Opera GX painted the last face over this chip.
            <span className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
                  style={{ boxShadow: `0 0 0 2px ${SURFACE.card}`, background: SURFACE.inset, color: TEXT.body }}>
              +{extra}
            </span>
          )}
        </div>
      )}
      <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: TEXT.muted }}>
        {rows.length === 0 ? 'No hunters yet' : `${rows.length} hunting`}
      </span>
    </div>
  );
};

const BoardBar = ({ boardData, rows, me }) => {
  const { user, loading: authLoading } = useAuth();

  // Natural width of each button label, so the skeleton's button wraps below
  // the month row at exactly the widths the real one will.
  // Signed out is known before the board lands, so its Prep button (89px) can be
  // reserved exactly; whether a signed-in viewer is unranked is not known yet.
  const signedOut = !authLoading && !user;
  const ctaWidth = signedOut ? 127 : 106; // Join the hunt : Submit

  if (!boardData) {
    // Sized to the loaded bar line for line: title 30px (25 under 380), the
    // 6px gap, the 16px days line; faces 28px + 4px + the 16px count line.
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4 animate-pulse">
        <div className="flex items-center justify-between gap-4" style={{ flexGrow: 999 }}>
          <div>
            <div className="h-[25px] w-[140px] min-[380px]:h-[32px] min-[380px]:w-[168px] rounded bg-white/5" />
            <div className="mt-1.5 h-4 flex items-center"><div className="h-3 w-24 rounded bg-white/5" /></div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="h-7 w-32 rounded-full bg-white/5" />
            <div className="h-4 flex items-center"><div className="h-3 w-16 rounded bg-white/5" /></div>
          </div>
        </div>
        <div className="grow flex gap-2 min-w-0">
          {signedOut && <div className="shrink-0 h-10 w-[89px] rounded-lg bg-white/5" />}
          <div className="grow h-10 rounded-lg bg-white/5" style={{ minWidth: ctaWidth }} />
        </div>
      </div>
    );
  }

  const end = boardData.end_date ? new Date(boardData.end_date).getTime() : null;
  const start = boardData.start_date ? new Date(`${boardData.start_date}T00:00:00Z`).getTime() : null;
  const now = Date.now();
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : null;
  const elapsed = end && start && end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : null;

  const cta = authLoading || (user && rows === null)
    ? null
    : !user
      ? { to: '/login', label: 'Join the hunt', prep: true }
      : me
        ? { to: '/upload', label: 'Submit' }
        : { to: '/upload', label: 'Submit your first catch', prep: true };

  return (
    // Month + hunters are one unbreakable row; the button joins it when there is
    // room and otherwise wraps below. flex-grow 999 vs 1: on a shared line the
    // spare width goes to the month row, alone on its line the button fills it.
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-4 min-w-0">
      <div className="flex items-center justify-between gap-4 whitespace-nowrap" style={{ flexGrow: 999 }}>
       <div>
        <h2 className="text-xl min-[380px]:text-2xl font-bold leading-tight" style={{ color: TEXT.strong }}>{boardData.month}</h2>
        {daysLeft !== null && (
          <div className="mt-1.5 flex items-center gap-2">
            {elapsed !== null && (
              <div className="h-1 w-16 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full w-full rounded-full origin-left"
                     style={{ transform: `scaleX(${elapsed})`, background: daysLeft <= 3 ? SEMANTIC.warn.base : ACCENT.base }} />
              </div>
            )}
            <span className="text-xs tabular-nums" style={{ color: daysLeft <= 3 ? SEMANTIC.warn.base : TEXT.muted }}>
              {daysLeft <= 1 ? 'Last day' : `${daysLeft} days left`}
            </span>
          </div>
        )}
       </div>
        {rows !== null && <HunterFaces rows={rows} />}
      </div>

      {cta ? (
        <div className="grow flex gap-2 min-w-0">
        {cta.prep && (
          <Link to="/prep"
                className="shrink-0 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-white/[0.06]"
                style={{ boxShadow: `inset 0 0 0 1px ${ACCENT.strong}`, color: ACCENT.base }}>
            <PrepGlyph />
            Prep
          </Link>
        )}
        <Link to={cta.to}
              className="grow flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: ACCENT.strong, color: TEXT.strong }}
              onMouseEnter={e => { e.currentTarget.style.background = ACCENT.base; }}
              onMouseLeave={e => { e.currentTarget.style.background = ACCENT.strong; }}>
          {cta.to === '/upload' && <UploadGlyph />}
          {cta.label}
        </Link>
        </div>
      ) : (
        <div className="grow h-10 rounded-lg bg-white/5 animate-pulse" style={{ minWidth: ctaWidth }} />
      )}
    </div>
  );
};

// ── Streamers — the bonus, and sized like one ───────────────────────────────
const LiveNow = () => {
  const [ambassadors, setAmbassadors] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/ambassadors');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!cancelled) setAmbassadors(data);
      } catch { if (!cancelled) setAmbassadors([]); }
    };
    load();
    timer.current = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer.current); };
  }, []);

  const sorted = useMemo(() => {
    if (!ambassadors) return null;
    return [...ambassadors].sort((a, b) => {
      if (!!b.is_live !== !!a.is_live) return b.is_live ? 1 : -1;
      return (b.viewer_count || 0) - (a.viewer_count || 0);
    });
  }, [ambassadors]);

  if (sorted !== null && sorted.length === 0) return null;
  const live = (sorted || []).filter(a => a.is_live);

  return (
    <Panel className="p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Eyebrow>Streamers</Eyebrow>
        {sorted && (
          <span className="text-[10px] font-bold shrink-0"
                style={{ color: live.length ? SEMANTIC.danger.base : TEXT.faint }}>
            {live.length ? `${live.length} live` : 'Offline'}
          </span>
        )}
      </div>

      {/* Avatars only when nobody is live — it is a bonus, so it takes bonus
          space. A live streamer earns a row with a name and a viewer count. */}
      {sorted === null ? (
        <div className="flex gap-2 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-9 h-9 rounded-full bg-white/5" />)}
        </div>
      ) : live.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {sorted.map(a => (
            <a key={a.id} href={a.twitch_url} target="_blank" rel="noopener noreferrer" title={a.display_name}>
              <img src={a.profile_image_url} alt={a.display_name} draggable={false}
                   className="w-9 h-9 rounded-full object-cover transition-opacity hover:opacity-100"
                   style={{ opacity: 0.5, boxShadow: `0 0 0 1px ${BORDER.edge}` }} />
            </a>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {live.map(a => (
            <a key={a.id} href={a.twitch_url} target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-3 min-w-0 rounded-lg -mx-1 px-1 py-1 transition-colors hover:bg-white/[0.04]">
              <img src={a.profile_image_url} alt="" draggable={false}
                   className="w-9 h-9 rounded-full object-cover shrink-0"
                   style={{ boxShadow: `0 0 0 2px ${a.brand_color || BRAND.twitch}` }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" style={{ color: TEXT.strong }} title={a.display_name}>
                  {a.display_name}
                </div>
                {a.viewer_count !== undefined && (
                  <div className="text-xs tabular-nums" style={{ color: TEXT.muted }}>
                    {a.viewer_count.toLocaleString()} watching
                  </div>
                )}
              </div>
            </a>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {sorted.filter(a => !a.is_live).map(a => (
              <a key={a.id} href={a.twitch_url} target="_blank" rel="noopener noreferrer" title={a.display_name}>
                <img src={a.profile_image_url} alt={a.display_name} draggable={false}
                     className="w-7 h-7 rounded-full object-cover"
                     style={{ opacity: 0.45, boxShadow: `0 0 0 1px ${BORDER.edge}` }} />
              </a>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────
const Home = () => {
  const { user, boardVersion, leaderboardVersion, loading: authLoading } = useAuth();
  const [boardData, setBoardData] = useState(null);
  const [boardError, setBoardError] = useState(null);
  const [rows, setRows] = useState(null);
  // Which open bounty the viewer is pointing at — lights its shape on the board.
  const [raceFocus, setRaceFocus] = useState(null);
  const retry = useRef({ timer: null, attempt: 0 });

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.getBingoBoard(boardVersion);
        if (cancelled) return;
        setBoardData(data);
        setBoardError(null);
        retry.current.attempt = 0;
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 404) { setBoardError('no_month'); return; }
        setBoardError('transient');
        const delay = Math.min(30000, 5000 * Math.pow(1.5, retry.current.attempt));
        retry.current.attempt += 1;
        retry.current.timer = setTimeout(load, delay);
      }
    };
    load();
    return () => { cancelled = true; clearTimeout(retry.current.timer); };
  }, [user, boardVersion, authLoading]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    api.getLeaderboard('monthly', leaderboardVersion)
      .then(d => { if (!cancelled) setRows(d || []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [leaderboardVersion, authLoading]);

  const d = useMemo(() => {
    const board = boardData?.board || [];
    const list = rows || [];
    const me = user ? list.find(r => r.user_id === user.id) || null : null;
    return {
      poolSize: board.filter(c => c.pokemon_id).length,
      caught: board.filter(c => c.is_checked).length,
      me,
      // The hunter one place above, and by how much.
      ahead: me && me.rank > 1
        ? (() => {
            const above = list.find(r => r.rank === me.rank - 1);
            return above
              ? { name: above.display_name, gap: Math.max(0, (above.points || 0) - (me.points || 0)) }
              : null;
          })()
        : null,
    };
  }, [boardData, rows, user]);

  // Only for a signed-in viewer: the board is their own board then.
  const mine = useMemo(
    () => (boardData?.user_authenticated && boardData.board?.length ? myRaces(boardData.board) : null),
    [boardData]
  );
  const highlight = raceFocus && mine?.[raceFocus] ? mine[raceFocus] : null;

  return (
    <main className="px-4 sm:px-6 min-[930px]:px-8 py-5 space-y-5">
      <BannerBar />

      {/* Breakpoint is 930px, NOT Tailwind's xl (1280). The target is a browser
          snapped to half of a 1920px monitor — by far the most common desktop
          width, and the way people actually watch a stream beside this page.
          That window is 960px, and its VIEWPORT is ~943 once the scrollbar is
          taken out, so the boundary has to sit below that with slop to spare;
          930 leaves ~13px. At xl it missed by a few pixels and dropped to one
          column, which is what this fixes.

          BOTH tracks have a real floor, and that is load-bearing. With the board
          on `minmax(0,...)` it had no floor at all, so at 960 the rail took its
          FULL 520px maximum and the board was left with 348 — measured, not
          theorised. A minmax max is a target the track grows into, so the only
          thing stopping the rail is the other track's minimum.

          The rail floor is 360px because that is where the mode tabs
          (Monthly/Season/Year/All Time) stop fitting on one line — at 344 they
          wrap to two. So 360 is measured from the content, not picked.

          The board floor is 480, not 500, and that ceiling is set by the
          breakpoint itself: at a 930px viewport the content box is 930 - 64
          (px-8) = 866, leaving 846 for tracks after the 20px gap. 480 + 360 =
          840 fits with 6px to spare; 500 + 360 = 860 did NOT, and the grid
          overflowed its own container by 17px across the whole 930-946 band.
          If either floor changes, re-check it against 846.

          Resulting split, measured in a browser:
             935px viewport -> board 480, rail 360   (fits; was overflowing)
             960px viewport -> board 498, rail 378
            1600px viewport -> board 740, rail 480   (was board 700, rail 520)

          Every `min-[930px]:` in this file is part of that one decision.

          Width goes to the BOARD, not the rail. Letting the rail take the
          leftover looked right at 1440 and broke at 2400: a ~600px leaderboard
          stretched every row into a gulf between the name and its points, and
          the tab cluster floated stranded in the middle. The rail is capped at
          a width its content actually reads well at; the board column takes the
          rest and the board grows into it, up to its own cap. */}
      <div className="grid grid-cols-1 min-[930px]:grid-cols-[minmax(480px,760px)_minmax(360px,480px)] gap-5 min-[930px]:items-stretch mx-auto w-full" style={{ maxWidth: 1240 }}>
        {/* The board, and the bounties directly beneath it. */}
        {/* Below 930 this column becomes `display: contents`, so the board,
            bounties and highlights become direct children of the one-column
            grid rather than a nested stack. That is what lets HomeHighlights
            take `order-last` and sit BELOW the rail (leaderboard + streamers)
            on mobile, while staying in this column above the rail's fold on
            desktop. Spacing switches from space-y-5 to the grid's own gap-5 at
            the same point, or the two would stack and double it.
            Safe because Panel already carries `min-w-0` — see The min-w-0 Rule
            in DESIGN.md; promoted grid items would otherwise blow out. */}
        <div className="min-w-0 max-[929px]:contents min-[930px]:space-y-5">
          <Panel className="p-4 sm:p-6 overflow-hidden">
            {/* Same 712px column as the grid, so the bar's edges line up with it. */}
            {boardError !== 'no_month' && (
              <div className="mx-auto" style={{ maxWidth: 712 }}>
                <BoardBar boardData={boardData} rows={rows} me={d.me} />
              </div>
            )}
            <BingoBoard
              hideTitle
              data={boardData}
              error={boardError}
              hideAchievements
              maxWidth="712px"
              highlight={highlight}
            />
          </Panel>
          <Bounties bounties={boardData?.bounties} loading={!boardData}
                    mine={mine} focus={raceFocus} onFocusRace={setRaceFocus} />
          {/* The friends' carousel idea, minus the carousel: all four
              destinations visible at once, each carrying a live figure rather
              than just a name. Reuses the existing teaser row, which already
              fetches real month-stats and tier-list data. */}
          {/* The wrapper exists to be a query container: the highlights grid
              switches 2x2 -> 4x1 on its OWN width, which comes from the left
              column track, not the viewport. See .hl-grid in index.css. */}
          <div className="hl-wrap min-w-0 max-[929px]:order-last">
            <HomeHighlights includePokedex compact className="gap-3" />
          </div>
        </div>

        {/* Fills to the height of the board + bounties column: the leaderboard
            takes whatever height the other rail cards leave behind. */}
        {/* Below xl these cards sit two-up instead of stretching to the full
            page width, which is what left their contents stranded in a 780px
            bar. At xl the aside becomes a single vertical rail again.
            (`min-w[380px]` was a typo class and a no-op; the grid track's
            minmax(340px, 1fr) already sets the rail's floor.) */}
        {/* Height, solved structurally instead of by a hand-tuned max-h.
            The rail's content used to feed the grid row height, so the row was
            sized by whichever column was taller and every card added to the
            rail broke the alignment again. At xl the rail is absolutely
            positioned inside this wrapper: an absolute box contributes nothing
            to row sizing, so the row is measured from the BOARD column alone,
            the rail fills it exactly, and the leaderboard's flex-1 takes
            whatever is left over. Add a row to any rail card and the
            leaderboard simply gets shorter. */}
        <div className="min-w-0 w-full min-[930px]:relative">
        <aside className="min-w-0 w-full grid grid-cols-1 sm:grid-cols-2 min-[930px]:grid-cols-1 min-[930px]:flex min-[930px]:flex-col gap-5 items-start min-[930px]:items-stretch min-[930px]:absolute min-[930px]:inset-0 min-[930px]:overflow-hidden">
          {/* 640-929: the desktop rule, two-up. Leaderboard on the left
              spanning both rows; Upcoming Badges over Streamers on the right.
              The leaderboard's wrapper stretches across those two rows and the
              panel is absolute inside it, so — exactly like the desktop rail —
              it contributes nothing to row sizing: the right-hand stack sets
              the height and the leaderboard fills it, both columns ending
              flush. It used to be a fixed h-[440px], which never matched the
              stack beside it and left a hole under whichever side was shorter.
              Below 640 it's one column and the 440 stands.
              `min-[930px]:contents` dissolves these wrappers on desktop so the
              panels are direct flex children of the rail and flex-1 resolves;
              `min-[930px]:static` undoes the absolute there. */}
          <div className="sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:self-stretch sm:relative min-w-0 min-[930px]:contents">
          <Panel className="p-4 h-[440px] sm:h-auto sm:absolute sm:inset-0 min-[930px]:static min-[930px]:flex-1 min-[930px]:min-h-0 flex flex-col overflow-hidden">
            <Leaderboard pinSelf />
          </Panel>
          </div>
          <div className="sm:col-start-2 sm:row-start-1 min-w-0 min-[930px]:contents"><BadgeLadder /></div>
          <div className="sm:col-start-2 sm:row-start-2 min-w-0 min-[930px]:contents"><LiveNow /></div>
        </aside>
        </div>
      </div>
    </main>
  );
};

export default Home;
