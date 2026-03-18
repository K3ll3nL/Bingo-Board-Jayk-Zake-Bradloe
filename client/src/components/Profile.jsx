import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import PokemonModal from './PokemonModal';
import { RESTRICTED_LAUNCH_DATE } from '../featureFlags';
import PageBackground from './PageBackground';

const Profile = () => {
  const { user, isPro } = useAuth();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPokemon, setSelectedPokemon] = useState(null);

  const profileUserId = paramUserId || user?.id;
  const [board, setBoard] = useState([]);
  const [boardMonth, setBoardMonth] = useState('');

  useEffect(() => {
    if (profileUserId) {
      loadProfile();
      loadBoard();
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
      <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-white">Profile</h1>
            </div>
            {isPro && (!paramUserId || paramUserId === user?.id) && (
              <button
                onClick={() => navigate('/pro')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{ backgroundColor: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.5)', color: '#a78bfa' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                Stream Overlays
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Row 1 - Hero Banner */}
        <div
          className="rounded-2xl shadow-2xl overflow-hidden border border-gray-600"
          style={{ backgroundColor: '#35373b' }}
        >
          {/* Top gradient strip */}
          <div className="h-2 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />

          <div className="px-8 pt-8 pb-6">
            {/* Avatar + Name */}
            <div className="flex items-center gap-6 mb-8">
              {profile.user.avatar_url ? (
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 blur-sm opacity-60" style={{ margin: '-3px' }} />
                  <img
                    src={profile.user.avatar_url}
                    alt="Avatar"
                    className="relative w-28 h-28 rounded-full ring-4 ring-purple-500 shadow-xl"
                  />
                </div>
              ) : (
                <div className="w-28 h-28 rounded-full ring-4 ring-purple-500 bg-gray-700 flex items-center justify-center text-4xl text-gray-400">
                  ?
                </div>
              )}
              <div>
                <h1 className="text-5xl font-extrabold text-white leading-tight">
                  {profile.user.display_name}
                </h1>
                <p className="text-purple-400 text-lg mt-1">@{profile.user.username}</p>
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
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                <span className="text-gray-400 text-sm">Overall Rank</span>
                <span className="text-purple-300 font-bold text-sm">
                  {stats.overallRank === 0 ? 'Unranked' : `#${stats.overallRank}`}
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                <span className="text-gray-400 text-sm">Total Points</span>
                <span className="text-purple-300 font-bold text-sm">{stats.totalPoints || 0}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                <span className="text-gray-400 text-sm">Total Shinies</span>
                <span className="text-purple-300 font-bold text-sm">{stats.totalShinies || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2 - 5 Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 border-gray-600">
          <div className="rounded-xl shadow-xl p-5 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">Pokémon Caught</div>
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
          {/* Normal Achievements */}
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

          {/* Restricted Challenge - only shown after feature launch date */}
          {showRestricted && (
            <div className="rounded-xl shadow-xl p-5 border border-[#78150a]/40" style={{ backgroundColor: '#35373b' }}>
              <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3 h-3 text-[#e07060]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
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

        {/* Row 5 - Current Month Bingo Board */}
        {board.length > 0 && (
          <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <h2 className="text-2xl font-bold text-white mb-6">{boardMonth} Bingo Progress</h2>
            <div className="grid grid-cols-5 gap-2 max-w-2xl mx-auto">
              {board.map((cell) => {
                const isFreeSpace = cell.position === 13;
                const isEmpty = cell.pokemon_name === 'EMPTY';
                const isClickable = !isFreeSpace && !isEmpty;

                return (
                  <div
                    key={cell.id}
                    onClick={() => isClickable && setSelectedPokemon(cell)}
                    className={`
                      relative rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none
                      ${cell.is_checked
                        ? 'border-green-500 text-white font-semibold shadow-lg'
                        : cell.is_pending
                        ? 'text-white font-semibold shadow-lg'
                        : 'border-gray-600 text-gray-300 bg-gray-800'
                      }
                      ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600 flex items-center justify-center aspect-square' : ''}
                      ${isEmpty ? 'bg-gray-900 border-gray-700 opacity-50 flex items-center justify-center aspect-square' : ''}
                      ${isClickable ? 'cursor-pointer hover:scale-105' : ''}
                    `}
                    style={{
                      backgroundColor: !isFreeSpace && !isEmpty
                        ? cell.is_checked ? '#16a34a'
                        : cell.is_pending ? '#854d0e'
                        : undefined
                        : undefined,
                      borderColor: !isFreeSpace && !isEmpty && cell.is_pending ? '#ca8a04' : undefined,
                    }}
                  >
                    {!isFreeSpace && !isEmpty && cell.pokemon_gif && (
                      <img
                        src={cell.pokemon_gif}
                        alt={cell.pokemon_name}
                        className="w-full block"
                        style={{ verticalAlign: 'top' }}
                      />
                    )}
                    {(isFreeSpace || isEmpty) && (
                      <span className="text-xs leading-tight break-words">
                        {cell.pokemon_name}
                      </span>
                    )}
                    {cell.is_checked && !isFreeSpace && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                        <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                    {cell.is_pending && !isFreeSpace && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                        <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
        />
      )}
    </div>
  );
};

export default Profile;
