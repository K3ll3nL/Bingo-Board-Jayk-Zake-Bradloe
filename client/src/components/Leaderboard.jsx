import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLeaderboard();
    
    // Poll for updates every 3 seconds
    const interval = setInterval(loadLeaderboard, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadLeaderboard = async () => {
    try {
      const data = await api.getLeaderboard();
      setLeaderboard(data);
      setError(null);
    } catch (err) {
      setError('Failed to load leaderboard');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading leaderboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  const getMedalEmoji = (position) => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return null;
  };

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">Leaderboard</h2>
      
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No players yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {leaderboard.map((user, index) => {
              const position = index + 1;
              const medal = getMedalEmoji(position);
              
              return (
                <div
                  key={user.id}
                  className={`
                    p-4 flex items-center justify-between transition-colors
                    ${position === 1 ? 'bg-gradient-to-r from-amber-300 via-amber-100 to-white' : position === 2 ? 'bg-gradient-to-r from-gray-200 via-gray-50 to-white' : position === 3 ? 'bg-gradient-to-r from-orange-200 via-orange-50 to-white' : 'hover:bg-gray-50'}                  `}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10">
                      {medal ? (
                        <span className="text-2xl">{medal}</span>
                      ) : (
                        <span className="text-gray-500 font-semibold">#{position}</span>
                      )}
                    </div>
                    
                    <div>
                      <div className="font-semibold text-gray-800">
                        {user.display_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary">
                      {user.points}
                    </span>
                    <span className="text-sm text-gray-500">pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
