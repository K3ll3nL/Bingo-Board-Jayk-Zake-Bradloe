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
      setError(null);
      setLoadedCount(0); // Reset image count
      setImagesLoaded(false);
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

  if (loading || (board.length === 0 && !error)) {
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

  // Preload images in background, but don't block display after first load
  const shouldShowLoading = !imagesLoaded && board.length > 0 && loadedCount === 0;

  if (shouldShowLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-400">Loading bingo board...</div>
        </div>
        {/* Hidden images to preload */}
        <div style={{ position: 'absolute', left: '-9999px' }}>
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
      </div>
    );
  }

  return (
    <div className="w-full">
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
    </div>
  );
};

export default BingoBoard;