import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import BannerBar from './BannerBar';
import BingoBoard from './BingoBoard';
import Leaderboard from './Leaderboard';
import HomeHighlights from './HomeHighlights';
import { GRADIENT, BORDER, TEXT, ACCENT, SEMANTIC, BRAND } from '../constants/theme';

/*
  HOME v2 — "the hunter's desk"  (reachable at /?layout=v2)

  THESIS       The home page opens on YOUR month, not on the product's. It answers
               "where am I, what is left, and who is live" before anything else. It
               refuses the stacked-column home page, where the board and the
               leaderboard were two equal cards and nothing on the page was about
               the visitor personally.
  OWN-WORLD    Unchanged. The committed field-notebook system — page black, 160deg
               card gradient, hairline rules, Rubik, achievement violet for earned
               things, gold for shiny totals. No new colour, radius or weight enters
               here; this redesign is structural.
  STORY        A returning hunter lands, reads their own standing in one glance,
               sees how much board is left, and either submits a catch or goes to
               watch whoever is live.
  FIRST VIEW   Status band across the full width (identity + metrics + progress +
               countdown + primary action), board dominant beneath it on the left, a
               sticky rail on the right carrying the leaderboard over Live Now.
               Teasers last.
  FORM         Dashboard shell, chosen by the owner over a live-community feed and an
               editorial hero.

  Data note: the band and the board share ONE /api/bingo/board response. That route
  is `Cache-Control: no-store`, so letting BingoBoard fetch its own would double the
  serverless invocations on the site's busiest route — it is controlled from here.
*/

// ── Countdown ───────────────────────────────────────────────────────────────
// `end_date` already encodes the 04:00 UTC rollover (it is the 1st at 03:00Z), so
// a plain diff against it is correct — do not re-apply MONTH_ROLLOVER_OFFSET here.
const useCountdown = (endDate) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    if (!endDate) return null;
    const ms = new Date(endDate).getTime() - now;
    if (!Number.isFinite(ms) || ms <= 0) return { ended: true, label: 'Month closed' };
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return {
      ended: false,
      label: days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`,
      urgent: days < 3,
    };
  }, [endDate, now]);
};

const Eyebrow = ({ children, className = '' }) => (
  <span className={`text-[10px] font-bold uppercase tracking-[0.1em] text-muted ${className}`}>{children}</span>
);

const Panel = ({ children, className = '' }) => (
  <section
    className={`min-w-0 rounded-xl border shadow-xl ${className}`}
    style={{ background: GRADIENT.card, borderColor: BORDER.hairline }}
  >
    {children}
  </section>
);

// ── Status band ─────────────────────────────────────────────────────────────
// The one authored motion moment on this page: the progress bar grows from zero
// to its real width once, on an exponential ease-out, when the numbers land.
const ProgressBar = ({ value, total }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const complete = total > 0 && value >= total;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      {/* scaleX, not width: a width transition lays out on every frame; this
          runs on the compositor and looks identical at this bar's height. */}
      <div
        className="h-full w-full rounded-full origin-left"
        style={{
          transform: `scaleX(${mounted ? pct / 100 : 0})`,
          background: complete ? SEMANTIC.success.strong : ACCENT.strong,
          transition: 'transform 900ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </div>
  );
};

const Metric = ({ label, value, color = TEXT.strong, title }) => (
  <div className="min-w-0" title={title}>
    <div className="text-2xl font-bold leading-none tabular-nums truncate" style={{ color }}>{value}</div>
    <Eyebrow className="block mt-1.5">{label}</Eyebrow>
  </div>
);

const StatusBand = ({ boardData, me, meLoading }) => {
  const { user } = useAuth();
  const countdown = useCountdown(boardData?.end_date);
  const caught = (boardData?.board || []).filter(c => c.is_checked).length;
  const total = (boardData?.board || []).filter(c => c.pokemon_id).length;

  const displayName =
    user?.user_metadata?.custom_claims?.global_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.username ||
    'Hunter';
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6 min-w-0">

        {/* Identity ------------------------------------------------------- */}
        <div className="flex items-center gap-3 min-w-0 lg:w-56 lg:shrink-0">
          {user ? (
            <>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  draggable={false}
                  className="w-12 h-12 rounded-full shrink-0"
                  style={{ boxShadow: `0 0 0 2px ${ACCENT.base}` }}
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-lg font-bold text-white"
                  style={{ background: GRADIENT.inset, boxShadow: `0 0 0 2px ${ACCENT.base}` }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <Link
                  to="/profile"
                  className="block text-base font-semibold text-white truncate hover:text-accent transition-colors"
                  title={displayName}
                >
                  {displayName}
                </Link>
                <div className="text-xs text-muted truncate">
                  {meLoading
                    ? 'Loading your standing…'
                    : me
                      ? `Rank #${me.rank} this month`
                      : 'No catches logged yet this month'}
                </div>
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <div className="text-base font-semibold text-white truncate">
                {boardData?.month || 'This month'} is live
              </div>
              <div className="text-xs text-muted">Sign in to track your own board.</div>
            </div>
          )}
        </div>

        <div className="hidden lg:block w-px self-stretch" style={{ background: BORDER.hairline }} />

        {/* Metrics --------------------------------------------------------- */}
        {user && (
          <div className="grid grid-cols-3 gap-4 sm:gap-6 min-w-0 lg:shrink-0">
            <Metric label="Points" value={meLoading ? '—' : (me?.points ?? 0)} color={ACCENT.base} />
            <Metric label="Shinies" value={meLoading ? '—' : (me?.pokemon_count ?? 0)} color={SEMANTIC.warn.base} />
            <Metric
              label="Badges"
              value={meLoading ? '—' : (me?.badge_slots?.length ?? 0)}
              color={ACCENT.base}
              title="Badges you have on display"
            />
          </div>
        )}

        {user && <div className="hidden lg:block w-px self-stretch" style={{ background: BORDER.hairline }} />}

        {/* Board progress + countdown -------------------------------------- */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-2 min-w-0">
            <Eyebrow className="truncate">
              {user ? 'Your board' : 'The board'} · {boardData?.month || '—'}
            </Eyebrow>
            {countdown && (
              <span
                className="text-xs font-semibold tabular-nums shrink-0"
                style={{ color: countdown.ended ? TEXT.muted : countdown.urgent ? SEMANTIC.warn.base : TEXT.body }}
              >
                {countdown.label}
              </span>
            )}
          </div>
          <ProgressBar value={user ? caught : 0} total={total} />
          <div className="mt-2 text-xs text-muted">
            {!boardData ? 'Loading the board…' : user ? (
              <><span className="text-white font-semibold tabular-nums">{caught}</span> of {total} caught</>
            ) : (
              <><span className="text-white font-semibold tabular-nums">{total}</span> Pokémon on this month's board</>
            )}
          </div>
        </div>

        {/* Primary action --------------------------------------------------- */}
        <div className="lg:shrink-0">
          <Link
            to={user ? '/upload' : '/login'}
            className="inline-flex items-center justify-center gap-2 w-full lg:w-auto rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            style={{ background: ACCENT.strong, lineHeight: 1.25 }}
            onMouseEnter={e => { e.currentTarget.style.background = ACCENT.base; }}
            onMouseLeave={e => { e.currentTarget.style.background = ACCENT.strong; }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {user ? 'Submit a catch' : 'Sign in'}
          </Link>
        </div>
      </div>
    </Panel>
  );
};

// ── Live Now rail ───────────────────────────────────────────────────────────
// The old home page put these in a horizontal 110px track, which is what let a
// long display name paint over its neighbours. Rows give a name the full width of
// the rail and truncate what still does not fit, so that class of bug cannot recur.
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
      } catch {
        if (!cancelled) setAmbassadors([]);
      }
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

  const liveCount = (sorted || []).filter(a => a.is_live).length;

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between mb-3 min-w-0">
        <Eyebrow>Streamers</Eyebrow>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.1em] shrink-0"
          style={{ color: liveCount ? SEMANTIC.danger.base : TEXT.muted }}
        >
          {sorted === null ? '' : liveCount > 0 ? `${liveCount} live` : 'All offline'}
        </span>
      </div>

      {sorted === null ? (
        <div className="space-y-1 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <div className="w-9 h-9 rounded-full bg-white/5 shrink-0" />
              <div className="h-3 rounded bg-white/5 flex-1" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted px-2 py-3">No streamers listed yet.</p>
      ) : (
        <div className="-mx-2 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {sorted.map(a => (
            <a
              key={a.id}
              href={a.twitch_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-2 py-2 rounded-lg min-w-0 transition-colors hover:bg-white/[0.04]"
            >
              <div className="relative shrink-0">
                <img
                  src={a.profile_image_url}
                  alt=""
                  draggable={false}
                  className="w-9 h-9 rounded-full object-cover"
                  style={{
                    boxShadow: a.is_live ? `0 0 0 2px ${a.brand_color || BRAND.twitch}` : `0 0 0 1px ${BORDER.edge}`,
                    opacity: a.is_live ? 1 : 0.55,
                  }}
                />
                {a.is_live && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                    style={{ background: SEMANTIC.danger.strong, boxShadow: '0 0 0 2px #1a1c23' }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: a.is_live ? TEXT.strong : TEXT.body }}
                  title={a.display_name}
                >
                  {a.display_name}
                </div>
                {a.is_live && a.viewer_count !== undefined && (
                  <div className="text-xs text-muted tabular-nums truncate">
                    {a.viewer_count.toLocaleString()} watching
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
};

// ── Page ────────────────────────────────────────────────────────────────────
const HomeV2 = () => {
  const { user, boardVersion, leaderboardVersion, loading: authLoading } = useAuth();
  const [boardData, setBoardData] = useState(null);
  const [boardError, setBoardError] = useState(null);
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(true);
  const retry = useRef({ timer: null, attempt: 0 });

  // Board — owned here, handed to both the band and <BingoBoard />.
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
        // 404 = no active bingo month. Real state, not a blip — do not retry.
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

  // The viewer's own monthly row. The monthly leaderboard returns every ranked
  // hunter (not a top-10 slice), so this rank is correct outside the top 10 too.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setMe(null); setMeLoading(false); return; }
    let cancelled = false;
    setMeLoading(true);
    api.getLeaderboard('monthly', leaderboardVersion)
      .then(rows => {
        if (cancelled) return;
        setMe((rows || []).find(r => r.user_id === user.id) || null);
      })
      .catch(() => { if (!cancelled) setMe(null); })
      .finally(() => { if (!cancelled) setMeLoading(false); });
    return () => { cancelled = true; };
  }, [user, leaderboardVersion, authLoading]);

  return (
    <main className="px-4 sm:px-6 xl:px-8 py-5 space-y-6">
      <BannerBar />

      <StatusBand boardData={boardData} me={me} meLoading={meLoading && !!user} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <Panel className="p-4 sm:p-6 overflow-hidden">
          <BingoBoard data={boardData} error={boardError} hideTitle maxWidth="720px" />
        </Panel>

        <aside className="min-w-0 w-full space-y-6 xl:sticky xl:top-5">
          {/* Definite height: <Leaderboard /> is `h-full flex flex-col` with a
              flex-1 scrolling list, so an auto-height parent collapses it. Sized
              to a full month's field rather than today's row count. */}
          <Panel className="p-4 h-[460px] xl:h-[560px] flex flex-col overflow-hidden">
            <Leaderboard />
          </Panel>
          <LiveNow />
        </aside>
      </div>

      <HomeHighlights />
    </main>
  );
};

export default HomeV2;
