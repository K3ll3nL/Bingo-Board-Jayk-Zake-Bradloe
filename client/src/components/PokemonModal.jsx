import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PokemonModal = ({ pokemon, onClose }) => {
  const navigate = useNavigate();
  const [recentCatches, setRecentCatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pokemon) {
      loadRecentCatches();
    }
  }, [pokemon]);

  const loadRecentCatches = async () => {
    try {
      const response = await fetch(`/api/pokemon/${pokemon.pokemon_id}/recent-catches`);
      if (!response.ok) throw new Error('Failed to load recent catches');
      const data = await response.json();
      setRecentCatches(data);
    } catch (err) {
      console.error('Error loading recent catches:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleSubmitClick = () => {
    navigate(`/upload?pokemon=${pokemon.pokemon_id}`);
    onClose();
  };

  if (!pokemon) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: '#35373b' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 p-6 border-b border-gray-600" style={{ backgroundColor: '#35373b' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src={pokemon.pokemon_gif || pokemon.img_url} 
                alt={pokemon.pokemon_name}
                className="w-20 h-20 object-contain"
              />
              <div>
                <h2 className="text-2xl font-bold text-white">{pokemon.pokemon_name}</h2>
                <p className="text-gray-400">#{String(pokemon.national_dex_id).padStart(4, '0')}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Recent Catches */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-white mb-3">Recent Catches</h3>
            {loading ? (
              <div className="text-gray-400 text-center py-4">Loading...</div>
            ) : recentCatches.length === 0 ? (
              <div className="text-gray-400 text-center py-4">No catches yet</div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#404040' }}>
                {recentCatches.map((entry, index) => (
                  <div
                    key={entry.id}
                    onClick={() => {
                      navigate(`/profile/${entry.user_id}`);
                      onClose();
                    }}
                    className="p-2 flex items-center justify-between transition-colors cursor-pointer hover:bg-gray-600"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8">
                        <span className="font-semibold text-xl text-gray-400">#{index + 1}</span>
                      </div>
                      
                      {entry.avatar_url && (
                        <img
                          src={entry.avatar_url}
                          alt={entry.display_name}
                          className="w-10 h-10 rounded-full"
                        />
                      )}
                      
                      <div>
                        <div className="font-semibold text-l text-white">
                          {entry.display_name}
                        </div>
                        <div className="text-xs text-gray-400">
                          {formatDate(entry.caught_at)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Achievement icons */}
                      <div className="flex items-center gap-1">
                        {entry.achievements?.row && (
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: entry.hex_code || '#9147ff' }}>
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
                            </svg>
                          </div>
                        )}
                        {entry.achievements?.column && (
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: entry.hex_code || '#9147ff' }}>
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
                            </svg>
                          </div>
                        )}
                        {entry.achievements?.x && (
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: entry.hex_code || '#9147ff' }}>
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        )}
                        {entry.achievements?.blackout && (
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: entry.hex_code || '#9147ff' }}>
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <rect x="3" y="3" width="18" height="18" rx="1" />
                              <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
                              <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      <span className="text-xl font-bold text-purple-400">
                        {entry.points || 0}
                      </span>
                      <span className="text-xs text-gray-400">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* External Links */}
          <div className="grid grid-cols-2 gap-px bg-gray-600 -mx-6 -mb-6 mt-6">
            <a
              href={`https://bulbapedia.bulbagarden.net/wiki/${pokemon.pokemon_name}_(Pok%C3%A9mon)`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 bg-gray-700 hover:bg-gray-600 text-white text-center font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Bulbapedia
            </a>
            <button
              onClick={pokemon.caught ? undefined : handleSubmitClick}
              className={`p-4 text-center font-medium transition-colors flex items-center justify-center gap-2 ${
                pokemon.caught 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white cursor-pointer'
              }`}
              disabled={pokemon.caught}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {pokemon.caught ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                )}
              </svg>
              {pokemon.caught ? 'Already Caught!' : 'Submit Catch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonModal;