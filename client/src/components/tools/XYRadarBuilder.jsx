import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from '../PageBackground';
import { useAuth } from '../../contexts/AuthContext';
import { getAuthHeaders } from '../../services/api';
import { XY_ROUTES, GRASS_TYPE_INFO, isEdgePatch, analyzePosition } from '../../data/xyRadarData';

const ACCENT = '#a78bfa';
const ACCENT_BG = 'rgba(167,139,250,0.12)';
const ACCENT_BORDER = 'rgba(167,139,250,0.3)';
const CARD_STYLE = {
  background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
};

const DEFAULT_WIDTH = 20;
const DEFAULT_HEIGHT = 15;
const TILE_SIZE = 22;

function buildEmptyTiles(w, h) {
  return new Array(w * h).fill(0);
}

// ── Spot calculation ──────────────────────────────────────────────────────────

function countZone4(tiles, width, height, px, py) {
  let n = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (tiles[y * width + x] === 1 && Math.max(Math.abs(x - px), Math.abs(y - py)) === 4 && !isEdgePatch(tiles, width, height, x, y)) n++;
  return n;
}

function countZones1to4(tiles, width, height, px, py) {
  let n = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== 1) continue;
      const d = Math.max(Math.abs(x - px), Math.abs(y - py));
      if (d >= 1 && d <= 4) n++;
    }
  return n;
}

// Best chain spots: all grass tiles tied for the most Zone-4 (distance-4) grass tiles.
function calcBestChainSpots(tiles, width, height) {
  let bestZ4 = -1;
  const scores = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== 1) continue;
      const z4 = countZone4(tiles, width, height, x, y);
      if (z4 > bestZ4) bestZ4 = z4;
      scores.push({ x, y, z4 });
    }
  return scores.filter(s => s.z4 === bestZ4).map(({ x, y }) => ({ x, y }));
}

// Best shiny spots: all grass tiles tied for the most total grass tiles in zones 1-4.
function calcBestShinySpots(tiles, width, height) {
  let bestTotal = -1;
  const scores = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (tiles[y * width + x] !== 1) continue;
      const total = countZones1to4(tiles, width, height, x, y);
      if (total > bestTotal) bestTotal = total;
      scores.push({ x, y, total });
    }
  return scores.filter(s => s.total === bestTotal).map(({ x, y }) => ({ x, y }));
}

// ── Tile Grid Editor ──────────────────────────────────────────────────────────

function TileGridEditor({ tiles, width, height, onChange, previewMode, chainSpots, shinySpots }) {
  const isPainting = useRef(false);
  const paintValue = useRef(1);

  const edgeCache = React.useMemo(() => {
    if (!previewMode) return null;
    const cache = new Array(width * height).fill(false);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (tiles[y * width + x] === 1)
          cache[y * width + x] = isEdgePatch(tiles, width, height, x, y);
    return cache;
  }, [tiles, width, height, previewMode]);

  const [hovered, setHovered] = useState(null);

  function getTileColor(x, y, idx) {
    const val = tiles[idx];
    if (previewMode) {
      if (val !== 1) return '#1e2028';
      if (hovered && Math.max(Math.abs(x - hovered.x), Math.abs(y - hovered.y)) === 0) return ACCENT;
      if (edgeCache[idx]) return '#16a34a';
      return '#4ade80';
    }
    return val === 1 ? '#4ade80' : '#1e2028';
  }

  function applyPaint(x, y) {
    const idx = y * width + x;
    const newTiles = [...tiles];
    newTiles[idx] = paintValue.current;
    onChange(newTiles);
  }

  function handleMouseDown(x, y, e) {
    e.preventDefault();
    isPainting.current = true;
    const idx = y * width + x;
    paintValue.current = tiles[idx] === 1 ? 0 : 1;
    applyPaint(x, y);
  }

  function handleMouseEnter(x, y) {
    if (!previewMode) setHovered({ x, y });
    if (isPainting.current) applyPaint(x, y);
  }

  function handleMouseUp() {
    isPainting.current = false;
  }

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const chainSet = new Set((chainSpots || []).map(s => `${s.x},${s.y}`));
  const shinySet = new Set((shinySpots || []).map(s => `${s.x},${s.y}`));

  return (
    <div
      className="overflow-auto rounded-xl p-2 select-none"
      style={{ background: '#0e1014', border: '1px solid rgba(255,255,255,0.07)', cursor: previewMode ? 'crosshair' : 'cell' }}
      onMouseLeave={() => setHovered(null)}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, ${TILE_SIZE}px)`, gap: 1 }}>
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => {
            const idx = y * width + x;
            const key = `${x},${y}`;
            const isChain = chainSet.has(key);
            const isShiny = shinySet.has(key);
            const isBoth = isChain && isShiny;
            return (
              <div
                key={idx}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundColor: getTileColor(x, y, idx),
                  borderRadius: 2,
                  position: 'relative',
                  overflow: 'hidden',
                  outline: hovered?.x === x && hovered?.y === y ? `2px solid ${ACCENT}` : undefined,
                  outlineOffset: '-1px',
                }}
                onMouseDown={e => !previewMode && handleMouseDown(x, y, e)}
                onMouseEnter={() => handleMouseEnter(x, y)}
              >
                {isBoth ? (
                  <>
                    <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0% 0%, calc(100% - 3px) 0%, 0% calc(100% - 3px))', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>✨</span>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(3px 100%, 100% 3px, 100% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>⭐</span>
                    </div>
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                      <line x1="0" y1={TILE_SIZE} x2={TILE_SIZE} y2="0" stroke="rgba(0,0,0,0.7)" strokeWidth="1.5" />
                    </svg>
                  </>
                ) : isShiny ? (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, pointerEvents: 'none' }}>✨</span>
                ) : isChain ? (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, pointerEvents: 'none' }}>⭐</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Main Builder ──────────────────────────────────────────────────────────────

export default function XYRadarBuilder() {
  const navigate = useNavigate();
  const { user, isModerator, loading: authLoading } = useAuth();

  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [tiles, setTiles] = useState(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [widthInput, setWidthInput] = useState(String(DEFAULT_WIDTH));
  const [heightInput, setHeightInput] = useState(String(DEFAULT_HEIGHT));
  const [savedTiles, setSavedTiles] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [routeStatuses, setRouteStatuses] = useState({});
  const [chainSpots, setChainSpots] = useState([]);   // [{x,y}, ...]
  const [shinySpots, setShinySpots] = useState([]);   // [{x,y}, ...]
  const [savedChainSpots, setSavedChainSpots] = useState([]);
  const [savedShinySpots, setSavedShinySpots] = useState([]);

  const isDirty = tiles !== null && (
    JSON.stringify(tiles) !== JSON.stringify(savedTiles) ||
    JSON.stringify(chainSpots) !== JSON.stringify(savedChainSpots) ||
    JSON.stringify(shinySpots) !== JSON.stringify(savedShinySpots)
  );

  // Redirect non-mods
  useEffect(() => {
    if (!authLoading && (!user || !isModerator)) {
      navigate('/tools/xy-radar');
    }
  }, [authLoading, user, isModerator, navigate]);

  // Load all route statuses (to show mapped/unmapped dots)
  useEffect(() => {
    async function loadStatuses() {
      const results = {};
      await Promise.allSettled(
        XY_ROUTES.map(async r => {
          const res = await fetch(`/api/radar/routes/${r.id}`);
          results[r.id] = res.ok;
        })
      );
      setRouteStatuses(results);
    }
    loadStatuses();
  }, []);

  async function selectRoute(routeId) {
    if (isDirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    setSelectedRouteId(routeId);
    setPreviewMode(false);
    setLoadingMap(true);
    setTiles(null);
    setSavedTiles(null);
    setSaveMsg(null);
    setChainSpots([]);
    setShinySpots([]);

    try {
      const res = await fetch(`/api/radar/routes/${routeId}`);
      if (res.ok) {
        const data = await res.json();
        setWidth(data.width);
        setHeight(data.height);
        setWidthInput(String(data.width));
        setHeightInput(String(data.height));
        setTiles(data.tiles);
        setSavedTiles(data.tiles);
        const cs = Array.isArray(data.chain_spot) ? data.chain_spot : [];
        const ss = Array.isArray(data.shiny_spot) ? data.shiny_spot : [];
        setChainSpots(cs);
        setShinySpots(ss);
        setSavedChainSpots(cs);
        setSavedShinySpots(ss);
      } else {
        setWidth(DEFAULT_WIDTH);
        setHeight(DEFAULT_HEIGHT);
        setWidthInput(String(DEFAULT_WIDTH));
        setHeightInput(String(DEFAULT_HEIGHT));
        const empty = buildEmptyTiles(DEFAULT_WIDTH, DEFAULT_HEIGHT);
        setTiles(empty);
        setSavedTiles(null);
      }
    } catch {
      const empty = buildEmptyTiles(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      setTiles(empty);
      setSavedTiles(null);
    } finally {
      setLoadingMap(false);
    }
  }

  function handleResize() {
    const newW = Math.max(5, Math.min(60, parseInt(widthInput) || DEFAULT_WIDTH));
    const newH = Math.max(5, Math.min(60, parseInt(heightInput) || DEFAULT_HEIGHT));
    setWidth(newW);
    setHeight(newH);
    setWidthInput(String(newW));
    setHeightInput(String(newH));

    if (tiles) {
      const newTiles = buildEmptyTiles(newW, newH);
      for (let y = 0; y < Math.min(height, newH); y++)
        for (let x = 0; x < Math.min(width, newW); x++)
          newTiles[y * newW + x] = tiles[y * width + x] ?? 0;
      setTiles(newTiles);
    }
  }

  function handleClearAll() {
    if (!tiles) return;
    setTiles(buildEmptyTiles(width, height));
    setChainSpots([]);
    setShinySpots([]);
  }

  function handleFillAll() {
    if (!tiles) return;
    setTiles(new Array(width * height).fill(1));
    setChainSpots([]);
    setShinySpots([]);
  }

  function handleCalculateSpots() {
    if (!tiles) return;
    setChainSpots(calcBestChainSpots(tiles, width, height));
    setShinySpots(calcBestShinySpots(tiles, width, height));
  }

  async function handleSave() {
    if (!selectedRouteId || !tiles) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/radar/routes/${selectedRouteId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ width, height, tiles, chain_spot: chainSpots, shiny_spot: shinySpots }),
      });
      if (res.ok) {
        setSavedTiles([...tiles]);
        setSavedChainSpots([...chainSpots]);
        setSavedShinySpots([...shinySpots]);
        setSaveMsg({ ok: true, text: 'Saved!' });
        setRouteStatuses(prev => ({ ...prev, [selectedRouteId]: true }));
      } else {
        const err = await res.json();
        setSaveMsg({ ok: false, text: err.error || 'Save failed' });
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: 'Network error' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  const selectedRoute = XY_ROUTES.find(r => r.id === selectedRouteId);

  if (authLoading) return null;
  if (!isModerator) return null;

  return (
    <div className="min-h-screen text-white" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* Header */}
      <div className="sticky top-0 z-30 border-b" style={{ background: 'rgba(13,15,20,0.92)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => {
              if (isDirty && !window.confirm('Discard unsaved changes?')) return;
              navigate('/tools/xy-radar');
            }}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors shrink-0"
          >
            <span className="text-lg">←</span>
            <span className="hidden sm:inline text-sm">XY Radar</span>
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <span className="text-sm font-bold flex-1">Route Map Builder</span>

          {selectedRoute && (
            <div className="flex items-center gap-2">
              {isDirty && <span className="text-[10px] text-amber-400 font-semibold">Unsaved changes</span>}
              {saveMsg && (
                <span className="text-[11px] font-semibold" style={{ color: saveMsg.ok ? '#4ade80' : '#f87171' }}>
                  {saveMsg.text}
                </span>
              )}
              <button
                onClick={() => {
                  if (isDirty && window.confirm('Discard unsaved changes?')) {
                    setTiles(savedTiles ? [...savedTiles] : buildEmptyTiles(width, height));
                    setChainSpots([...savedChainSpots]);
                    setShinySpots([...savedShinySpots]);
                  }
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg border transition-all"
                style={{ borderColor: '#374151', color: '#9ca3af' }}
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="text-[11px] px-3 py-1.5 rounded-lg font-bold border transition-all disabled:opacity-40"
                style={{ background: ACCENT_BG, borderColor: ACCENT_BORDER, color: ACCENT }}
              >
                {saving ? 'Saving…' : 'Save Layout'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body: sidebar + editor */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4" style={{ minHeight: 'calc(100vh - 56px)' }}>

        {/* Sidebar: route list */}
        <div className="w-56 shrink-0">
          <div className="rounded-xl overflow-hidden sticky top-20" style={CARD_STYLE}>
            <div className="p-3 border-b border-gray-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Routes</p>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
              {XY_ROUTES.map(route => {
                const gtInfo = GRASS_TYPE_INFO[route.grassType];
                const isMapped = routeStatuses[route.id];
                const isSelected = selectedRouteId === route.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => selectRoute(route.id)}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-2 border-b transition-all hover:bg-white/5"
                    style={{
                      borderColor: 'rgba(255,255,255,0.04)',
                      background: isSelected ? ACCENT_BG : 'transparent',
                    }}
                  >
                    <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isMapped ? '#4ade80' : '#374151' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white leading-tight truncate">{route.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: gtInfo.color }}>{gtInfo.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex-1 min-w-0 space-y-4">
          {!selectedRoute ? (
            <div className="rounded-xl p-10 text-center" style={CARD_STYLE}>
              <p className="text-gray-400 text-sm">Select a route from the sidebar to begin mapping its tile layout.</p>
              <p className="text-gray-600 text-xs mt-2">Use the edge patch guide for each route as a reference.</p>
            </div>
          ) : (
            <>
              {/* Route header */}
              <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={CARD_STYLE}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold">{selectedRoute.name}</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border font-semibold"
                      style={{ color: GRASS_TYPE_INFO[selectedRoute.grassType].color, background: GRASS_TYPE_INFO[selectedRoute.grassType].bg, borderColor: GRASS_TYPE_INFO[selectedRoute.grassType].border }}>
                      {GRASS_TYPE_INFO[selectedRoute.grassType].label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Difficulty {selectedRoute.difficulty}/10</p>
                </div>
                <a
                  href={selectedRoute.edgePatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] px-2.5 py-1.5 rounded-lg border transition-all hover:opacity-80"
                  style={{ background: ACCENT_BG, borderColor: ACCENT_BORDER, color: ACCENT }}
                >
                  View Edge Patch Guide →
                </a>
              </div>

              {/* Grid controls */}
              <div className="rounded-xl p-4 flex flex-wrap items-end gap-4" style={CARD_STYLE}>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Width</label>
                    <input type="number" min="5" max="60" value={widthInput}
                      onChange={e => setWidthInput(e.target.value)}
                      className="w-16 text-sm font-semibold text-white text-center rounded-lg px-2 py-1.5 border"
                      style={{ background: '#12141a', borderColor: 'rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <span className="text-gray-600 mb-2">×</span>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Height</label>
                    <input type="number" min="5" max="60" value={heightInput}
                      onChange={e => setHeightInput(e.target.value)}
                      className="w-16 text-sm font-semibold text-white text-center rounded-lg px-2 py-1.5 border"
                      style={{ background: '#12141a', borderColor: 'rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <button onClick={handleResize}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-all hover:opacity-80 mb-0"
                    style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)', color: '#d1d5db' }}>
                    Resize
                  </button>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleClearAll}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-all hover:opacity-80"
                    style={{ borderColor: '#374151', color: '#9ca3af' }}>
                    Clear All
                  </button>
                  <button onClick={handleFillAll}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-all hover:opacity-80"
                    style={{ background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.25)', color: '#86efac' }}>
                    Fill All Grass
                  </button>
                  <button onClick={handleCalculateSpots}
                    disabled={!tiles}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-all hover:opacity-80 disabled:opacity-40"
                    style={{ background: 'rgba(167,139,250,0.08)', borderColor: 'rgba(167,139,250,0.3)', color: '#a78bfa' }}>
                    ⭐✨ Calculate Spots
                  </button>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Preview</span>
                  <button
                    onClick={() => setPreviewMode(p => !p)}
                    className="relative w-10 h-5 rounded-full transition-all"
                    style={{ background: previewMode ? ACCENT : '#374151' }}
                  >
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ left: previewMode ? '1.25rem' : '0.125rem' }} />
                  </button>
                </div>
              </div>

              {/* Editor legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 px-1">
                {previewMode ? (
                  <>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#4ade80' }} /> Safe tile</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} /> Edge patch risk</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1e2028' }} /> No grass</span>
                    <span className="ml-2 text-amber-400">Preview mode — click to switch to edit mode</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#4ade80' }} /> Grass</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1e2028' }} /> No grass</span>
                    <span className="ml-2 text-gray-500">Click or drag to paint tiles</span>
                  </>
                )}
                {chainSpots.length > 0 && <span>⭐ Best chain ({chainSpots.length} tile{chainSpots.length !== 1 ? 's' : ''})</span>}
                {shinySpots.length > 0 && <span>✨ Best shiny ({shinySpots.length} tile{shinySpots.length !== 1 ? 's' : ''})</span>}
              </div>

              {/* Grid */}
              {loadingMap ? (
                <div className="rounded-xl p-10 text-center text-gray-500" style={CARD_STYLE}>Loading saved layout…</div>
              ) : tiles ? (
                <TileGridEditor
                  tiles={tiles}
                  width={width}
                  height={height}
                  onChange={setTiles}
                  previewMode={previewMode}
                  chainSpots={chainSpots}
                  shinySpots={shinySpots}
                />
              ) : null}

              {/* Reference note */}
              <div className="rounded-xl px-4 py-3 text-xs text-gray-500" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.1)' }}>
                Tip: open the <a href={selectedRoute.edgePatchUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">edge patch guide</a> in another window and replicate the grass layout tile-by-tile. Each green tile = walkable grass in-game. Toggle preview mode to verify safe (bright green) vs edge (dark green) tiles.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
