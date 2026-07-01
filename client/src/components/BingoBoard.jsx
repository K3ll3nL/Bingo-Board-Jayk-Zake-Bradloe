import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import PokemonModal from './PokemonModal';
import AchievementIcon from './AchievementIcon';
import BingoGrid from './BingoGrid';

const BingoBoard = () => {
  const { user, boardVersion, loading: authLoading } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [achievements, setAchievements] = useState({ row: null, column: null, x: null, blackout: null });
  const [selectedPokemon, setSelectedPokemon] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    loadBoard();
  }, [user, boardVersion, authLoading]);

  const loadBoard = async () => {
    try {
      const data = await api.getBingoBoard(boardVersion);
      setBoard(data.board);
      setMonth(data.month);
      setAchievements(data.achievements || { row: null, column: null, x: null, blackout: null });
      setError(null);
    } catch (err) {
      setError('Failed to load bingo board');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full animate-pulse">
        <div style={{ maxWidth: '645px', margin: '0 auto' }}>
          <div className="mb-4">
            <div className="h-8 bg-gray-700/60 rounded mx-auto" style={{ width: 160 }} />
          </div>
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        style={{
          maxWidth: '645px',
        }}
        className="mx-auto"
      >
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-center text-white">{month || 'Bingo Board'}</h2>
      </div>

      <BingoGrid board={board} onCellClick={setSelectedPokemon} large />

      {/* Bingo Achievements */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { type: 'row',     label: achievements.row },
            { type: 'column',  label: achievements.column },
            { type: 'x',       label: achievements.x },
            { type: 'blackout',label: achievements.blackout },
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
                { type: 'row',     label: achievements.row_restricted },
                { type: 'column',  label: achievements.column_restricted },
                { type: 'x',       label: achievements.x_restricted },
                { type: 'blackout',label: achievements.blackout_restricted },
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