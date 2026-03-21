import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

const MEDAL      = ['🥇', '🥈', '🥉'];
const TOP3_COLOR = ['#fbbf24', '#d1d5db', '#cd7c2f'];
const TOP3_BG    = ['rgba(251,191,36,0.08)', 'rgba(209,213,219,0.06)', 'rgba(205,124,47,0.07)'];

const OverlayLeaderboard = () => {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const period = params.get('period') || 'monthly';
  const limit  = parseInt(params.get('limit'), 10) || 10;
  const pin    = params.get('pin') !== '0'; // on by default, opt-out with &pin=0

  const [rows,  setRows]  = useState([]);
  const [label, setLabel] = useState('');
  const [error, setError] = useState(null);
  const versionRef = useRef(0);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  const fetchLeaderboard = async () => {
    if (!apiKey) { setError('No API key provided.'); return; }
    try {
      const url = `${API_BASE_URL}/overlay/leaderboard?key=${encodeURIComponent(apiKey)}&period=${period}&limit=${limit}${pin ? '&pin=1' : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load leaderboard.');
        return;
      }
      const data = await res.json();
      setRows(data.rows || []);
      setLabel(data.label || '');
      setError(null);
    } catch {
      setError('Failed to load leaderboard.');
    }
  };

  useEffect(() => { fetchLeaderboard(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-updates')
      .on('broadcast', { event: 'leaderboard-changed' }, () => {
        versionRef.current += 1;
        fetchLeaderboard();
      })
      .subscribe();
    const poll = setInterval(() => fetchLeaderboard(), 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, []);

  const allRegularRows = rows.filter(r => !r.pinned);
  const pinnedRow      = rows.find(r => r.pinned) ?? null;
  // When pinned, replace the last regular row so total count stays at `limit`
  const regularRows    = pinnedRow ? allRegularRows.slice(0, limit - 1) : allRegularRows;

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'transparent',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        padding: '1.6vh 4vw',
        background: 'linear-gradient(135deg, rgba(109,40,217,0.97) 0%, rgba(192,38,211,0.93) 100%)',
        display: 'flex',
        alignItems: 'center',
        gap: '2vw',
        boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
      }}>
        <span style={{ fontSize: 'clamp(20px, 5vw, 36px)', lineHeight: 1 }}>🏆</span>
        <span style={{
          color: '#fff',
          fontWeight: 800,
          fontSize: 'clamp(20px, 5vw, 36px)',
          letterSpacing: '0.01em',
          textShadow: '0 1px 6px rgba(0,0,0,0.5)',
        }}>
          Leaderboard
        </span>
        <span style={{
          marginLeft: 'auto',
          color: 'rgba(255,255,255,0.95)',
          fontSize: 'clamp(14px, 3.4vw, 22px)',
          fontWeight: 600,
          background: 'rgba(0,0,0,0.25)',
          padding: '0.4vh 1.6vw',
          borderRadius: 9999,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1,
        background: 'rgba(15,17,20,0.93)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {error ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 'clamp(16px, 4vw, 24px)' }}>
            {error}
          </div>
        ) : regularRows.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563', fontSize: 'clamp(16px, 4vw, 24px)' }}>
            No data yet.
          </div>
        ) : (
          <>
            {/* All rows in one flex column — regular rows + optional pinned row replacing the last slot */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {regularRows.map((row, i) => {
                const isTop3 = row.rank <= 3;
                const medalIndex = row.rank - 1;
                return (
                  <div
                    key={row.user_id}
                    style={{
                      flex: 1,
                      minHeight: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3vw',
                      padding: '0 4vw',
                      background: isTop3 ? TOP3_BG[medalIndex] : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div style={{
                      width: 'clamp(32px, 8vw, 56px)',
                      flexShrink: 0,
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: isTop3 ? 'clamp(22px, 5.5vw, 38px)' : 'clamp(18px, 4.5vw, 30px)',
                      color: isTop3 ? TOP3_COLOR[medalIndex] : '#6b7280',
                      lineHeight: 1,
                    }}>
                      {isTop3 ? MEDAL[medalIndex] : `#${row.rank}`}
                    </div>
                    <div style={{
                      flex: 1,
                      fontWeight: isTop3 ? 700 : 500,
                      fontSize: isTop3 ? 'clamp(20px, 5vw, 34px)' : 'clamp(18px, 4.5vw, 30px)',
                      color: isTop3 ? '#ffffff' : '#c9cdd4',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textShadow: isTop3 ? '0 1px 4px rgba(0,0,0,0.7)' : 'none',
                    }}>
                      {row.display_name}
                    </div>
                    <div style={{
                      flexShrink: 0,
                      fontWeight: 700,
                      fontSize: 'clamp(30px, 7.5vw, 52px)',
                      color: isTop3 ? '#c4b5fd' : '#a78bfa',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.points}
                      <span style={{ fontWeight: 500, fontSize: 'clamp(22px, 5.5vw, 38px)', color: '#6b7280', marginLeft: '0.6vw' }}>pts</span>
                    </div>
                  </div>
                );
              })}

              {/* Pinned row — same flex:1 height as regular rows, dashed top border as separator */}
              {pinnedRow && (
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3vw',
                  padding: '0 4vw',
                  background: 'linear-gradient(90deg, rgba(109,40,217,0.22) 0%, rgba(109,40,217,0.06) 60%, transparent 100%)',
                  borderTop: '1px dashed rgba(124,58,237,0.5)',
                }}>
                  <div style={{
                    width: 'clamp(32px, 8vw, 56px)',
                    flexShrink: 0,
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: 'clamp(18px, 4.5vw, 30px)',
                    color: '#a78bfa',
                    lineHeight: 1,
                  }}>
                    #{pinnedRow.rank}
                  </div>
                  <div style={{
                    flex: 1,
                    fontWeight: 700,
                    fontSize: 'clamp(18px, 4.5vw, 30px)',
                    color: '#ddd6fe',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {pinnedRow.display_name}
                  </div>
                  <div style={{
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: 'clamp(30px, 7.5vw, 52px)',
                    color: '#a78bfa',
                    whiteSpace: 'nowrap',
                  }}>
                    {pinnedRow.points}
                    <span style={{ fontWeight: 500, fontSize: 'clamp(22px, 5.5vw, 38px)', color: '#6b7280', marginLeft: '0.6vw' }}>pts</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OverlayLeaderboard;
