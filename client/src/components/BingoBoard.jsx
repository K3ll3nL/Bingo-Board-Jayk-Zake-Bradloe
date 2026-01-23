import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const BingoBoard = () => {
  const { user } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState(null);
  const [achievements, setAchievements] = useState({ row: false, column: false, blackout: false });

  useEffect(() => {
    loadBoard();
    
    // Check for completion updates every 5 minutes (not images, just data)
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

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
      const data = await api.getBingoBoard();
      setBoard(data.board);
      setMonth(data.month);
      setAchievements(data.achievements || { row: false, column: false, blackout: false });
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

  // Check only for completion status updates, not reload images
  const checkForUpdates = async () => {
    try {
      const data = await api.getBingoBoard();
      // Only update completion status, not the entire board
      setBoard(prevBoard => 
        prevBoard.map(cell => {
          const updated = data.board.find(c => c.id === cell.id);
          if (updated && cell.is_checked !== updated.is_checked) {
            return { ...cell, is_checked: updated.is_checked };
          }
          return cell;
        })
      );
    } catch (err) {
      console.error('Failed to check for updates:', err);
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
      <div style={{ opacity: imagesLoaded || !hasImagesToLoad ? 1 : 0, transition: 'opacity 0.3s' }}>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-center text-white">{month || 'Bingo Board'}</h2>
      </div>
      
      <div className="grid grid-cols-5 gap-2 aspect-square max-w-2xl mx-auto">
        {board.map((cell) => {
          const isFreeSpace = cell.position === 13;
          
          return (
            <div
              key={cell.id}
              className={`
                relative rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none
                ${cell.is_checked 
                  ? 'bg-primary border-primary text-white font-semibold shadow-lg' 
                  : 'border-gray-600 text-gray-200'
                }
                ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600 flex items-center justify-center aspect-square' : ''}
                ${cell.pokemon_name === 'EMPTY' ? 'bg-gray-900 border-gray-700 opacity-50 flex items-center justify-center aspect-square' : ''}
              `}
              style={{ backgroundColor: cell.is_checked && !isFreeSpace ? '#5865F2' : !isFreeSpace && cell.pokemon_name !== 'EMPTY' ? '#212326' : undefined }}
            >
              {!isFreeSpace && cell.pokemon_name !== 'EMPTY' && cell.pokemon_gif && (
                <img 
                  src={cell.pokemon_gif} 
                  alt={cell.pokemon_name}
                  className="w-full block"
                  style={{ verticalAlign: 'top' }}
                />
              )}
              {(isFreeSpace || cell.pokemon_name === 'EMPTY') && (
                <span className="text-xs md:text-sm leading-tight break-words">
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
            </div>
          );
        })}
      </div>

      {/* Bingo Achievements - Only show if user is authenticated */}
      {user && (
        <div className="mt-6 flex justify-center gap-8">
          {/* Row Bingo */}
          <div className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${achievements.row ? 'bg-purple-500' : 'bg-gray-700'}`}>
              <svg className={`w-8 h-8 ${achievements.row ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-2">Row</span>
          </div>

          {/* Column Bingo */}
          <div className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${achievements.column ? 'bg-purple-500' : 'bg-gray-700'}`}>
              <svg className={`w-8 h-8 ${achievements.column ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" transform="rotate(90 12 12)" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-2">Column</span>
          </div>

          {/* Blackout */}
          <div className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${achievements.blackout ? 'bg-purple-500' : 'bg-gray-700'}`}>
              <svg className={`w-8 h-8 ${achievements.blackout ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
              </svg>
            </div>
            <span className="text-xs text-gray-400 mt-2">Blackout</span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default BingoBoard;