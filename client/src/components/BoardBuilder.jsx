import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import backgroundImage from '../Icons/2026Jan.png';
import logoImage from '../Icons/pokemon-bounty-board.png';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';
import { ALLOWED_GAMES } from '../constants/games';

// key -> { label, shortLabel, img }
const GAME_META = ALLOWED_GAMES.reduce((acc, g) => {
  acc[g.key] = {
    label: g.label,
    shortLabel: g.label.replace(/^Pokémon\s+/, ''),
    img: g.img_urls?.[0] ?? null,
  };
  return acc;
}, {});

// ─── Game Utilization visualizer ──────────────────────────────────────────────
// Compares each game's share of the board vs its share of the full dex.
// A small-dex game filling lots of slots is "over-utilized"; a big-dex game
// with few slots is "under-utilized".
function GameUtilization({ gameStats, restrictedGameStats, boardMonTotal, dexTotal }) {
  const [mode, setMode] = useState('standard'); // 'standard' | 'restricted'

  if (!gameStats || !boardMonTotal || !dexTotal) return null;

  const activeStats = mode === 'restricted' ? (restrictedGameStats || {}) : gameStats;

  const rows = Object.entries(activeStats)
    .map(([key, { boardCount, dexCount }]) => {
      const boardShare = boardCount / boardMonTotal;
      const dexShare   = dexCount / dexTotal;
      const ratio      = dexShare > 0 ? boardShare / dexShare : Infinity;
      return { key, boardCount, dexCount, boardShare, dexShare, ratio };
    })
    .filter(r => r.boardCount > 0)
    .sort((a, b) => b.ratio - a.ratio);

  const OVER = '#f87171';
  const UNDER = '#60a5fa';
  const GRAY = '#9ca3af';

  const pct = (n) => `${Math.round(n * 100)}%`;
  // Signed deviation from balanced (ratio 1), clamped to ±1 → half-bar fraction
  const half = (ratio) => Math.min(Math.abs((ratio === Infinity ? 3 : ratio) - 1), 1) * 50;
  const color = (ratio) => (ratio >= 1.25 ? OVER : ratio <= 0.8 ? UNDER : GRAY);

  return (
    <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-200">Game Utilization</h3>
        <div className="flex rounded-md overflow-hidden border border-gray-600 divide-x divide-gray-600 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode('standard')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${mode === 'standard' ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-300 hover:text-white'}`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setMode('restricted')}
            className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${mode === 'restricted' ? 'bg-[#78150a] text-white' : 'bg-gray-800 text-gray-300 hover:text-white'}`}
          >
            Restricted
          </button>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-2 leading-snug">
        Board share ÷ dex share. Bars grow right if a game is
        <span style={{ color: OVER }}> over-</span> and left if
        <span style={{ color: UNDER }}> under-</span>represented.
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-gray-500 py-3 text-center">
          No {mode === 'restricted' ? 'restricted-eligible ' : ''}Pokémon on the board.
        </p>
      ) : (
      <div className="space-y-1">
        {rows.map(r => {
          const over = r.ratio >= 1;
          const w = half(r.ratio);
          const c = color(r.ratio);
          const meta = GAME_META[r.key] ?? { shortLabel: r.key, img: null };
          return (
            <div
              key={r.key}
              className="flex items-center gap-2"
              title={`Board ${pct(r.boardShare)} of slots · Dex ${pct(r.dexShare)} of Pokédex`}
            >
              <div className="flex items-center gap-1 w-28 flex-shrink-0 min-w-0">
                {meta.img && <img src={meta.img} alt="" className="w-3.5 h-3.5 object-contain flex-shrink-0" />}
                <span className="text-[11px] text-gray-300 truncate" title={meta.label}>{meta.shortLabel}</span>
              </div>
              {/* Diverging bar: center = balanced */}
              <div className="relative flex-1 h-3 rounded bg-gray-800/60">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
                <div
                  className="absolute top-0.5 bottom-0.5 rounded-sm"
                  style={over
                    ? { left: '50%', width: `${w}%`, background: c }
                    : { left: `${50 - w}%`, width: `${w}%`, background: c }}
                />
              </div>
              <span className="text-[11px] font-semibold w-9 text-right tabular-nums flex-shrink-0" style={{ color: c }}>
                {r.ratio === Infinity ? '∞' : `${r.ratio.toFixed(1)}×`}
              </span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

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

// Build complete pokemon object from tile by looking up in current tiles
function enrichTileWithPokemon(tile, currentTiles) {
  if (!tile) return tile;
  if (tile.pokemon?.national_dex_id) return tile;

  // Try to find pokemon data from other tiles on the board
  const pokemonFromBoard = currentTiles.find(t => t.pokemon_id === tile.pokemon_id)?.pokemon;
  if (pokemonFromBoard) {
    return { ...tile, pokemon: pokemonFromBoard };
  }

  // Fallback: create minimal pokemon object with tile fields
  return {
    ...tile,
    pokemon: {
      national_dex_id: tile.national_dex_id,
      name: tile.name,
      display_name: tile.display_name,
      form_id: tile.form_id ?? 0,
      forms_count: tile.forms_count ?? 1,
      genderless: tile.genderless ?? false,
      has_gender_difference: tile.has_gender_difference ?? false,
      has_major_gender_difference: tile.has_major_gender_difference ?? false,
      custom_gender_code: tile.custom_gender_code ?? null,
    },
  };
}

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
    pokemon:         updated[i1].pokemon,
  };
  updated[i1] = { ...updated[i1], pokemon_id: updated[i2].pokemon_id, name: updated[i2].name, national_dex_id: updated[i2].national_dex_id, is_second_round: updated[i2].is_second_round, pokemon: updated[i2].pokemon };
  updated[i2] = { ...updated[i2], ...tmp };
  return updated;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BoardBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tiles, setTiles]           = useState([]);
  const [categoryStats, setCategoryStats] = useState(null);
  const [gameStats, setGameStats]   = useState(null);
  const [restrictedGameStats, setRestrictedGameStats] = useState(null);
  const [boardMeta, setBoardMeta]   = useState({ boardMonTotal: 0, dexTotal: 0 });
  const [nextMonth, setNextMonth]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [fadingOut, setFadingOut]       = useState(new Set());
  const [rerolling, setRerolling]       = useState(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [shuffling, setShuffling]         = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  // Lock state: array of 26 booleans (index 0 unused, 13 is always false for free space)
  const [lockedPositions, setLockedPositions] = useState(Array(26).fill(false));

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
      const enrichedTiles = data.tiles.map(tile => enrichTileWithPokemon(tile, data.tiles));
      setTiles(enrichedTiles);
      setCategoryStats(data.categoryStats);
      setGameStats(data.gameStats || null);
      setRestrictedGameStats(data.restrictedGameStats || null);
      setBoardMeta({ boardMonTotal: data.boardMonTotal || 0, dexTotal: data.dexTotal || 0 });
      setLockedPositions(data.lockedPositions || Array(26).fill(false));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Silently re-fetch just the utilization stats (board composition changed).
  // Doesn't touch tiles/locks, so it won't disrupt in-flight animations.
  const refreshGameStats = async () => {
    try {
      const res = await fetch('/api/mod/board-builder', {
        headers: { Authorization: await getAuthHeader() },
      });
      if (!res.ok) return;
      const data = await res.json();
      setGameStats(data.gameStats || null);
      setRestrictedGameStats(data.restrictedGameStats || null);
      setBoardMeta({ boardMonTotal: data.boardMonTotal || 0, dexTotal: data.dexTotal || 0 });
    } catch { /* non-critical */ }
  };

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!nextMonth) return;
    const channel = supabaseClient
      .channel(`board-builder-updates-${nextMonth.id}`)
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
        setTiles(prev => prev.map(t => t.position === tile.position ? enrichTileWithPokemon(tile, prev) : t));
        setFadingOut(prev => { const n = new Set(prev); n.delete(tile.position); return n; });
      }, 300);
      refreshGameStats();
    } else if (payload.type === 'refresh-all') {
      const allPositions = new Set(payload.tiles.map(t => t.position));
      setFadingOut(prev => new Set([...prev, ...allPositions]));
      setTimeout(() => {
        setTiles(prev => {
          const newTileMap = {};
          payload.tiles.forEach(nt => { newTileMap[nt.position] = enrichTileWithPokemon(nt, prev); });
          return prev.map(t => newTileMap[t.position] || t);
        });
        if (payload.categoryStats) setCategoryStats(payload.categoryStats);
        setFadingOut(new Set());
      }, 300);
      refreshGameStats();
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
    } else if (payload.type === 'lock-toggled') {
      setLockedPositions(payload.lockedPositions);
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
        setTiles(prev => prev.map(t => t.position === position ? enrichTileWithPokemon(tile, prev) : t));
        setFadingOut(prev => { const n = new Set(prev); n.delete(position); return n; });
      }, 300);
      refreshGameStats();
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

  // ── Lock Toggle ──────────────────────────────────────────────────────────
  const handleToggleLock = async (e, position) => {
    e.stopPropagation();
    if (position === FREE_POSITION || !nextMonth) return;

    const isCurrentlyLocked = lockedPositions[position];
    const newLockedState = !isCurrentlyLocked;

    // Optimistic update
    const newLockedPositions = [...lockedPositions];
    newLockedPositions[position] = newLockedState;
    setLockedPositions(newLockedPositions);

    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/mod/board-builder/${nextMonth.id}/toggle-lock`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ position, locked: newLockedState }),
      });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(`HTTP ${res.status}: ${errBody.error}`);
      }
      const data = await res.json();
    } catch (err) {
      console.error('Toggle lock failed:', err);
      // Revert on error
      setLockedPositions(lockedPositions);
    }
  };

  // ── Clear All Locks ───────────────────────────────────────────────────────
  const handleClearAllLocks = async () => {
    if (!nextMonth) return;

    const opId = Math.random().toString(36).slice(2);
    pendingOps.current.add(opId);

    // Optimistic update
    setLockedPositions(Array(26).fill(false));

    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/mod/board-builder/${nextMonth.id}/clear-all-locks`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: opId }),
      });
      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(`HTTP ${res.status}: ${errBody.error}`);
      }
    } catch (err) {
      console.error('Clear all locks failed:', err);
      // Revert on error by reloading
      loadBoard();
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDragStart = (e, position) => {
    if (lockedPositions[position]) {
      e.preventDefault();
      return;
    }
    setDragSource(position);
    e.dataTransfer.effectAllowed = 'move';
    // Suppress the browser's default ghost image
    const ghost = new Image();
    ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(ghost, 0, 0);
  };

  const handleDragOver = (e, position) => {
    if (lockedPositions[position] || position === FREE_POSITION) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragTarget(position);
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

    const opId = Math.random().toString(36).slice(2);
    pendingOps.current.add(opId);

    setRefreshingAll(true);

    // Fade out only unlocked tiles
    const allPositions = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25];
    const unlockedPositions = new Set(allPositions.filter(pos => !lockedPositions[pos]));
    setFadingOut(new Set(unlockedPositions));

    try {
      const res = await fetch('/api/mod/board-builder/refresh-all', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthId: nextMonth.id, operationId: opId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { tiles: newTiles } = await res.json();
      setTimeout(() => {
        setTiles(prev => {
          const newTileMap = {};
          newTiles.forEach(nt => { newTileMap[nt.position] = enrichTileWithPokemon(nt, prev); });
          return prev.map(t => {
            if (unlockedPositions.has(t.position) && newTileMap[t.position]) {
              return newTileMap[t.position];
            }
            return t;
          });
        });
        setFadingOut(new Set());
      }, 300);
      refreshGameStats();
    } catch (err) {
      console.error('Refresh all failed:', err);
      pendingOps.current.delete(opId);
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

    // Optimistic update: shuffle only unlocked positions, respecting locks
    const allPositions = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25];
    const unlockedPositions = allPositions.filter(pos => !lockedPositions[pos]);
    const lockedPosSet = new Set(allPositions.filter(pos => lockedPositions[pos]));

    const shuffledUnlockedPositions = (() => {
      const out = [...unlockedPositions];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    })();

    const positionMap = {};
    let unlockedIdx = 0;
    tiles.forEach((t, i) => {
      if (i < allPositions.length) {
        const pos = allPositions[i];
        if (lockedPosSet.has(pos)) {
          positionMap[pos] = pos;
        } else {
          positionMap[pos] = shuffledUnlockedPositions[unlockedIdx++];
        }
      }
    });

    const positionsToFade = new Set(unlockedPositions);
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

      {/* Right-docked utilization panel (large screens) — doesn't shift the board */}
      <aside className="hidden xl:block xl:absolute xl:top-24 xl:right-6 xl:w-80 2xl:w-96">
        <GameUtilization gameStats={gameStats} restrictedGameStats={restrictedGameStats} boardMonTotal={boardMeta.boardMonTotal} dexTotal={boardMeta.dexTotal} />
      </aside>

      {/* Grid */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        {/* Month title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-purple-400">{nextMonth?.month_year_display}</h2>
          <div className="flex gap-2">
            {lockedPositions.some(locked => locked) && (
              <button
                onClick={handleClearAllLocks}
                className="px-3 py-1 text-sm bg-red-700 hover:bg-red-600 disabled:bg-gray-600 text-white rounded transition-colors"
                title="Remove all locks"
              >
                ⟲ Clear Locks
              </button>
            )}
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

            const isLocked = lockedPositions[pos];

            return (
              <div
                key={pos}
                draggable={!isLocked}
                onDragStart={e => handleDragStart(e, pos)}
                onDragOver={e => handleDragOver(e, pos)}
                onDrop={e => handleDrop(e, pos)}
                onDragEnd={handleDragEnd}
                className={[
                  'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 overflow-hidden select-none transition-all duration-150',
                  tile?.is_second_round ? 'border-orange-400 bg-orange-900/50 shadow-[0_0_8px_2px_rgba(251,146,60,0.5)]' : 'border-gray-500 bg-black/30',
                  isDragging ? 'opacity-40 scale-95' : '',
                  isOver    ? 'border-purple-400 scale-105' : '',
                  isLocked ? 'cursor-not-allowed opacity-75' : 'cursor-grab active:cursor-grabbing',
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

                    {/* Lock icon */}
                    <button
                      onClick={e => handleToggleLock(e, pos)}
                      className={`absolute top-0.5 right-6 rounded p-0.5 transition-all z-10 ${
                        isLocked
                          ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/50'
                          : 'bg-black/70 hover:bg-blue-700 text-white opacity-0 group-hover:opacity-100'
                      }`}
                      title={isLocked ? 'Unlock Pokémon' : 'Lock Pokémon (won\'t change during Refresh All or Shuffle)'}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        {isLocked ? (
                          <>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V6a5 5 0 0110 0v5" />
                            <circle cx="12" cy="16" r="1" fill="currentColor" />
                          </>
                        ) : (
                          <>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V6a5 5 0 018 0" />
                            <circle cx="12" cy="16" r="1" fill="currentColor" />
                          </>
                        )}
                      </svg>
                    </button>

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
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Category Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
              {Object.entries(categoryStats).map(([category, stats]) => (
                <div key={category} className="flex justify-between items-center">
                  <span className="text-gray-300 capitalize">{category}</span>
                  <span className="text-purple-300 font-semibold">{stats.avg}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Utilization panel inline for smaller screens */}
        <div className="mt-6 xl:hidden">
          <GameUtilization gameStats={gameStats} restrictedGameStats={restrictedGameStats} boardMonTotal={boardMeta.boardMonTotal} dexTotal={boardMeta.dexTotal} />
        </div>
      </div>
    </div>
  );
}
