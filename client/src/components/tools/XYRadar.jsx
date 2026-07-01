import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from '../PageBackground';
import PokemonImage from '../PokemonImage';
import { useAuth } from '../../contexts/AuthContext';
import {
  XY_ROUTES, GRASS_TYPE_INFO,
  getBestShinyOdds, getDifficultyInfo,
  analyzePosition, isEdgePatch,
} from '../../data/xyRadarData';

const ACCENT = '#a78bfa';
const ACCENT_BG = 'rgba(167,139,250,0.12)';
const ACCENT_BORDER = 'rgba(167,139,250,0.3)';
const CARD_STYLE = {
  background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
};

const ZONE_COLORS = {
  0: ACCENT,
  1: 'rgba(239,68,68,0.55)',
  2: 'rgba(251,191,36,0.50)',
  3: 'rgba(52,211,153,0.50)',
  4: 'rgba(96,165,250,0.50)',
};
const ZONE_EDGE_COLORS = {
  1: 'rgba(239,68,68,0.30)',
  2: 'rgba(251,191,36,0.28)',
  3: 'rgba(52,211,153,0.28)',
  4: 'rgba(96,165,250,0.28)',
};
const ZONE_LABELS = {
  1: 'Zone 1 - Avoid (too close)',
  2: 'Zone 2 - Acceptable',
  3: 'Zone 3 - Recommended',
  4: 'Zone 4 - Good',
};

function fmtPct(v) {
  if (v == null) return '-';
  if (v >= 10) return `${v.toFixed(1)}%`;
  if (v >= 1) return `${v.toFixed(2)}%`;
  return `${v.toFixed(3)}%`;
}
function fmtOdds(p) {
  if (!p || !isFinite(p)) return '-';
  return `1 / ${Math.round(1 / p)}`;
}
function safeLabel(chainBreak) {
  if (chainBreak < 0.005) return { text: 'Very Safe', color: '#4ade80' };
  if (chainBreak < 0.02)  return { text: 'Caution',   color: '#fbbf24' };
  if (chainBreak < 0.08)  return { text: 'Risky',     color: '#f97316' };
  return                         { text: 'Dangerous', color: '#f87171' };
}

// ── Responsive map max-height hook ───────────────────────────────────────────

function useMapMaxHeight() {
  const compute = () => {
    const mobile = window.innerWidth < 1024;
    return Math.floor(window.innerHeight * (mobile ? 0.50 : 0.65));
  };
  const [maxH, setMaxH] = useState(compute);
  useEffect(() => {
    const update = () => setMaxH(compute());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return maxH;
}

// ── Shared hook: compute tile size to fit both width and a max height ─────────

function useTileSize(containerRef, numCols, numRows, maxHeightPx) {
  const [tileSize, setTileSize] = useState(4);
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const PADDING = 12;
    const GAP = 1;
    const compute = () => {
      const w = containerRef.current.clientWidth - PADDING;
      const byWidth = Math.floor((w - GAP * (numCols - 1)) / numCols);
      const byHeight = Math.floor((maxHeightPx - GAP * (numRows - 1)) / numRows);
      setTileSize(Math.max(2, Math.min(byWidth, byHeight)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [numCols, numRows, maxHeightPx]);
  return tileSize;
}

// ── Static tile map (accordion preview) ──────────────────────────────────────

function StaticTileMap({ mapData }) {
  const { width, height, tiles, chain_spot, shiny_spot } = mapData;
  const containerRef = useRef(null);
  const tileSize = useTileSize(containerRef, width, height, 220);

  const edgeCache = useMemo(() => {
    const c = new Array(width * height).fill(false);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (tiles[y * width + x] === 1) c[y * width + x] = isEdgePatch(tiles, width, height, x, y);
    return c;
  }, [tiles, width, height]);

  const chainSet = useMemo(() => new Set((chain_spot || []).map(s => `${s.x},${s.y}`)), [chain_spot]);
  const shinySet = useMemo(() => new Set((shiny_spot || []).map(s => `${s.x},${s.y}`)), [shiny_spot]);

  return (
    <div ref={containerRef} style={{ background: '#0e1014', borderRadius: 10, padding: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, ${tileSize}px)`, gap: '1px' }}>
        {Array.from({ length: height * width }, (_, idx) => {
          const x = idx % width;
          const y = Math.floor(idx / width);
          const val = tiles[idx];
          const bg = val !== 1 ? '#1e2028' : edgeCache[idx] ? '#16a34a' : '#4ade80';
          const key2 = `${x},${y}`;
          const isChain = chainSet.has(key2);
          const isShiny = shinySet.has(key2);
          const isBoth = isChain && isShiny;
          return (
            <div key={idx} style={{ width: tileSize, height: tileSize, backgroundColor: bg, borderRadius: 1, position: 'relative', overflow: 'hidden' }}>
              {isBoth ? (
                <>
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,191,36,0.75)', clipPath: 'polygon(0% 0%, calc(100% - 3px) 0%, 0% calc(100% - 3px))' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(167,139,250,0.75)', clipPath: 'polygon(3px 100%, 100% 3px, 100% 100%)' }} />
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <line x1="0" y1={tileSize} x2={tileSize} y2="0" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
                  </svg>
                </>
              ) : isChain ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(251,191,36,0.75)' }} />
              ) : isShiny ? (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(167,139,250,0.75)' }} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Interactive tile map ──────────────────────────────────────────────────────

function InteractiveTileMap({ mapData, playerPos, onPlacePlayer, onHoverTile, maxHeight = 500 }) {
  const { width, height, tiles, chain_spot, shiny_spot } = mapData;
  const chainSet = useMemo(() => new Set((chain_spot || []).map(s => `${s.x},${s.y}`)), [chain_spot]);
  const shinySet = useMemo(() => new Set((shiny_spot || []).map(s => `${s.x},${s.y}`)), [shiny_spot]);
  const containerRef = useRef(null);
  const baseTileSize = useTileSize(containerRef, width, height, maxHeight);
  const [zoom, setZoom] = useState(1);
  const tileSize = Math.max(2, Math.round(baseTileSize * zoom));
  const [hovered, setHovered] = useState(null);

  // Reset zoom when route changes
  useEffect(() => { setZoom(1); }, [mapData]);

  // Ctrl+Scroll to zoom (non-passive so preventDefault works)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(prev => Math.min(2.5, Math.max(0.75, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);


  const edgeCache = useMemo(() => {
    const c = new Array(width * height).fill(false);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (tiles[y * width + x] === 1) c[y * width + x] = isEdgePatch(tiles, width, height, x, y);
    return c;
  }, [tiles, width, height]);

  // Chain continuation % for each grass tile in zones 1-4 from the player
  const contCache = useMemo(() => {
    if (!playerPos) return {};
    const result = {};
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y * width + x] !== 1) continue;
        const dist = Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y));
        if (dist < 1 || dist > 4) continue;
        const { chainBreakOdds } = analyzePosition(tiles, width, height, x, y);
        result[`${x},${y}`] = Math.round((1 - chainBreakOdds) * 1000) / 10;
      }
    }
    return result;
  }, [playerPos, tiles, width, height]);

  const showLabels = tileSize >= 14;

  function getTileColor(x, y, idx) {
    const val = tiles[idx];
    if (val !== 1) return '#1e2028';
    if (playerPos && playerPos.x === x && playerPos.y === y) return ACCENT;
    if (playerPos) {
      const dist = Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y));
      if (dist >= 1 && dist <= 4)
        return edgeCache[idx] ? ZONE_EDGE_COLORS[dist] : ZONE_COLORS[dist];
      return edgeCache[idx] ? '#1e3a2a' : '#2a4a35';
    }
    return edgeCache[idx] ? '#16a34a' : '#4ade80';
  }

  function handleMouseEnter(x, y) {
    setHovered({ x, y });
    onHoverTile({ x, y });
  }
  function handleMouseLeave() {
    setHovered(null);
    onHoverTile(null);
  }
  function handleClick(x, y) {
    if (tiles[y * width + x] !== 1) return;
    onPlacePlayer(playerPos && playerPos.x === x && playerPos.y === y ? null : { x, y });
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-auto"
      style={{ background: '#0e1014', border: '1px solid rgba(255,255,255,0.07)', padding: 6, cursor: 'crosshair', height: maxHeight, width: '100%' }}
      onMouseLeave={handleMouseLeave}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, ${tileSize}px)`, gap: '1px' }}>
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const idx = y * width + x;
            const isH = hovered?.x === x && hovered?.y === y;
            const isGrass = tiles[idx] === 1;
            const cont = contCache[`${x},${y}`];
            const isPlayer = playerPos?.x === x && playerPos?.y === y;
            const key2 = `${x},${y}`;
            const isChainSpot = chainSet.has(key2);
            const isShinySpot = shinySet.has(key2);
            const isBothSpots = isChainSpot && isShinySpot;
            const showSpot = tileSize >= 12 && (isChainSpot || isShinySpot);
            const iconSize = Math.min(18, Math.max(10, Math.floor(tileSize * 0.55)));
            return (
              <div
                key={idx}
                style={{
                  width: tileSize,
                  height: tileSize,
                  backgroundColor: getTileColor(x, y, idx),
                  borderRadius: 2,
                  boxSizing: 'border-box',
                  outline: isH && isGrass ? '2px solid rgba(255,255,255,0.7)' : undefined,
                  outlineOffset: '-1px',
                  cursor: isGrass ? 'pointer' : 'default',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
                onMouseEnter={() => handleMouseEnter(x, y)}
                onClick={() => handleClick(x, y)}
              >
                {showLabels && !isPlayer && cont !== undefined && (
                  <span style={{
                    fontSize: Math.min(12, Math.floor(tileSize * 0.32)) + 'px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.85)',
                    lineHeight: 1,
                    userSelect: 'none',
                    pointerEvents: 'none',
                    position: 'relative',
                    zIndex: 1,
                  }}>{cont}</span>
                )}
                {showSpot && isBothSpots && (
                  <>
                    <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0% 0%, calc(100% - 3px) 0%, 0% calc(100% - 3px))', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
                      <span style={{ fontSize: iconSize, lineHeight: 1 }}>✨</span>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(3px 100%, 100% 3px, 100% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 2 }}>
                      <span style={{ fontSize: iconSize, lineHeight: 1 }}>⭐</span>
                    </div>
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}>
                      <line x1="0" y1={tileSize} x2={tileSize} y2="0" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" />
                    </svg>
                  </>
                )}
                {showSpot && !isBothSpots && isShinySpot && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: iconSize, lineHeight: 1, pointerEvents: 'none', zIndex: 2 }}>✨</span>
                )}
                {showSpot && !isBothSpots && isChainSpot && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: iconSize, lineHeight: 1, pointerEvents: 'none', zIndex: 2 }}>⭐</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Accordion row (browse mode) ───────────────────────────────────────────────

// ── Pokémon chip (image + name) ─────────────────────────────────────────────

function PokemonChip({ name, pokemon }) {
  return (
    <div className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-gray-800 border border-gray-700">
      <div className="w-7 h-7 shrink-0">
        <PokemonImage pokemon={pokemon} className="w-full h-full" disableCycling />
      </div>
      <span className="text-[11px] text-gray-300">{name}</span>
    </div>
  );
}

// Fetches and caches name → pokemon_master row lookups for route Pokémon lists.
function usePokemonLookup(names) {
  const [lookup, setLookup] = useState({});
  const key = useMemo(() => [...new Set(names)].sort().join(','), [names]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/radar/pokemon-lookup?names=${encodeURIComponent(key)}`)
      .then(res => res.ok ? res.json() : {})
      .then(data => { if (!cancelled) setLookup(prev => ({ ...prev, ...data })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  return lookup;
}

function RouteAccordionRow({ route, isExpanded, mapData, mapLoading, onToggle, onUseMap, pokemonLookup }) {
  const gt = GRASS_TYPE_INFO[route.grassType];
  const di = getDifficultyInfo(route.difficulty);

  return (
    <div className="rounded-xl overflow-hidden transition-all" style={CARD_STYLE}>
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 group transition-all hover:brightness-110"
      >
        <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-sm font-bold select-none"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>
          ›
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-white">{route.name}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border" style={{ color: gt.color, background: gt.bg, borderColor: gt.border }}>{gt.label}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-0.5 text-[11px]">
            <span style={{ color: di.color }}>{route.difficulty}/10 · {di.label}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">Best: <span className="font-semibold" style={{ color: ACCENT }}>1/{getBestShinyOdds(route)}</span></span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{route.pokemon.length} Pokémon</span>
          </div>
        </div>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Left: Pokémon */}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Available Pokémon</p>
                <div className="flex flex-wrap gap-1">
                  {route.pokemon.map(p => (
                    <PokemonChip key={p} name={p} pokemon={pokemonLookup[p]} />
                  ))}
                </div>
              </div>
              {route.notes && (
                <div className="rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p className="text-[11px] text-amber-300 leading-snug">{route.notes}</p>
                </div>
              )}
            </div>

            {/* Right: map preview */}
            <div className="sm:w-48 shrink-0">
              {mapLoading ? (
                <div className="h-32 rounded-xl flex items-center justify-center" style={{ background: '#0e1014' }}>
                  <p className="text-gray-600 text-xs">Loading…</p>
                </div>
              ) : mapData ? (
                <StaticTileMap mapData={mapData} />
              ) : (
                <div className="h-32 rounded-xl flex flex-col items-center justify-center gap-1" style={{ background: '#0e1014' }}>
                  <span className="text-2xl">🗺️</span>
                  <p className="text-[11px] text-gray-500 text-center">Layout not yet mapped</p>
                </div>
              )}
            </div>
          </div>

          {/* Use This Map button */}
          {mapData && (
            <div className="flex justify-end pt-1">
              <button
                onClick={onUseMap}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm border transition-all hover:opacity-90 active:scale-95"
                style={{ background: ACCENT_BG, borderColor: ACCENT_BORDER, color: ACCENT }}>
                Use This Map →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Browse mode ───────────────────────────────────────────────────────────────

const DIFF_FILTERS = [
  { label: 'All', min: 0, max: 11 },
  { label: 'Easy (0–3)', min: 0, max: 3 },
  { label: 'Medium (4–6)', min: 4, max: 6 },
  { label: 'Hard (7–9)', min: 7, max: 9 },
  { label: 'Expert (10+)', min: 10, max: 11 },
];
const GRASS_FILTERS = ['All', 'Grass', 'Red Flowers', 'Yellow Flowers', 'Purple Flowers'];
const GRASS_TYPE_MAP = { 'Grass': 'grass', 'Red Flowers': 'red-flowers', 'Yellow Flowers': 'yellow-flowers', 'Purple Flowers': 'purple-flowers' };

const ALL_ROUTE_POKEMON = [...new Set(XY_ROUTES.flatMap(r => r.pokemon))];

function RouteBrowser({ expandedId, mapCache, loadingIds, onToggle, onUseMap }) {
  const [diffFilter, setDiffFilter] = useState(DIFF_FILTERS[0]);
  const [grassFilter, setGrassFilter] = useState('All');
  const pokemonLookup = usePokemonLookup(ALL_ROUTE_POKEMON);

  const filtered = useMemo(() => XY_ROUTES.filter(r => {
    if (r.difficulty < diffFilter.min || r.difficulty > diffFilter.max) return false;
    if (grassFilter !== 'All' && r.grassType !== GRASS_TYPE_MAP[grassFilter]) return false;
    return true;
  }), [diffFilter, grassFilter]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="space-y-2">
        <div className="flex overflow-x-auto gap-1.5 pb-0.5">
          {DIFF_FILTERS.map(f => (
            <button key={f.label} onClick={() => setDiffFilter(f)}
              className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all"
              style={diffFilter === f
                ? { background: ACCENT_BG, borderColor: ACCENT_BORDER, color: ACCENT }
                : { background: 'transparent', borderColor: '#374151', color: '#9ca3af' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex overflow-x-auto gap-1.5 pb-0.5">
          {GRASS_FILTERS.map(gf => {
            const gt = gf !== 'All' ? GRASS_TYPE_INFO[GRASS_TYPE_MAP[gf]] : null;
            return (
              <button key={gf} onClick={() => setGrassFilter(gf)}
                className="shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all"
                style={grassFilter === gf
                  ? { background: gt?.bg || ACCENT_BG, borderColor: gt?.border || ACCENT_BORDER, color: gt?.color || ACCENT }
                  : { background: 'transparent', borderColor: '#374151', color: '#9ca3af' }}>
                {gf}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-600">{filtered.length} location{filtered.length !== 1 ? 's' : ''}</p>

      <div className="space-y-2">
        {filtered.map(route => (
          <RouteAccordionRow
            key={route.id}
            route={route}
            isExpanded={expandedId === route.id}
            mapData={mapCache[route.id] ?? null}
            mapLoading={loadingIds.has(route.id)}
            onToggle={() => onToggle(route.id)}
            onUseMap={() => onUseMap(route.id)}
            pokemonLookup={pokemonLookup}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">No locations match these filters.</p>
        )}
      </div>
    </div>
  );
}

// ── Hero chip (interactive mode) ──────────────────────────────────────────────

function HeroChip({ route, onClear }) {
  const gt = GRASS_TYPE_INFO[route.grassType];
  const di = getDifficultyInfo(route.difficulty);
  return (
    <div className="rounded-xl px-3 py-2 flex items-center gap-2 mb-3" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} />
      <span className="font-bold text-white text-sm truncate min-w-0">{route.name}</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0" style={{ color: gt.color, background: gt.bg, borderColor: gt.border }}>{gt.label}</span>
      <span className="hidden sm:inline text-[11px] font-semibold shrink-0" style={{ color: di.color }}>{route.difficulty}/10 · {di.label}</span>
      <button onClick={onClear} className="ml-auto shrink-0 text-gray-500 hover:text-white transition-colors text-lg leading-none" title="Back to route list">×</button>
    </div>
  );
}

// ── Interactive sidebar ───────────────────────────────────────────────────────

function InteractiveSidebar({ route, hoverStats, playerSet }) {
  const pokemonLookup = usePokemonLookup(route.pokemon);
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={CARD_STYLE}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Available Pokémon</p>
        <div className="flex flex-wrap gap-1">
          {route.pokemon.map(p => (
            <PokemonChip key={p} name={p} pokemon={pokemonLookup[p]} />
          ))}
        </div>
      </div>

      {route.notes && (
        <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <p className="text-[11px] text-amber-300 leading-snug">{route.notes}</p>
        </div>
      )}

      {/* Hover stats - only shown in interactive mode once player is placed */}
      {playerSet && (
        <div className="rounded-xl p-4 transition-all" style={hoverStats
          ? { background: 'linear-gradient(160deg, #161820 0%, #1b1d25 100%)', border: `1px solid ${ACCENT_BORDER}` }
          : CARD_STYLE}>
          {hoverStats ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>Tile Analysis</span>
                {hoverStats.isEdge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>⚠ Edge Patch</span>
                )}
              </div>
              <div className="text-[11px] text-gray-400 mb-1">{ZONE_LABELS[hoverStats.zone] ?? 'Outside Zone 4'}</div>
              {hoverStats.zone > 0 && hoverStats.zone <= 4 ? (
                <>
                  <p className="text-[10px] text-gray-600 mt-3 mb-1.5 uppercase font-bold tracking-wider">If you enter this patch:</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Zones (A·B·C·D)</span>
                      <span className="text-[11px] font-bold text-white tabular-nums">{hoverStats.A}·{hoverStats.B}·{hoverStats.C}·{hoverStats.D}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Ideal Spawn</span>
                      <span className="text-[11px] font-bold tabular-nums"
                        style={{ color: hoverStats.idealPct > 30 ? '#4ade80' : hoverStats.idealPct > 10 ? '#fbbf24' : '#f87171' }}>
                        {fmtPct(hoverStats.idealPct)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Shiny @ 40</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: ACCENT }}>{fmtOdds(hoverStats.shinyOdds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[11px] text-gray-400">Chain Break</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: safeLabel(hoverStats.chainBreak).color }}>
                        {fmtPct(hoverStats.chainBreakPct)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg px-3 py-2"
                    style={{ background: `${safeLabel(hoverStats.chainBreak).color}14`, border: `1px solid ${safeLabel(hoverStats.chainBreak).color}40` }}>
                    <p className="text-[11px] font-semibold" style={{ color: safeLabel(hoverStats.chainBreak).color }}>
                      {safeLabel(hoverStats.chainBreak).text}{hoverStats.isEdge && ' - edge patch risk'}
                    </p>
                    {hoverStats.zone === 1 && <p className="text-[10px] text-gray-500 mt-0.5">Zone 1 patches are too close - don't enter.</p>}
                    {hoverStats.zone === 2 && <p className="text-[10px] text-gray-500 mt-0.5">Zone 2 patches can work but Zone 3–4 are safer.</p>}
                  </div>
                </>
              ) : hoverStats.zone === 0 ? (
                <p className="text-xs text-gray-500 mt-2">This is your standing position.</p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">Outside zone range - patches can't spawn here.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">Hover any tile on the map to see its chain safety statistics.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mobile compact stats bar ──────────────────────────────────────────────────

const ZONE_SHORT = { 1: 'Zone 1', 2: 'Zone 2', 3: 'Zone 3', 4: 'Zone 4' };

function MobileStatsBar({ hoverStats }) {
  if (!hoverStats || !hoverStats.isGrass || hoverStats.zone === 0) {
    return (
      <div className="rounded-xl px-4 py-3 text-center text-xs text-gray-500" style={CARD_STYLE}>
        {hoverStats?.zone === 0 ? 'Your standing position' : 'Hover a patch to see stats'}
      </div>
    );
  }
  if (hoverStats.zone > 4) {
    return (
      <div className="rounded-xl px-4 py-3 text-center text-xs text-gray-500" style={CARD_STYLE}>
        Outside zone range - patches can't spawn here
      </div>
    );
  }
  const sl = safeLabel(hoverStats.chainBreak);
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'linear-gradient(160deg, #161820 0%, #1b1d25 100%)', border: `1px solid ${ACCENT_BORDER}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-center flex-1">
          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Zone</p>
          <p className="text-xs font-bold text-white">{ZONE_SHORT[hoverStats.zone]}</p>
        </div>
        <div className="w-px h-7 bg-gray-800 shrink-0" />
        <div className="text-center flex-1">
          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Ideal</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: hoverStats.idealPct > 30 ? '#4ade80' : hoverStats.idealPct > 10 ? '#fbbf24' : '#f87171' }}>
            {fmtPct(hoverStats.idealPct)}
          </p>
        </div>
        <div className="w-px h-7 bg-gray-800 shrink-0" />
        <div className="text-center flex-1">
          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Shiny @40</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: ACCENT }}>{fmtOdds(hoverStats.shinyOdds)}</p>
        </div>
        <div className="w-px h-7 bg-gray-800 shrink-0" />
        <div className="text-center flex-1">
          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Safety</p>
          <p className="text-xs font-bold" style={{ color: sl.color }}>{sl.text}</p>
        </div>
        {hoverStats.isEdge && (
          <span className="shrink-0 text-[9px] font-bold px-1.5 py-1 rounded" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>⚠</span>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function XYRadar() {
  const navigate = useNavigate();
  const { isModerator } = useAuth();

  // Browse state
  const [expandedId, setExpandedId] = useState(null);
  const [mapCache, setMapCache] = useState({});   // routeId → mapData | null
  const [loadingIds, setLoadingIds] = useState(new Set());

  // Interactive (locked) state
  const [lockedRouteId, setLockedRouteId] = useState(null);
  const [playerPos, setPlayerPos] = useState(null);
  const [hoverStats, setHoverStats] = useState(null);

  // Fetch a route's map (cached)
  const fetchMap = useCallback(async (routeId) => {
    if (routeId in mapCache || loadingIds.has(routeId)) return;
    setLoadingIds(prev => new Set(prev).add(routeId));
    try {
      const res = await fetch(`/api/radar/routes/${routeId}`);
      const data = res.ok ? await res.json() : null;
      setMapCache(prev => ({ ...prev, [routeId]: data }));
    } catch {
      setMapCache(prev => ({ ...prev, [routeId]: null }));
    } finally {
      setLoadingIds(prev => { const s = new Set(prev); s.delete(routeId); return s; });
    }
  }, [mapCache, loadingIds]);

  function handleToggle(routeId) {
    const next = expandedId === routeId ? null : routeId;
    setExpandedId(next);
    if (next) fetchMap(next);
  }

  function handleUseMap(routeId) {
    setLockedRouteId(routeId);
    setPlayerPos(null);
    setHoverStats(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleExitInteractive() {
    setLockedRouteId(null);
    setPlayerPos(null);
    setHoverStats(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleHoverTile(tile) {
    if (!tile || !lockedRouteId) { setHoverStats(null); return; }
    const mapData = mapCache[lockedRouteId];
    if (!mapData || !playerPos) { setHoverStats(null); return; }
    const { tiles, width, height } = mapData;
    const isGrass = tiles[tile.y * width + tile.x] === 1;
    const zone = Math.max(Math.abs(tile.x - playerPos.x), Math.abs(tile.y - playerPos.y));
    const isEdge = isGrass ? isEdgePatch(tiles, width, height, tile.x, tile.y) : false;
    let A = 0, B = 0, C = 0, D = 0, idealPct = 0, shinyOdds = 0, chainBreakOdds = 0;
    if (isGrass && zone >= 1 && zone <= 4) {
      const a = analyzePosition(tiles, width, height, tile.x, tile.y);
      A = a.A; B = a.B; C = a.C; D = a.D;
      idealPct = a.idealOdds * 100;
      shinyOdds = a.shinyOdds;
      chainBreakOdds = a.chainBreakOdds;
    }
    setHoverStats({ zone, isEdge, isGrass, A, B, C, D, idealPct, shinyOdds, chainBreak: chainBreakOdds, chainBreakPct: chainBreakOdds * 100 });
  }

  const lockedRoute = XY_ROUTES.find(r => r.id === lockedRouteId);
  const lockedMapData = lockedRouteId ? (mapCache[lockedRouteId] ?? null) : null;
  const mapMaxHeight = useMapMaxHeight();

  // Shared banner/status bar above the map
  const MapBanner = playerPos ? (
    <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-xs text-gray-400">Standing at ({playerPos.x}, {playerPos.y}) · Tap patches to compare</span>
      <button onClick={() => setPlayerPos(null)} className="text-[11px] text-gray-500 hover:text-white transition-colors ml-3 shrink-0">Clear</button>
    </div>
  ) : (
    <div className="rounded-lg px-4 py-2.5 text-sm font-semibold text-center" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORDER}`, color: ACCENT }}>
      Click any grass tile to place yourself
    </div>
  );

  const hasChainSpots = (lockedMapData?.chain_spot?.length ?? 0) > 0;
  const hasShinySpots = (lockedMapData?.shiny_spot?.length ?? 0) > 0;

  const ZoneLegend = (
    <div className="space-y-1.5 px-1">
      {playerPos && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ACCENT }} /> You</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ZONE_COLORS[1] }} /> Zone 1 (avoid)</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ZONE_COLORS[2] }} /> Zone 2</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ZONE_COLORS[3] }} /> Zone 3</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: ZONE_COLORS[4] }} /> Zone 4</span>
        </div>
      )}
      {(hasChainSpots || hasShinySpots) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
          {hasChainSpots && <span className="flex items-center gap-1">⭐ Best chaining spot</span>}
          {hasShinySpots && <span className="flex items-center gap-1">✨ Best shiny reset spot</span>}
          {hasChainSpots && hasShinySpots && <span className="text-gray-600">(diagonal split = both)</span>}
        </div>
      )}
      <p className="text-[10px] text-gray-600">
        {playerPos && <>Numbers show chain continuation chance (%) if you enter that patch · </>}
        <span className="text-gray-500">Ctrl+Scroll to zoom</span>
      </p>
    </div>
  );

  const MapArea = lockedMapData ? (
    <InteractiveTileMap
      mapData={lockedMapData}
      playerPos={playerPos}
      onPlacePlayer={setPlayerPos}
      onHoverTile={handleHoverTile}
      maxHeight={mapMaxHeight}
    />
  ) : (
    <div className="rounded-xl p-8 text-center space-y-2" style={CARD_STYLE}>
      <div className="text-4xl">🗺️</div>
      <p className="text-sm text-gray-400">Layout not yet mapped</p>
    </div>
  );

  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* Sticky header */}
      <div className="sticky top-0 z-30 border-b" style={{ background: 'rgba(13,15,20,0.88)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/tools')} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors shrink-0">
            <span className="text-lg">←</span>
            <span className="hidden sm:inline text-sm">Tools</span>
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <span className="text-sm">📡</span>
          <h1 className="text-sm font-bold flex-1">XY Poké Radar</h1>
          {isModerator && (
            <button onClick={() => navigate('/tools/xy-radar/builder')}
              className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg font-semibold border transition-all hover:opacity-80"
              style={{ background: ACCENT_BG, borderColor: ACCENT_BORDER, color: ACCENT }}>
              ✏️ Edit Maps
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {!lockedRoute ? (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Route Browser</h2>
              <p className="text-sm text-gray-400">Select a location to preview it, then click <span className="font-semibold text-gray-300">Use This Map</span> to start analyzing.</p>
            </div>
            <RouteBrowser
              expandedId={expandedId}
              mapCache={mapCache}
              loadingIds={loadingIds}
              onToggle={handleToggle}
              onUseMap={handleUseMap}
            />
          </>
        ) : (
          <>
            <HeroChip route={lockedRoute} onClear={handleExitInteractive} />

            {/* Desktop layout: sidebar + map */}
            <div className="hidden lg:flex gap-5">
              <div className="w-64 shrink-0">
                <InteractiveSidebar route={lockedRoute} hoverStats={hoverStats} playerSet={!!playerPos} />
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                {MapBanner}
                {MapArea}
                {ZoneLegend}
              </div>
            </div>

            {/* Mobile layout: map first, compact stats below */}
            <div className="lg:hidden space-y-3">
              {MapBanner}
              {MapArea}
              {ZoneLegend}
              {playerPos && <MobileStatsBar hoverStats={hoverStats} />}
            </div>
          </>
        )}
      </div>
      <p className="text-center text-[10px] text-gray-700 py-4">
        Odds &amp; mechanics data sourced from{' '}
        <a
          href="https://www.youtube.com/@HP4003"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-500 transition-colors underline underline-offset-2"
        >
          HP4003
        </a>{' '}
        on YouTube
      </p>
    </div>
  );
}
