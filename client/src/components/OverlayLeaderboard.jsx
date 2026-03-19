import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#b45309'];

const OverlayLeaderboard = () => {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const period = params.get('period') || 'monthly';
  const limit = parseInt(params.get('limit'), 10) || 10;

  const [rows, setRows] = useState([]);
  const [label, setLabel] = useState('');
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

  const fetchLeaderboard = async () => {
    if (!apiKey) { setError('No API key provided.'); return; }
    try {
      const url = `${API_BASE_URL}/overlay/leaderboard?key=${encodeURIComponent(apiKey)}&period=${period}&limit=${limit}`;
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

  // Live updates + polling fallback
  useEffect(() => {
    // Subscribe to the same channel the API broadcasts on
    const channel = supabase
      .channel('leaderboard-updates')
      .on('broadcast', { event: 'leaderboard-changed' }, () => {
        versionRef.current += 1;
        fetchLeaderboard();
      })
      .subscribe();

    // Polling fallback: catches any broadcast missed during a WS reconnect
    const poll = setInterval(() => fetchLeaderboard(), 30_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, []);

  // Font size scales with viewport width, clamped to a readable range
  const nameFontSize = 'clamp(11px, 2.8vw, 22px)';
  const ptsFontSize  = 'clamp(10px, 2.4vw, 19px)';
  const rankFontSize = 'clamp(12px, 3vw, 24px)';

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
      {/* Header — 9% of height */}
      <div style={{
        height: '9vh',
        minHeight: 36,
        padding: '0 2.5vw',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.92), rgba(219,39,119,0.92))',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5vw',
        flexShrink: 0,
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{ fontSize: 'clamp(14px, 3.5vw, 28px)' }}>🏆</span>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 'clamp(13px, 3vw, 24px)', letterSpacing: 0.3 }}>
          Leaderboard
        </span>
        <span style={{
          marginLeft: 'auto',
          color: 'rgba(255,255,255,0.8)',
          fontSize: 'clamp(10px, 2.2vw, 17px)',
          fontWeight: 600,
          background: 'rgba(0,0,0,0.25)',
          padding: '0.4vh 1.2vw',
          borderRadius: 9999,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      {/* Body — remaining 91% split equally among rows */}
      <div style={{
        flex: 1,
        background: 'rgba(33,35,38,0.88)',
        overflow: 'hidden',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {error ? (
          <div style={{ color: '#ef4444', fontSize: nameFontSize, textAlign: 'center', padding: '3vh 2vw', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: nameFontSize, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No data yet.</div>
        ) : (
          rows.map((row, i) => {
            const rankColor = RANK_COLORS[i] || '#d1d5db';
            const isTop3 = i < 3 && !row.pinned;
            return (
              <React.Fragment key={row.user_id}>
                {/* Separator before pinned row */}
                {row.pinned && (
                  <div style={{
                    flexShrink: 0,
                    height: '0.5vh',
                    minHeight: 4,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 2.5vw',
                    gap: '1vw',
                  }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(124,58,237,0.4)', borderTop: '1px dashed rgba(124,58,237,0.4)' }} />
                    <span style={{ fontSize: 'clamp(8px, 1.6vw, 12px)', color: '#6b7280', whiteSpace: 'nowrap' }}>you</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(124,58,237,0.4)', borderTop: '1px dashed rgba(124,58,237,0.4)' }} />
                  </div>
                )}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    padding: `0 2.5vw`,
                    borderBottom: row.pinned ? 'none' : '1px solid rgba(255,255,255,0.05)',
                    background: row.pinned
                      ? 'linear-gradient(90deg, rgba(124,58,237,0.12) 0%, transparent 70%)'
                      : isTop3
                        ? `linear-gradient(90deg, rgba(${i === 0 ? '245,158,11' : i === 1 ? '156,163,175' : '180,83,9'},0.08) 0%, transparent 60%)`
                        : 'transparent',
                    gap: '1.5vw',
                    minHeight: 0,
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    width: '6vw',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: rankFontSize,
                    color: row.pinned ? '#a78bfa' : isTop3 ? rankColor : '#6b7280',
                    flexShrink: 0,
                  }}>
                    {!row.pinned && row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                  </div>

                  {/* Name */}
                  <div style={{
                    flex: 1,
                    fontWeight: row.pinned ? 700 : isTop3 ? 700 : 500,
                    fontSize: nameFontSize,
                    color: row.pinned ? '#e9d5ff' : isTop3 ? '#f3f4f6' : '#d1d5db',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.display_name}
                  </div>

                  {/* Points */}
                  <div style={{
                    fontWeight: 700,
                    fontSize: ptsFontSize,
                    color: '#a78bfa',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {row.points} <span style={{ fontWeight: 400, color: '#6b7280' }}>pts</span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OverlayLeaderboard;
