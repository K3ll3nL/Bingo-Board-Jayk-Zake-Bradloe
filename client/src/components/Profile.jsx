import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import PokemonModal from './PokemonModal';
import PokemonImage from './PokemonImage';
import BadgeCase from './BadgeCase';
import BingoGrid from './BingoGrid';
import AchievementIcon from './AchievementIcon';
import restrictedIcon from '../Icons/restricted-icon.png';
import shinyDexUrl from '../Icons/ShinyDex Logo.png';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import { getAuthHeaders } from '../services/api';

// Card gradient styles — avoids repeating the strings everywhere
const CARD = {
  // Primary card (was #35373b)
  bg: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  // Nested / inner card (was #2a2c30)
  inner: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)',
  // Hero card
  hero: 'linear-gradient(160deg, #1c1e27 0%, #22242e 100%)',
  border: 'rgba(255,255,255,0.07)',
  borderSubtle: 'rgba(255,255,255,0.04)',
};

// ── Icons ─────────────────────────────────────────────────────
const IconStatistics = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
  </svg>
);
const IconBadges = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);
const IconPokedex = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);
const IconBoards = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const TABS = [
  { id: 'boards',  label: 'Boards',  Icon: IconBoards },
  { id: 'statistics', label: 'Statistics', Icon: IconStatistics },
  { id: 'badges',   label: 'Badges',   Icon: IconBadges },
  { id: 'pokedex',  label: 'Pokédex',  Icon: IconPokedex },
];

// ── Points bar chart ──────────────────────────────────────────
const PointsChart = ({ data, accentColor }) => {
  const [hovered, setHovered] = useState(null);
  if (!data.length) return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">No data yet</div>
  );
  const maxPts = Math.max(...data.map(d => d.points), 1);
  const H = 160;
  return (
    <div className="flex items-end gap-1" style={{ height: H + 24 }}>
      {data.map((d, i) => {
        const barH = Math.max(Math.round((d.points / maxPts) * H), 3);
        const abbrev = d.month.split(' ')[0].slice(0, 3);
        const isHov = hovered === i;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 cursor-default"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="relative w-full flex justify-center">
              {isHov && (
                <div className="absolute bottom-full mb-1 text-xs font-bold text-white px-1.5 py-0.5 rounded whitespace-nowrap z-10 shadow"
                  style={{ background: '#0d0f14', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {d.points} pts
                </div>
              )}
              <div className="w-full rounded-t-sm transition-all duration-100"
                style={{ height: barH, backgroundColor: accentColor, opacity: isHov ? 1 : 0.6 }} />
            </div>
            <span className="text-[10px] text-gray-500 truncate w-full text-center leading-none">{abbrev}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Game-style nav ────────────────────────────────────────────
const GameNav = ({ tab, setTab, accentColor }) => (
  <div className="rounded-xl overflow-hidden" style={{
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: `1px solid ${CARD.border}`,
  }}>
    {TABS.map(({ id, label, Icon }) => {
      const active = tab === id;
      return (
        <button
          key={id}
          onClick={() => setTab(id)}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all text-left"
          style={{
            color: active ? '#fff' : 'rgba(255,255,255,0.4)',
            background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
            borderLeft: `3px solid ${active ? accentColor : 'transparent'}`,
          }}
        >
          <span style={{ color: active ? accentColor : 'rgba(255,255,255,0.3)' }}>
            <Icon />
          </span>
          {label}
        </button>
      );
    })}
  </div>
);

// ── Mobile top tab strip ──────────────────────────────────────
const MobileTabStrip = ({ tab, setTab, accentColor }) => (
  <div className="lg:hidden flex gap-1 overflow-x-auto scrollbar-hide pb-0.5 mt-3">
    {TABS.map(({ id, label, Icon }) => {
      const active = tab === id;
      return (
        <button key={id} onClick={() => setTab(id)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0"
          style={{
            color: active ? '#fff' : 'rgba(255,255,255,0.45)',
            background: active ? accentColor + '30' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${active ? accentColor + '60' : 'transparent'}`,
          }}>
          <span style={{ color: active ? accentColor : 'rgba(255,255,255,0.3)' }}><Icon /></span>
          {label}
        </button>
      );
    })}
  </div>
);

// ── Statistics tab ──────────────────────────────────────────────
const StatisticsTab = ({ profile, accentColor, onPokemonClick }) => {
  const { stats, monthlyData, recentCatches = [] } = profile;

  const AchievementBlock = ({ items, label, restricted }) => (
    <div className="rounded-xl p-3 sm:p-4 border flex flex-col"
      style={{
        background: CARD.bg,
        borderColor: restricted ? 'rgba(120,40,30,0.4)' : CARD.border,
      }}>
      <div className="flex items-center gap-1.5 mb-3 sm:mb-4">
        {restricted && <img src={restrictedIcon} alt="" className="w-3.5 h-3.5 object-contain" />}
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wide" style={{ color: restricted ? '#e07060' : 'rgba(255,255,255,0.35)' }}>{label}</p>
      </div>
      <div className="grid grid-cols-5 gap-2 flex-1">
        {items.map(({ type, count }) => (
          <div key={type} className="flex flex-col items-center gap-1.5 sm:gap-2">
            <AchievementIcon type={type} color={restricted ? undefined : accentColor} restricted={restricted}
              containerClassName="w-11 h-11 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl"
              svgClassName={type.includes('blackout') ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-5 h-5 sm:w-7 sm:h-7'} />
            <span className="text-lg sm:text-2xl font-black text-white leading-none">{count || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Achievement summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AchievementBlock label="Bonus Bounties" restricted={false} items={[
          { type: 'row', count: stats.totalRows },
          { type: 'column', count: stats.totalColumns },
          { type: 'x', count: stats.totalXs },
          { type: 'blackout', count: stats.totalBlackouts },
          { type: 'personal_blackout', count: stats.totalPersonalBlackouts },
        ]} />
        <AchievementBlock label="Restricted" restricted={true} items={[
          { type: 'row', count: stats.restrictedRows },
          { type: 'column', count: stats.restrictedColumns },
          { type: 'x', count: stats.restrictedXs },
          { type: 'blackout', count: stats.restrictedBlackouts },
          { type: 'personal_blackout', count: stats.restrictedPersonalBlackouts },
        ]} />
      </div>

      {/* Recent Catches */}
      <div className="rounded-xl p-4 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Recent Catches</p>
        {recentCatches.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-gray-600 text-sm">No catches yet</div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {recentCatches.map((pokemon, i) => (
              <div key={i} onClick={() => onPokemonClick(pokemon)}
                className="relative rounded-lg overflow-hidden cursor-pointer group border-2 transition-colors"
                style={{ aspectRatio: '1', background: CARD.inner, borderColor: pokemon.restricted ? '#3b82f6' : 'transparent' }}>
                <PokemonImage pokemon={pokemon} className="w-full h-full" disableCycling />
                {pokemon.restricted && (
                  <img src={restrictedIcon} alt="" className="absolute top-0.5 right-0.5 w-3.5 h-3.5 sm:w-5 sm:h-5 object-contain" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity truncate px-0.5 leading-tight">
                  {(pokemon.display_name || pokemon.name || '').toUpperCase()}
                </div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 8 - recentCatches.length) }).map((_, i) => (
              <div key={`e${i}`} className="rounded-lg" style={{ aspectRatio: '1', background: CARD.inner, border: `1px solid ${CARD.borderSubtle}` }} />
            ))}
          </div>
        )}
      </div>

      {/* Points history */}
      <div className="rounded-xl p-4 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Points History</p>
        <PointsChart data={monthlyData} accentColor={accentColor} />
      </div>
    </div>
  );
};

// ── Badge tooltip ─────────────────────────────────────────────
const BadgeTip = ({ ub }) => (
  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 hidden group-hover:block w-36 rounded-lg shadow-xl px-2.5 py-2 text-xs pointer-events-none"
    style={{ backgroundColor: '#0d0e10', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="font-semibold text-white leading-tight">{ub.badges?.name}</div>
    {ub.badges?.description && <div className="text-gray-400 mt-0.5 leading-tight">{ub.badges.description}</div>}
    {ub.badges?.hint && <div className="text-yellow-400/80 mt-1 italic leading-tight">{ub.badges.hint}</div>}
    {ub.badges?.earned_percent != null && (
      <div className="text-gray-500 mt-1 leading-tight">Earned by {ub.badges.earned_percent}% of players</div>
    )}
    {ub.earned_at && (
      <div className="text-gray-600 mt-1 text-[10px]">
        {new Date(ub.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
    )}
  </div>
);

// ── Badges tab ────────────────────────────────────────────────
const BadgesTab = ({ userId, isOwnProfile, accentColor, playAnimation, onAnimationPlayed }) => {
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}/badges`).then(r => r.json())
      .then(badges => { setEarnedBadges(Array.isArray(badges) ? badges : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const sorted = [...earnedBadges].sort((a, b) => {
    const ordA = a.badges?.badge_families?.display_order ?? 999;
    const ordB = b.badges?.badge_families?.display_order ?? 999;
    if (ordA !== ordB) return ordA - ordB;
    return (a.badges?.family_order ?? 99) - (b.badges?.family_order ?? 99);
  });

  return (
    <div className="space-y-3">
      <BadgeCase userId={userId} isOwnProfile={isOwnProfile} playAnimation={playAnimation} onPlayed={onAnimationPlayed} />

      <div className="rounded-xl border overflow-hidden" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD.borderSubtle }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>All Badges</p>
          <span className="text-sm text-gray-400">{earnedBadges.length} earned</span>
        </div>
        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-gray-700 border-t-purple-500 animate-spin" />
          </div>
        ) : earnedBadges.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No badges earned yet</div>
        ) : (
          <div className="p-3">
            <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-8 xl:grid-cols-10 gap-1.5">
              {sorted.map(ub => (
                <div key={ub.badge_id} className="relative group aspect-square rounded-lg overflow-hidden p-1"
                  style={{ background: CARD.inner, border: `1px solid ${CARD.borderSubtle}` }}>
                  {ub.badges?.image_url
                    ? <img src={ub.badges.image_url} alt={ub.badges.name} className="w-full h-full object-contain" draggable="false" />
                    : <div className="w-full h-full rounded bg-gray-700/50" />}
                  <BadgeTip ub={ub} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Pokédex tab ───────────────────────────────────────────────
const PokedexTab = ({ stats, accentColor }) => {
  const caughtPct = stats.totalPokemon > 0 ? Math.round((stats.totalCaught / stats.totalPokemon) * 100) : 0;

  return (
    <div className="space-y-2">
      {/* Overall */}
      <div className="rounded-xl p-4 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <div className="flex items-center gap-5">
          <div className="shrink-0 leading-none">
            <span className="text-6xl font-extrabold tabular-nums" style={{ color: accentColor }}>{caughtPct}</span>
            <span className="text-2xl font-extrabold" style={{ color: accentColor }}>%</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Overall Progress</p>
            <div className="rounded-full h-3 mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-3 rounded-full transition-all" style={{ width: `${caughtPct}%`, backgroundColor: accentColor }} />
            </div>
            <p className="text-sm text-gray-400">{stats.totalCaught} / {stats.totalPokemon} available shinies</p>
          </div>
        </div>
      </div>

      {/* By Generation */}
      <div className="rounded-xl p-3 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>By Generation</p>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
          {(stats.dexByGen || []).map(({ gen, total, caught }) => {
            const pct = total > 0 ? Math.round((caught / total) * 100) : 0;
            return (
              <div key={gen} className="rounded-lg p-2.5 border" style={{ background: CARD.inner, borderColor: CARD.borderSubtle }}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-xs font-semibold text-gray-300">Gen {gen}</span>
                  <span className="text-sm font-bold" style={{ color: accentColor }}>{pct}%</span>
                </div>
                <div className="rounded-full h-1.5 mb-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
                </div>
                <span className="text-xs text-gray-500">{caught}/{total}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* By Type */}
      <div className="rounded-xl p-3 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
        <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>By Type</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          {(stats.dexByType || []).map(({ type, total, caught }) => {
            const pct = total > 0 ? Math.round((caught / total) * 100) : 0;
            return (
              <div key={type}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-300">{type}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-gray-500">{caught}/{total}</span>
                    <span className="text-sm font-bold" style={{ color: accentColor }}>{pct}%</span>
                  </div>
                </div>
                <div className="rounded-full h-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Boards tab ───────────────────────────────────────────────

const BoardsTab = ({ userId, monthlyData, stats, onPokemonClick, accentColor }) => {
  const [pastMonths, setPastMonths] = useState([]);
  const [selectedMonthId, setSelectedMonthId] = useState(null);
  const [boardCache, setBoardCache] = useState({});
  const [currentBoard, setCurrentBoard] = useState({ board: [], month: '' });
  const [boardLoading, setBoardLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [monthRank, setMonthRank] = useState(null);
  const rankCache = useRef({});

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    Promise.all([
      fetch(`/api/profile/${userId}/board`).then(r => r.json()).catch(() => ({ board: [], month: '' })),
      fetch(`/api/profile/${userId}/past-months`).then(r => r.json()).catch(() => []),
    ]).then(([boardData, months]) => {
      setCurrentBoard(boardData);
      setPastMonths(months);
      setBoardLoading(false);
    });
  }, [userId, loaded]);

  // Fetch monthly rank for the displayed month
  useEffect(() => {
    if (!userId) return;
    const key = selectedMonthId ?? 'current';
    if (rankCache.current[key] !== undefined) {
      setMonthRank(rankCache.current[key]);
      return;
    }
    // Clear stale value immediately so the card doesn't show the previous month's rank
    setMonthRank(null);
    const url = selectedMonthId
      ? `/api/leaderboard?mode=monthly&period_month_id=${selectedMonthId}`
      : `/api/leaderboard?mode=monthly`;
    fetch(url)
      .then(r => r.json())
      .then(rows => {
        const arr = Array.isArray(rows) ? rows : [];
        const idx = arr.findIndex(r => r.user_id === userId);
        const rank = idx !== -1 ? (arr[idx].rank ?? idx + 1) : null;
        rankCache.current[key] = rank;
        setMonthRank(rank);
      })
      .catch(() => { rankCache.current[key] = null; setMonthRank(null); });
  }, [userId, selectedMonthId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allMonthIds = [null, ...pastMonths.map(m => m.id)];
  const currentIdx = allMonthIds.indexOf(selectedMonthId);
  const displayBoard = selectedMonthId === null ? currentBoard.board : (boardCache[selectedMonthId]?.board ?? []);
  const displayMonth = selectedMonthId === null ? currentBoard.month : (boardCache[selectedMonthId]?.month ?? '');

  const selectMonth = async (monthId) => {
    setSelectedMonthId(monthId);
    if (monthId === null || boardCache[monthId]) return;
    setBoardLoading(true);
    try {
      const data = await fetch(`/api/profile/${userId}/board/${monthId}`).then(r => r.json());
      setBoardCache(p => ({ ...p, [monthId]: data }));
    } catch {}
    setBoardLoading(false);
  };

  // Board-derived metrics
  const hasData = displayBoard.length > 0;
  const caughtCells = displayBoard.filter(c => c.position !== 13 && (c.is_checked || c.is_restricted)).length;
  const historicalCells = displayBoard.filter(c => c.position !== 13 && c.is_historical && (c.is_checked || c.is_restricted)).length;
  const completionPct = hasData ? Math.round((caughtCells / 24) * 100) : 0;
  const monthPoints = monthlyData.find(d => d.month === displayMonth)?.points ?? null;

  const restrictedCells = displayBoard.filter(c => c.position !== 13 && c.is_restricted).length;

  // Ring geometry
  const ringR = 26;
  const ringCircum = 2 * Math.PI * ringR;

  // Rank medal colour
  const rankColor = monthRank === 1 ? '#f59e0b' : monthRank === 2 ? '#94a3b8' : monthRank === 3 ? '#cd7f32' : 'white';

  const statLabel = text => (
    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{text}</p>
  );

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: CARD.bg, borderColor: CARD.border }}>
      {/* Month nav header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD.borderSubtle }}>
        <button onClick={() => selectMonth(allMonthIds[currentIdx + 1])}
          disabled={currentIdx >= allMonthIds.length - 1}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-default transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-base font-semibold text-white">{displayMonth || '—'}</span>
        <button onClick={() => selectMonth(allMonthIds[currentIdx - 1])}
          disabled={currentIdx <= 0}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-default transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Board + stats — stacked on mobile, side-by-side on sm+ */}
      <div className="p-3 flex flex-col sm:flex-row gap-3">
        {/* Board */}
        <div className="flex-1 min-w-0">
          {boardLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 rounded-full border-2 border-gray-700 border-t-purple-500 animate-spin" />
            </div>
          ) : hasData ? (
            <BingoGrid board={displayBoard} onCellClick={onPokemonClick} large />
          ) : (
            <div className="py-16 text-center text-gray-600 text-sm">No board data for this month</div>
          )}
        </div>

        {/* Month stats sidebar — 2-col grid under the board on mobile, column on sm+ */}
        <div className="w-full sm:w-40 shrink-0 grid grid-cols-2 sm:flex sm:flex-col gap-2">

          {/* 1 — Points */}
          <div className="rounded-lg p-3 border flex flex-col"
            style={{ background: CARD.inner, borderColor: CARD.borderSubtle, borderLeftColor: accentColor, borderLeftWidth: '3px' }}>
            {statLabel('Points')}
            {monthPoints !== null ? (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white leading-none">{monthPoints}</span>
                <span className="text-xs text-gray-500">pts</span>
              </div>
            ) : <span className="text-sm text-gray-600">—</span>}
          </div>

          {/* 2 — Completion ring */}
          <div className="rounded-lg p-3 border flex flex-col items-center"
            style={{ background: CARD.inner, borderColor: CARD.borderSubtle }}>
            {statLabel('Completion')}
            <svg viewBox="0 0 70 70" className="w-16 h-16 -mt-1">
              <circle cx="35" cy="35" r={ringR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
              <circle cx="35" cy="35" r={ringR} fill="none"
                stroke={hasData ? accentColor : 'rgba(255,255,255,0.08)'}
                strokeWidth="7" strokeLinecap="round"
                strokeDasharray={ringCircum}
                strokeDashoffset={ringCircum * (1 - (hasData ? completionPct / 100 : 0))}
                transform="rotate(-90 35 35)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
              <text x="35" y="32" textAnchor="middle" fill="white" fontSize="13" fontWeight="800" fontFamily="sans-serif">
                {hasData ? `${completionPct}%` : '—'}
              </text>
              <text x="35" y="45" textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontFamily="sans-serif">
                {hasData ? `${caughtCells} / 24` : ''}
              </text>
            </svg>
          </div>

          {/* 3 — Restricted catches */}
          <div className="rounded-lg p-3 border flex flex-col"
            style={{
              background: 'linear-gradient(160deg, #1a0a0a 0%, #1f0d0d 100%)',
              borderColor: 'rgba(120,21,10,0.4)',
            }}>
            <p className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: 'rgba(224,112,96,0.6)'}}>
              Restricted
            </p>
            {hasData ? (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold leading-none"
                  style={{ color: '#e07060'}}>
                  {restrictedCells}
                </span>
                <span className="text-xs" style={{ color: 'rgba(224,112,96,0.55)' }}>
                  {restrictedCells === 1 ? 'catch' : 'catches'}
                </span>
              </div>
            ) : <span className="text-sm text-gray-600">—</span>}
          </div>

          {/* 4 — Monthly rank */}
          <div className="rounded-lg p-3 border flex flex-col"
            style={{ background: CARD.inner, borderColor: CARD.borderSubtle }}>
            {statLabel('Monthly Rank')}
            {monthRank !== null ? (
              <div className="flex items-baseline gap-0.5">
                <span className="text-sm font-bold" style={{ color: rankColor }}>#</span>
                <span className="text-2xl font-extrabold leading-none" style={{ color: rankColor }}>{monthRank}</span>
              </div>
            ) : <span className="text-sm text-gray-600">—</span>}
          </div>

          {/* 5 — Historical */}
          <div className="rounded-lg p-3 border flex flex-col"
            style={{
              background: historicalCells > 0 ? 'linear-gradient(160deg, #1a1508 0%, #1f1a0a 100%)' : CARD.inner,
              borderColor: historicalCells > 0 ? 'rgba(251,191,36,0.2)' : CARD.borderSubtle,
            }}>
            <p className="text-[10px] uppercase tracking-wider mb-1"
              style={{ color: historicalCells > 0 ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.3)' }}>
              Historical
            </p>
            {!hasData ? (
              <span className="text-sm text-gray-600">—</span>
            ) : historicalCells > 0 ? (
              <>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-extrabold leading-none" style={{ color: '#fbbf24' }}>{historicalCells}</span>
                  <span className="text-xs" style={{ color: 'rgba(251,191,36,0.55)' }}>/ {caughtCells}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full"
                    style={{
                      width: `${Math.round((historicalCells / caughtCells) * 100)}%`,
                      background: 'linear-gradient(90deg, #d97706, #fbbf24)',
                      transition: 'width 0.5s ease',
                    }} />
                </div>
                <span className="text-[10px] mt-1" style={{ color: 'rgba(251,191,36,0.4)' }}>caught after close</span>
              </>
            ) : (
              <span className="text-sm font-medium text-gray-600">None this month</span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

// ── Social handles ───────────────────────────────────────────
// Users enter only their handle; we store/display full URLs so Twitch
// live-status (which does twitch_url.split('/').pop()) keeps working.
const SOCIAL_PREFIX = {
  twitch_url:   'https://twitch.tv/',
  youtube_url:  'https://youtube.com/@',
  shinydex_url: 'https://shinydex.com/',
};

const handleFromUrl = (key, value) => {
  if (!value) return '';
  let h = String(value).trim();
  const prefix = SOCIAL_PREFIX[key];
  if (prefix && h.toLowerCase().startsWith(prefix.toLowerCase())) {
    h = h.slice(prefix.length);
  } else if (/^https?:\/\//i.test(h)) {
    // Unknown full URL — fall back to the last path segment
    h = h.replace(/\/+$/, '').split('/').pop();
  }
  return h.replace(/^@/, '');
};

const urlFromHandle = (key, handle) => {
  const h = String(handle || '').trim().replace(/^@/, '').replace(/^\/+/, '');
  if (!h) return '';
  if (/^https?:\/\//i.test(h)) return h; // user pasted a full URL anyway
  return (SOCIAL_PREFIX[key] || '') + h;
};

// ── Main ──────────────────────────────────────────────────────
const Profile = () => {
  const { user, identities, linkIdentity, unlinkIdentity, refreshIdentities } = useAuth();
  const { userId: paramUserId } = useParams();
  const profileUserId = paramUserId || user?.id;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('boards');
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [editingSocials, setEditingSocials] = useState(false);
  const [socialForm, setSocialForm] = useState({ twitch_url: '', youtube_url: '', shinydex_url: '' });
  const [socialSaving, setSocialSaving] = useState(false);
  const [accountLinking, setAccountLinking] = useState(null);
  const [editingProviders, setEditingProviders] = useState(false);
  const badgesAnimationPlayed = useRef(false);

  const handleLinkIdentity = async (provider) => {
    try {
      setAccountLinking(provider);
      await linkIdentity(provider);
    } catch {
      setAccountLinking(null);
    }
  };

  const handleUnlinkIdentity = async (provider) => {
    if (identities.length <= 1) return;
    try {
      setAccountLinking(provider);
      await unlinkIdentity(provider);
    } catch {}
    setAccountLinking(null);
  };

  useEffect(() => {
    if (!profileUserId) { setLoading(false); return; }
    fetch(`/api/profile/${profileUserId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => {
        setProfile(data);
        setSocialForm({
          twitch_url: handleFromUrl('twitch_url', data.user.twitch_url),
          youtube_url: handleFromUrl('youtube_url', data.user.youtube_url),
          shinydex_url: handleFromUrl('shinydex_url', data.user.shinydex_url),
        });
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [profileUserId]);

  const handleSaveSocials = async () => {
    setSocialSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        twitch_url: urlFromHandle('twitch_url', socialForm.twitch_url),
        youtube_url: urlFromHandle('youtube_url', socialForm.youtube_url),
        shinydex_url: urlFromHandle('shinydex_url', socialForm.shinydex_url),
      };
      const res = await fetch(`/api/users/${profileUserId}/socials`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setProfile(p => ({ ...p, user: { ...p.user, ...payload } }));
        setEditingSocials(false);
      }
    } catch {}
    setSocialSaving(false);
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#0d0f14' }}>
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-4 animate-pulse">
        <div className="h-32 rounded-2xl" style={{ background: CARD.bg, border: `1px solid ${CARD.border}` }} />
        <div className="flex gap-4">
          <div className="hidden lg:block w-44 shrink-0 h-48 rounded-xl" style={{ background: CARD.bg }} />
          <div className="flex-1 space-y-3">
            <div className="h-40 rounded-xl" style={{ background: CARD.bg }} />
            <div className="h-48 rounded-xl" style={{ background: CARD.bg }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (!profileUserId) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f14' }}>
      <div className="text-gray-400">Please log in to view your profile</div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f14' }}>
      <div className="text-red-400">{error || 'Profile not found'}</div>
    </div>
  );

  const accentColor = profile.user.hex_code || '#9147ff';
  const isOwnProfile = !paramUserId || user?.id === paramUserId;
  const { stats, monthlyData } = profile;
  const caughtPct = stats.totalPokemon > 0 ? Math.round((stats.totalCaught / stats.totalPokemon) * 100) : 0;

  return (
    <div className="min-h-screen" style={{ background: '#0d0f14' }}>
      <PageBackground />
      <PageHeader title={`${profile.user.display_name}'s Profile`} />

      <div className="max-w-7xl mx-auto px-6 py-4">

        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="rounded-2xl shadow-2xl border" style={{ background: CARD.hero, borderColor: CARD.border, overflow: 'visible' }}>
          {/* Accent top bar with glow */}
          <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: accentColor, boxShadow: `0 0 20px ${accentColor}80` }} />
          <div className="px-4 sm:px-6 py-4">

            {/* Top row: avatar + identity + desktop stats */}
            <div className="flex items-center gap-4">

              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="absolute inset-0 rounded-full blur-lg opacity-40" style={{ backgroundColor: accentColor, margin: '-6px' }} />
                {profile.user.avatar_url
                  ? <img src={profile.user.avatar_url} alt="Avatar"
                      className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-2xl"
                      style={{ outline: `3px solid ${accentColor}`, outlineOffset: '2px' }} />
                  : <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-3xl text-gray-400"
                      style={{ background: CARD.inner, outline: `3px solid ${accentColor}`, outlineOffset: '2px' }}>?</div>}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight truncate">
                  {profile.user.display_name}
                </h1>
                <p className="text-sm" style={{ color: accentColor }}>@{profile.user.username}</p>
                <p className="hidden sm:block text-sm text-gray-500 mt-0.5">
                  Joined {new Date(profile.user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              {/* Stat values — desktop only */}
              <div className="hidden sm:flex shrink-0 items-center gap-px border-l pl-5" style={{ borderColor: CARD.border }}>
                {[
                  { label: 'Rank',   value: stats.overallRank > 0 ? `#${stats.overallRank}` : '—' },
                  { label: 'Points', value: stats.totalPoints || 0 },
                  { label: 'Shinies', value: stats.totalShinies || 0 },
                ].map(({ label, value }, i) => (
                  <div key={label} className={`text-center px-5 ${i > 0 ? 'border-l' : ''}`} style={{ borderColor: CARD.border }}>
                    <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
                    <div className="text-2xl font-extrabold leading-none" style={{ color: accentColor }}>{value}</div>
                  </div>
                ))}
              </div>

            </div>

            {/* 6-stat grid — mobile only */}
            <div className="sm:hidden mt-3 pt-3 border-t grid grid-cols-3" style={{ borderColor: CARD.borderSubtle }}>
              {[
                { label: 'Rank',        value: stats.overallRank > 0 ? `#${stats.overallRank}` : '—' },
                { label: 'Best Rank',   value: stats.bestRankedMonth ? `#${stats.bestRankedMonth.rank}` : '—' },
                { label: 'Shinies',     value: stats.totalShinies || 0 },
                { label: 'Points',      value: stats.totalPoints || 0 },
                { label: 'Avg Pts',     value: stats.avgPointsPerMonth || 0 },
                { label: 'Months',      value: stats.monthsParticipated || 0 },
              ].map(({ label, value }, i) => (
                <div key={label} className={`text-center py-2 ${i % 3 !== 0 ? 'border-l' : ''} ${i >= 3 ? 'border-t' : ''}`}
                  style={{ borderColor: CARD.borderSubtle }}>
                  <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</div>
                  <div className="text-lg font-extrabold leading-none" style={{ color: accentColor }}>{value}</div>
                </div>
              ))}
            </div>

          </div>

          {/* Social links strip */}
          {(isOwnProfile || profile.user.twitch_url || profile.user.youtube_url || profile.user.shinydex_url) && (
            <div className="border-t px-6 py-2.5" style={{ borderColor: CARD.borderSubtle }}>
              <div className="flex items-center gap-2 flex-wrap">
                {profile.user.twitch_url && (
                  <a href={profile.user.twitch_url} target="_blank" rel="noopener noreferrer"
                    className="flex justify-center items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(145,71,255,0.12)', border: '1px solid rgba(145,71,255,0.25)', color: '#9147ff' }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                    </svg>
                    Twitch
                  </a>
                )}
                {profile.user.youtube_url && (
                  <a href={profile.user.youtube_url} target="_blank" rel="noopener noreferrer"
                    className="flex justify-center items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.22)', color: '#ff4444' }}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    YouTube
                  </a>
                )}
                {profile.user.shinydex_url && (
                  <a href={profile.user.shinydex_url} target="_blank" rel="noopener noreferrer"
                    className="flex justify-center items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                    style={{ backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.22)'}}>
                    <img src={shinyDexUrl} alt="" className="w-18 h-5 object-contain"/>
                  </a>
                )}
                {isOwnProfile && (
                  <>
                    <button onClick={() => { setSocialForm({ twitch_url: handleFromUrl('twitch_url', profile.user.twitch_url), youtube_url: handleFromUrl('youtube_url', profile.user.youtube_url), shinydex_url: handleFromUrl('shinydex_url', profile.user.shinydex_url) }); setEditingSocials(e => !e); }}
                      className="flex justify-center items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
                      style={{ color: editingSocials ? '#fff' : 'rgba(255,255,255,0.35)', border: `1px solid ${editingSocials ? 'rgba(255,255,255,0.15)' : CARD.border}`, backgroundColor: editingSocials ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      {editingSocials ? 'Cancel' : 'Edit Socials'}
                    </button>

                    {/* Connect Authenticators toggle */}
                    <div className="ml-auto relative">
                      <button
                        onClick={() => setEditingProviders(e => !e)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all"
                        style={{
                          color: editingProviders ? accentColor : 'rgba(255,255,255,0.35)',
                          border: `1px solid ${editingProviders ? accentColor + '50' : CARD.border}`,
                          backgroundColor: editingProviders ? accentColor + '14' : 'transparent',
                        }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Authenticators
                      </button>

                      {editingProviders && (
                        <div className="absolute right-0 top-full mt-1 z-20 rounded-xl border overflow-hidden shadow-xl"
                          style={{ background: CARD.inner, borderColor: CARD.border, minWidth: 200 }}>
                          {[
                            { provider: 'discord', label: 'Discord', color: '#5865F2' },
                            { provider: 'twitch',  label: 'Twitch',  color: '#9147ff' },
                            { provider: 'google',  label: 'Google',  color: '#4285F4' },
                          ].map(({ provider, label, color }) => {
                            const identity = identities.find(i => i.provider === provider);
                            const busy = accountLinking === provider;
                            return (
                              <div key={provider} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b last:border-b-0"
                                style={{ borderColor: CARD.borderSubtle }}>
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: identity ? color : 'rgba(255,255,255,0.15)' }} />
                                  <span className="text-sm" style={{ color: identity ? '#fff' : 'rgba(255,255,255,0.4)' }}>{label}</span>
                                </div>
                                <button
                                  onClick={() => identity ? handleUnlinkIdentity(provider) : handleLinkIdentity(provider)}
                                  disabled={busy || (identity && identities.length <= 1) || accountLinking !== null}
                                  title={identity && identities.length <= 1 ? 'Link another account first to enable unlinking' : undefined}
                                  className="text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={identity
                                    ? { color: 'rgba(255,255,255,0.35)', border: `1px solid ${CARD.border}` }
                                    : { color, border: `1px solid ${color}40`, backgroundColor: `${color}12` }}
                                >
                                  {busy ? '…' : identity ? 'Unlink' : 'Connect'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {editingSocials && (
                <div className="mt-2 rounded-xl p-3 border space-y-2" style={{ background: CARD.inner, borderColor: CARD.border }}>
                  {[
                    { key: 'twitch_url', label: 'Twitch Handle', prefix: 'twitch.tv/', placeholder: 'yourname', color: '#9147ff' },
                    { key: 'youtube_url', label: 'YouTube Handle', prefix: 'youtube.com/@', placeholder: 'yourname', color: '#ff4444' },
                    { key: 'shinydex_url', label: 'Shinydex Handle', prefix: 'shinydex.com/', placeholder: 'yourname', color: '#eab308' },
                  ].map(({ key, label, prefix, placeholder, color }) => (
                    <div key={key}>
                      <label className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color }}>{label}</label>
                      <div className="flex items-stretch rounded-lg overflow-hidden" style={{ border: `1px solid ${CARD.border}` }}>
                        <span className="flex items-center px-2 text-xs whitespace-nowrap select-none" style={{ background: CARD.inner, color: 'rgba(255,255,255,0.4)' }}>{prefix}</span>
                        <input
                          type="text"
                          value={socialForm[key]}
                          onChange={e => setSocialForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="flex-1 min-w-0 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                          style={{ background: CARD.bg }}
                        />
                      </div>
                    </div>
                  ))}
                  <button onClick={handleSaveSocials} disabled={socialSaving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: accentColor }}>
                    {socialSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Nav + Content ─────────────────────────────────── */}
        <MobileTabStrip tab={tab} setTab={setTab} accentColor={accentColor} />

        <div className="mt-3 flex gap-4 items-start">

          {/* Left game nav — desktop only */}
          <div className="hidden lg:block w-44 shrink-0 sticky top-4 space-y-2">
            <GameNav tab={tab} setTab={setTab} accentColor={accentColor} />

            {/* Mini stat card */}
            <div className="rounded-xl p-3 border" style={{ background: CARD.bg, borderColor: CARD.border }}>
              <div className="space-y-3">
                {[
                  { label: 'Months Active', value: stats.monthsParticipated || 0 },
                  { label: 'Avg Points', value: stats.avgPointsPerMonth || 0 },
                  { label: 'Pokédex', value: `${caughtPct}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <div className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
                    <div className="text-xl font-extrabold leading-none" style={{ color: accentColor }}>{value}</div>
                  </div>
                ))}
                {stats.bestRankedMonth && (
                  <div className="pt-2 border-t" style={{ borderColor: CARD.borderSubtle }}>
                    <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Best Rank</div>
                    <div className="text-2xl font-extrabold leading-none" style={{ color: accentColor }}>#{stats.bestRankedMonth.rank}</div>
                    <div className="text-xs mt-0.5 text-gray-500">{stats.bestRankedMonth.month}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {tab === 'statistics' && (
              <StatisticsTab profile={profile} accentColor={accentColor} onPokemonClick={setSelectedPokemon} />
            )}
            {tab === 'badges' && (
              <BadgesTab
                userId={profileUserId}
                isOwnProfile={isOwnProfile}
                accentColor={accentColor}
                playAnimation={!badgesAnimationPlayed.current}
                onAnimationPlayed={() => { badgesAnimationPlayed.current = true; }}
              />
            )}
            {tab === 'pokedex' && (
              <PokedexTab stats={stats} accentColor={accentColor} />
            )}
            {tab === 'boards' && (
              <BoardsTab userId={profileUserId} monthlyData={monthlyData} stats={stats} onPokemonClick={setSelectedPokemon} accentColor={accentColor} />
            )}
          </div>
        </div>
      </div>

      {selectedPokemon && (
        <PokemonModal pokemon={selectedPokemon} onClose={() => setSelectedPokemon(null)} />
      )}
    </div>
  );
};

export default Profile;
