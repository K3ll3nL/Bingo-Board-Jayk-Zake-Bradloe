import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import backgroundImage from '../Icons/2026Jan.png';
import PokemonModal from './PokemonModal';
import AchievementIcon from './AchievementIcon';
import { restrictedEnabled } from '../featureFlags';

const BingoBoard = () => {
  const { user, boardVersion } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(null);
  const [achievements, setAchievements] = useState({ row: null, column: null, x: null, blackout: null });
  const [selectedPokemon, setSelectedPokemon] = useState(null);

  useEffect(() => {
    loadBoard();
  }, [user, boardVersion]);

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
      
      <div 
        className="grid grid-cols-5 gap-2 aspect-square rounded-lg p-2"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#212326'
        }}
      >
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
                  ? 'text-white font-semibold shadow-lg'
                  : cell.is_pending
                  ? 'text-white font-semibold shadow-lg'
                  : 'border-gray-600 text-gray-200'
                }
                ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600 flex items-center justify-center text-center aspect-square' : ''}
                ${isEmpty ? 'bg-gray-900 border-gray-700 opacity-50 flex items-center justify-center text-center aspect-square' : ''}
                ${isClickable ? 'cursor-pointer hover:scale-105' : ''}
              `}
              style={{
                backgroundColor: !isFreeSpace && !isEmpty
                  ? cell.is_checked ? '#16a34a'
                  : cell.is_pending ? '#854d0e'
                  : '#212326'
                  : undefined,
                borderColor: !isFreeSpace && !isEmpty
                  ? cell.is_checked ? '#16a34a'
                  : cell.is_pending ? '#ca8a04'
                  : undefined
                  : undefined,
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
                <span className="text-xs md:text-sm leading-tight break-words px-1">
                  {cell.pokemon_name}
                </span>
              )}
              {cell.is_checked && !isFreeSpace && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              {cell.is_pending && !isFreeSpace && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40">
                  <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
        {restrictedEnabled && (
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