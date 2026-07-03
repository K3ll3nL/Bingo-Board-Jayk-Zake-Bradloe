import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';

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

const GEN_NAMES = { 1: 'Generation I', 2: 'Generation II', 3: 'Generation III', 4: 'Generation IV', 5: 'Generation V', 6: 'Generation VI', 7: 'Generation VII', 8: 'Generation VIII', 9: 'Generation IX' };

const Pokedex = () => {
  const { user } = useAuth();
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caughtCount, setCaughtCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'caught' | 'missed' | 'never_featured'

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
            <Link
              to="/"
              className="inline-block px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Back to Home
            </Link>
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

      {/* Pokédex Grid */}
      <div className="p-4 sm:p-4">
        <div className="max-w-7xl mx-auto">
          {/* Search + filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Pokémon..."
              className="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm w-56"
            />
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
              {[['all', 'All'], ['caught', 'Caught'], ['missed', 'Missed'], ['never_featured', 'Undiscovered']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === val ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Grouped by generation */}
          {(() => {
            const searchLower = search.trim().toLowerCase();
            const filtered = pokemon.filter(p => {
              if (searchLower && !p.name.toLowerCase().includes(searchLower) && !(p.display_name || '').toLowerCase().includes(searchLower)) return false;
              if (filter === 'caught') return p.caught;
              if (filter === 'missed') return p.in_pool && !p.caught;
              if (filter === 'never_featured') return !p.in_pool;
              return true;
            });

            // Group by generation
            const byGen = {};
            filtered.forEach(p => {
              const gen = p.generation || 1;
              if (!byGen[gen]) byGen[gen] = [];
              byGen[gen].push(p);
            });

            const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b);

            if (gens.length === 0) {
              return <div className="text-center text-gray-500 py-16">No Pokémon found.</div>;
            }

            return gens.map(gen => (
              <div key={gen} className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">{GEN_NAMES[gen] || `Generation ${gen}`}</h3>
                  <div className="flex-1 h-px bg-gray-700" />
                  <span className="text-xs text-gray-600">{byGen[gen].filter(p => p.caught).length} / {byGen[gen].length}</span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
                  {byGen[gen].map(poke => {
                    const canSubmit = poke.in_pool && !poke.caught;
                    const isCurrentPool = poke.in_current_pool && !poke.caught;
                    const submitUrl = isCurrentPool
                      ? `/upload?pokemon=${poke.id}`
                      : `/upload?historical=true&pokemon=${poke.id}`;
                    const submitTitle = isCurrentPool
                      ? `Submit catch for ${poke.display_name || poke.name}`
                      : `Submit historical catch for ${poke.display_name || poke.name}`;
                    // Render a real link when the cell navigates to the upload page,
                    // so it supports open-in-new-tab / right-click. Non-submittable
                    // cells stay plain divs.
                    const CellTag = canSubmit ? Link : 'div';
                    const cellProps = canSubmit ? { to: submitUrl } : {};
                    return (
                    <CellTag
                      key={poke.id}
                      {...cellProps}
                      className={`group relative block rounded-lg border-2 transition-all duration-200 overflow-hidden leading-none aspect-square ${canSubmit ? 'hover:scale-105 cursor-pointer hover:border-purple-400' : poke.caught ? 'hover:scale-105 cursor-pointer' : 'cursor-default'} ${poke.caught ? 'border-purple-500 bg-gray-800' : 'border-gray-700 bg-gray-900'}`}
                      title={canSubmit ? submitTitle : `${poke.display_name || poke.name}${poke.caught ? ' ✓' : ''}`}
                    >
                      <div className={`w-full h-full ${poke.caught ? '' : poke.in_pool ? 'grayscale opacity-30' : 'brightness-0 opacity-20'}`}>
                        <PokemonImage pokemon={poke} className="w-full h-full" disableCycling={!poke.in_pool} />
                      </div>
                      {poke.caught && (
                        <div className="absolute top-1 right-1">
                          <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      {/* Upload hint on hover for missed pokemon */}
                      {canSubmit && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ background: 'rgba(145,71,255,0.25)' }}>
                          <svg className="w-5 h-5 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </div>
                      )}
                    </CellTag>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
};

export default Pokedex;