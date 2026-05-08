import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import backgroundImage from '../Icons/2026Jan.png';
import logoImage from '../Icons/pokemon-bounty-board.png';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';

const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

// ─── Board layout ─────────────────────────────────────────────────────────────
const ALL_POSITIONS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
const FREE_POSITION = 13;

// Swap pokemon data between two positions in a tiles array (positions stay fixed)
function swapTileData(tiles, pos1, pos2) {
  const updated = tiles.map(t => ({ ...t }));
  const i1 = updated.findIndex(t => t.position === pos1);
  const i2 = updated.findIndex(t => t.position === pos2);
  if (i1 === -1 || i2 === -1) return tiles;
  const tmp = {
    pokemon_id:      updated[i1].pokemon_id,
    name:            updated[i1].name,
    national_dex_id: updated[i1].national_dex_id,
    is_second_round: updated[i1].is_second_round,
  };
  updated[i1] = { ...updated[i1], ...{ pokemon_id: updated[i2].pokemon_id, name: updated[i2].name, national_dex_id: updated[i2].national_dex_id, is_second_round: updated[i2].is_second_round } };
  updated[i2] = { ...updated[i2], ...tmp };
  return updated;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BoardBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tiles, setTiles]           = useState([]);
  const [categoryStats, setCategoryStats] = useState(null);
  const [nextMonth, setNextMonth]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Positions mid-reroll fade-out
  const [fadingOut, setFadingOut]       = useState(new Set());
  // Positions with an in-flight reroll request
  const [rerolling, setRerolling]       = useState(new Set());

  // Bulk operations
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [shuffling, setShuffling]         = useState(false);

  // Drag state
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  // Operation IDs we originated — ignore our own broadcast echo
  const pendingOps = useRef(new Set());

  // ── Load ──────────────────────────────────────────────────────────────────
  // Run once on mount only. Auth header works independently of user state
  // (dev_token in dev, session token in prod), so we don't need to re-fetch
  // when the user object resolves.
  useEffect(() => { loadBoard(); }, []);

  const loadBoard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/mod/board-builder', {
        headers: { Authorization: await getAuthHeader() },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(body, null, 2) || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setNextMonth(data.nextMonth);
      setTiles(data.tiles);
      setCategoryStats(data.categoryStats);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!nextMonth) return;
    const channel = supabaseClient
      .channel('board-builder-updates')
      .on('broadcast', { event: 'tile-update' }, ({ payload }) => {
        if (payload.operationId && pendingOps.current.has(payload.operationId)) {
          pendingOps.current.delete(payload.operationId);
          return;
        }
        applyRemoteUpdate(payload);
      })
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [nextMonth?.id]);

  const applyRemoteUpdate = (payload) => {
    if (payload.type === 'swap') {
      setTiles(prev => swapTileData(prev, payload.pos1, payload.pos2));
    } else if (payload.type === 'reroll') {
      const { tile } = payload;
      setFadingOut(prev => new Set([...prev, tile.position]));
      setTimeout(() => {
        setTiles(prev => prev.map(t => t.position === tile.position ? tile : t));
        setFadingOut(prev => { const n = new Set(prev); n.delete(tile.position); return n; });
      }, 300);
    } else if (payload.type === 'refresh-all') {
      const allPositions = new Set(payload.tiles.map(t => t.position));
      setFadingOut(prev => new Set([...prev, ...allPositions]));
      setTimeout(() => {
        setTiles(payload.tiles);
        if (payload.categoryStats) setCategoryStats(payload.categoryStats);
        setFadingOut(new Set());
      }, 300);
    } else if (payload.type === 'shuffle') {
      const positionsToFade = new Set(payload.updates.map(u => u.newPosition));
      setFadingOut(prev => new Set([...prev, ...positionsToFade]));
      setTimeout(() => {
        setTiles(prev => {
          const updateMap = {};
          payload.updates.forEach(u => {
            updateMap[u.pokemon_id] = u.newPosition;
          });
          return prev.map(t => ({
            ...t,
            position: updateMap[t.pokemon_id] ?? t.position,
          }));
        });
        setFadingOut(prev => { const n = new Set(prev); positionsToFade.forEach(p => n.delete(p)); return n; });
      }, 300);
    }
  };

  // ── Reroll ────────────────────────────────────────────────────────────────
  const handleReroll = async (e, position) => {
    e.stopPropagation();
    if (rerolling.has(position) || !nextMonth) return;

    const opId = Math.random().toString(36).slice(2);
    pendingOps.current.add(opId);

    setRerolling(prev => new Set([...prev, position]));
    setFadingOut(prev => new Set([...prev, position]));

    try {
      const res = await fetch('/api/mod/board-builder/reroll', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ position, monthId: nextMonth.id, operationId: opId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const { tile } = await res.json();

      setTimeout(() => {
        setTiles(prev => prev.map(t => t.position === position ? tile : t));
        setFadingOut(prev => { const n = new Set(prev); n.delete(position); return n; });
      }, 300);
    } catch (err) {
      console.error('Reroll failed:', err);
      pendingOps.current.delete(opId);
      setFadingOut(prev => { const n = new Set(prev); n.delete(position); return n; });
    } finally {
      setTimeout(() => {
        setRerolling(prev => { const n = new Set(prev); n.delete(position); return n; });
      }, 400);
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDragStart = (e, position) => {
    setDragSource(position);
    e.dataTransfer.effectAllowed = 'move';
    // Suppress the browser's default ghost image
    const ghost = new Image();
    ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(ghost, 0, 0);
  };

  const handleDragOver = (e, position) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (position !== FREE_POSITION) setDragTarget(position);
  };

  const handleDrop = async (e, dropPosition) => {
    e.preventDefault();
    const srcPos = dragSource;
    setDragSource(null);
    setDragTarget(null);

    if (!srcPos || srcPos === dropPosition || dropPosition === FREE_POSITION || !nextMonth) return;

    const opId = Math.random().toString(36).slice(2);
    pendingOps.current.add(opId);

    // Optimistic update
    setTiles(prev => swapTileData(prev, srcPos, dropPosition));

    try {
      const res = await fetch('/api/mod/board-builder/swap', {
        method: 'PUT',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos1: srcPos, pos2: dropPosition, monthId: nextMonth.id, operationId: opId }),
      });
      if (!res.ok) throw new Error(`Swap HTTP ${res.status}`);
    } catch (err) {
      console.error('Swap failed, reverting:', err);
      pendingOps.current.delete(opId);
      setTiles(prev => swapTileData(prev, srcPos, dropPosition)); // revert
    }
  };

  const handleDragEnd = () => { setDragSource(null); setDragTarget(null); };

  // ── Refresh All ───────────────────────────────────────────────────────────
  const handleRefreshAll = async () => {
    if (refreshingAll || !nextMonth) return;

    setRefreshingAll(true);

    // Immediate visual feedback: fade out all tiles
    const allPositions = new Set([1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25]);
    setFadingOut(new Set(allPositions));

    try {
      const res = await fetch('/api/mod/board-builder/refresh-all', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthId: nextMonth.id, operationId: Math.random().toString(36).slice(2) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { tiles: newTiles } = await res.json();
      setTimeout(() => {
        setTiles(newTiles);
        setFadingOut(new Set());
      }, 300);
    } catch (err) {
      console.error('Refresh all failed:', err);
      setFadingOut(new Set());
    } finally {
      setRefreshingAll(false);
    }
  };

  // ── Shuffle ───────────────────────────────────────────────────────────────
  const handleShuffle = async () => {
    if (shuffling || !nextMonth) return;

    const opId = Math.random().toString(36).slice(2);
    pendingOps.current.add(opId);

    setShuffling(true);

    // Optimistic update: shuffle positions in client state immediately
    const allPositions = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25];
    const shuffledPositions = (() => {
      const out = [...allPositions];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    })();

    const positionMap = {};
    tiles.forEach((t, i) => {
      if (i < allPositions.length) {
        positionMap[allPositions[i]] = shuffledPositions[i];
      }
    });

    const positionsToFade = new Set(Object.values(positionMap));
    setFadingOut(prev => new Set([...prev, ...positionsToFade]));

    setTimeout(() => {
      setTiles(prev => prev.map(t => ({
        ...t,
        position: positionMap[t.position] ?? t.position,
      })));
      setFadingOut(new Set());
    }, 300);

    try {
      const res = await fetch('/api/mod/board-builder/shuffle', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthId: nextMonth.id, operationId: opId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Shuffle failed:', err);
      pendingOps.current.delete(opId);
      // Revert to previous state on error would go here if needed
    } finally {
      setShuffling(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-lg text-gray-400">Loading board builder…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-center max-w-2xl w-full px-4">
          <div className="text-red-400 text-lg mb-2 font-semibold">Board Builder Error</div>
          <pre className="text-left text-red-300 text-xs mb-6 font-mono bg-gray-900 rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap">{error}</pre>
          <button onClick={loadBoard} className="text-purple-400 hover:text-purple-300 text-sm mr-6">
            Retry
          </button>
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-300 text-sm">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  const tileMap = {};
  tiles.forEach(t => { tileMap[t.position] = t; });
  const hasSecondRound = tiles.some(t => t.is_second_round);

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Header */}
      <PageHeader title="Board Builder" badge="mod" />

      {/* Grid */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        {/* Month title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-purple-400">{nextMonth?.month_year_display}</h2>
          <div className="flex gap-2">
            <button
              onClick={handleRefreshAll}
              disabled={refreshingAll}
              className="px-3 py-1 text-sm bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded transition-colors"
              title="Reroll all 24 slots"
            >
              {refreshingAll ? '⟳ Refreshing...' : '⟳ Refresh All'}
            </button>
            <button
              onClick={handleShuffle}
              disabled={shuffling}
              className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded transition-colors"
              title="Shuffle all positions"
            >
              {shuffling ? '⤨ Shuffling...' : '⤨ Shuffle'}
            </button>
          </div>
        </div>
        <div
          className="grid grid-cols-5 gap-1 rounded-xl overflow-hidden"
          style={{
            backgroundImage: `url(${backgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            padding: '8px',
          }}
        >
          {ALL_POSITIONS.map(pos => {
            const tile = tileMap[pos];
            const isFree    = pos === FREE_POSITION;
            const isDragging = dragSource === pos;
            const isOver     = dragTarget === pos;
            const isFading   = fadingOut.has(pos);

            if (isFree) {
              return (
                <div
                  key={pos}
                  className="aspect-square flex flex-col items-center justify-center rounded-lg bg-yellow-500/20 border-2 border-yellow-400"
                >
                  <div className="text-yellow-300 font-bold text-lg">FREE</div>
                  <div className="text-yellow-300 text-xs">SPACE</div>
                </div>
              );
            }

            return (
              <div
                key={pos}
                draggable
                onDragStart={e => handleDragStart(e, pos)}
                onDragOver={e => handleDragOver(e, pos)}
                onDrop={e => handleDrop(e, pos)}
                onDragEnd={handleDragEnd}
                className={[
                  'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 cursor-grab active:cursor-grabbing overflow-hidden select-none transition-all duration-150',
                  tile?.is_second_round ? 'border-orange-400 bg-orange-900/50 shadow-[0_0_8px_2px_rgba(251,146,60,0.5)]' : 'border-gray-500 bg-black/30',
                  isDragging ? 'opacity-40 scale-95' : '',
                  isOver    ? 'border-purple-400 scale-105' : '',
                ].join(' ')}
              >
                {tile ? (
                  <>
                    {/* Pokemon image */}
                    <div
                      className="w-full h-full transition-opacity duration-300"
                      style={{ opacity: isFading ? 0 : 1 }}
                    >
                      <PokemonImage
                        pokemon={tile.pokemon}
                        className="w-full h-full p-1"
                      />
                    </div>

                    {/* Name label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-center py-0.5 px-1"
                         style={{ fontSize: '10px', lineHeight: '1.2' }}>
                      {tile.pokemon?.name || tile.name}
                    </div>

                    {/* 2nd-round badge */}
                    {tile.is_second_round && (
                      <div className="absolute top-0.5 left-0.5 bg-orange-500 text-white font-bold rounded px-1 shadow-md"
                           style={{ fontSize: '9px', lineHeight: '14px' }}>
                        2×
                      </div>
                    )}

                    {/* Reroll button — appears on hover */}
                    <button
                      onClick={e => handleReroll(e, pos)}
                      disabled={rerolling.has(pos)}
                      className="absolute top-0.5 right-0.5 bg-black/70 hover:bg-purple-700 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Reroll"
                      style={{ display: rerolling.has(pos) ? 'flex' : undefined }}
                    >
                      <svg className={`w-3 h-3 text-white ${rerolling.has(pos) ? 'animate-spin' : ''}`}
                           fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="text-gray-600 text-xs">Empty</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-gray-500 bg-black/30" />
            <span>First appearance</span>
          </div>
          {hasSecondRound && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded border-2 border-orange-400 bg-orange-900/50 shadow-[0_0_6px_1px_rgba(251,146,60,0.5)]" />
              <span className="text-orange-400 font-semibold">Second appearance</span>
            </div>
          )}
        </div>

        {/* Category Stats */}
        {categoryStats && (
          <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Category Balance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
              {Object.entries(categoryStats).map(([category, stats]) => (
                <div key={category} className="bg-black/30 px-2 py-1.5 rounded border border-gray-600">
                  <div className="text-gray-400 font-semibold capitalize mb-0.5">{category}</div>
                  <div className="text-purple-300">
                    {stats.count}/{stats.count === stats.floor && stats.count === stats.ceiling
                      ? `${stats.floor}`
                      : `${stats.floor}-${stats.ceiling}`}
                  </div>
                  <div className="text-gray-500 text-xs">avg {stats.avg}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
