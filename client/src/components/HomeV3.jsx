import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import BannerBar from './BannerBar';
import BingoBoard from './BingoBoard';
import Leaderboard from './Leaderboard';
import AchievementIcon from './AchievementIcon';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC, BRAND } from '../constants/theme';

/*
  HOME v3 — board first, badges as the carrot  (/?layout=v3)

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
    "Almost yours" — the badges you are CLOSEST to earning, with the exact count
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

// ── Almost yours — the carrot ───────────────────────────────────────────────
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
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-xs font-semibold truncate" style={{ color: TEXT.body }} title={b.name}>{b.name}</span>
        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: ACCENT.base }}>
          {b.remaining} to go
        </span>
      </div>

      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full w-full rounded-full origin-left"
             style={{ transform: `scaleX(${b.pct / 100})`, background: ACCENT.strong }} />
      </div>

      <span className="text-[10px] tabular-nums truncate" style={{ color: TEXT.faint }}>
        {b.current} / {b.target} {b.unit}
        {b.earned_percent != null && ` · ${b.earned_percent}% have it`}
      </span>
    </div>
  </div>
);

const BadgeLadder = () => {
  const { user, leaderboardVersion, loading: authLoading } = useAuth();
  const [state, setState] = useState({ loading: true, badges: [] });

  useEffect(() => {
    if (authLoading || !user) { setState({ loading: false, badges: [] }); return; }
    let cancelled = false;
    setState(s => ({ ...s, loading: true }));
    api.getBadgeProgress(LADDER_SLOTS)
      .then(d => { if (!cancelled) setState({ loading: false, badges: d.badges || [] }); })
      .catch(() => { if (!cancelled) setState({ loading: false, badges: [] }); });
    return () => { cancelled = true; };
  }, [user, authLoading, leaderboardVersion]);

  if (!user) return null;

  const badges = state.badges.slice(0, LADDER_SLOTS);
  const blanks = Math.max(0, LADDER_SLOTS - badges.length);

  return (
    <Panel className="p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Eyebrow>Almost yours</Eyebrow>
        <Link to="/profile" className="text-[10px] font-bold uppercase tracking-[0.1em] shrink-0 transition-colors hover:opacity-80"
              style={{ color: TEXT.faint }}>Case</Link>
      </div>

      {/* Constant height whether it holds four badges, one, or none. */}
      <div className="flex flex-col gap-3" style={{ minHeight: LADDER_MIN_H }}>
        {state.loading ? (
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
      </div>
    </Panel>
  );
};

// ── Bounties ────────────────────────────────────────────────────────────────
const RACE_TYPES = ['row', 'column', 'x', 'blackout'];
const RACE_LABELS = { row: 'Row', column: 'Column', x: 'X', blackout: 'Blackout' };

const BountyCell = ({ type, holder, restricted }) => (
  <div className="flex items-center gap-2.5 min-w-0 rounded-lg px-3 py-2.5 border"
       style={{ background: GRADIENT.inset, borderColor: holder ? 'rgba(167,139,250,0.28)' : BORDER.hairline }}>
    <AchievementIcon
      type={type}
      claimed={!!holder}
      restricted={restricted}
      color={ACCENT.strong}
      containerClassName="w-7 h-7 rounded-lg shrink-0"
      svgClassName={type === 'blackout' ? 'w-7 h-7' : 'w-4 h-4'}
    />
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] truncate" style={{ color: TEXT.muted }}>
        {RACE_LABELS[type]}
      </div>
      <div className="text-xs font-semibold truncate"
           style={{ color: holder ? ACCENT.base : TEXT.faint }} title={holder || 'Open'}>
        {holder || 'Open'}
      </div>
    </div>
  </div>
);

const Bounties = ({ achievements, loading }) => {
  if (loading) {
    return (
      <Panel className="p-4">
        <div className="animate-pulse grid grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[52px] rounded-lg bg-white/5" />)}
        </div>
      </Panel>
    );
  }

  const a = achievements || {};
  const open = RACE_TYPES.reduce((n, t) => n + (a[t] ? 0 : 1) + (a[`${t}_restricted`] ? 0 : 1), 0);

  return (
    <Panel className="p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 min-w-0">
        <Eyebrow>Bounties</Eyebrow>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] shrink-0"
              style={{ color: open ? ACCENT.base : TEXT.muted }}>
          {open > 0 ? `${open} open` : 'All claimed'}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 min-w-0">
        {RACE_TYPES.map(t => <BountyCell key={t} type={t} holder={a[t]} restricted={false} />)}
      </div>

      <Eyebrow>Restricted</Eyebrow>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 min-w-0">
        {RACE_TYPES.map(t => <BountyCell key={`${t}_r`} type={t} holder={a[`${t}_restricted`]} restricted />)}
      </div>
    </Panel>
  );
};

// ── You ─────────────────────────────────────────────────────────────────────
const Standing = ({ me, loading, caught, poolSize }) => {
  const { user } = useAuth();
  if (!user) return null;

  const name =
    user?.user_metadata?.custom_claims?.global_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.username || 'Hunter';
  const avatar = user?.user_metadata?.avatar_url;

  const cell = (label, value, color) => (
    <div className="min-w-0">
      <div className="text-lg font-bold leading-none tabular-nums truncate" style={{ color }}>{value}</div>
      <Eyebrow className="block mt-1">{label}</Eyebrow>
    </div>
  );

  return (
    <Panel className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {avatar
          ? <img src={avatar} alt="" draggable={false} className="w-10 h-10 rounded-full shrink-0"
                 style={{ boxShadow: `0 0 0 2px ${ACCENT.base}` }} />
          : <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-base font-bold"
                 style={{ background: GRADIENT.inset, boxShadow: `0 0 0 2px ${ACCENT.base}`, color: TEXT.strong }}>
              {name.charAt(0).toUpperCase()}
            </div>}
        <div className="min-w-0 flex-1">
          <Link to="/profile" className="block text-sm font-semibold truncate transition-colors hover:opacity-80"
                style={{ color: TEXT.strong }} title={name}>{name}</Link>
          <div className="text-xs truncate" style={{ color: TEXT.muted }}>
            {loading ? '…' : me ? `Rank #${me.rank}` : 'Unranked'}
          </div>
        </div>
        <Link to="/upload" className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
              style={{ background: ACCENT.strong, color: TEXT.strong, lineHeight: 1.25 }}
              onMouseEnter={e => { e.currentTarget.style.background = ACCENT.base; }}
              onMouseLeave={e => { e.currentTarget.style.background = ACCENT.strong; }}>
          Submit
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-1">
        {cell('Points', loading ? '—' : (me?.points ?? 0), ACCENT.base)}
        {cell('Shinies', loading ? '—' : (me?.pokemon_count ?? 0), SEMANTIC.warn.base)}
        {cell('Board', poolSize ? `${caught}/${poolSize}` : '—', TEXT.strong)}
      </div>
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
const HomeV3 = () => {
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
    return {
      poolSize: board.filter(c => c.pokemon_id).length,
      caught: board.filter(c => c.is_checked).length,
      me: user ? list.find(r => r.user_id === user.id) || null : null,
    };
  }, [boardData, rows, user]);

  return (
    <main className="px-4 sm:px-6 xl:px-8 py-5 space-y-5">
      <BannerBar />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 xl:items-stretch">
        {/* The board, and the bounties directly beneath it. */}
        <div className="min-w-0 space-y-5">
          <Panel className="p-4 sm:p-6 overflow-hidden">
            <BingoBoard
              data={boardData}
              error={boardError}
              hideTitle
              hideAchievements
              maxWidth="760px"
            />
          </Panel>
          <Bounties achievements={boardData?.achievements} loading={!boardData} />
        </div>

        {/* Fills to the height of the board + bounties column: the leaderboard
            takes whatever height the other rail cards leave behind. */}
        <aside className="min-w-0 w-full flex flex-col gap-5">
          <Standing me={d.me} loading={rows === null} caught={d.caught} poolSize={d.poolSize} />
          <BadgeLadder />
          <Panel className="p-4 h-[440px] xl:h-auto xl:flex-1 xl:min-h-[320px] flex flex-col overflow-hidden">
            <Leaderboard />
          </Panel>
          <LiveNow />
        </aside>
      </div>
    </main>
  );
};

export default HomeV3;
