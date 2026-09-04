import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import BannerBar from './BannerBar';
import BingoBoard from './BingoBoard';
import Leaderboard from './Leaderboard';
import HomeHighlights from './HomeHighlights';
import AchievementIcon from './AchievementIcon';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC, BRAND } from '../constants/theme';

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
  <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${className}`} style={{ color: TEXT.muted, ...style }}>
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
      <Link to="/profile?tab=badges" className="text-[10px] font-bold uppercase tracking-[0.1em] shrink-0 transition-colors hover:opacity-80"
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

const Avatar = ({ url, name, size = 18, ring }) => (
  url
    ? <img src={url} alt="" draggable={false} title={name}
           className="rounded-full object-cover shrink-0"
           style={{ width: size, height: size, boxShadow: `0 0 0 1px ${ring || BORDER.edge}` }} />
    : <span className="rounded-full shrink-0 flex items-center justify-center font-bold"
            title={name}
            style={{ width: size, height: size, fontSize: size * 0.5, background: GRADIENT.inset,
                     color: TEXT.muted, boxShadow: `0 0 0 1px ${ring || BORDER.edge}` }}>
        {(name || '?').charAt(0).toUpperCase()}
      </span>
);

// One bounty in one mode. Claimed is a FILLED violet block; open is an empty
// well. Inside a 4-row matrix that contrast is instant, where eight sibling
// cards with status chips were not.
const BountyState = ({ bounty, restricted = false }) => {
  const held = !!bounty?.holder;
  const contenders = bounty?.contenders || [];

  if (held) {
    // The two rulesets light up in their own colours: violet is the product's
    // "earned" accent, oxblood is Restricted's own. Oxblood is a BACKGROUND
    // value (1.5:1), so the name on it stays Ink Strong either way.
    const fill = restricted
      ? { background: 'linear-gradient(160deg, rgba(120,21,10,0.85) 0%, rgba(120,21,10,0.45) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(192,57,43,0.55)' }
      : { background: 'linear-gradient(160deg, rgba(139,92,246,0.26) 0%, rgba(139,92,246,0.12) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(167,139,250,0.4)' };
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

  if (!contenders.length) {
    return (
      <div className="flex items-center min-w-0 rounded-md px-2 py-1.5 h-9"
           style={{ background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-xs" style={{ color: TEXT.faint }}>No one in range</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 h-9"
         style={{ background: 'rgba(255,255,255,0.02)' }}
         title={contenders.map(c => c.display_name).join(', ')}>
      {/* The distance leads: on an open bounty it is the only number that
          matters, and it makes the column scannable top to bottom. */}
      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: TEXT.body }}>
        {bounty.remaining}
        <span className="font-normal" style={{ color: TEXT.faint }}> away</span>
      </span>
      <span className="w-px h-3.5 shrink-0" style={{ background: BORDER.hairline }} />
      {/* No avatar on a contender. A strong hunter is legitimately closest on
          several bounties at once, so faces here repeated down the column and
          made correct data look like a rendering bug. A face now means exactly
          one thing — you hold this — which is also the distinction the panel is
          built around. */}
      <span className="text-xs truncate min-w-0" style={{ color: TEXT.muted }}>
        {contenders[0].display_name}
        {contenders.length > 1 && <span style={{ color: TEXT.faint }}>{` +${contenders.length - 1}`}</span>}
      </span>
    </div>
  );
};

const Bounties = ({ bounties, loading }) => {
  if (loading) {
    return (
      <Panel className="p-4">
        <div className="animate-pulse flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 rounded-md bg-white/5" />)}
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
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] truncate"
                    style={{ color: TEXT.muted }}>
                {RACE_LABELS[t]}
              </span>
            </div>
            <BountyState bounty={b[t]} />
            <BountyState bounty={b[`${t}_restricted`]} restricted />
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
};

// ── You ─────────────────────────────────────────────────────────────────────
// Shown ONLY to a hunter who is not yet on the board. Once you are ranked, the
// leaderboard's own pinned row carries your rank, points, catches, bounties and
// your gap to the place above — in context, among the people you are chasing,
// which is strictly better than the same numbers alone in a corner. Two
// surfaces saying the same thing is one too many; this is the one that only
// exists when the other cannot.
const FirstCatchPrompt = ({ show }) => {
  const { user } = useAuth();
  if (!user || !show) return null;

  const name =
    user?.user_metadata?.custom_claims?.global_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.username || 'Hunter';

  return (
    <Panel className="p-4 flex items-center gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate" style={{ color: TEXT.strong }} title={name}>{name}</div>
        <div className="text-xs" style={{ color: TEXT.muted }}>Not on the board yet</div>
      </div>
      <Link to="/upload" className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
            style={{ background: ACCENT.strong, color: TEXT.strong, lineHeight: 1.25 }}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT.base; }}
            onMouseLeave={e => { e.currentTarget.style.background = ACCENT.strong; }}>
        Submit
      </Link>
    </Panel>
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
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] shrink-0"
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

  const showPrompt = rows !== null && !d.me;

  return (
    <main className="px-4 sm:px-6 xl:px-8 py-5 space-y-5">
      <BannerBar />

      {/* Mobile only. On desktop this card sits at the top of the rail, level
          with the board — "you" and "the month" are peers. Stacking flattens
          that into a queue and buries the Submit action ~900px down, so on a
          phone the card is hoisted above the board to restore the pairing.
          Rendered twice with complementary visibility because CSS order cannot
          lift a child out of the aside. */}
      {showPrompt && (
        <div className="xl:hidden">
          <FirstCatchPrompt show />
        </div>
      )}

      {/* Width goes to the BOARD, not the rail. Letting the rail take the
          leftover looked right at 1440 and broke at 2400: a ~600px leaderboard
          stretched every row into a gulf between the name and its points, and
          the tab cluster floated stranded in the middle. The rail is capped at
          a width its content actually reads well at; the board column takes the
          rest and the board grows into it, up to its own cap. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,760px)_minmax(400px,520px)] gap-5 xl:items-stretch mx-auto w-full" style={{ maxWidth: 1240 }}>
        {/* The board, and the bounties directly beneath it. */}
        <div className="min-w-0 space-y-5">
          <Panel className="p-4 sm:p-6 overflow-hidden">
            <BingoBoard
              data={boardData}
              error={boardError}
              hideAchievements
              maxWidth="712px"
            />
          </Panel>
          <Bounties bounties={boardData?.bounties} loading={!boardData} />
          {/* The friends' carousel idea, minus the carousel: all four
              destinations visible at once, each carrying a live figure rather
              than just a name. Reuses the existing teaser row, which already
              fetches real month-stats and tier-list data. */}
          <HomeHighlights includePokedex compact className="gap-3" />
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
        <div className="min-w-0 w-full xl:relative">
        <aside className="min-w-0 w-full grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 xl:flex xl:flex-col gap-5 items-start xl:items-stretch xl:absolute xl:inset-0 xl:overflow-hidden">
          {/* Rendered only when it has content: an empty wrapper is still a
              flex child, and the rail's gap-5 was offsetting every panel by
              20px against the board column. */}
          {showPrompt && (
            <div className="hidden xl:block">
              <FirstCatchPrompt show />
            </div>
          )}
          {/* Explicit placement below xl. Left as auto-flow, the short ladder
              sat beside the tall leaderboard and Streamers was stranded alone
              on a second row. Stacking ladder + streamers in column one against
              a row-spanning leaderboard balances the two columns.
              `xl:contents` dissolves these wrappers at xl so the panels are
              direct flex children of the rail again and the leaderboard's
              flex-1 still resolves. */}
          <div className="sm:col-start-1 sm:row-start-1 xl:contents"><BadgeLadder /></div>
          {/* The cap is load-bearing, not cosmetic. A flex child's natural
              content height still feeds grid row sizing, so without max-h a
              24-row All Time list grew this panel to 1785px, stretched the grid
              row to 2326px and dragged the BOARD column to match, leaving a
              huge gap under the board. min-h-0 lets it shrink; max-h stops it
              driving the row. 520px is sized from the column it sits beside:
              board ~810 + bounties ~200 + gap, minus the rail's fixed cards. */}
          <div className="sm:col-start-2 sm:row-start-1 sm:row-span-2 min-w-0 xl:contents">
          <Panel className="p-4 h-[440px] xl:h-auto xl:flex-1 xl:min-h-0 flex flex-col overflow-hidden">
            <Leaderboard pinSelf />
          </Panel>
          </div>
          <div className="sm:col-start-1 sm:row-start-2 xl:contents"><LiveNow /></div>
        </aside>
        </div>
      </div>
    </main>
  );
};

export default Home;
