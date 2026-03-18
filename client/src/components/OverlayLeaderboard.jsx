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

  // Live updates
  useEffect(() => {
    const channel = supabase
      .channel('overlay-leaderboard-updates')
      .on('broadcast', { event: 'leaderboard-changed' }, () => {
        versionRef.current += 1;
        fetchLeaderboard();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Row height scales down for larger limits so everything fits in 720px
  // Header ~56px, footer ~4px padding → available ~660px for rows
  const rowHeight = limit <= 10 ? 60 : limit <= 20 ? 30 : 24;
  const fontSize = limit <= 10 ? 15 : limit <= 20 ? 12 : 11;

  return (
    <div style={{
      width: 400,
      height: 720,
      background: 'transparent',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.92), rgba(219,39,119,0.92))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{ fontSize: 18 }}>🏆</span>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: 0.3 }}>
          Leaderboard
        </span>
        <span style={{
          marginLeft: 'auto',
          color: 'rgba(255,255,255,0.75)',
          fontSize: 12,
          fontWeight: 600,
          background: 'rgba(0,0,0,0.25)',
          padding: '2px 8px',
          borderRadius: 9999,
        }}>
          {label}
        </span>
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        background: 'rgba(33,35,38,0.88)',
        overflow: 'hidden',
        backdropFilter: 'blur(4px)',
      }}>
        {error ? (
          <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', padding: 24 }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: 24 }}>No data yet.</div>
        ) : (
          rows.map((row, i) => {
            const rankColor = RANK_COLORS[i] || '#d1d5db';
            const isTop3 = i < 3;
            return (
              <div
                key={row.user_id}
                style={{
                  height: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  padding: `0 14px`,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: isTop3
                    ? `linear-gradient(90deg, rgba(${i === 0 ? '245,158,11' : i === 1 ? '156,163,175' : '180,83,9'},0.08) 0%, transparent 60%)`
                    : 'transparent',
                  gap: 10,
                }}
              >
                {/* Rank */}
                <div style={{
                  width: 28,
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: isTop3 ? fontSize + 1 : fontSize,
                  color: isTop3 ? rankColor : '#6b7280',
                  flexShrink: 0,
                }}>
                  {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                </div>

                {/* Name */}
                <div style={{
                  flex: 1,
                  fontWeight: isTop3 ? 700 : 500,
                  fontSize,
                  color: isTop3 ? '#f3f4f6' : '#d1d5db',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {row.display_name}
                </div>

                {/* Points */}
                <div style={{
                  fontWeight: 700,
                  fontSize,
                  color: '#a78bfa',
                  flexShrink: 0,
                }}>
                  {row.points} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: fontSize - 1 }}>pts</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OverlayLeaderboard;
