import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import PokemonModal from './PokemonModal';
import BadgeCase from './BadgeCase';
import BingoGrid from './BingoGrid';
import restrictedIcon from '../Icons/restricted-icon.png';
import { isRestrictedEnabled, RESTRICTED_LAUNCH_DATE } from '../featureFlags';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const Profile = () => {
  const { user, isModerator } = useAuth();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [showDexTooltip, setShowDexTooltip] = useState(false);
  const [dexView, setDexView] = useState('type');
  const dexHideTimer = useRef(null);
  const dexShowTimer = useRef(null);

  const profileUserId = paramUserId || user?.id;
  const [board, setBoard] = useState([]);
  const [boardMonth, setBoardMonth] = useState('');
  const [pastMonths, setPastMonths] = useState([]);
  const [selectedMonthId, setSelectedMonthId] = useState(null); // null = current
  const [boardCache, setBoardCache] = useState({}); // monthId -> { board, month }
  const [boardLoading, setBoardLoading] = useState(false);

  useEffect(() => {
    if (profileUserId) {
      loadProfile();
      loadBoard();
      loadPastMonths();
    } else {
      setLoading(false);
    }
  }, [profileUserId]);

  const loadProfile = async () => {
    try {
      const response = await fetch(`/api/profile/${profileUserId}`);
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
      setProfile(data);
      setError(null);
    } catch (err) {
      setError('Failed to load profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBoard = async () => {
    try {
      const response = await fetch(`/api/profile/${profileUserId}/board`);
      if (!response.ok) throw new Error('Failed to fetch board');
      const data = await response.json();
      setBoard(data.board);
      setBoardMonth(data.month);
    } catch (err) {
      console.error('Failed to load board:', err);
    }
  };

  const loadPastMonths = async () => {
    try {
      const response = await fetch(`/api/profile/${profileUserId}/past-months`);
      if (!response.ok) return;
      const data = await response.json();
      setPastMonths(data);
    } catch (err) {
      console.error('Failed to load past months:', err);
    }
  };

  const selectMonth = async (monthId) => {
    setSelectedMonthId(monthId);
    if (monthId === null) return;
    if (boardCache[monthId]) return;
    setBoardLoading(true);
    try {
      const response = await fetch(`/api/profile/${profileUserId}/board/${monthId}`);
      if (!response.ok) throw new Error('Failed to fetch board');
      const data = await response.json();
      setBoardCache(prev => ({ ...prev, [monthId]: data }));
    } catch (err) {
      console.error('Failed to load board for month:', err);
    } finally {
      setBoardLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (!profileUserId && !paramUserId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-center">
          <div className="text-lg text-gray-400 mb-4">Please log in to view your profile</div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-red-400">{error || 'Profile not found'}</div>
      </div>
    );
  }

  const stats = profile.stats;
  const maxPoints = Math.max(...profile.monthlyData.map(m => m.points), 1);
  const caughtPct = stats.totalPokemon > 0
    ? Math.round((stats.totalCaught / stats.totalPokemon) * 100)
    : 0;
  const showRestricted = new Date() >= RESTRICTED_LAUNCH_DATE;

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Back Button Bar */}
      <PageHeader
        title="Profile"
        onBack={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')}
      />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Row 1 - Hero Banner */}
        <div
          className="rounded-2xl shadow-2xl overflow-hidden border border-gray-600"
          style={{ backgroundColor: '#35373b' }}
        >
          {/* Top gradient strip */}
          <div className="h-2 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />

          <div className="px-4 pt-4 pb-4 sm:px-8 sm:pt-8 sm:pb-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">

            {/* Left — avatar + name + stat pills */}
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-center gap-3 sm:gap-6 mb-5 sm:mb-8">
                {profile.user.avatar_url ? (
                  <div className="relative flex-shrink-0">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 blur-sm opacity-60" style={{ margin: '-3px' }} />
                    <img
                      src={profile.user.avatar_url}
                      alt="Avatar"
                      className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full ring-4 ring-purple-500 shadow-xl"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-full ring-4 ring-purple-500 bg-gray-700 flex items-center justify-center text-4xl text-gray-400">
                    ?
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight truncate">
                    {profile.user.display_name}
                  </h1>
                  <p className="text-purple-400 text-base sm:text-lg mt-1">@{profile.user.username}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Joined{' '}
                    {new Date(profile.user.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {/* Inline pill stats */}
              <div className="flex flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                  <span className="text-gray-400 text-sm">Overall Rank</span>
                  <span className="text-purple-300 font-bold text-sm">
                    {stats.overallRank === 0 ? 'Unranked' : `#${stats.overallRank}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                  <span className="text-gray-400 text-sm">Total Points</span>
                  <span className="text-purple-300 font-bold text-sm">{stats.totalPoints || 0}</span>
                </div>
                <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                  <span className="text-gray-400 text-sm">Total Shinies</span>
                  <span className="text-purple-300 font-bold text-sm">{stats.totalShinies || 0}</span>
                </div>
              </div>
            </div>

            {/* Badge Case — stacks below on mobile, side column on sm+ */}
            {isRestrictedEnabled(isModerator) && (
              <div className="w-full sm:flex-shrink-0 sm:w-52">
                <BadgeCase
                  userId={profileUserId}
                  isOwnProfile={!paramUserId || user?.id === paramUserId}
                />
              </div>
            )}

          </div>
        </div>

        {/* Row 2 - 5 Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 border-gray-600">
          <div
            className="col-span-2 md:col-span-1 relative rounded-xl shadow-xl p-5 border border-gray-600 cursor-pointer select-none"
            style={{ backgroundColor: '#35373b' }}
            onClick={() => {
              clearTimeout(dexHideTimer.current);
              clearTimeout(dexShowTimer.current);
              setShowDexTooltip(v => !v);
            }}
            onMouseEnter={() => {
              clearTimeout(dexHideTimer.current);
              dexShowTimer.current = setTimeout(() => setShowDexTooltip(true), 600);
            }}
            onMouseLeave={() => {
              clearTimeout(dexShowTimer.current);
              dexHideTimer.current = setTimeout(() => setShowDexTooltip(false), 150);
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-gray-400 text-xs uppercase tracking-wider">Pokémon Caught</div>
              <svg
                className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${showDexTooltip ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="text-3xl font-bold text-purple-400 leading-tight">
              {stats.totalCaught || 0}
              <span className="text-lg text-gray-500 font-normal"> / {stats.totalPokemon || 0}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${caughtPct}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{caughtPct}%</span>
            </div>

            {/* Dex breakdown tooltip */}
            {showDexTooltip && (
              <div
                className="absolute top-full left-0 right-0 md:right-auto md:w-80 mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs z-50 shadow-lg"
                onClick={e => e.stopPropagation()}
                onMouseEnter={() => {
                  clearTimeout(dexHideTimer.current);
                  clearTimeout(dexShowTimer.current);
                }}
                onMouseLeave={() => {
                  dexHideTimer.current = setTimeout(() => setShowDexTooltip(false), 150);
                }}
              >
                {/* View toggle */}
                <div className="flex items-center justify-between mb-3 px-2 py-1 bg-gray-800 rounded">
                  <button
                    onClick={() => setDexView(v => v === 'type' ? 'gen' : 'type')}
                    className="text-gray-400 hover:text-white transition-colors px-1 text-sm"
                  >
                    ‹
                  </button>
                  <span className="text-gray-300 font-medium select-none">
                    {dexView === 'type' ? 'By Type' : 'By Generation'}
                  </span>
                  <button
                    onClick={() => setDexView(v => v === 'type' ? 'gen' : 'type')}
                    className="text-gray-400 hover:text-white transition-colors px-1 text-sm"
                  >
                    ›
                  </button>
                </div>

                {/* Breakdown grid - 2 columns */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {(dexView === 'type' ? (stats.dexByType || []) : (stats.dexByGen || []).map(g => ({ ...g, type: `Gen ${g.gen}` }))).map(({ type, total, caught }) => {
                    const pct = total > 0 ? Math.round((caught / total) * 100) : 0;
                    return (
                      <div key={type} className="space-y-0.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-gray-400 text-[11px] truncate">{type}</span>
                          <span className="text-purple-300 font-bold text-sm ml-1 flex-shrink-0">{pct}%</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 bg-gray-700 rounded-full h-1">
                            <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-gray-600 text-[10px] flex-shrink-0">({caught}/{total})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Months Active</div>
            <div className="text-5xl font-bold text-purple-400">{stats.monthsParticipated || 0}</div>
          </div>

          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Avg Pts / Month</div>
            <div className="text-5xl font-bold text-purple-400">{stats.avgPointsPerMonth || 0}</div>
          </div>

          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">🏆 Best Points</div>
            {stats.highestPointMonth ? (
              <>
                <div className="text-lg font-bold text-white leading-tight">{stats.highestPointMonth.month}</div>
                <div className="text-purple-400 text-m mt-0.5">{stats.highestPointMonth.points} pts</div>
              </>
            ) : <div className="text-gray-600 text-m mt-2">No data yet</div>}
          </div>

          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">📈 Best Rank</div>
            {stats.bestRankedMonth ? (
              <>
                <div className="text-lg font-bold text-white leading-tight">{stats.bestRankedMonth.month}</div>
                <div className="text-purple-400 text-m mt-0.5">Rank #{stats.bestRankedMonth.rank}</div>
              </>
            ) : <div className="text-gray-600 text-m mt-2">No data yet</div>}
          </div>
        </div>

        {/* Row 3 - Achievements + Restricted side by side */}
        <div className={`grid gap-4 ${showRestricted ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <h2 className="text-s font-semibold text-gray-400 uppercase tracking-wider mb-3">Bonus Bounties</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-4xl font-extrabold text-purple-400 leading-tight">{stats.totalBingos || 0}</div>
                <div className="text-gray-500 text-xs mt-0.5">Bingos</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-extrabold text-purple-400 leading-tight">{stats.totalXs || 0}</div>
                <div className="text-gray-500 text-xs mt-0.5">X Bingos</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-extrabold text-purple-400 leading-tight">{stats.totalBlackouts || 0}</div>
                <div className="text-gray-500 text-xs mt-0.5">Blackouts</div>
              </div>
            </div>
          </div>

          {showRestricted && (
            <div className="rounded-xl shadow-xl p-5 border border-[#78150a]/40" style={{ backgroundColor: '#35373b' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <img src={restrictedIcon} alt="" className="w-3 h-3 object-contain" />
                <h2 className="text-s font-semibold text-[#e07060] uppercase tracking-wider">Restricted Bonus Bounties</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-4xl font-extrabold text-[#e07060] leading-tight">{stats.restrictedBingos || 0}</div>
                  <div className="text-gray-500 text-xs mt-0.5">Bingos</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-extrabold text-[#e07060] leading-tight">{stats.restrictedXs || 0}</div>
                  <div className="text-gray-500 text-xs mt-0.5">X Bingos</div>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-extrabold text-[#e07060] leading-tight">{stats.restrictedBlackouts || 0}</div>
                  <div className="text-gray-500 text-xs mt-0.5">Blackouts</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Row 5 - Bingo Board with month navigation */}
        {(board.length > 0 || pastMonths.length > 0) && (() => {
          const allMonthIds = [null, ...pastMonths.map(m => m.id)];
          const currentIndex = allMonthIds.indexOf(selectedMonthId);
          const displayBoard = selectedMonthId === null ? board : (boardCache[selectedMonthId]?.board ?? []);
          const displayMonth = selectedMonthId === null ? boardMonth : (boardCache[selectedMonthId]?.month ?? '');

          return (
            <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
              {/* Arrow navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => selectMonth(allMonthIds[currentIndex + 1])}
                  disabled={currentIndex >= allMonthIds.length - 1}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-20 disabled:cursor-default transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-xl font-bold text-white">{displayMonth} Bingo Progress</h2>
                <button
                  onClick={() => selectMonth(allMonthIds[currentIndex - 1])}
                  disabled={currentIndex <= 0}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-20 disabled:cursor-default transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {boardLoading ? (
                <div className="text-gray-400 text-sm text-center py-16">Loading board...</div>
              ) : displayBoard.length > 0 ? (
                <div className="mx-auto" style={{ maxWidth: '605px' }}>
                  <BingoGrid board={displayBoard} onCellClick={setSelectedPokemon} />
                </div>
              ) : null}
            </div>
          );
        })()}

        {/* Row 6 - Points Per Month Chart */}
        <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
          <h2 className="text-2xl font-bold text-white mb-6">Points Per Month</h2>
          {profile.monthlyData.length > 0 ? (
            <div className="space-y-4">
              {profile.monthlyData.map((month, index) => (
                <div key={index}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300 text-sm">{month.month}</span>
                    <span className="text-purple-400 font-bold">{month.points} pts</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all"
                      style={{ width: `${(month.points / maxPoints) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No monthly data yet</div>
          )}
        </div>

      </div>

      {/* Pokemon Modal */}
      {selectedPokemon && (
        <PokemonModal
          pokemon={selectedPokemon}
          onClose={() => setSelectedPokemon(null)}
          monthId={selectedMonthId}
        />
      )}

    </div>
  );
};

export default Profile;
