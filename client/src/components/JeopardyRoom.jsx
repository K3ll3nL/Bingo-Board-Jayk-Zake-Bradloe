import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, supabase } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import { ALLOWED_GAMES } from '../constants/games';
import backgroundImage from '../Icons/2026Jan.png';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';
import alphaIcon from '../Icons/alpha.png';

const SHALPHA_GAMES = new Set(['legends_arceus', 'legends_za']);
const DEFAULT_ROW_POINTS = [1, 2, 3, 4, 5];
const MIN_PLAYERS_TO_START = 2;

// Shared token classes — kept in one place so the warn/gold "claim" pill
// pattern (header ×2 badge, points badge, Shalpha count) can't drift the way
// it did when each spot had its own copy of the raw yellow-* classes.
const WARN_PILL = 'bg-warn-strong/20 text-warn border border-warn-strong/40';

function makePositions(columns) {
  return Array.from({ length: (columns ?? 5) * 5 }, (_, i) => i + 1);
}

function rowValue(pos, rowPoints, columns) {
  return (rowPoints ?? DEFAULT_ROW_POINTS)[Math.floor((pos - 1) / (columns ?? 5))] ?? Math.ceil(pos / (columns ?? 5));
}

function claimPoints(claim, rowPoints, shalphaDbl, columns) {
  const base = rowValue(claim.position, rowPoints, columns);
  return (claim.claim_type === 'shalpha' && shalphaDbl) ? base * 2 : base;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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

export default function JeopardyRoom() {
  const { user, isPro } = useAuth();
  const { code } = useParams();

  const [board, setBoard]     = useState(null);
  const [tiles, setTiles]     = useState([]);
  const [claims, setClaims]   = useState([]);
  const [members, setMembers] = useState([]);
  const [viewerRole, setViewerRole]   = useState(null); // 'host' | 'player' | 'spectator' | null
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blocked, setBlocked] = useState(null); // non-null = kicked from this lobby, holds the message
  const [error, setError]     = useState(null);

  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding]     = useState(false);
  const [apiKey, setApiKey]     = useState(undefined); // undefined = loading, null = no key, string = key value

  const [fadingOut, setFadingOut]   = useState(new Set());
  const [rerolling, setRerolling]   = useState(new Set());
  const [rerollingAll, setRerollingAll] = useState(false);
  const [shuffling, setShuffling]   = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  // Tap-to-select-then-tap-target swap — the touch-usable path alongside HTML5
  // drag, since native draggable/onDragStart never fires from touch input at
  // all (P0, docs/JEOPARDY_ROOM_DESIGN.md). Works identically for mouse too,
  // so there's one interaction model to reason about instead of two.
  const [selectedSwapPos, setSelectedSwapPos] = useState(null);

  // Claim-conflict feedback (P0) — a losing 409 flashes the tile and toasts
  // who got there first, instead of looking identical to a tap that missed.
  const [conflictFlash, setConflictFlash] = useState(new Set());
  const [toasts, setToasts] = useState([]);

  const pendingOps = useRef(new Set());
  const [nowTick, setNowTick] = useState(() => Date.now());
  const finishCalledRef = useRef(false);

  const isMember  = viewerRole === 'host' || viewerRole === 'player';
  const canManage = isModerator; // lobby lifecycle (start/discard/end) — creation is mod-only for now, so host === mod
  const canClaim  = isMember || isModerator;
  const isHost    = viewerRole === 'host';
  // Tile edits (reroll/lock/swap/shuffle) are scoped to the lobby roster —
  // host always, everyone else only once the host grants it. Derived from
  // `members` (not a separate server flag) so it stays in sync with the
  // realtime 'permissions-updated' broadcast for free.
  const viewerMember = members.find(m => m.user_id === user?.id);
  const canEditTiles = viewerMember?.role === 'host' || !!viewerMember?.can_edit;
  // A moderator who isn't the host of this specific lobby (host walked away
  // and nobody transferred hosting) still needs a way to close it out.
  const canForceEnd = isModerator && !isHost;

  const remainingMs = board?.status === 'active' && board?.ends_at ? new Date(board.ends_at).getTime() - nowTick : null;

  useEffect(() => { loadBoard(); }, [code]);

  // Countdown tick for timed lobbies. When it hits zero, opportunistically
  // ask the server to finalize — server re-validates ends_at itself, so this
  // is safe to fire from every open client without double-finalizing.
  useEffect(() => {
    if (board?.status !== 'active' || !board?.ends_at) { finishCalledRef.current = false; return; }
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [board?.status, board?.ends_at]);

  useEffect(() => {
    if (remainingMs != null && remainingMs <= 0 && !finishCalledRef.current) {
      finishCalledRef.current = true;
      (async () => {
        try {
          await fetch(`/api/jeopardy/${code}/finish-timed`, { method: 'POST', headers: await getAuthHeaders() });
        } catch { /* another client will catch it, or the next page load will */ }
      })();
    }
  }, [remainingMs, code]);

  useEffect(() => {
    if (!canManage || !isPro) { setApiKey(null); return; }
    (async () => {
      try {
        const res = await fetch('/api/keys', { headers: await getAuthHeaders() });
        const data = res.ok ? await res.json() : null;
        setApiKey(data?.key_value ?? null);
      } catch { setApiKey(null); }
    })();
  }, [canManage, isPro]);

  const loadBoard = async () => {
    try {
      setLoading(true);
      setError(null);
      setNotFound(false);
      setBlocked(null);
      const res = await fetch(`/api/jeopardy/${code}`, { headers: await getAuthHeaders() });
      if (res.status === 404) { setNotFound(true); return; }
      if (res.status === 403) { setBlocked((await res.json().catch(() => ({}))).error || 'You no longer have access to this lobby.'); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const data = await res.json();
      setBoard(data.board);
      setTiles(data.tiles || []);
      setClaims(data.claims || []);
      setMembers(data.members || []);
      setViewerRole(data.viewerRole ?? null);
      setIsModerator(!!data.isModerator);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!board?.id) return;
    const channel = supabase
      .channel(`jeopardy-updates-${board.id}`)
      .on('broadcast', { event: 'tile-update' }, ({ payload }) => {
        if (payload.operationId && pendingOps.current.has(payload.operationId)) {
          pendingOps.current.delete(payload.operationId);
          return;
        }
        applyRemoteUpdate(payload);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [board?.id]);

  const applyRemoteUpdate = (payload) => {
    switch (payload.type) {
      case 'reroll':
        setTiles(prev => prev.map(t => t.position === payload.tile.position ? { ...t, ...payload.tile } : t));
        break;
      case 'reroll-all': {
        const byPosition = Object.fromEntries(payload.tiles.map(t => [t.position, t]));
        setTiles(prev => prev.map(t => byPosition[t.position] ? { ...t, ...byPosition[t.position] } : t));
        break;
      }
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
        setBoard(prev => prev ? { ...prev, status: 'active', ends_at: payload.endsAt ?? null } : prev);
        break;
      case 'ended':
        setBoard(prev => prev ? { ...prev, status: 'completed' } : prev);
        break;
      case 'claim':
        setClaims(prev => [...prev.filter(c => c.position !== payload.claim.position), payload.claim]);
        break;
      case 'unclaim':
        setClaims(prev => prev.filter(c => c.position !== payload.position));
        break;
      case 'member-joined':
      case 'permissions-updated':
        setMembers(payload.members || []);
        break;
      case 'host-transferred': {
        setMembers(payload.members || []);
        const mine = (payload.members || []).find(m => m.user_id === user?.id);
        if (mine) setViewerRole(mine.role);
        break;
      }
      case 'member-kicked':
        setMembers(payload.members || []);
        if (payload.kickedUserId === user?.id) {
          setViewerRole(null);
          pushToast('You were removed from this lobby by the host.', 'warn');
        }
        break;
      default: break;
    }
  };

  // ── Toast helper — local, ephemeral, for in-the-moment feedback (claim
  // conflicts, action failures). Not the account-wide NotificationToast/DB
  // notification system; those are for durable events, this is for "that
  // just happened and here's why nothing visibly changed."
  const pushToast = (message, tone = 'error') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  };

  const handleTogglePermission = async (targetUserId, nextCanEdit) => {
    const prevMembers = members;
    setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, can_edit: nextCanEdit } : m));
    try {
      const res = await fetch(`/api/jeopardy/${code}/permissions`, {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ userId: targetUserId, canEdit: nextCanEdit }),
      });
      if (!res.ok) {
        setMembers(prevMembers);
        pushToast((await res.json().catch(() => ({}))).error || 'Could not update edit access.');
      }
    } catch {
      setMembers(prevMembers);
      pushToast('Network error — try again.');
    }
  };

  const handleKick = async (targetUserId, targetName) => {
    if (!window.confirm(`Remove ${targetName || 'this player'} from the lobby?`)) return;
    const prevMembers = members;
    setMembers(prev => prev.filter(m => m.user_id !== targetUserId));
    try {
      const res = await fetch(`/api/jeopardy/${code}/members/${targetUserId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      if (!res.ok) {
        setMembers(prevMembers);
        pushToast((await res.json().catch(() => ({}))).error || 'Could not remove that player.');
      }
    } catch {
      setMembers(prevMembers);
      pushToast('Network error — try again.');
    }
  };

  const handleTransferHost = async (targetUserId, targetName) => {
    if (!window.confirm(`Make ${targetName || 'this player'} the new host? You'll become a regular player.`)) return;
    try {
      const res = await fetch(`/api/jeopardy/${code}/transfer-host`, {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (!res.ok) {
        pushToast((await res.json().catch(() => ({}))).error || 'Could not transfer hosting.');
        return;
      }
      const { members: newMembers } = await res.json();
      setMembers(newMembers || []);
      setViewerRole('player');
    } catch {
      pushToast('Network error — try again.');
    }
  };

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/jeopardy/${code}/join`, { method: 'POST', headers: await getAuthHeaders() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      await loadBoard();
    } catch (err) { setError(err.message); }
    finally { setJoining(false); }
  };

  const handleReroll = async (position) => {
    if (!board || rerolling.has(position)) return;
    const opId = `reroll-${Date.now()}-${Math.random()}`;
    pendingOps.current.add(opId);
    setRerolling(prev => new Set([...prev, position]));
    setFadingOut(prev => new Set([...prev, position]));
    try {
      const res = await fetch('/api/mod/jeopardy/reroll', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, position, operationId: opId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { tile } = await res.json();
      setTiles(prev => prev.map(t => t.position === position ? { ...t, ...tile } : t));
    } catch (err) {
      console.error('Reroll failed:', err);
      pendingOps.current.delete(opId);
      pushToast(err.message || 'Reroll failed — try again.');
    } finally {
      setRerolling(prev => { const s = new Set(prev); s.delete(position); return s; });
      setFadingOut(prev => { const s = new Set(prev); s.delete(position); return s; });
    }
  };

  const handleRerollAll = async () => {
    if (!board || rerollingAll) return;
    const opId = `reroll-all-${Date.now()}`;
    pendingOps.current.add(opId);
    setRerollingAll(true);
    const unlockedPositions = tiles.filter(t => !t.locked).map(t => t.position);
    setFadingOut(new Set(unlockedPositions));
    try {
      const res = await fetch('/api/mod/jeopardy/reroll-all', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, operationId: opId }),
      });
      if (!res.ok) {
        pendingOps.current.delete(opId);
        pushToast((await res.json().catch(() => ({}))).error || 'Reroll all failed — try again.');
        return;
      }
      const { tiles: newTiles } = await res.json();
      const byPosition = Object.fromEntries(newTiles.map(t => [t.position, t]));
      setTiles(prev => prev.map(t => byPosition[t.position] ? { ...t, ...byPosition[t.position] } : t));
    } catch (err) {
      console.error('Reroll all failed:', err);
      pendingOps.current.delete(opId);
      pushToast('Reroll all failed — try again.');
    } finally {
      setRerollingAll(false);
      setFadingOut(new Set());
    }
  };

  const handleToggleLock = async (position, currentLocked) => {
    const opId = `lock-${Date.now()}-${Math.random()}`;
    pendingOps.current.add(opId);
    setTiles(prev => prev.map(t => t.position === position ? { ...t, locked: !currentLocked } : t));
    try {
      const res = await fetch('/api/mod/jeopardy/lock', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, position, locked: !currentLocked, operationId: opId }),
      });
      if (!res.ok) {
        pendingOps.current.delete(opId);
        setTiles(prev => prev.map(t => t.position === position ? { ...t, locked: currentLocked } : t));
        pushToast('Lock toggle failed — try again.');
      }
    } catch {
      pendingOps.current.delete(opId);
      setTiles(prev => prev.map(t => t.position === position ? { ...t, locked: currentLocked } : t));
      pushToast('Lock toggle failed — try again.');
    }
  };

  const handleClearAllLocks = async () => {
    pendingOps.current.add(`clear-locks-${Date.now()}`);
    setTiles(prev => prev.map(t => ({ ...t, locked: false })));
    try {
      for (const tile of tiles.filter(t => t.locked)) {
        await fetch('/api/mod/jeopardy/lock', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ boardId: board.id, position: tile.position, locked: false }),
        });
      }
    } catch (err) {
      console.error('Clear locks failed:', err);
      pushToast('Clear locks failed — some tiles may still be locked.');
    }
  };

  const handleShuffle = async () => {
    if (shuffling) return;
    const opId = `shuffle-${Date.now()}`;
    pendingOps.current.add(opId);
    setShuffling(true);

    const unlocked = tiles.filter(t => !t.locked).map(t => t.position);
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
      const res = await fetch('/api/mod/jeopardy/shuffle', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, operationId: opId }),
      });
      if (!res.ok) { pendingOps.current.delete(opId); pushToast('Shuffle failed — try again.'); }
    } catch { pendingOps.current.delete(opId); pushToast('Shuffle failed — try again.'); }
    finally { setShuffling(false); }
  };

  // Shared by both drag-drop and tap-to-select swap so the two input paths
  // can't drift out of sync with each other.
  const performSwap = async (srcPos, targetPos) => {
    if (!srcPos || srcPos === targetPos) return;
    const srcTile = tiles.find(t => t.position === srcPos);
    const tgtTile = tiles.find(t => t.position === targetPos);
    if (!srcTile || !tgtTile || srcTile.locked || tgtTile.locked) return;
    const opId = `swap-${Date.now()}`;
    pendingOps.current.add(opId);
    setTiles(prev => swapTileData(prev, srcPos, targetPos));
    try {
      const res = await fetch('/api/mod/jeopardy/swap', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, pos1: srcPos, pos2: targetPos, operationId: opId }),
      });
      if (!res.ok) pendingOps.current.delete(opId);
    } catch { pendingOps.current.delete(opId); }
  };

  const handleDragStart = (e, pos) => { e.dataTransfer.effectAllowed = 'move'; setDragSource(pos); };
  const handleDragOver  = (e, pos) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragTarget(pos); };
  const handleDrop = async (e, targetPos) => {
    e.preventDefault();
    const srcPos = dragSource;
    setDragSource(null); setDragTarget(null);
    await performSwap(srcPos, targetPos);
  };
  const handleDragEnd = () => { setDragSource(null); setDragTarget(null); };

  const handleTileTap = (pos) => {
    const tile = tiles.find(t => t.position === pos);
    if (!tile || tile.locked) { setSelectedSwapPos(null); return; }
    if (selectedSwapPos == null) { setSelectedSwapPos(pos); return; }
    if (selectedSwapPos === pos) { setSelectedSwapPos(null); return; }
    const targetTile = tiles.find(t => t.position === selectedSwapPos);
    if (targetTile?.locked) { setSelectedSwapPos(pos); return; }
    performSwap(selectedSwapPos, pos);
    setSelectedSwapPos(null);
  };

  const handleStart = async () => {
    if (!board || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/mod/jeopardy/start', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setBoard(prev => ({ ...prev, status: 'active' }));
    } catch (err) { setError(err.message); }
    finally { setStarting(false); }
  };

  const handleEnd = async () => {
    if (!board || ending) return;

    // Discard/End Lobby confirm copy now names the actual stakes instead of
    // sharing one generic sentence regardless of whether anything is on the
    // line (P3, docs/JEOPARDY_ROOM_DESIGN.md).
    let confirmMsg;
    if (board.status === 'active') {
      const claimedCount = claims.length;
      const uniqueClaimers = new Set(claims.map(c => c.claimed_by)).size;
      confirmMsg = claimedCount > 0
        ? `${uniqueClaimers} player${uniqueClaimers === 1 ? '' : 's'} claimed ${claimedCount} square${claimedCount === 1 ? '' : 's'} — end anyway? This cannot be undone.`
        : 'End this lobby? No squares have been claimed yet. This cannot be undone.';
    } else {
      confirmMsg = members.length > 1
        ? `Discard this lobby? ${members.length} people are in it, but the game hasn't started — nothing has been played. This cannot be undone.`
        : 'Discard this lobby? This cannot be undone.';
    }
    if (!window.confirm(confirmMsg)) return;

    setEnding(true);
    try {
      const res = await fetch('/api/mod/jeopardy', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setBoard(prev => ({ ...prev, status: 'completed' }));
    } catch (err) { setError(err.message); }
    finally { setEnding(false); }
  };

  const triggerConflict = (position, claim) => {
    setConflictFlash(prev => new Set([...prev, position]));
    setTimeout(() => {
      setConflictFlash(prev => { const s = new Set(prev); s.delete(position); return s; });
    }, 500);
    const name = claim?.claimer?.display_name;
    pushToast(name ? `Claimed first by ${name}` : 'Someone claimed that square first', 'warn');
    // The realtime broadcast should land almost immediately, but reflect the
    // real winner right away in case it's slow — the loser shouldn't see a
    // shaken, still-open-looking tile for a full round-trip.
    if (claim?.claimed_by) {
      setClaims(prev => prev.some(c => c.position === position) ? prev : [...prev, claim]);
    }
  };

  const handleClaim = async (position, claimType = 'standard') => {
    if (!board || !canClaim) return;
    try {
      const res = await fetch('/api/jeopardy/claim', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, position, claimType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          triggerConflict(position, body.claim);
        } else {
          console.error('Claim failed:', body.error);
          pushToast(body.error || 'Claim failed — try again.');
        }
        return;
      }
      const { claim } = await res.json();
      setClaims(prev => [...prev.filter(c => c.position !== position), claim]);
    } catch (err) {
      console.error('Claim error:', err);
      pushToast('Network error — try again.');
    }
  };

  const handleUnclaim = async (position) => {
    if (!board || !canClaim) return;
    try {
      const res = await fetch('/api/jeopardy/claim', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ boardId: board.id, position }),
      });
      if (!res.ok) { pushToast('Unclaim failed — try again.'); return; }
      setClaims(prev => prev.filter(c => c.position !== position));
    } catch (err) {
      console.error('Unclaim error:', err);
      pushToast('Network error — try again.');
    }
  };

  const tileMap         = Object.fromEntries(tiles.map(t => [t.position, t]));
  const claimMap        = Object.fromEntries(claims.map(c => [c.position, c]));
  const claimersMap     = Object.fromEntries(members.filter(m => m.user).map(m => [m.user.id, m.user]));
  const isShalpha       = board ? SHALPHA_GAMES.has(board.game) : false;
  const boardRowPts     = board?.row_points ?? DEFAULT_ROW_POINTS;
  const boardColumns    = board?.columns ?? 5;
  const boardShalphaDbl = board?.shalpha_double_points ?? false;
  const gameLabel       = ALLOWED_GAMES.find(g => g.key === board?.game)?.label ?? board?.game;
  const hostMember      = members.find(m => m.role === 'host');

  const Breadcrumb = () => (
    <Link
      to="/games"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-strong transition-colors mb-4"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Shiny Games
    </Link>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0d0f14' }}>
        <div className="text-muted">Loading lobby…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
        <PageBackground />
        <PageHeader title="Shiny Jeopardy" />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumb />
          <div className="max-w-md rounded-xl p-6 text-center text-muted bg-black/50">
            No lobby found for code <span className="font-mono text-strong">{code}</span>. It may have ended.
          </div>
        </div>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
        <PageBackground />
        <PageHeader title="Shiny Jeopardy" />
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumb />
          <div className="max-w-md rounded-xl p-6 text-center bg-danger-strong/10 border border-danger-strong/40">
            <p className="text-sm font-semibold text-danger">{blocked}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Shiny Jeopardy" badge="mod" />

      <ToastStack toasts={toasts} />

      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-6">
        <Breadcrumb />

        {error && (
          <div className="mb-4 max-w-xl p-3 bg-danger-strong/20 border border-danger-strong/50 rounded text-danger text-sm">{error}</div>
        )}

        {board.status === 'completed' && (
          <div className="max-w-md space-y-4">
            <div className="rounded-xl p-4 border border-hairline bg-black/30 text-center">
              <p className="text-sm font-semibold text-strong">{gameLabel}</p>
              <p className="text-xs text-muted mt-0.5">This lobby has ended.</p>
            </div>
            <ClaimsLegend claims={claims} claimersMap={claimersMap} rowPoints={boardRowPts} shalphaDbl={boardShalphaDbl} columns={boardColumns} />
          </div>
        )}

        {board.status !== 'completed' && (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Grid-shaped content gets more viewport width, not more gutter
                (DESIGN.md Layout) — the old lg:max-w-xl cap left ~500px of
                dead space beside the side panel at 1440px+ instead of letting
                the board (and its tiles) actually grow. */}
            <div className="w-full lg:flex-1 lg:max-w-3xl xl:max-w-4xl">
              {board.status === 'building' && isMember && (
                <>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-accent">{gameLabel}</h2>
                        {boardShalphaDbl && (
                          <>
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${WARN_PILL}`}>
                              <img src={alphaIcon} alt="α" className="w-3 h-3 object-contain" draggable="false" />
                              ×2
                            </span>
                            <ShalphaInfoButton />
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        Lobby — not yet started
                        {board.timed_minutes && <span className="text-warn ml-2">· ⏱ {board.timed_minutes} min once started</span>}
                      </div>
                      {canEditTiles && (
                        <div className="text-[10px] text-faint mt-0.5">Drag a tile, or tap one then tap another, to swap them</div>
                      )}
                    </div>
                    {canEditTiles ? (
                      <div className="flex gap-2 flex-wrap justify-end">
                        {tiles.some(t => t.locked) && (
                          <button
                            onClick={handleClearAllLocks}
                            className="px-3 py-1 text-sm bg-danger-strong/80 hover:bg-danger-strong text-strong rounded transition-colors"
                          >
                            ⟲ Clear Locks
                          </button>
                        )}
                        <button
                          onClick={handleRerollAll}
                          disabled={rerollingAll || tiles.every(t => t.locked)}
                          className="px-3 py-1 text-sm bg-surface-inset hover:bg-edge border border-edge disabled:opacity-50 text-body hover:text-strong rounded transition-colors"
                        >
                          {rerollingAll ? '↺ Rerolling…' : '↺ Reroll All'}
                        </button>
                        <button
                          onClick={handleShuffle}
                          disabled={shuffling}
                          className="px-3 py-1 text-sm bg-surface-inset hover:bg-edge border border-edge disabled:opacity-50 text-body hover:text-strong rounded transition-colors"
                        >
                          {shuffling ? '⤨ Shuffling…' : '⤨ Shuffle'}
                        </button>
                        {isHost && (
                          <button
                            onClick={handleStart}
                            disabled={starting || tiles.length < boardColumns * 5 || members.length < MIN_PLAYERS_TO_START}
                            className="px-4 py-1 text-sm bg-success-strong hover:brightness-110 disabled:bg-surface-inset disabled:text-faint disabled:cursor-not-allowed text-strong rounded font-semibold transition-all"
                          >
                            {starting ? 'Starting…' : '▶ Start'}
                          </button>
                        )}
                        {isHost && (
                          <button
                            onClick={handleEnd}
                            disabled={ending}
                            className="px-3 py-1 text-sm bg-surface-inset hover:bg-edge border border-edge text-body hover:text-strong rounded transition-colors"
                          >
                            Discard
                          </button>
                        )}
                        {canForceEnd && (
                          <button
                            onClick={handleEnd}
                            disabled={ending}
                            title="The host isn't around — end this lobby as a moderator"
                            className="px-3 py-1 text-sm bg-danger-strong/10 hover:bg-danger-strong/20 border border-danger-strong/40 text-danger rounded transition-colors"
                          >
                            {ending ? 'Ending…' : 'Force End (Mod)'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted italic">Waiting for the host to start the game</p>
                        {canForceEnd && (
                          <button
                            onClick={handleEnd}
                            disabled={ending}
                            title="The host isn't around — end this lobby as a moderator"
                            className="px-3 py-1 text-sm bg-danger-strong/10 hover:bg-danger-strong/20 border border-danger-strong/40 text-danger rounded transition-colors"
                          >
                            {ending ? 'Ending…' : 'Force End (Mod)'}
                          </button>
                        )}
                      </div>
                    )}
                    {isHost && members.length < MIN_PLAYERS_TO_START && (
                      <p className="w-full text-right text-[10px] text-warn">
                        Need {MIN_PLAYERS_TO_START}+ players to start — share the code
                      </p>
                    )}
                  </div>

                  <BoardGrid
                    tileMap={tileMap}
                    fadingOut={fadingOut}
                    rerolling={rerolling}
                    dragSource={dragSource}
                    dragTarget={dragTarget}
                    selectedSwapPos={selectedSwapPos}
                    rowPoints={boardRowPts}
                    columns={boardColumns}
                    canManage={canEditTiles}
                    onReroll={handleReroll}
                    onToggleLock={handleToggleLock}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onTileTap={handleTileTap}
                  />
                </>
              )}

              {board.status === 'building' && !isMember && (
                <>
                  <div className="rounded-xl p-4 mb-4 border border-hairline bg-black/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold text-strong">{gameLabel}</h2>
                        <p className="text-xs text-muted mt-0.5">
                          {hostMember?.user?.display_name ? `Hosted by ${hostMember.user.display_name}` : 'Waiting to start'} · {members.length} in lobby
                          {board.timed_minutes && <span className="text-warn"> · ⏱ {board.timed_minutes} min</span>}
                        </p>
                      </div>
                      <button
                        onClick={handleJoin}
                        disabled={joining}
                        className="shrink-0 px-4 py-2 bg-accent-strong hover:brightness-110 disabled:bg-surface-inset disabled:text-faint text-strong rounded-lg font-semibold transition-all"
                      >
                        {joining ? 'Joining…' : 'Join Game'}
                      </button>
                    </div>
                    <p className="text-xs text-muted leading-relaxed mt-2">
                      Once the host starts it, everyone here races to claim the square matching a shiny they've caught.
                    </p>
                    {canForceEnd && (
                      <button
                        onClick={handleEnd}
                        disabled={ending}
                        title="The host isn't around — end this lobby as a moderator"
                        className="mt-3 px-3 py-1 text-sm bg-danger-strong/10 hover:bg-danger-strong/20 border border-danger-strong/40 text-danger rounded transition-colors"
                      >
                        {ending ? 'Ending…' : 'Force End (Mod)'}
                      </button>
                    )}
                  </div>
                  <BoardGrid
                    tileMap={tileMap}
                    fadingOut={fadingOut}
                    rerolling={rerolling}
                    dragSource={null}
                    dragTarget={null}
                    selectedSwapPos={null}
                    rowPoints={boardRowPts}
                    columns={boardColumns}
                    canManage={false}
                    onReroll={() => {}}
                    onToggleLock={() => {}}
                    onDragStart={() => {}}
                    onDragOver={() => {}}
                    onDrop={() => {}}
                    onDragEnd={() => {}}
                    onTileTap={() => {}}
                  />
                </>
              )}

              {board.status === 'active' && (
                <>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-success">{gameLabel}</h2>
                        {boardShalphaDbl && (
                          <>
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${WARN_PILL}`}>
                              <img src={alphaIcon} alt="α" className="w-3 h-3 object-contain" draggable="false" />
                              ×2
                            </span>
                            <ShalphaInfoButton />
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {canClaim ? 'Active — click a square to claim it' : 'Active — this game is already in progress'}
                        {isShalpha && canClaim && <span className="text-warn ml-2">· Shalpha clause enabled</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {remainingMs != null && (
                        <span className={`text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg border ${remainingMs <= 60000 ? 'text-danger border-danger-strong/40 bg-danger-strong/10' : 'text-body border-edge bg-surface-inset'}`}>
                          ⏱ {formatCountdown(remainingMs)}
                        </span>
                      )}
                      {isHost && (
                        <button
                          onClick={handleEnd}
                          disabled={ending}
                          className="px-3 py-1 text-sm bg-danger-strong/10 hover:bg-danger-strong/20 border border-danger-strong/40 text-danger rounded transition-colors"
                        >
                          {ending ? 'Ending…' : 'End Lobby'}
                        </button>
                      )}
                      {canForceEnd && (
                        <button
                          onClick={handleEnd}
                          disabled={ending}
                          title="The host isn't around — end this lobby as a moderator"
                          className="px-3 py-1 text-sm bg-danger-strong/10 hover:bg-danger-strong/20 border border-danger-strong/40 text-danger rounded transition-colors"
                        >
                          {ending ? 'Ending…' : 'Force End (Mod)'}
                        </button>
                      )}
                    </div>
                  </div>

                  {claims.length >= boardColumns * 5 && (
                    <div className="mb-4 p-3 rounded-lg border border-success-strong/40 bg-success-strong/10 text-center">
                      <p className="text-sm font-semibold text-success">
                        🎉 Every square's been claimed!{isHost ? ' End the lobby to lock in the standings.' : ' Waiting for the host to end the lobby.'}
                      </p>
                    </div>
                  )}

                  <ClaimGrid
                    tileMap={tileMap}
                    claimMap={claimMap}
                    claimersMap={claimersMap}
                    isShalpha={isShalpha}
                    shalphaDbl={boardShalphaDbl}
                    rowPoints={boardRowPts}
                    columns={boardColumns}
                    currentUserId={user?.id}
                    canClaim={canClaim}
                    conflictFlash={conflictFlash}
                    onClaim={handleClaim}
                    onUnclaim={handleUnclaim}
                  />
                </>
              )}
            </div>

            {/* ── Side panel: code + roster + (when active) leaderboard ── */}
            <div className="w-full lg:w-72 shrink-0 space-y-4">
              {board.status === 'building' && board.code && (
                isMember ? <LobbyCodeCard code={board.code} /> : <LobbyCodeLockedCard />
              )}
              <RosterList members={members} isHost={isHost} onTogglePermission={handleTogglePermission} onKick={handleKick} onTransferHost={handleTransferHost} />
              {board.status === 'active' && (
                <ClaimsLegend claims={claims} claimersMap={claimersMap} rowPoints={boardRowPts} shalphaDbl={boardShalphaDbl} columns={boardColumns} />
              )}
              {canManage && <OverlayPanel isPro={isPro} apiKey={apiKey} code={board.code} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toasts ──────────────────────────────────────────────────────────────────
function ToastStack({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={[
            'px-3 py-2 rounded-lg text-xs font-semibold shadow-lg border max-w-xs',
            t.tone === 'warn' ? 'bg-warn-strong/20 border-warn-strong/50 text-warn' : 'bg-danger-strong/20 border-danger-strong/50 text-danger',
          ].join(' ')}
          style={{ animation: 'jeopardy-conflict-shake 0.4s ease-in-out' }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Shalpha in-room explainer ────────────────────────────────────────────────
// Tap-accessible (not hover-only title=) so the mechanic is explained to the
// persona this whole feature is built around: someone on a phone (P3).
function ShalphaInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-surface-inset border border-edge text-muted hover:text-strong transition-colors"
        aria-label="What is Shalpha?"
      >
        ?
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-2 left-1/2 -translate-x-1/2 w-56 rounded-lg p-3 text-xs leading-relaxed text-body bg-surface-card border border-hairline shadow-lg">
          <p>
            <strong className="text-strong">Shalpha</strong> — on Legends Arceus / Z-A boards, any already-claimed
            square can be stolen with a Shalpha claim, worth double points. The tile's crossed-out avatar shows who
            it was stolen from.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[10px] font-semibold text-accent hover:text-strong transition-colors"
          >
            Got it
          </button>
        </div>
      )}
    </span>
  );
}

// ── Stream overlay (Pro) ─────────────────────────────────────────────────────
function OverlayPanel({ isPro, apiKey, code }) {
  const [copied, setCopied] = useState(false);
  const overlayUrl = apiKey ? `${window.location.origin}/overlay/jeopardy?key=${apiKey}&code=${code}` : null;

  const handleCopy = async () => {
    if (!overlayUrl) return;
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isPro) {
    return (
      <div className="rounded-xl p-4 border border-hairline border-dashed bg-black/20">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Stream Overlay</div>
        <p className="text-xs text-muted leading-relaxed">
          Pro members can add this board as a live OBS browser source that updates instantly as squares get claimed.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 border border-hairline bg-black/30">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Stream Overlay</div>
      {apiKey === undefined && <p className="text-xs text-faint">Loading…</p>}
      {apiKey === null && (
        <>
          <p className="text-xs text-muted mb-2">Generate an API key to get a live OBS browser source for this board.</p>
          <Link to="/overlays" className="inline-block text-xs font-semibold text-accent hover:text-strong transition-colors">
            Generate a key →
          </Link>
        </>
      )}
      {overlayUrl && (
        <>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[10px] rounded px-2 py-1.5 truncate bg-black/40 border border-hairline text-accent">
              {overlayUrl}
            </code>
            <button
              onClick={handleCopy}
              className={[
                'shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors text-strong',
                copied ? 'bg-success-strong' : 'bg-discord hover:brightness-110',
              ].join(' ')}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-faint mt-2">Add as an OBS Browser Source. Keep this link private.</p>
        </>
      )}
    </div>
  );
}

// ── Lobby code card ─────────────────────────────────────────────────────────
function LobbyCodeCard({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/games/jeopardy/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl p-4 border border-accent-strong bg-accent-strong/10">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Connection Code</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 text-2xl font-black tracking-[0.2em] text-strong text-center py-2 rounded-lg bg-black/30">
          {code}
        </div>
        <button
          onClick={handleCopy}
          className={[
            'shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-strong',
            copied ? 'bg-success-strong' : 'bg-discord hover:brightness-110',
          ].join(' ')}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
      <p className="text-xs text-muted mt-2">Share this link or code with the players you want in the lobby.</p>
    </div>
  );
}

// ── Locked lobby code card — shown to viewers who haven't joined yet ────────
function LobbyCodeLockedCard() {
  return (
    <div className="rounded-xl p-4 border border-hairline bg-black/30">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Connection Code</div>
      <div className="relative">
        <div className="text-2xl font-black tracking-[0.2em] text-strong text-center py-2 rounded-lg bg-black/30 blur-sm select-none" aria-hidden="true">
          ••••••
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-2">
          <p className="text-xs font-semibold text-center text-muted">Join the lobby to share the code</p>
        </div>
      </div>
    </div>
  );
}

// ── Roster ───────────────────────────────────────────────────────────────────
function RosterList({ members, isHost, onTogglePermission, onKick, onTransferHost }) {
  return (
    <div className="rounded-xl p-4 border border-hairline bg-black/30">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
        In This Game — {members.length}
      </div>
      {members.length === 0 ? (
        <p className="text-xs text-faint">Nobody's joined yet.</p>
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-2">
              {(m.user?.avatar_url || m.user?.twitch_avatar_url) ? (
                <img
                  src={m.user.avatar_url || m.user.twitch_avatar_url}
                  alt={m.user.display_name}
                  className="w-6 h-6 rounded-full object-cover"
                  draggable="false"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-inset flex items-center justify-center text-strong text-[10px]">
                  {m.user?.display_name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <span className="text-sm text-body truncate">{m.user?.display_name || 'Unknown'}</span>
              {m.role === 'host' ? (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent-strong/20 text-accent border border-accent-strong/40 ml-auto">
                  Host
                </span>
              ) : isHost ? (
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={() => onTogglePermission(m.user_id, !m.can_edit)}
                    className={[
                      'shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border transition-colors',
                      m.can_edit
                        ? 'bg-success-strong/20 text-success border-success-strong/40 hover:bg-success-strong/30'
                        : 'bg-surface-inset text-faint border-edge hover:text-body',
                    ].join(' ')}
                    title={m.can_edit ? 'Revoke edit access' : 'Grant edit access'}
                  >
                    {m.can_edit ? 'Can Edit' : 'View Only'}
                  </button>
                  <button
                    onClick={() => onTransferHost(m.user_id, m.user?.display_name)}
                    className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-surface-inset text-faint border-edge hover:text-accent hover:border-accent-strong/40 transition-colors"
                    title="Make this player the host"
                  >
                    Make Host
                  </button>
                  <button
                    onClick={() => onKick(m.user_id, m.user?.display_name)}
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-danger-strong/20 text-danger border border-danger-strong/40 hover:bg-danger-strong/30 transition-colors"
                    title="Remove from lobby"
                    aria-label={`Remove ${m.user?.display_name || 'this player'} from the lobby`}
                  >
                    ✕
                  </button>
                </div>
              ) : m.can_edit ? (
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-success-strong/20 text-success border border-success-strong/40 ml-auto">
                  Can Edit
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Building-phase grid ────────────────────────────────────────────────────────
function BoardGrid({
  tileMap, fadingOut, rerolling, dragSource, dragTarget, selectedSwapPos, rowPoints, columns, canManage,
  onReroll, onToggleLock, onDragStart, onDragOver, onDrop, onDragEnd, onTileTap,
}) {
  return (
    <div
      className="grid gap-1 rounded-xl overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${columns ?? 5}, minmax(0, 1fr))`,
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#212326',
        padding: '8px',
      }}
    >
      {makePositions(columns).map(pos => {
        const tile      = tileMap[pos];
        const isLocked  = tile?.locked ?? false;
        const isFading  = fadingOut.has(pos);
        const isDragging = dragSource === pos;
        const isOver    = dragTarget === pos;
        const isSelected = selectedSwapPos === pos;
        const pts       = rowValue(pos, rowPoints, columns);

        return (
          <div
            key={pos}
            draggable={canManage && !isLocked}
            onDragStart={e => onDragStart(e, pos)}
            onDragOver={e => onDragOver(e, pos)}
            onDrop={e => onDrop(e, pos)}
            onDragEnd={onDragEnd}
            style={{ backgroundColor: '#212326' }}
            className={[
              'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 overflow-hidden select-none transition-all duration-150',
              'border-edge',
              isDragging ? 'opacity-40 scale-95' : '',
              isOver     ? 'border-accent scale-105' : '',
              isSelected ? 'border-accent ring-2 ring-accent-strong scale-105' : '',
              isLocked   ? 'opacity-75' : '',
              canManage ? (isLocked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing') : 'cursor-default',
            ].join(' ')}
          >
            {tile ? (
              <>
                <div className="w-full h-full transition-opacity duration-300" style={{ opacity: isFading ? 0 : 1 }}>
                  <PokemonImage pokemon={tile.pokemon} className="w-full h-full p-1" />
                </div>
                {/* The name strip — not the whole tile — is the swap-select tap
                    target. The lock/reroll buttons are ≥32px real touch targets
                    (P2) that, on narrow multi-column boards, cover most of a
                    tile's visual center; a whole-tile tap handler would fight
                    them for the same pixels. This band is always clear of both. */}
                <div
                  onClick={e => { e.stopPropagation(); if (canManage) onTileTap(pos); }}
                  className={[
                    'absolute bottom-0 left-0 right-0 bg-black/60 text-strong text-center py-0.5 px-1',
                    canManage && !isLocked ? 'cursor-pointer' : '',
                  ].join(' ')}
                  style={{ fontSize: '10px', lineHeight: '1.2' }}
                >
                  {tile.pokemon?.name || '?'}
                </div>

                {canManage && (
                  <button
                    onClick={e => { e.stopPropagation(); onToggleLock(pos, isLocked); }}
                    className={[
                      'absolute top-1 right-1 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-opacity',
                      isLocked
                        ? 'bg-warn-strong text-strong opacity-100'
                        : 'bg-black/60 text-body opacity-70 group-hover:opacity-100',
                    ].join(' ')}
                    title={isLocked ? 'Unlock' : 'Lock'}
                    aria-label={isLocked ? 'Unlock this tile' : 'Lock this tile'}
                  >
                    {isLocked ? '🔒' : '🔓'}
                  </button>
                )}

                {canManage && !isLocked && (
                  <button
                    onClick={e => { e.stopPropagation(); onReroll(pos); }}
                    className="absolute top-1 left-1 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-base bg-accent-strong text-strong opacity-70 group-hover:opacity-100 transition-opacity"
                    title="Reroll"
                    aria-label="Reroll this tile"
                  >
                    ↺
                  </button>
                )}

                <div className={`absolute bottom-5 right-0.5 z-10 font-bold leading-none text-warn`} style={{ fontSize: '9px' }}>
                  {pts}pt
                </div>
              </>
            ) : (
              <div className="text-faint text-xs">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Active-phase claim grid ────────────────────────────────────────────────────
function ClaimGrid({ tileMap, claimMap, claimersMap, isShalpha, shalphaDbl, rowPoints, columns, currentUserId, canClaim, conflictFlash, onClaim, onUnclaim }) {
  return (
    <div className="flex items-stretch gap-1">
      <div className="flex flex-col" style={{ width: '20px', paddingTop: '8px', paddingBottom: '8px' }}>
        {(rowPoints ?? DEFAULT_ROW_POINTS).map((pts, i) => (
          <div key={i} className="flex-1 flex items-center justify-center text-warn font-bold" style={{ fontSize: '10px' }}>
            {pts}pt
          </div>
        ))}
      </div>

      <div
        className="flex-1 grid gap-1 rounded-xl overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${columns ?? 5}, minmax(0, 1fr))`,
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#212326',
          padding: '8px',
        }}
      >
        {makePositions(columns).map(pos => {
          const tile           = tileMap[pos];
          const claim           = claimMap[pos];
          const isClaimed       = !!claim;
          const isShalphaClaim  = claim?.claim_type === 'shalpha';

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
              columns={columns}
              claimersMap={claimersMap}
              currentUserId={currentUserId}
              canClaim={canClaim}
              isConflict={conflictFlash?.has(pos) ?? false}
              onClaim={onClaim}
              onUnclaim={onUnclaim}
            />
          );
        })}
      </div>
    </div>
  );
}

function ClaimTile({ pos, tile, claim, isClaimed, isShalphaClaim, isShalpha, shalphaDbl, rowPoints, columns, claimersMap, currentUserId, canClaim, isConflict, onClaim, onUnclaim }) {
  const claimer         = claimersMap?.[claim?.claimed_by]          ?? claim?.claimer         ?? null;
  const originalClaimer = claimersMap?.[claim?.original_claimed_by] ?? claim?.original_claimer ?? null;

  const basePts    = rowValue(pos, rowPoints, columns);
  const earnedPts  = isClaimed ? (isShalphaClaim && shalphaDbl ? basePts * 2 : basePts) : null;
  const isDoubled  = isClaimed && isShalphaClaim && shalphaDbl;

  return (
    <div
      style={{ backgroundColor: isClaimed ? '#16161a' : '#212326' }}
      className={[
        'group aspect-square relative flex flex-col items-center justify-center rounded-lg border-2 overflow-hidden select-none transition-all duration-150',
        isConflict ? 'border-danger-strong animate-jeopardy-shake' : '',
        !isConflict && (isClaimed
          ? 'border-hairline cursor-default'
          : canClaim ? 'border-edge cursor-pointer hover:border-success hover:scale-105' : 'border-edge cursor-default'),
      ].join(' ')}
      onClick={() => { if (!isClaimed && canClaim) onClaim(pos, 'standard'); }}
    >
      {tile && (
        <div className="w-full h-full absolute inset-0" style={{ opacity: isClaimed ? 0.25 : 1 }}>
          <PokemonImage pokemon={tile.pokemon} className="w-full h-full p-1" />
        </div>
      )}

      {tile && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-strong text-center py-0.5 px-1 z-10" style={{ fontSize: '10px', lineHeight: '1.2' }}>
          {tile.pokemon?.name || '?'}
        </div>
      )}

      <div
        className={[
          'absolute top-0.5 left-0.5 z-30 font-bold leading-none',
          isClaimed
            ? (isDoubled ? 'text-warn' : 'text-strong/60')
            : 'text-warn/80',
        ].join(' ')}
        style={{ fontSize: '9px' }}
      >
        {isClaimed ? `${earnedPts}pt${isDoubled ? '!' : ''}` : `${basePts}pt`}
      </div>

      {isClaimed && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="relative flex items-center justify-center w-4/5 h-4/5">
            {(claimer?.avatar_url || claimer?.twitch_avatar_url) ? (
              <img
                src={claimer.avatar_url || claimer.twitch_avatar_url}
                alt={claimer.display_name}
                className="rounded-full w-full h-full object-cover border-2 border-edge"
                draggable="false"
              />
            ) : (
              <div className="rounded-full w-full h-full bg-surface-inset flex items-center justify-center text-strong text-2xl font-bold border-2 border-edge">
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
                    className="rounded-full w-6 h-6 object-cover border border-edge grayscale opacity-60"
                    draggable="false"
                  />
                ) : (
                  <div className="rounded-full w-6 h-6 bg-surface-inset flex items-center justify-center text-strong text-xs border border-edge grayscale opacity-60">
                    {originalClaimer.display_name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-full h-0.5 bg-danger-strong rotate-45 opacity-80" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {canClaim && (
        <div className="absolute top-1 right-1 z-30 flex flex-col gap-1">
          {isClaimed && (
            <button
              onClick={e => { e.stopPropagation(); onUnclaim(pos); }}
              className="w-8 h-8 rounded-lg bg-danger-strong hover:brightness-110 text-strong flex items-center justify-center text-sm font-bold opacity-80 group-hover:opacity-100 transition-all"
              title="Unclaim"
              aria-label="Unclaim this square"
            >
              ✕
            </button>
          )}
          {isShalpha && isClaimed && !isShalphaClaim && (
            <button
              onClick={e => { e.stopPropagation(); onClaim(pos, 'shalpha'); }}
              className="w-8 h-8 rounded-lg bg-warn-strong hover:brightness-110 flex items-center justify-center p-1.5 opacity-80 group-hover:opacity-100 transition-all"
              title="Shalpha — override this claim"
              aria-label="Shalpha — steal this claim"
            >
              <img src={alphaIcon} alt="" className="w-full h-full object-contain" draggable="false" />
            </button>
          )}
          {isShalpha && !isClaimed && (
            <button
              onClick={e => { e.stopPropagation(); onClaim(pos, 'shalpha'); }}
              className="w-8 h-8 rounded-lg bg-warn-strong hover:brightness-110 flex items-center justify-center p-1.5 opacity-60 group-hover:opacity-100 transition-all"
              title="Shalpha claim"
              aria-label="Shalpha claim"
            >
              <img src={alphaIcon} alt="" className="w-full h-full object-contain" draggable="false" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Claims legend / leaderboard ────────────────────────────────────────────────
function ClaimsLegend({ claims, claimersMap, rowPoints, shalphaDbl, columns }) {
  const byUser = {};
  claims.forEach(c => {
    const id = c.claimed_by;
    if (!byUser[id]) byUser[id] = { user: claimersMap?.[id] ?? c.claimer, shalpha: 0, points: 0 };
    byUser[id].points += claimPoints(c, rowPoints, shalphaDbl, columns);
    if (c.claim_type === 'shalpha') byUser[id].shalpha++;
  });
  const ranked = Object.values(byUser).sort((a, b) => b.points - a.points);

  return (
    <div className="rounded-xl p-4 border border-hairline bg-black/30">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Standings</div>
      {ranked.length === 0 ? (
        <p className="text-xs text-faint">No claims yet.</p>
      ) : (
        <div className="space-y-2">
          {ranked.map(({ user, shalpha, points }) => (
            <div key={user?.id || Math.random()} className="flex items-center gap-2">
              {(user?.avatar_url || user?.twitch_avatar_url) ? (
                <img
                  src={user.avatar_url || user.twitch_avatar_url}
                  alt={user.display_name}
                  className="w-6 h-6 rounded-full object-cover"
                  draggable="false"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-surface-inset flex items-center justify-center text-strong text-[10px]">
                  {user?.display_name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <span className="text-sm text-body truncate flex-1">{user?.display_name || 'Unknown'}</span>
              <span className={`text-xs font-bold rounded-full px-2 py-0.5 shrink-0 ${WARN_PILL}`}>
                {points}pt
              </span>
              {shalpha > 0 && (
                <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 shrink-0 ${WARN_PILL}`}>
                  <img src={alphaIcon} alt="shalpha" className="w-3 h-3 object-contain" draggable="false" />
                  <span className="text-xs font-bold text-warn">×{shalpha}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
