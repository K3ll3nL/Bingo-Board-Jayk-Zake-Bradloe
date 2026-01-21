import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const BingoBoard = () => {
  const { user } = useAuth();
  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadBoard();
    
    // Poll for updates every hour (moderators update via Supabase)
    const interval = setInterval(loadBoard, 60 * 60 * 1000); // 1 hour = 60 min * 60 sec * 1000 ms
    return () => clearInterval(interval);
  }, [user]); // Reload when user changes (login/logout)

  const loadBoard = async () => {
    try {
      const data = await api.getBingoBoard();
      setBoard(data.board);
      setMonth(data.month_year_display);
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
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading bingo board...</div>
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
                relative p-2 rounded-lg border-2 transition-all duration-200 
                flex flex-col items-center justify-center text-center overflow-hidden
                ${cell.is_checked 
                  ? 'bg-primary border-primary text-white font-semibold shadow-lg' 
                  : 'border-gray-600 text-gray-200'
                }
                ${isFreeSpace ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white font-bold border-purple-600' : ''}
              `}
              style={{ backgroundColor: cell.is_checked && !isFreeSpace ? '#5865F2' : !isFreeSpace ? '#212326' : undefined }}
            >
              {!isFreeSpace && cell.pokemon_gif && (
                <img 
                  src={cell.pokemon_gif} 
                  alt={cell.pokemon_name}
                  className="w-full h-auto mb-1"
                />
              )}
              <span className="text-xs md:text-sm leading-tight break-words">
                {cell.pokemon_name}
              </span>
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