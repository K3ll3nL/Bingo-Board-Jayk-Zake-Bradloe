import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Pokedex = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caughtCount, setCaughtCount] = useState(0);

  useEffect(() => {
    if (user) {
      loadPokedex();
    }
  }, [user]);

  const loadPokedex = async () => {
    try {
      const response = await fetch('/api/pokedex', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch pokedex');
      
      const data = await response.json();
      setPokemon(data.pokemon);
      setCaughtCount(data.caughtCount);
      setError(null);
    } catch (err) {
      setError('Failed to load Pokédex');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
        <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Pokédex</h1>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-gray-400 mb-4">Please log in to view your Pokédex</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
        <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Pokédex</h1>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center p-8">
          <div className="text-lg text-gray-400">Loading Pokédex...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
        <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Pokédex</h1>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center p-8">
          <div className="text-lg text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      {/* Header */}
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Pokédex</h1>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Caught</div>
              <div className="text-2xl font-bold text-purple-400">
                {caughtCount} / {pokemon.length}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Pokedex Grid */}
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {pokemon.map((poke) => (
              <div
                key={poke.id}
                className={`
                  relative rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none aspect-square
                  ${poke.caught 
                    ? 'border-purple-500 bg-gray-800' 
                    : 'border-gray-700 bg-gray-900'
                  }
                  hover:scale-105 cursor-pointer
                `}
                title={`${poke.name} ${poke.caught ? '✓' : ''}`}
              >
                <img 
                  src={poke.img_url} 
                  alt={poke.name}
                  className={`w-full h-full object-cover block ${poke.caught ? '' : 'grayscale opacity-30'}`}
                  style={{ verticalAlign: 'top' }}
                />
                {poke.caught && (
                  <div className="absolute top-1 right-1">
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pokedex;