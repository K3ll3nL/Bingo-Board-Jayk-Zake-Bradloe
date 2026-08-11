import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../contexts/AuthContext';
import PokemonImage from './PokemonImage';
import alphaIcon from '../Icons/alpha.png';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';
const DEFAULT_ROW_POINTS = [1, 2, 3, 4, 5];

function rowValue(pos, rowPoints, columns) {
  return (rowPoints ?? DEFAULT_ROW_POINTS)[Math.floor((pos - 1) / (columns ?? 5))] ?? 1;
}

// Read-only OBS browser source for a live Shiny Jeopardy board. Fills whatever
// box OBS gives it (100vw/100vh + vmin-scaled everything, same technique as
// OverlayBoard.jsx) rather than rendering at a fixed pixel size, transparent
// background, realtime with a polling fallback so a missed broadcast during a
// WS reconnect still self-heals within 15s.
export default function OverlayJeopardy() {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const code = params.get('code');

  const [board, setBoard] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [claims, setClaims] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const boardIdRef = useRef(null);

  // Force transparent background for OBS — matches every other overlay.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  const fetchBoard = async () => {
    if (!apiKey || !code) { setError('Missing key or code.'); return; }
    try {
      const res = await fetch(
        `${API_BASE_URL}/overlay/jeopardy?key=${encodeURIComponent(apiKey)}&code=${encodeURIComponent(code)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load board.');
        return;
      }
      const data = await res.json();
      boardIdRef.current = data.board?.id ?? null;
      setBoard(data.board);
      setTiles(data.tiles || []);
      setClaims(data.claims || []);
      setMembers(data.members || []);
      setError(null);
    } catch {
      setError('Failed to load board.');
    }
  };

  useEffect(() => { fetchBoard(); }, []);

  // Realtime + polling fallback, once we know which board to listen to.
  useEffect(() => {
    if (!board?.id) return;
    const channel = supabase
      .channel(`jeopardy-updates-${board.id}`)
      .on('broadcast', { event: 'tile-update' }, () => { fetchBoard(); })
      .subscribe();
    const poll = setInterval(fetchBoard, 15_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [board?.id]);

  const fullPage = { width: '100vw', height: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0, overflow: 'hidden', fontFamily: 'Rubik, sans-serif', WebkitFontSmoothing: 'antialiased' };

  if (error) {
    return (
      <div style={fullPage}>
        <div style={{ color: '#ef4444', fontSize: '2vmin', textAlign: 'center', padding: '2vmin', background: 'rgba(0,0,0,0.7)', borderRadius: '1vmin' }}>
          {error}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div style={fullPage}>
        <div style={{ width: '5vmin', height: '5vmin', borderRadius: '50%', border: '0.5vmin solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const claimMap = Object.fromEntries(claims.map(c => [c.position, c]));
  const claimersMap = Object.fromEntries(members.filter(m => m.user).map(m => [m.user.id, m.user]));
  const columns = board.columns ?? 5;
  const rowPoints = board.row_points ?? DEFAULT_ROW_POINTS;
  const positions = Array.from({ length: columns * 5 }, (_, i) => i + 1);

  if (board.status === 'completed') {
    return (
      <div style={fullPage}>
        <div style={{ color: '#9ca3af', fontSize: '2.2vmin', textAlign: 'center', padding: '2vmin', background: 'rgba(0,0,0,0.7)', borderRadius: '1vmin' }}>
          This lobby has ended.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw', height: '100vh', background: 'transparent',
      padding: 0, margin: 0, overflow: 'hidden', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Rubik, sans-serif', WebkitFontSmoothing: 'antialiased',
    }}>
      {/* Stage sized to the largest rectangle that fits the viewport at the
          board's true columns:5 ratio, so every cell stays square — a wide
          browser source no longer squashes tiles into short, wide rectangles
          that leave the sprite art shrunk down with dead space either side. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: 'repeat(5, 1fr)',
        gap: '0.8%',
        width: `min(100vw, calc(100vh * ${columns} / 5))`,
        height: `min(100vh, calc(100vw * 5 / ${columns}))`,
        boxSizing: 'border-box',
        padding: '0.8%',
      }}>
        {positions.map(pos => {
          const tile = tiles.find(t => t.position === pos);
          const claim = claimMap[pos];
          const claimer = claim ? claimersMap[claim.claimed_by] : null;
          const isShalphaClaim = claim?.claim_type === 'shalpha';
          const pts = rowValue(pos, rowPoints, columns);

          return (
            <div
              key={pos}
              style={{
                position: 'relative',
                background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.8vmin',
                boxShadow: '0 0.2vmin 0.6vmin rgba(0,0,0,0.5)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {tile && (
                <div style={{ position: 'absolute', inset: 0, opacity: claim ? 0.25 : 1 }}>
                  <PokemonImage pokemon={tile.pokemon} className="w-full h-full" hideControls />
                </div>
              )}

              {claim && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(claimer?.avatar_url || claimer?.twitch_avatar_url) ? (
                    <img
                      src={claimer.avatar_url || claimer.twitch_avatar_url}
                      alt=""
                      style={{ width: '65%', height: '65%', borderRadius: '50%', objectFit: 'cover', border: '0.2vmin solid rgba(255,255,255,0.5)' }}
                    />
                  ) : (
                    <div style={{
                      width: '65%', height: '65%', borderRadius: '50%', background: '#374151',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '2.4vmin', fontWeight: 700,
                    }}>
                      {claimer?.display_name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  {isShalphaClaim && (
                    <img src={alphaIcon} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
