import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

const OverlayBoard = () => {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const mode = params.get('mode') === 'template' ? 'template' : 'live';

  const [board, setBoard] = useState([]);
  const [month, setMonth] = useState('');
  const [error, setError] = useState(null);
  const versionRef = useRef(0);

  // Force transparent background for OBS
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  const fetchBoard = async () => {
    if (!apiKey) { setError('No API key provided.'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/overlay/board?key=${encodeURIComponent(apiKey)}&mode=${mode}`, { cache: 'no-store' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load board.');
        return;
      }
      const data = await res.json();
      setBoard(data.board || []);
      setMonth(data.month || '');
      setError(null);
    } catch {
      setError('Failed to load board.');
    }
  };

  // Initial load
  useEffect(() => { fetchBoard(); }, []);

  // Live Realtime updates (only in live mode)
  useEffect(() => {
    if (mode !== 'live') return;
    const channel = supabase
      .channel('overlay-board-updates')
      .on('broadcast', { event: 'board-changed' }, () => {
        versionRef.current += 1;
        fetchBoard();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [mode]);

  if (error) {
    return (
      <div style={{ width: 400, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <div style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', padding: 16, background: 'rgba(0,0,0,0.7)', borderRadius: 8 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!board.length) {
    return (
      <div style={{ width: 400, height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #8b5cf6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: 400, height: 400, background: 'transparent', padding: 0, margin: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gridTemplateRows: 'repeat(5, 1fr)',
        gap: 2,
        width: 400,
        height: 400,
      }}>
        {board.map((cell) => {
          const isFree = cell.position === 13;
          const isEmpty = cell.pokemon_name === 'EMPTY';

          let bg = '#1f2937';
          let borderColor = '#374151';
          if (isFree) { bg = 'linear-gradient(135deg, #7c3aed, #db2777)'; borderColor = '#7c3aed'; }
          else if (cell.is_checked) { bg = '#14532d'; borderColor = '#16a34a'; }
          else if (cell.is_pending) { bg = '#451a03'; borderColor = '#d97706'; }
          else if (isEmpty) { bg = '#111827'; borderColor = '#1f2937'; }

          return (
            <div
              key={cell.position}
              style={{
                position: 'relative',
                background: bg,
                border: `2px solid ${borderColor}`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* Pokemon GIF */}
              {!isFree && !isEmpty && cell.pokemon_gif && (
                <img
                  src={cell.pokemon_gif}
                  alt={cell.pokemon_name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              )}

              {/* Free space label */}
              {isFree && (
                <span style={{ color: '#fff', fontSize: 9, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, padding: '0 2px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                  FREE{'\n'}SPACE
                </span>
              )}

              {/* Empty cell */}
              {isEmpty && (
                <span style={{ color: '#4b5563', fontSize: 8, fontWeight: 600 }}>EMPTY</span>
              )}

              {/* Approved overlay */}
              {cell.is_checked && !isFree && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.35)',
                }}>
                  <svg width="28" height="28" viewBox="0 0 20 20" fill="#ffffff">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}

              {/* Pending overlay */}
              {cell.is_pending && !isFree && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.35)',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OverlayBoard;
