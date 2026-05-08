import React, { useState, useEffect, useMemo } from 'react';
import { buildVariants } from '../utils/pokemonImageUtils';

const AUTO_CYCLE_MS = 3000;

const PokemonImage = ({ pokemon, className = '' }) => {
  const variants = useMemo(() => buildVariants(pokemon), [pokemon?.national_dex_id]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);

  // Reset state when pokemon changes
  useEffect(() => {
    setCurrentIdx(0);
    setPrevIdx(null);
  }, [pokemon?.national_dex_id]);

  // Auto-cycle when multiple variants exist
  useEffect(() => {
    if (variants.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIdx(prev => {
        setPrevIdx(prev);
        return (prev + 1) % variants.length;
      });
    }, AUTO_CYCLE_MS);
    return () => clearInterval(id);
  }, [pokemon?.national_dex_id, variants.length]);

  if (!pokemon?.national_dex_id) {
    return <div className={className} style={{ background: '#1f2937' }} />;
  }

  const current = variants[currentIdx] ?? variants[0];
  const prev = prevIdx !== null ? variants[prevIdx] : null;

  if (!current) return <div className={className} style={{ background: '#1f2937' }} />;

  return (
    <div className={`relative ${className}`}>
      <div
        className="relative w-full h-full overflow-hidden"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {prev && (
          <img
            src={prev.url}
            alt=""
            className="absolute w-full h-full object-contain block"
            style={{ animation: 'pokeSlideOut 0.4s ease-in-out forwards' }}
            onAnimationEnd={() => setPrevIdx(null)}
          />
        )}
        <img
          src={current.url}
          alt={pokemon.display_name || pokemon.name}
          className="w-full h-full object-contain block"
          style={{
            animation: prev ? 'pokeSlideIn 0.4s ease-in-out forwards' : undefined,
            verticalAlign: 'top',
          }}
        />
      </div>
      <style>{`
        @keyframes pokeSlideOut {
          from { transform: translateX(0);     opacity: 1; }
          to   { transform: translateX(-100%); opacity: 0; }
        }
        @keyframes pokeSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default PokemonImage;
