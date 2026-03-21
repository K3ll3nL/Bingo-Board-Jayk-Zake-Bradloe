import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import AchievementIcon from './AchievementIcon';
import { restrictedEnabled } from '../featureFlags';

const Leaderboard = () => {
  const navigate = useNavigate();
  const { leaderboardVersion } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const loadedKeys = useRef(new Set());
  const rowRefs = useRef({});
  const prevTops = useRef({});
  const prevModeIndex = useRef(0);
  const shouldRunFlip = useRef(false);
  const MODES = ['monthly', 'season', 'year', 'alltime'];
  const MODE_LABELS = { monthly: 'This Month', season: 'This Season', year: 'This Year', alltime: 'All Time' };
  const [modeIndex, setModeIndex] = useState(0);
  const viewMode = MODES[modeIndex];

  const capturePositions = () => {
    const positions = {};
    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (el) positions[id] = el.getBoundingClientRect().top;
    });
    prevTops.current = positions;
  };

  const loadLeaderboard = async (key, mode, version) => {
    try {
      const data = await api.getLeaderboard(mode, version);
      loadedKeys.current.add(key);
      setLeaderboard(data);
      setError(null);
    } catch (err) {
      setError('Failed to load leaderboard');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const key = `${viewMode}_${leaderboardVersion}`;
    const isCached = loadedKeys.current.has(key);
    const modeChanged = prevModeIndex.current !== modeIndex;
    prevModeIndex.current = modeIndex;

    // Only animate when version bumped on the same view (real DB refetch, not a tab switch)
    shouldRunFlip.current = !modeChanged && !isCached && leaderboard.length > 0;

    if (leaderboard.length === 0) {
      setLoading(true);
    } else if (!isCached) {
      setRefreshing(true);
    }

    // Capture positions NOW (synchronously, before the async fetch) so the DOM
    // still reflects the old order when we record the "First" positions for FLIP.
    if (shouldRunFlip.current) capturePositions();

    loadLeaderboard(key, viewMode, leaderboardVersion);
  }, [modeIndex, leaderboardVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // FLIP animation: only runs when a live version update changed the current view
  useLayoutEffect(() => {
    if (!shouldRunFlip.current) return;
    shouldRunFlip.current = false;

    const currentIds = new Set(leaderboard.map(u => u.user_id));
    Object.keys(rowRefs.current).forEach(id => {
      if (!currentIds.has(id)) delete rowRefs.current[id];
    });

    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (!el || prevTops.current[id] === undefined) return;
      const delta = prevTops.current[id] - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          el.style.transform = '';
        });
      });
    });
  }, [leaderboard]);

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
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setModeIndex((modeIndex - 1 + MODES.length) % MODES.length)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-white h-6">{MODE_LABELS[viewMode]}</h2>
          <div className="flex justify-center gap-1 mt-1">
            {MODES.map((_, i) => (
              <button
                key={i}
                onClick={() => setModeIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === modeIndex ? 'bg-purple-400' : 'bg-gray-600 hover:bg-gray-500'}`}
              />
            ))}
          </div>
        </div>

        <button
          onClick={() => setModeIndex((modeIndex + 1) % MODES.length)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      
      <div className="rounded-lg shadow-lg overflow-hidden relative" style={{ backgroundColor: '#212326' }}>
        {refreshing && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-700 overflow-hidden z-10">
            <div className="h-full bg-purple-500 animate-pulse" style={{ width: '100%' }} />
          </div>
        )}
        {leaderboard.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No players yet
          </div>
        ) : (
          <div className={`divide-y overflow-y-auto transition-opacity duration-150 ${refreshing ? 'opacity-50' : 'opacity-100'}`} style={{ borderColor: '#404040', maxHeight: '610px' }}>
            {leaderboard.map((user, index) => {
              const position = user.rank ?? (index + 1);
              const medal = getMedalEmoji(position);
              const showBadge = index < 10;
              
              return (
                <div
                  key={user.user_id}
                  ref={el => { rowRefs.current[user.user_id] = el; }}
                  onClick={() => navigate(`/profile/${user.user_id}`)}
                  className="p-2 flex items-center justify-between transition-colors cursor-pointer hover:bg-gray-600"
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
                        {showBadge && user.is_live && user.twitch_url && (
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
                    {/* Achievement icons — with counts for multi-month views, icon-only for monthly */}
                    <div className="flex items-center gap-1">
                      {['row', 'column', 'x', 'blackout'].map(type => (
                        user.achievement_counts?.[type] > 0 && (
                          viewMode === 'monthly' ? (
                            <AchievementIcon
                              key={type}
                              type={type}
                              color={user.hex_code || '#9147ff'}
                              svgClassName={type === 'blackout' ? 'w-4 h-4' : 'w-3 h-3'}
                            />
                          ) : (
                            <div key={type} className="flex items-center gap-0.5">
                              <AchievementIcon
                                type={type}
                                color={user.hex_code || '#9147ff'}
                                svgClassName={type === 'blackout' ? 'w-4 h-4' : 'w-3 h-3'}
                              />
                              <span className="text-xs text-gray-400">x{user.achievement_counts[type]}</span>
                            </div>
                          )
                        )
                      ))}
                      {restrictedEnabled && ['row', 'column', 'x', 'blackout'].map(type => (
                        user.achievement_counts?.[`${type}_restricted`] > 0 && (
                          viewMode === 'monthly' ? (
                            <AchievementIcon
                              key={`${type}_r`}
                              type={type}
                              restricted={true}
                              color={user.hex_code || '#9147ff'}
                              svgClassName={type === 'blackout' ? 'w-4 h-4' : 'w-3 h-3'}
                            />
                          ) : (
                            <div key={`${type}_r`} className="flex items-center gap-0.5">
                              <AchievementIcon
                                type={type}
                                restricted={true}
                                color={user.hex_code || '#9147ff'}
                                svgClassName={type === 'blackout' ? 'w-4 h-4' : 'w-3 h-3'}
                              />
                              <span className="text-xs text-gray-400">x{user.achievement_counts[`${type}_restricted`]}</span>
                            </div>
                          )
                        )
                      ))}
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