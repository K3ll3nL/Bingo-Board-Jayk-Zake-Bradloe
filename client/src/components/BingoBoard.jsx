import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import PokemonModal from './PokemonModal';
import AchievementIcon from './AchievementIcon';
import BingoGrid from './BingoGrid';
import ReconnectingPill from './ReconnectingPill';

// Optionally CONTROLLED. Passing `data` (the /api/bingo/board payload, or null
// while it's in flight) makes the parent the owner of the fetch and this
// component a pure renderer — Home needs the same payload for its own panels,
// and /api/bingo/board is `Cache-Control: no-store`, so an uncontrolled second
// instance would cost a real duplicate serverless invocation on every home load.
// Omitting `data` keeps the original self-fetching behaviour byte-for-byte.
const BingoBoard = ({ data, error: errorProp = null, hideTitle = false, hideAchievements = false, maxWidth = '645px' }) => {
  const controlled = data !== undefined;
  const { user, boardVersion, loading: authLoading } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // null | 'transient' | 'no_month'
  const [achievements, setAchievements] = useState({ row: null, column: null, x: null, blackout: null });
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const retryTimer = useRef(null);
  const retryAttempt = useRef(0);

  useEffect(() => {
    if (controlled || authLoading) return;
    loadBoard();
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [user, boardVersion, authLoading]);

  const loadBoard = async () => {
    try {
      const data = await api.getBingoBoard(boardVersion);
      setBoard(data.board);
      setMonth(data.month);
      setAchievements(data.achievements || { row: null, column: null, x: null, blackout: null });
      setError(null);
      retryAttempt.current = 0;
      setLoading(false);
    } catch (err) {
      console.error(err);
      // 404 = no active bingo month — real state, don't spin retrying.
      if (err?.status === 404) {
        setError('no_month');
        setLoading(false);
        return;
      }
      setError('transient');
      // Auto-retry with capped backoff so a Supabase blip recovers on its own.
      const delay = Math.min(30000, 5000 * Math.pow(1.5, retryAttempt.current));
      retryAttempt.current += 1;
      retryTimer.current = setTimeout(loadBoard, delay);
    }
  };

  // Resolve every render input from whichever source owns it.
  const vBoard = controlled ? (data?.board || []) : board;
  const vMonth = controlled ? (data?.month || '') : month;
  const vAchievements = controlled
    ? (data?.achievements || { row: null, column: null, x: null, blackout: null })
    : achievements;
  const vError = controlled ? errorProp : error;
  const vLoading = controlled ? (data === null && !errorProp) : loading;

  if (vError === 'no_month') {
    return (
      <div className="w-full">
        <div style={{ maxWidth: '645px', margin: '0 auto' }} className="text-center py-16">
          <h2 className="text-xl font-bold text-white mb-2">No active bingo month</h2>
          <p className="text-sm text-gray-400">The next month hasn't started yet. Check back soon.</p>
        </div>
      </div>
    );
  }

  if (vLoading || vError === 'transient') {
    return (
      <div className="w-full animate-pulse relative">
        {vError === 'transient' && <ReconnectingPill label="Reconnecting to server…" />}
        <div style={{ maxWidth, margin: '0 auto' }}>
          {!hideTitle && (
            <div className="mb-4">
              <div className="h-8 bg-gray-700/60 rounded mx-auto" style={{ width: 160 }} />
            </div>
          )}
          <div className="grid grid-cols-5 grid-rows-5 gap-2 aspect-square rounded-lg p-2" style={{ background: '#0d0f14' }}>
            {Array.from({ length: 25 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-gray-700/50" />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-6 h-6 md:w-9 md:h-9 rounded-lg bg-gray-700/50" />
                <div className="h-3 rounded bg-gray-700/40" style={{ width: 80 }} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="h-4 rounded bg-gray-700/30 mx-auto mb-2" style={{ width: 120 }} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 md:w-9 md:h-9 rounded-lg bg-gray-700/50" />
                  <div className="h-3 rounded bg-gray-700/40" style={{ width: 80 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        style={{ maxWidth }}
        className="mx-auto"
      >
      {!hideTitle && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-center text-white">{vMonth || 'Bingo Board'}</h2>
        </div>
      )}

      <BingoGrid board={vBoard} onCellClick={setSelectedPokemon} large />

      {/* Bingo Achievements — hidden when the parent renders its own bounty
          strip instead (Home's Bounties panel). */}
      {!hideAchievements && (<>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { type: 'row',     label: vAchievements.row },
            { type: 'column',  label: vAchievements.column },
            { type: 'x',       label: vAchievements.x },
            { type: 'blackout',label: vAchievements.blackout },
          ].map(({ type, label }) => (
            <div key={type} className="flex items-center gap-2">
              <AchievementIcon
                type={type}
                claimed={!!label}
                color="#9147ff"
                containerClassName="w-6 h-6 md:w-9 md:h-9 rounded-lg"
                svgClassName={type === 'blackout' ? 'w-6 h-6 md:w-9 md:h-9' : 'w-4 h-4 md:w-6 md:h-6'}
              />
              <span className="text-[10px] md:text-xs text-gray-400">
                {label
                  ? `Claimed by: ${label.length > 15 ? `${label.slice(0, 12)}...` : label}`
                  : 'Unclaimed'}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3">
            <p className="text-center text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-2">
              Restricted Challenge
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { type: 'row',     label: vAchievements.row_restricted },
                { type: 'column',  label: vAchievements.column_restricted },
                { type: 'x',       label: vAchievements.x_restricted },
                { type: 'blackout',label: vAchievements.blackout_restricted },
              ].map(({ type, label }) => (
                <div key={`${type}_restricted`} className="flex items-center gap-2">
                  <AchievementIcon
                    type={type}
                    claimed={!!label}
                    restricted={true}
                    color="#9147ff"
                    containerClassName="w-6 h-6 md:w-9 md:h-9 rounded-lg"
                    svgClassName={type === 'blackout' ? 'w-6 h-6 md:w-9 md:h-9' : 'w-4 h-4 md:w-6 md:h-6'}
                  />
                  <span className="text-[10px] md:text-xs text-gray-400">
                    {label
                      ? `Claimed by: ${label.length > 15 ? `${label.slice(0, 12)}...` : label}`
                      : 'Unclaimed'}
                  </span>
                </div>
              ))}
            </div>
        </div>
      </>)}
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

export default BingoBoard;