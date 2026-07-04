import React, { useState, useEffect, useRef, useMemo } from 'react';
import { buildVariants } from '../utils/pokemonImageUtils';

const AUTO_CYCLE_MS = 3000;

const PokemonImage = ({ pokemon, className = '', disableCycling = false }) => {
  const variants = useMemo(() => buildVariants(pokemon), [pokemon?.national_dex_id]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);

  // Reset state when pokemon changes
  useEffect(() => {
    setCurrentIdx(0);
    setPrevIdx(null);
    setLoaded(false);
  }, [pokemon?.national_dex_id]);

  // If image already cached, img.complete is true before onLoad fires
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [pokemon?.national_dex_id]);

  // Auto-cycle when multiple variants exist
  useEffect(() => {
    if (variants.length <= 1 || disableCycling) return;
    const id = setInterval(() => {
      setCurrentIdx(prev => {
        setPrevIdx(prev);
        return (prev + 1) % variants.length;
      });
    }, AUTO_CYCLE_MS);
    return () => clearInterval(id);
  }, [pokemon?.national_dex_id, variants.length, disableCycling]);

  if (!pokemon?.national_dex_id) {
    return <div className={className} style={{ background: '#1f2937' }} />;
  }

  const current = variants[currentIdx] ?? variants[0];
  const prev = prevIdx !== null ? variants[prevIdx] : null;

  if (!current) return <div className={className} style={{ background: '#1f2937' }} />;

  return (
    <div className={`relative ${className}`}>
      {/* Shimmer — only shown while not yet loaded */}
      {!loaded && (
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            background: 'linear-gradient(90deg, #2a2c30 25%, #35373b 50%, #2a2c30 75%)',
            backgroundSize: '200% 100%',
            animation: 'pokeShimmer 1.4s infinite',
          }}
        />
      )}

      <div
        className="relative w-full h-full overflow-hidden"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {prev && (
          <img
            src={prev.url}
            alt=""
            draggable={false}
            className="absolute w-full h-full object-contain block"
            style={{ animation: 'pokeSlideOut 0.4s ease-in-out forwards' }}
            onAnimationEnd={() => setPrevIdx(null)}
          />
        )}
        <img
          ref={imgRef}
          src={current.url}
          alt={pokemon.display_name || pokemon.name}
          draggable={false}
          className="w-full h-full object-contain block"
          style={{
            animation: prev ? 'pokeSlideIn 0.4s ease-in-out forwards' : undefined,
            verticalAlign: 'top',
            opacity: loaded ? 1 : 0,
            transition: loaded ? 'opacity 0.15s ease' : 'none',
          }}
          onLoad={() => setLoaded(true)}
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
        @keyframes pokeShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

export default PokemonImage;
