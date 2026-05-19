import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { ALLOWED_GAMES } from '../constants/games';
import backgroundImage from '../Icons/2026Jan.png';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';
import alphaIcon from '../Icons/alpha.png';

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

const ALL_POSITIONS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
const SHALPHA_GAMES = new Set(['legends_arceus', 'legends_za']);
const DEFAULT_ROW_POINTS = [1, 2, 3, 4, 5];

function rowValue(pos, rowPoints) {
  return (rowPoints ?? DEFAULT_ROW_POINTS)[Math.floor((pos - 1) / 5)] ?? Math.ceil(pos / 5);
}

function claimPoints(claim, rowPoints, shalphaDbl) {
  const base = rowValue(claim.position, rowPoints);
  return (claim.claim_type === 'shalpha' && shalphaDbl) ? base * 2 : base;
}

function swapTileData(tiles, pos1, pos2) {
  const updated = tiles.map(t => ({ ...t }));
  const i1 = updated.findIndex(t => t.position === pos1);
  const i2 = updated.findIndex(t => t.position === pos2);
  if (i1 === -1 || i2 === -1) return tiles;
  const tmp = { pokemon_id: updated[i1].pokemon_id, pokemon: updated[i1].pokemon };
  updated[i1] = { ...updated[i1], pokemon_id: updated[i2].pokemon_id, pokemon: updated[i2].pokemon };
  updated[i2] = { ...updated[i2], ...tmp };
  return updated;
}

export default function GameBoard() {
  const { user } = useAuth();

  const [board, setBoard]   = useState(null);
  const [tiles, setTiles]   = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selectedGame, setSelectedGame] = useState(ALLOWED_GAMES[0].key);
  const [rowPts, setRowPts] = useState([...DEFAULT_ROW_POINTS]);
  const [shalphaDbl, setShalphaDbl] = useState(false);
  const [modsMap, setModsMap]   = useState({});
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding]     = useState(false);

  const [fadingOut, setFadingOut]   = useState(new Set());
  const [rerolling, setRerolling]   = useState(new Set());
  const [shuffling, setShuffling]   = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  const pendingOps = useRef(new Set());

  useEffect(() => { loadBoard(); }, []);

  const loadBoard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/mod/game-board', {
        headers: { Authorization: await getAuthHeader() },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = await res.json();
      setBoard(data.board);
      setTiles(data.tiles || []);
      setClaims(data.claims || []);
      setModsMap(Object.fromEntries((data.mods || []).map(m => [m.id, m])));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!board?.id) return;
    const channel = supabaseClient
      .channel(`game-board-updates-${board.id}`)
      .on('broadcast', { event: 'tile-update' }, ({ payload }) => {
        if (payload.operationId && pendingOps.current.has(payload.operationId)) {
          pendingOps.current.delete(payload.operationId);
          return;
        }
        applyRemoteUpdate(payload);
      })
      .subscribe();
    return () => { supabaseClient.removeChannel(channel); };
  }, [board?.id]);

  const applyRemoteUpdate = (payload) => {
    switch (payload.type) {
      case 'reroll':
        setTiles(prev => prev.map(t => t.position === payload.tile.position ? { ...t, ...payload.tile } : t));
        break;
      case 'swap':
        setTiles(prev => swapTileData(prev, payload.pos1, payload.pos2));
        break;
      case 'shuffle':
        setTiles(payload.tiles);
        break;
      case 'lock-toggled':
        setTiles(prev => prev.map(t => t.position === payload.position ? { ...t, locked: payload.locked } : t));
        break;
      case 'started':
        setBoard(prev => prev ? { ...prev, status: 'active' } : prev);
        break;
      case 'ended':
        setBoard(null); setTiles([]); setClaims([]);
        break;
      case 'claim':
        setClaims(prev => [...prev.filter(c => c.position !== payload.claim.position), payload.claim]);
        break;
      case 'unclaim':
        setClaims(prev => prev.filter(c => c.position !== payload.position));
        break;
      default: break;
    }
  };

  const handleCreate = async () => {
    if (!selectedGame) return;
    try {
      setCreating(true); setError(null);
      const res = await fetch('/api/mod/game-board', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: selectedGame,
          row_points: rowPts,
          shalpha_double_points: shalphaDbl,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = await res.json();
      setBoard(data.board); setTiles(data.tiles); setClaims([]);
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const handleReroll = async (position) => {
    if (!board || rerolling.has(position)) return;
    const opId = `reroll-${Date.now()}-${Math.random()}`;
    pendingOps.current.add(opId);
    setRerolling(prev => new Set([...prev, position]));
    setFadingOut(prev => new Set([...prev, position]));
    try {
      const res = await fetch('/api/mod/game-board/reroll', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, position, operationId: opId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { tile } = await res.json();
      setTiles(prev => prev.map(t => t.position === position ? { ...t, ...tile } : t));
    } catch (err) {
      console.error('Reroll failed:', err);
      pendingOps.current.delete(opId);
    } finally {
      setRerolling(prev => { const s = new Set(prev); s.delete(position); return s; });
      setFadingOut(prev => { const s = new Set(prev); s.delete(position); return s; });
    }
  };

  const handleToggleLock = async (position, currentLocked) => {
    const opId = `lock-${Date.now()}-${Math.random()}`;
    pendingOps.current.add(opId);
    setTiles(prev => prev.map(t => t.position === position ? { ...t, locked: !currentLocked } : t));
    try {
      const res = await fetch('/api/mod/game-board/lock', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, position, locked: !currentLocked, operationId: opId }),
      });
      if (!res.ok) {
        pendingOps.current.delete(opId);
        setTiles(prev => prev.map(t => t.position === position ? { ...t, locked: currentLocked } : t));
      }
    } catch { pendingOps.current.delete(opId); }
  };

  const handleClearAllLocks = async () => {
    pendingOps.current.add(`clear-locks-${Date.now()}`);
    setTiles(prev => prev.map(t => ({ ...t, locked: false })));
    try {
      for (const tile of tiles.filter(t => t.locked)) {
        await fetch('/api/mod/game-board/lock', {
          method: 'POST',
          headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ boardId: board.id, position: tile.position, locked: false }),
        });
      }
    } catch (err) { console.error('Clear locks failed:', err); }
  };

  const handleShuffle = async () => {
    if (shuffling) return;
    const opId = `shuffle-${Date.now()}`;
    pendingOps.current.add(opId);
    setShuffling(true);

    const unlocked = ALL_POSITIONS.filter(pos => !tiles.find(t => t.position === pos)?.locked);
    const shuffled = [...unlocked].sort(() => Math.random() - 0.5);
    setFadingOut(new Set(unlocked));
    setTimeout(() => {
      setTiles(prev => {
        const map = {};
        unlocked.forEach((pos, i) => { map[pos] = shuffled[i]; });
        return prev.map(t => ({ ...t, position: map[t.position] ?? t.position }));
      });
      setFadingOut(new Set());
    }, 300);

    try {
      const res = await fetch('/api/mod/game-board/shuffle', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, operationId: opId }),
      });
      if (!res.ok) pendingOps.current.delete(opId);
    } catch { pendingOps.current.delete(opId); }
    finally { setShuffling(false); }
  };

  const handleDragStart = (e, pos) => { e.dataTransfer.effectAllowed = 'move'; setDragSource(pos); };
  const handleDragOver  = (e, pos) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragTarget(pos); };
  const handleDrop = async (e, targetPos) => {
    e.preventDefault();
    setDragSource(null); setDragTarget(null);
    const srcPos = dragSource;
    if (!srcPos || srcPos === targetPos) return;
    const srcTile = tiles.find(t => t.position === srcPos);
    const tgtTile = tiles.find(t => t.position === targetPos);
    if (!srcTile || !tgtTile || srcTile.locked || tgtTile.locked) return;
    const opId = `swap-${Date.now()}`;
    pendingOps.current.add(opId);
    setTiles(prev => swapTileData(prev, srcPos, targetPos));
    try {
      await fetch('/api/mod/game-board/swap', {
        method: 'PUT',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, pos1: srcPos, pos2: targetPos, operationId: opId }),
      });
    } catch { pendingOps.current.delete(opId); }
  };
  const handleDragEnd = () => { setDragSource(null); setDragTarget(null); };

  const handleStart = async () => {
    if (!board || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/mod/game-board/start', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setBoard(prev => ({ ...prev, status: 'active' }));
    } catch (err) { setError(err.message); }
    finally { setStarting(false); }
  };

  const handleEnd = async () => {
    if (!board || ending) return;
    if (!window.confirm('End this board? This cannot be undone.')) return;
    setEnding(true);
    try {
      const res = await fetch('/api/mod/game-board', {
        method: 'DELETE',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setBoard(null); setTiles([]); setClaims([]);
    } catch (err) { setError(err.message); }
    finally { setEnding(false); }
  };

  const handleClaim = async (position, claimType = 'standard') => {
    if (!board) return;
    try {
      const res = await fetch('/api/mod/game-board/claim', {
        method: 'POST',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, position, claimType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status !== 409) console.error('Claim failed:', body.error);
        return;
      }
      const { claim } = await res.json();
      setClaims(prev => [...prev.filter(c => c.position !== position), claim]);
    } catch (err) { console.error('Claim error:', err); }
  };

  const handleUnclaim = async (position) => {
    if (!board) return;
    try {
      const res = await fetch('/api/mod/game-board/claim', {
        method: 'DELETE',
        headers: { Authorization: await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, position }),
      });
      if (!res.ok) return;
      setClaims(prev => prev.filter(c => c.position !== position));
    } catch (err) { console.error('Unclaim error:', err); }
  };

  const tileMap         = Object.fromEntries(tiles.map(t => [t.position, t]));
  const claimMap        = Object.fromEntries(claims.map(c => [c.position, c]));
  const isShalpha       = board ? SHALPHA_GAMES.has(board.game) : SHALPHA_GAMES.has(selectedGame);
  const boardRowPts     = board?.row_points ?? DEFAULT_ROW_POINTS;
  const boardShalphaDbl = board?.shalpha_double_points ?? false;
  const gameLabel       = ALLOWED_GAMES.find(g => g.key === board?.game)?.label ?? board?.game;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-gray-400">Loading game board…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Game Board" badge="mod" />

      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm">{error}</div>
        )}

        {/* ── No board: creation form ── */}
        {!board && (
          <div className="rounded-xl p-6" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="text-gray-300 text-lg mb-6 text-center">No active game board. Create one to get started.</div>
            <div className="flex flex-col items-center gap-5">
              <select
                value={selectedGame}
                onChange={e => setSelectedGame(e.target.value)}
                className="w-full max-w-sm px-3 py-2 rounded bg-gray-800 border border-gray-600 text-white text-sm"
              >
                {ALLOWED_GAMES.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>

              {/* Row point values */}
              <div className="w-full max-w-sm">
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Points per Row</div>
                <div className="grid grid-cols-5 gap-2">
                  {rowPts.map((val, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <label className="text-xs text-gray-500">Row {i + 1}</label>
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={val}
                        onChange={e => {
                          const n = Math.max(0, Math.min(99, parseInt(e.target.value) || 0));
                          setRowPts(prev => prev.map((v, j) => j === i ? n : v));
                        }}
                        className="w-full text-center px-1 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-sm font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Shalpha double — only for PLA/PLZA */}
              {SHALPHA_GAMES.has(selectedGame) && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shalphaDbl}
                    onChange={e => setShalphaDbl(e.target.checked)}
                    className="w-4 h-4 accent-yellow-500"
                  />
                  <span className="text-sm text-gray-300 flex items-center gap-1.5">
                    <img src={alphaIcon} alt="α" className="w-4 h-4 object-contain" draggable="false" />
                    Shalpha counts for double points
                  </span>
                </label>
              )}

              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-6 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded font-semibold transition-colors"
              >
                {creating ? 'Creating…' : 'Create Board'}
              </button>
            </div>
          </div>
        )}

        {/* ── Building phase ── */}
        {board?.status === 'building' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-purple-400">{gameLabel}</h2>
                  {boardShalphaDbl && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-900/60 text-yellow-300 border border-yellow-700">
                      <img src={alphaIcon} alt="α" className="w-3 h-3 object-contain" draggable="false" />
                      ×2
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">Building — not yet started</div>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {tiles.some(t => t.locked) && (
                  <button onClick={handleClearAllLocks} className="px-3 py-1 text-sm bg-red-700 hover:bg-red-600 text-white rounded">
                    ⟲ Clear Locks
                  </button>
                )}
                <button
                  onClick={handleShuffle}
                  disabled={shuffling}
                  className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 text-white rounded"
                >
                  {shuffling ? '⤨ Shuffling…' : '⤨ Shuffle'}
                </button>
                <button
                  onClick={handleStart}
                  disabled={starting || tiles.length < 25}
                  className="px-4 py-1 text-sm bg-green-700 hover:bg-green-600 disabled:bg-gray-600 text-white rounded font-semibold"
                >
                  {starting ? 'Starting…' : '▶ Start'}
                </button>
                <button
                  onClick={handleEnd}
                  disabled={ending}
                  className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                >
                  Discard
                </button>
              </div>
            </div>

            <BoardGrid
              tileMap={tileMap}
              fadingOut={fadingOut}
              rerolling={rerolling}
              dragSource={dragSource}
              dragTarget={dragTarget}
              rowPoints={boardRowPts}
              onReroll={handleReroll}
              onToggleLock={handleToggleLock}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </>
        )}

        {/* ── Active phase ── */}
        {board?.status === 'active' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-green-400">{gameLabel}</h2>
                  {boardShalphaDbl && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-900/60 text-yellow-300 border border-yellow-700">
                      <img src={alphaIcon} alt="α" className="w-3 h-3 object-contain" draggable="false" />
                      ×2
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Active — click a square to claim it
                  {isShalpha && <span className="text-yellow-400 ml-2">· Shalpha clause enabled</span>}
                </div>
              </div>
              <button
                onClick={handleEnd}
                disabled={ending}
                className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              >
                {ending ? 'Ending…' : 'End Board'}
              </button>
            </div>

            <ClaimGrid
              tileMap={tileMap}
              claimMap={claimMap}
              modsMap={modsMap}
              isShalpha={isShalpha}
              shalphaDbl={boardShalphaDbl}
              rowPoints={boardRowPts}
              currentUserId={user?.id}
              onClaim={handleClaim}
              onUnclaim={handleUnclaim}
            />

            <ClaimsLegend
              claims={claims}
              modsMap={modsMap}
              rowPoints={boardRowPts}
              shalphaDbl={boardShalphaDbl}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Building-phase grid ────────────────────────────────────────────────────────
function BoardGrid({
  tileMap, fadingOut, rerolling, dragSource, dragTarget, rowPoints,
  onReroll, onToggleLock, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  return (
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
        const tile      = tileMap[pos];
        const isLocked  = tile?.locked ?? false;
        const isFading  = fadingOut.has(pos);
        const isDragging = dragSource === pos;
        const isOver    = dragTarget === pos;
        const pts       = rowValue(pos, rowPoints);

        return (
          <div
            key={pos}
            draggable={!isLocked}
            onDragStart={e => onDragStart(e, pos)}
            onDragOver={e => onDragOver(e, pos)}
            onDrop={e => onDrop(e, pos)}
            onDragEnd={onDragEnd}
            className={[
              'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 overflow-hidden select-none transition-all duration-150',
              'border-gray-500 bg-black/30',
              isDragging ? 'opacity-40 scale-95' : '',
              isOver     ? 'border-purple-400 scale-105' : '',
              isLocked   ? 'cursor-not-allowed opacity-75' : 'cursor-grab active:cursor-grabbing',
            ].join(' ')}
          >
            {tile ? (
              <>
                <div className="w-full h-full transition-opacity duration-300" style={{ opacity: isFading ? 0 : 1 }}>
                  <PokemonImage pokemon={tile.pokemon} className="w-full h-full p-1" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-center py-0.5 px-1" style={{ fontSize: '10px', lineHeight: '1.2' }}>
                  {tile.pokemon?.name || '?'}
                </div>

                {/* Lock button */}
                <button
                  onClick={e => { e.stopPropagation(); onToggleLock(pos, isLocked); }}
                  className={[
                    'absolute top-0.5 right-0.5 rounded px-1 text-xs font-bold transition-opacity',
                    isLocked
                      ? 'bg-yellow-500 text-black opacity-100'
                      : 'bg-black/60 text-gray-300 opacity-0 group-hover:opacity-100',
                  ].join(' ')}
                  title={isLocked ? 'Unlock' : 'Lock'}
                >
                  {isLocked ? '🔒' : '🔓'}
                </button>

                {/* Reroll button */}
                {!isLocked && (
                  <button
                    onClick={e => { e.stopPropagation(); onReroll(pos); }}
                    className="absolute top-0.5 left-0.5 rounded px-1 text-xs bg-purple-700 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Reroll"
                  >
                    ↺
                  </button>
                )}

                {/* Point value */}
                <div
                  className="absolute bottom-5 right-0.5 z-10 text-yellow-300 font-bold leading-none"
                  style={{ fontSize: '9px' }}
                >
                  {pts}pt
                </div>
              </>
            ) : (
              <div className="text-gray-600 text-xs">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Active-phase claim grid ────────────────────────────────────────────────────
function ClaimGrid({ tileMap, claimMap, modsMap, isShalpha, shalphaDbl, rowPoints, currentUserId, onClaim, onUnclaim }) {
  return (
    <div className="flex items-stretch gap-1">
      {/* Row point labels */}
      <div className="flex flex-col" style={{ width: '20px', paddingTop: '8px', paddingBottom: '8px' }}>
        {(rowPoints ?? DEFAULT_ROW_POINTS).map((pts, i) => (
          <div key={i} className="flex-1 flex items-center justify-center text-yellow-400 font-bold" style={{ fontSize: '10px' }}>
            {pts}pt
          </div>
        ))}
      </div>

      <div
        className="flex-1 grid grid-cols-5 gap-1 rounded-xl overflow-hidden"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          padding: '8px',
        }}
      >
        {ALL_POSITIONS.map(pos => {
          const tile           = tileMap[pos];
          const claim          = claimMap[pos];
          const isClaimed      = !!claim;
          const isShalphaClaim = claim?.claim_type === 'shalpha';

          return (
            <ClaimTile
              key={pos}
              pos={pos}
              tile={tile}
              claim={claim}
              isClaimed={isClaimed}
              isShalphaClaim={isShalphaClaim}
              isShalpha={isShalpha}
              shalphaDbl={shalphaDbl}
              rowPoints={rowPoints}
              modsMap={modsMap}
              currentUserId={currentUserId}
              onClaim={onClaim}
              onUnclaim={onUnclaim}
            />
          );
        })}
      </div>
    </div>
  );
}

function ClaimTile({ pos, tile, claim, isClaimed, isShalphaClaim, isShalpha, shalphaDbl, rowPoints, modsMap, currentUserId, onClaim, onUnclaim }) {
  const claimer         = modsMap?.[claim?.claimed_by]          ?? claim?.claimer         ?? null;
  const originalClaimer = modsMap?.[claim?.original_claimed_by] ?? claim?.original_claimer ?? null;
  const [hovered, setHovered] = useState(false);

  const basePts    = rowValue(pos, rowPoints);
  const earnedPts  = isClaimed ? (isShalphaClaim && shalphaDbl ? basePts * 2 : basePts) : null;
  const isDoubled  = isClaimed && isShalphaClaim && shalphaDbl;

  return (
    <div
      className={[
        'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 overflow-hidden select-none transition-all duration-150',
        isClaimed
          ? 'border-gray-600 bg-black/70 cursor-default'
          : 'border-gray-500 bg-black/30 cursor-pointer hover:border-green-400 hover:scale-105',
      ].join(' ')}
      onClick={() => { if (!isClaimed) onClaim(pos, 'standard'); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pokemon image */}
      {tile && (
        <div className="w-full h-full absolute inset-0" style={{ opacity: isClaimed ? 0.25 : 1 }}>
          <PokemonImage pokemon={tile.pokemon} className="w-full h-full p-1" />
        </div>
      )}

      {/* Name label */}
      {tile && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-center py-0.5 px-1 z-10" style={{ fontSize: '10px', lineHeight: '1.2' }}>
          {tile.pokemon?.name || '?'}
        </div>
      )}

      {/* Point value badge */}
      <div
        className={[
          'absolute top-0.5 left-0.5 z-30 font-bold leading-none',
          isClaimed
            ? (isDoubled ? 'text-yellow-300' : 'text-white/60')
            : 'text-yellow-300/80',
        ].join(' ')}
        style={{ fontSize: '9px' }}
      >
        {isClaimed ? `${earnedPts}pt${isDoubled ? '!' : ''}` : `${basePts}pt`}
      </div>

      {/* Claimed overlay */}
      {isClaimed && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="relative flex items-center justify-center w-4/5 h-4/5">
            {(claimer?.avatar_url || claimer?.twitch_avatar_url) ? (
              <img
                src={claimer.avatar_url || claimer.twitch_avatar_url}
                alt={claimer.display_name}
                className="rounded-full w-full h-full object-cover border-2"
                style={{ borderColor: '#6b7280' }}
                draggable="false"
              />
            ) : (
              <div className="rounded-full w-full h-full bg-gray-700 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-500">
                {claimer?.display_name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            {isShalphaClaim && (
              <img
                src={alphaIcon}
                alt="α"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                draggable="false"
              />
            )}
          </div>

          {isShalphaClaim && originalClaimer && (
            <div className="absolute bottom-1 left-1 z-30" title={`Previously: ${originalClaimer.display_name}`}>
              <div className="relative">
                {(originalClaimer.avatar_url || originalClaimer.twitch_avatar_url) ? (
                  <img
                    src={originalClaimer.avatar_url || originalClaimer.twitch_avatar_url}
                    alt={originalClaimer.display_name}
                    className="rounded-full w-6 h-6 object-cover border border-gray-500 grayscale opacity-60"
                    draggable="false"
                  />
                ) : (
                  <div className="rounded-full w-6 h-6 bg-gray-700 flex items-center justify-center text-white text-xs border border-gray-500 grayscale opacity-60">
                    {originalClaimer.display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-0.5 bg-red-500 rotate-45 opacity-80" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hover actions */}
      {hovered && (
        <div className="absolute top-0.5 right-0.5 z-30 flex flex-col gap-0.5">
          {isClaimed && (
            <button
              onClick={e => { e.stopPropagation(); onUnclaim(pos); }}
              className="w-5 h-5 rounded bg-red-700 hover:bg-red-600 text-white flex items-center justify-center text-xs font-bold"
              title="Unclaim"
            >
              ✕
            </button>
          )}
          {isShalpha && isClaimed && !isShalphaClaim && (
            <button
              onClick={e => { e.stopPropagation(); onClaim(pos, 'shalpha'); }}
              className="w-5 h-5 rounded bg-yellow-600 hover:bg-yellow-500 flex items-center justify-center p-0.5"
              title="Shalpha — override this claim"
            >
              <img src={alphaIcon} alt="shalpha" className="w-full h-full object-contain" draggable="false" />
            </button>
          )}
          {isShalpha && !isClaimed && (
            <button
              onClick={e => { e.stopPropagation(); onClaim(pos, 'shalpha'); }}
              className="w-5 h-5 rounded bg-yellow-600 hover:bg-yellow-500 flex items-center justify-center p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Shalpha claim"
            >
              <img src={alphaIcon} alt="shalpha" className="w-full h-full object-contain" draggable="false" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Claims legend ──────────────────────────────────────────────────────────────
function ClaimsLegend({ claims, modsMap, rowPoints, shalphaDbl }) {
  if (claims.length === 0) return null;

  const byUser = {};
  claims.forEach(c => {
    const id = c.claimed_by;
    if (!byUser[id]) byUser[id] = { user: modsMap?.[id] ?? c.claimer, shalpha: 0, points: 0 };
    byUser[id].points += claimPoints(c, rowPoints, shalphaDbl);
    if (c.claim_type === 'shalpha') byUser[id].shalpha++;
  });

  return (
    <div className="mt-4 rounded-lg p-3 flex flex-wrap gap-3" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      {Object.values(byUser).sort((a, b) => b.points - a.points).map(({ user, shalpha, points }) => (
        <div key={user?.id || Math.random()} className="flex items-center gap-2">
          {(user?.avatar_url || user?.twitch_avatar_url) ? (
            <img
              src={user.avatar_url || user.twitch_avatar_url}
              alt={user.display_name}
              className="w-7 h-7 rounded-full border-2 object-cover"
              style={{ borderColor: '#6b7280' }}
              draggable="false"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs border-2 border-gray-500">
              {user?.display_name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span className="text-sm text-gray-200">{user?.display_name || 'Unknown'}</span>
          <span className="text-xs font-bold text-yellow-300 bg-yellow-900/50 border border-yellow-700 rounded-full px-2 py-0.5">
            {points}pt
          </span>
          {shalpha > 0 && (
            <span className="flex items-center gap-1 bg-yellow-900/60 rounded-full px-2 py-0.5">
              <img src={alphaIcon} alt="shalpha" className="w-3 h-3 object-contain" draggable="false" />
              <span className="text-xs font-bold text-yellow-300">×{shalpha}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
