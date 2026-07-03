import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import AchievementIcon from './AchievementIcon';

// Whether the device supports true hover (desktop). Evaluated once.
const CAN_HOVER = typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(hover: hover)').matches;

// Right-aligned stat that auto-cycles points ↔ Pokémon count while its row is hovered.
// State is kept local per-row so the parent list (and FLIP animation) never re-renders.
const StatContent = ({ step, points, pokemonCount }) => (
  step % 2 === 0 ? (
    <>
      <span className="text-xl font-bold text-purple-400">{points}</span>
      <span className="text-xs text-gray-400">pts</span>
    </>
  ) : (
    <>
      <span className="text-xl font-bold text-emerald-400">{pokemonCount}</span>
      <span className="text-xs text-gray-400">Pkmn</span>
    </>
  )
);

const StatValue = ({ points, pokemonCount, hovered }) => {
  // A 2-cell vertical track. Each tick rolls the track up one cell (always the same
  // direction); when the roll finishes we promote the next value to the top cell and
  // snap back to 0 with no transition, so the cycle can repeat seamlessly.
  const [base, setBase] = useState(0);      // step shown in the top (visible) cell
  const [rolling, setRolling] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const canCycle = CAN_HOVER && typeof pokemonCount === 'number';

  useEffect(() => {
    if (hovered && canCycle) {
      // Two-phase per tick: roll up (transform transition), then rebase on a timer.
      // Rebasing on a timer (not transitionend) means the cycle can never deadlock if
      // the transition event doesn't fire (e.g. backgrounded tab / paused compositor).
      intervalRef.current = setInterval(() => {
        setRolling(true);
        timeoutRef.current = setTimeout(() => {
          setBase(b => b + 1);
          setRolling(false);
        }, 420);
      }, 5000);
    } else {
      setRolling(false);
      setBase(0);
    }
    return () => { clearInterval(intervalRef.current); clearTimeout(timeoutRef.current); };
  }, [hovered, canCycle]);

  const cellClass = 'h-7 flex items-baseline justify-end gap-1';
  return (
    <div className="min-w-[3.5rem] h-7 overflow-hidden text-right">
      <div
        className="flex flex-col"
        style={{
          transform: rolling ? 'translateY(-1.75rem)' : 'translateY(0)',
          transition: rolling ? 'transform 0.4s ease' : 'none',
        }}
      >
        <div className={cellClass}>
          <StatContent step={base} points={points} pokemonCount={pokemonCount} />
        </div>
        <div className={cellClass}>
          <StatContent step={base + 1} points={points} pokemonCount={pokemonCount} />
        </div>
      </div>
    </div>
  );
};

const Leaderboard = () => {
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
  const MODE_LABELS = { monthly: 'Monthly', season: 'Season', year: 'Year', alltime: 'All Time' };
  const [modeIndex, setModeIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const viewMode = MODES[modeIndex];

  // Historical period navigation
  const [periods, setPeriods] = useState(null);
  const [periodIdx, setPeriodIdx] = useState(0); // 0 = current/active

  useEffect(() => {
    api.getLeaderboardPeriods().then(setPeriods).catch(() => {});
  }, []);

  const getPeriodList = () => {
    if (!periods) return [];
    if (viewMode === 'monthly') return periods.months || [];
    if (viewMode === 'season') return periods.seasons || [];
    if (viewMode === 'year') return periods.years || [];
    return [];
  };

  const getPeriodMonthId = () => {
    if (periodIdx === 0 || !periods) return null;
    const list = getPeriodList();
    const item = list[periodIdx];
    if (!item) return null;
    return viewMode === 'monthly' ? item.id : item.anchor_month_id;
  };

  const getPeriodLabel = () => {
    const list = getPeriodList();
    if (!list.length) return null;
    return list[periodIdx]?.label || null;
  };

  const capturePositions = () => {
    const positions = {};
    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (el) positions[id] = el.getBoundingClientRect().top;
    });
    prevTops.current = positions;
  };

  const loadLeaderboard = async (key, mode, version, periodMonthId) => {
    try {
      const data = await api.getLeaderboard(mode, version, periodMonthId);
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
    const periodMonthId = getPeriodMonthId();
    const key = `${viewMode}_${leaderboardVersion}_${periodIdx}`;
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

    if (shouldRunFlip.current) capturePositions();

    loadLeaderboard(key, viewMode, leaderboardVersion, periodMonthId);
  }, [modeIndex, leaderboardVersion, periodIdx]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="w-full h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-center gap-1 mb-2">
          {MODES.map((mode, i) => (
            <div key={mode} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${i === 0 ? 'bg-purple-600/40' : 'bg-gray-700/40'}`} style={{ minWidth: 60 }}>&nbsp;</div>
          ))}
        </div>
        <div className="mb-3 h-6" />
        <div className="rounded-lg overflow-hidden flex-1" style={{ background: '#0d0f14' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-2 flex items-center justify-between border-b border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-700/60" />
                <div>
                  <div className="h-3.5 rounded bg-gray-700/60 mb-1.5" style={{ width: 80 + (i % 3) * 30 }} />
                  <div className="h-2.5 rounded bg-gray-700/40" style={{ width: 50 + (i % 2) * 20 }} />
                </div>
              </div>
              <div className="h-5 w-12 rounded bg-gray-700/60" />
            </div>
          ))}
        </div>
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
    <div className="w-full h-full flex flex-col">
      {/* Mode tabs */}
      <div className="flex items-center justify-center gap-1 mb-2">
        {MODES.map((mode, i) => (
          <button
            key={mode}
            onClick={() => { setModeIndex(i); setPeriodIdx(0); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${i === modeIndex ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {/* Period navigator — only for non-alltime modes */}
      {viewMode !== 'alltime' && (
        <div className="flex items-center justify-center gap-2 mb-3">
          <button
            onClick={() => setPeriodIdx(i => i + 1)}
            disabled={!periods || periodIdx >= getPeriodList().length - 1}
            className="p-2 -m-2 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-default transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm text-gray-300 min-w-[110px] text-center">
            {getPeriodLabel() || (periodIdx === 0 ? 'Current' : '…')}
            {periodIdx === 0 && <span className="ml-1 text-xs text-purple-400">(live)</span>}
          </span>
          <button
            onClick={() => setPeriodIdx(i => Math.max(0, i - 1))}
            disabled={periodIdx === 0}
            className="p-2 -m-2 text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-default transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
      {viewMode === 'alltime' && <div className="mb-3 text-center text-sm text-gray-400 font-medium">All Time</div>}
      
      <div className={`rounded-lg shadow-lg overflow-hidden relative flex flex-col ${leaderboard.length >= 10 ? 'flex-1' : ''}`} style={{ background: '#0d0f14' }}>
        {refreshing && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-700 overflow-hidden z-10">
            <div className="h-full bg-purple-500 animate-pulse" style={{ width: '100%' }} />
          </div>
        )}
        {leaderboard.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-400">
            No players yet
          </div>
        ) : (
          <div className={`divide-y overflow-y-auto flex-1 transition-opacity duration-150 ${refreshing ? 'opacity-50' : 'opacity-100'}`} style={{ borderColor: '#404040' }}>
            {leaderboard.map((user, index) => {
              const position = user.rank ?? (index + 1);
              const medal = getMedalEmoji(position);
              const showBadge = index < 10;
              
              return (
                <div
                  key={user.user_id}
                  ref={el => { rowRefs.current[user.user_id] = el; }}
                  onMouseEnter={CAN_HOVER ? () => setHoveredId(user.user_id) : undefined}
                  onMouseLeave={CAN_HOVER ? () => setHoveredId(null) : undefined}
                  className="relative p-2 flex items-center justify-between transition-colors cursor-pointer hover:bg-white/5"
                >
                  {/* Stretched link overlay: makes the whole row a real anchor (open-in-new-tab, right-click) while keeping nested links like Twitch clickable via higher z-index */}
                  <Link
                    to={`/profile/${user.user_id}`}
                    className="absolute inset-0 z-0"
                    aria-label={`View ${user.display_name}'s profile`}
                  />
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
                            className="relative z-10 inline-flex"
                          >
                            <svg className="w-4 h-4 text-purple-500 hover:text-purple-400 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0 min-h-[16px]">
                        {(user.badge_slots || []).map((badge, i) => {
                          const isSubmissionFamily = badge?.family === 'submission_standard' || badge?.family === 'submission_restricted';
                          return badge?.image_url && (
                            <img
                              key={i}
                              src={badge.image_url}
                              alt={badge.name}
                              style={isSubmissionFamily ? { width: '25px', height: '28px' } : { width: '28px', height: '28px' }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Achievement icons — with counts for multi-month views, icon-only for monthly */}
                    <div className="flex items-center gap-1">
                      {['row', 'column', 'x', 'blackout', 'personal_blackout'].map(type => (
                        user.achievement_counts?.[type] > 0 && (
                          viewMode === 'monthly' ? (
                            <AchievementIcon
                              key={type}
                              type={type}
                              color={user.hex_code || '#9147ff'}
                              svgClassName={type.includes('blackout') ? 'w-4 h-4' : 'w-3 h-3'}
                            />
                          ) : (
                            <div key={type} className="flex items-center gap-0.5">
                              <AchievementIcon
                                type={type}
                                color={user.hex_code || '#9147ff'}
                                svgClassName={type.includes('blackout') ? 'w-4 h-4' : 'w-3 h-3'}
                              />
                              <span className="text-xs text-gray-400">x{user.achievement_counts[type]}</span>
                            </div>
                          )
                        )
                      ))}
                      {['row', 'column', 'x', 'blackout', 'personal_blackout'].map(type => (
                        user.achievement_counts?.[`${type}_restricted`] > 0 && (
                          viewMode === 'monthly' ? (
                            <AchievementIcon
                              key={`${type}_r`}
                              type={type}
                              restricted={true}
                              color={user.hex_code || '#9147ff'}
                              svgClassName={type.includes('blackout') ? 'w-4 h-4' : 'w-3 h-3'}
                            />
                          ) : (
                            <div key={`${type}_r`} className="flex items-center gap-0.5">
                              <AchievementIcon
                                type={type}
                                restricted={true}
                                color={user.hex_code || '#9147ff'}
                                svgClassName={type.includes('blackout') ? 'w-4 h-4' : 'w-3 h-3'}
                              />
                              <span className="text-xs text-gray-400">x{user.achievement_counts[`${type}_restricted`]}</span>
                            </div>
                          )
                        )
                      ))}
                    </div>
                    
                    <StatValue
                      points={user.points}
                      pokemonCount={user.pokemon_count}
                      hovered={hoveredId === user.user_id}
                    />
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