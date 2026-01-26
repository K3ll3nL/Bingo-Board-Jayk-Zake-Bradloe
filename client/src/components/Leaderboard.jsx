import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const Leaderboard = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLeaderboard();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(loadLeaderboard, 30000);
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Recently';
    
    try {
      // Handle both ISO strings and PostgreSQL timestamps
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Recently';
      }
      
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      console.error('Error parsing date:', dateString, e);
      return 'Recently';
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
      <h2 className="text-2xl font-bold text-center text-white mb-4">Leaderboard</h2>
      
      <div className="rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: '#212326' }}>
        {leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No players yet
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#404040' }}>
            {leaderboard.map((user, index) => {
              const position = index + 1;
              const medal = getMedalEmoji(position);
              
              return (
                <div
                  key={user.id}
                  onClick={() => navigate(`/profile/${user.user_id}`)}
                  className={`
                    p-2 flex items-center justify-between transition-colors cursor-pointer
                    ${position === 1 ? 'bg-gradient-to-r from-amber-300 via-amber-100 to-white hover:from-amber-400 hover:via-amber-200' : position === 2 ? 'bg-gradient-to-r from-gray-200 via-gray-50 to-white hover:from-gray-300 hover:via-gray-100' : position === 3 ? 'bg-gradient-to-r from-orange-200 via-orange-50 to-white hover:from-orange-300 hover:via-orange-100' : 'hover:bg-gray-700'}
                  `}
                  style={position > 3 ? { backgroundColor: '#212326' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8">
                      {medal ? (
                        <span className="text-xl">{medal}</span>
                      ) : (
                        <span className={`font-semibold text-sm ${position > 3 ? 'text-gray-400' : 'text-gray-500'}`}>#{position}</span>
                      )}
                    </div>
                    
                    <div>
                      <div className={`font-semibold text-sm ${position > 3 ? 'text-white' : 'text-gray-800'}`}>
                        {user.username}
                      </div>
                      <div className={`text-xs ${position > 3 ? 'text-gray-400' : 'text-gray-500'}`}>
                        Joined {formatDate(user.created_at)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Achievement icons */}
                    <div className="flex items-center gap-1">
                      {/* Row */}
                      {user.achievements?.row && (
                        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
                          </svg>
                        </div>
                      )}
                      {/* Column */}
                      {user.achievements?.column && (
                        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
                          </svg>
                        </div>
                      )}
                      {/* X */}
                      {user.achievements?.x && (
                        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                      {/* Blackout */}
                      {user.achievements?.blackout && (
                        <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <rect x="3" y="3" width="18" height="18" rx="1" />
                            <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
                            <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    <span className={`text-xl font-bold ${position > 3 ? 'text-purple-400' : 'text-primary'}`}>
                      {user.points}
                    </span>
                    <span className={`text-xs ${position > 3 ? 'text-gray-400' : 'text-gray-500'}`}>pts</span>
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