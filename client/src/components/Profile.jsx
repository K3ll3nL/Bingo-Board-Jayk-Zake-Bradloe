import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

const Profile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Use userId from URL param if present, otherwise use logged-in user
  const profileUserId = paramUserId || user?.id;

  useEffect(() => {
    if (profileUserId) {
      loadProfile();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-gray-400">Loading profile...</div>
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

  const maxPoints = Math.max(...profile.monthlyData.map(m => m.points), 1);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      {/* Header with Back Button */}
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">Profile</h1>
          </div>
        </div>
      </header>

      <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header with Avatar and Name */}
        <div className="rounded-xl shadow-xl p-8 mb-8" style={{ backgroundColor: '#35373b' }}>
          <div className="flex items-center gap-6">
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="Profile"
                className="w-24 h-24 rounded-full ring-4 ring-purple-500"
              />
            )}
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                {profile.user.display_name}
              </h1>
              <p className="text-gray-400">@{profile.user.username}</p>
              <p className="text-sm text-gray-500 mt-1">
                Joined {new Date(profile.user.created_at).toLocaleDateString('en-US', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Overall Rank */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">Overall Rank</div>
            <div className="text-4xl font-bold text-purple-400">#{profile.stats.overallRank}</div>
          </div>

          {/* Total Points */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">Total Points</div>
            <div className="text-4xl font-bold text-purple-400">{profile.stats.totalPoints}</div>
          </div>

          {/* Total Shinies */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">Shinies Caught</div>
            <div className="text-4xl font-bold text-purple-400">{profile.stats.totalShinies}</div>
          </div>

          {/* Total Bingos */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">Bingos</div>
            <div className="text-4xl font-bold text-purple-400">{profile.stats.totalBingos}</div>
          </div>
        </div>

        {/* Best Months & Blackouts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Highest Point Month */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">🏆 Best Points Month</div>
            {profile.stats.highestPointMonth ? (
              <>
                <div className="text-2xl font-bold text-white">{profile.stats.highestPointMonth.month}</div>
                <div className="text-purple-400 text-lg">{profile.stats.highestPointMonth.points} pts</div>
              </>
            ) : (
              <div className="text-gray-500">No data yet</div>
            )}
          </div>

          {/* Best Ranked Month */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">📈 Best Rank Month</div>
            {profile.stats.bestRankedMonth ? (
              <>
                <div className="text-2xl font-bold text-white">{profile.stats.bestRankedMonth.month}</div>
                <div className="text-purple-400 text-lg">Rank #{profile.stats.bestRankedMonth.rank}</div>
              </>
            ) : (
              <div className="text-gray-500">No data yet</div>
            )}
          </div>

          {/* Blackouts */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <div className="text-gray-400 text-sm mb-2">⚫ Blackouts</div>
            <div className="text-4xl font-bold text-purple-400">{profile.stats.totalBlackouts}</div>
          </div>
        </div>

        {/* Points Per Month Graph */}
        <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
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
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">No monthly data yet</div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default Profile;