import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

const Pokedex = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caughtCount, setCaughtCount] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) {
      loadPokedex();
    }
  }, [user]);

  const loadPokedex = async () => {
    try {
      const response = await fetch('/api/pokedex', {
        headers: { 'Authorization': await getAuthHeader() }
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
      <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
        <PageHeader title="Pokédex" />
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
      <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
        <PageHeader title="Pokédex" />
        <div className="flex items-center justify-center p-8">
          <div className="text-lg text-gray-400">Loading Pokédex...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
        <PageHeader title="Pokédex" />
        <div className="flex items-center justify-center p-8">
          <div className="text-lg text-red-400">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Header */}
      <PageHeader title="Pokédex" completion={{ caught: caughtCount, total: pokemon.length }} />

      {/* Pokedex Grid */}
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Pokémon..."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
            />
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {pokemon.filter(p => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())).map((poke) => (
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
                  className={`w-full h-full object-cover block ${
                    poke.caught 
                      ? '' 
                      : poke.in_pool 
                        ? 'grayscale opacity-30' 
                        : 'brightness-0 opacity-20'
                  }`}
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