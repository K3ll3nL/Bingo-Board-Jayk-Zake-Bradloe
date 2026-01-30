import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const Leaderboard = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('monthly'); // 'monthly' or 'alltime'

  useEffect(() => {
    loadLeaderboard();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(loadLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [viewMode]);

  const loadLeaderboard = async () => {
    try {
      const data = await api.getLeaderboard(viewMode);
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
      {/* Header with Tab Switcher */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewMode(viewMode === 'monthly' ? 'alltime' : 'monthly')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <h2 className="text-2xl font-bold text-white">
          {viewMode === 'monthly' ? 'This Month' : 'All Time'}
        </h2>
        
        <button
          onClick={() => setViewMode(viewMode === 'monthly' ? 'alltime' : 'monthly')}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
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
                    p-2 flex items-center justify-between transition-colors cursor-pointer hover:bg-gray-600`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8">
                      {medal ? (
                        <span className="text-3xl">{medal}</span>
                      ) : (
                        <span className={`font-semibold text-xl text-gray-400`}>#{position}</span>
                      )}
                    </div>
                    
                    <div>
                      <div className={`font-semibold text-l text-white flex items-center gap-1`}>
                        <span>{user.display_name}</span>
                        {user.is_live && user.twitch_url && (
                          <a 
                            href={user.twitch_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex"
                          >
                            <svg className="w-4 h-4 text-purple-500 hover:text-purple-400 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                      <div className={`text-xs text-gray-400`}>
                        Joined {formatDate(user.created_at)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Achievement icons with counts (all-time) or boolean (monthly) */}
                    <div className="flex items-center gap-1">
                      {viewMode === 'alltime' ? (
                        // All-time: Show counts
                        <>
                          {user.achievement_counts?.row > 0 && (
                            <div className="flex items-center gap-0.5">
                              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
                                </svg>
                              </div>
                              <span className="text-xs text-gray-400">x{user.achievement_counts.row}</span>
                            </div>
                          )}
                          {user.achievement_counts?.column > 0 && (
                            <div className="flex items-center gap-0.5">
                              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
                                </svg>
                              </div>
                              <span className="text-xs text-gray-400">x{user.achievement_counts.column}</span>
                            </div>
                          )}
                          {user.achievement_counts?.x > 0 && (
                            <div className="flex items-center gap-0.5">
                              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </div>
                              <span className="text-xs text-gray-400">x{user.achievement_counts.x}</span>
                            </div>
                          )}
                          {user.achievement_counts?.blackout > 0 && (
                            <div className="flex items-center gap-0.5">
                              <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <rect x="3" y="3" width="18" height="18" rx="1" />
                                  <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
                                  <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
                                </svg>
                              </div>
                              <span className="text-xs text-gray-400">x{user.achievement_counts.blackout}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        // Monthly: Show boolean icons (only if they have the achievement)
                        <>
                          {user.achievement_counts?.row > 0 && (
                            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
                              </svg>
                            </div>
                          )}
                          {user.achievement_counts?.column > 0 && (
                            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
                              </svg>
                            </div>
                          )}
                          {user.achievement_counts?.x > 0 && (
                            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                          )}
                          {user.achievement_counts?.blackout > 0 && (
                            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: user.hex_code || '#9147ff' }}>
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <rect x="3" y="3" width="18" height="18" rx="1" />
                                <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
                                <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
                              </svg>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    <span className="text-xl font-bold text-purple-400">
                      {user.points}
                    </span>
                    <span className="text-xs text-gray-400">pts</span>
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