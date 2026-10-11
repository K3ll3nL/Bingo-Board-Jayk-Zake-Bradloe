import React, { useState, useEffect, useRef, useMemo } from 'react';
import { buildVariants } from '../utils/pokemonImageUtils';

const AUTO_CYCLE_MS = 4500;
const REDUCED_CYCLE_MS = 6000;
const FADE_MS = 500;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(REDUCED_MOTION_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

// One timer per period, shared by every tile, aligned to the wall clock. All
// multi-form tiles change in the same frame, and a tile mounted later (e.g.
// scrolling the Pokédex) joins the next beat instead of starting its own.
const beats = new Map(); // period -> { listeners: Set, timeoutId }

const subscribeToBeat = (period, fn) => {
  let beat = beats.get(period);
  if (!beat) {
    beat = { listeners: new Set(), timeoutId: null };
    beats.set(period, beat);
    const schedule = () => {
      let delay = period - (Date.now() % period);
      if (delay < 50) delay += period; // a late fire must not double-tick
      beat.timeoutId = setTimeout(() => {
        beat.listeners.forEach(l => l());
        schedule();
      }, delay);
    };
    schedule();
  }
  beat.listeners.add(fn);
  return () => {
    beat.listeners.delete(fn);
    if (beat.listeners.size === 0) {
      clearTimeout(beat.timeoutId);
      beats.delete(period);
    }
  };
};

const PokemonImage = ({ pokemon, className = '', disableCycling = false }) => {
  const variants = useMemo(() => buildVariants(pokemon), [pokemon?.national_dex_id]);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();

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

  // Warm every form so the incoming sprite is decoded before it fades in —
  // otherwise the first pass of a crossfade dips to an empty frame.
  useEffect(() => {
    if (variants.length <= 1 || disableCycling) return;
    variants.slice(1).forEach(v => { const img = new Image(); img.src = v.url; });
  }, [pokemon?.national_dex_id, variants.length, disableCycling]);

  // Auto-cycle when multiple variants exist, on the shared beat so the whole
  // page changes at once and is still in between. Reduced motion: hard swap
  // (no fade), less often.
  useEffect(() => {
    if (variants.length <= 1 || disableCycling) return;
    const period = reducedMotion ? REDUCED_CYCLE_MS : AUTO_CYCLE_MS;
    return subscribeToBeat(period, () => {
      setCurrentIdx(prev => {
        if (!reducedMotion) setPrevIdx(prev);
        return (prev + 1) % variants.length;
      });
    });
  }, [pokemon?.national_dex_id, variants.length, disableCycling, reducedMotion]);

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
            style={{ animation: `pokeFadeOut ${FADE_MS}ms ease-in-out forwards` }}
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
            animation: prev ? `pokeFadeIn ${FADE_MS}ms ease-in-out forwards` : undefined,
            verticalAlign: 'top',
            opacity: loaded ? 1 : 0,
            transition: loaded ? 'opacity 0.15s ease' : 'none',
          }}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <style>{`
        @keyframes pokeFadeOut {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes pokeFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
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
