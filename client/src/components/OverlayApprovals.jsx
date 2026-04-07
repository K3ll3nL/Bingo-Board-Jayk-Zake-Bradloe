import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

// URL params:
//   ?key=pb_xxx          — moderator API key (required)
//   ?limit=5             — max items shown (default 5, max 10)
//   ?show_names=0        — hide submitter names (default 1)

const OverlayApprovals = () => {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const limit = Math.min(10, Math.max(1, parseInt(params.get('limit'), 10) || 5));
  const showNames = params.get('show_names') !== '0';

  const [data, setData] = useState({ count: 0, items: [] });
  const [error, setError] = useState(null);

  // Force transparent background for OBS
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  const fetchApprovals = useCallback(async () => {
    if (!apiKey) { setError('No API key provided.'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/overlay/approvals?key=${encodeURIComponent(apiKey)}`, { cache: 'no-store' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to load approvals.');
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError('Failed to load approvals.');
    }
  }, [apiKey]);

  // Initial load
  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  // Live updates + polling fallback
  useEffect(() => {
    const channel = supabase
      .channel('approvals-updates-overlay')
      .on('broadcast', { event: 'queue-changed' }, () => { fetchApprovals(); })
      .subscribe();

    const poll = setInterval(fetchApprovals, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [fetchApprovals]);

  if (error) {
    return (
      <div style={{ fontFamily: 'sans-serif', color: '#f87171', padding: '8px', fontSize: '13px' }}>
        {error}
      </div>
    );
  }

  if (data.count === 0) {
    // Show nothing when there are no pending — keeps overlay invisible
    return null;
  }

  const displayItems = data.items.slice(0, limit);

  return (
    <div style={{
      fontFamily: "'Segoe UI', sans-serif",
      display: 'inline-flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: '220px',
      maxWidth: '320px',
    }}>
      {/* Header count badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(30,20,40,0.88)',
        borderRadius: '10px',
        padding: '6px 12px',
        border: '1px solid rgba(168,85,247,0.5)',
        backdropFilter: 'blur(6px)',
      }}>
        {/* Bell icon */}
        <svg width="16" height="16" fill="none" stroke="#c084fc" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '14px' }}>
          {data.count} Pending
        </span>
      </div>

      {/* Item list */}
      {displayItems.map((item, i) => (
        <div key={item.id ?? i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(20,15,30,0.82)',
          borderRadius: '8px',
          padding: '5px 10px',
          border: item.restricted
            ? '1px solid rgba(220,60,40,0.45)'
            : '1px solid rgba(100,80,140,0.4)',
          backdropFilter: 'blur(4px)',
        }}>
          {item.pokemon_img && (
            <img
              src={item.pokemon_img}
              alt={item.pokemon_name}
              style={{ width: 32, height: 32, objectFit: 'contain', imageRendering: 'pixelated' }}
            />
          )}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{
              color: '#f1f5f9',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {item.pokemon_name}
            </div>
            {showNames && (
              <div style={{
                color: '#94a3b8',
                fontSize: '11px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.display_name}
              </div>
            )}
          </div>
          {item.restricted && (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#f87171',
              background: 'rgba(220,60,40,0.2)',
              borderRadius: '4px',
              padding: '1px 5px',
              border: '1px solid rgba(220,60,40,0.4)',
              flexShrink: 0,
            }}>
              R
            </span>
          )}
        </div>
      ))}

      {data.count > limit && (
        <div style={{
          color: '#94a3b8',
          fontSize: '11px',
          textAlign: 'center',
          padding: '2px 0',
        }}>
          +{data.count - limit} more
        </div>
      )}
    </div>
  );
};

export default OverlayApprovals;
