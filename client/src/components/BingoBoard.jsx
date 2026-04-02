import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import PokemonModal from './PokemonModal';
import AchievementIcon from './AchievementIcon';
import BingoGrid from './BingoGrid';
import { isRestrictedEnabled } from '../featureFlags';

const BingoBoard = () => {
  const { user, boardVersion, isModerator, loading: authLoading } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(null);
  const [achievements, setAchievements] = useState({ row: null, column: null, x: null, blackout: null });
  const [selectedPokemon, setSelectedPokemon] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    loadBoard();
  }, [user, boardVersion, authLoading]);

  useEffect(() => {
    // Reset images loaded when board changes
    if (board.length > 0) {
      const totalImages = board.filter(c => c.pokemon_gif && c.pokemon_name !== 'FREE SPACE' && c.pokemon_name !== 'EMPTY').length;
      if (totalImages === 0) {
        // No images to load, show immediately
        setImagesLoaded(true);
      }
    }
  }, [board]);

  const loadBoard = async () => {
    try {
      const data = await api.getBingoBoard(boardVersion);
      setBoard(data.board);
      setMonth(data.month);
      setAchievements(data.achievements || { row: null, column: null, x: null, blackout: null });
      setError(null);
      // Don't reset image states on updates, only on initial load
      if (loading) {
        setLoadedCount(0);
        setImagesLoaded(false);
      }
    } catch (err) {
      setError('Failed to load bingo board');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageLoad = () => {
    setLoadedCount(prev => {
      const newCount = prev + 1;
      // Count only Pokemon images (not FREE SPACE or EMPTY)
      const totalImages = board.filter(cell => 
        cell.pokemon_name !== 'FREE SPACE' && 
        cell.pokemon_name !== 'EMPTY' && 
        cell.pokemon_gif
      ).length;
      
      if (newCount >= totalImages) {
        setImagesLoaded(true);
      }
      return newCount;
    });
  };

  // Show loading screen only during initial API fetch
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-400">Loading bingo board...</div>
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

  // Preload images in hidden div if not loaded yet
  const hasImagesToLoad = board.some(c => c.pokemon_gif && c.pokemon_name !== 'FREE SPACE' && c.pokemon_name !== 'EMPTY');

  return (
    <div className="w-full">
      {!imagesLoaded && hasImagesToLoad && (
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
          {board.map((cell) => {
            if (cell.pokemon_name !== 'FREE SPACE' && cell.pokemon_name !== 'EMPTY' && cell.pokemon_gif) {
              return (
                <img 
                  key={cell.id}
                  src={cell.pokemon_gif} 
                  alt={cell.pokemon_name}
                  onLoad={handleImageLoad}
                  onError={handleImageLoad}
                />
              );
            }
            return null;
          })}
        </div>
      )}
      
      {/* Show board with opacity transition */}
      <div
        style={{
          opacity: imagesLoaded || !hasImagesToLoad ? 1 : 0,
          transition: 'opacity 0.3s',
          maxWidth: '645px',
        }}
        className="mx-auto"
      >
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-center text-white">{month || 'Bingo Board'}</h2>
      </div>

      <BingoGrid board={board} onCellClick={setSelectedPokemon} />

      {/* Bingo Achievements - Show for everyone */}
        <div className="mt-4 grid grid-cols-2 md:flex md:justify-center gap-3 md:gap-4">
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

        {/* Restricted Challenge Achievements — gated until RESTRICTED_LAUNCH_DATE */}
        {isRestrictedEnabled(isModerator) && (
          <div className="mt-3">
            <p className="text-center text-[10px] md:text-xs text-gray-500 uppercase tracking-wider mb-2">
              Restricted Challenge
            </p>
            <div className="grid grid-cols-2 md:flex md:justify-center gap-3 md:gap-4">
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
        )}
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