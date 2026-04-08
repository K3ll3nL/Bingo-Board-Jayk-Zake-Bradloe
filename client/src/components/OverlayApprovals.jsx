import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import faviconImage from '/logo-16x16.png';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

// URL params:
//   ?key=pb_xxx      — moderator API key (required)
//   ?show_names=0    — hide submitter names (default: show)
//   ?duration=5      — seconds to stay visible (default 5, max 30)

const DURATION_DEFAULT = 5000;

const OverlayApprovals = () => {
  const params = new URLSearchParams(window.location.search);
  const apiKey = params.get('key');
  const showNames = params.get('show_names') !== '0';
  const duration = Math.min(30, Math.max(2, parseInt(params.get('duration'), 10) || 5)) * 1000;

  const [visible, setVisible] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [progress, setProgress] = useState(100);
  const dismissTimer = useRef(null);
  const progressInterval = useRef(null);

  // Clear all backgrounds set by index.css so OBS sees transparency
  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById('root')];
    els.forEach(el => { if (el) el.style.backgroundColor = 'transparent'; });
    return () => {
      els.forEach(el => { if (el) el.style.backgroundColor = ''; });
    };
  }, []);

  const showBanner = useCallback(async (testItem = null) => {
    let item = testItem;

    if (!item) {
      if (!apiKey) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/overlay/approvals?key=${encodeURIComponent(apiKey)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!json.count) return;
        item = json.items[json.items.length - 1];
      } catch {
        return;
      }
    }

    setSubmission(item);
    setVisible(true);
    setProgress(100);

    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (progressInterval.current) clearInterval(progressInterval.current);

    const start = Date.now();
    progressInterval.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100));
    }, 50);

    dismissTimer.current = setTimeout(() => {
      setVisible(false);
      clearInterval(progressInterval.current);
    }, duration);
  }, [apiKey, duration]);

  useEffect(() => {
    if (!apiKey) return;
    const channel = supabase
      .channel('approvals-updates')
      .on('broadcast', { event: 'queue-changed' }, (msg) => {
        showBanner(msg?.payload?.test ? msg.payload.item : null);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [showBanner, apiKey]);

  const accentColor = submission?.restricted ? '#ef4444' : '#a855f7';
  const bgColor     = submission?.restricted ? '#1a0707'  : '#0f0a1a';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      width: '480px',
      transform: visible ? 'translateY(0)' : 'translateY(-100%)',
      transition: 'transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)',
    }}>
      <div style={{
        margin: '12px 14px 0',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        borderLeft: `5px solid ${accentColor}`,
        backgroundColor: bgColor,
      }}>
        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 18px', position: 'relative' }}>

          {/* Pokemon sprite */}
          {submission?.pokemon_img && (
            <img
              src={submission.pokemon_img}
              alt={submission.pokemon_name}
              style={{ width: 96, height: 96, imageRendering: 'pixelated', flexShrink: 0 }}
            />
          )}

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badge pill */}
            <div style={{ marginBottom: '5px' }}>
              <span style={{
                backgroundColor: submission?.restricted ? '#450a0a' : '#3b0764',
                color: submission?.restricted ? '#fca5a5' : '#e9d5ff',
                fontSize: '12px',
                fontWeight: 600,
                padding: '2px 9px',
                borderRadius: '4px',
              }}>
                {submission?.restricted ? 'Restricted Submission' : 'New Submission'}
              </span>
            </div>

            {/* Pokemon name */}
            <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '18px', margin: 0, lineHeight: 1.2 }}>
              {submission?.pokemon_name ?? ''}
            </p>
            {/* Submitter — brighter to distinguish from game */}
            {showNames && submission?.display_name && (
              <p style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '14px', margin: '3px 0 0', lineHeight: 1.2 }}>
                {submission.display_name}
              </p>
            )}
            {/* Game — dimmer secondary info */}
            {submission?.game && (
              <p style={{ color: '#64748b', fontSize: '12px', margin: '2px 0 0', lineHeight: 1.2 }}>
                {submission.game}
              </p>
            )}
          </div>

          {/* Site branding — pinned bottom-right */}
          <div style={{
            position: 'absolute',
            bottom: '10px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            opacity: 0.45,
          }}>
            <img src={faviconImage} alt="" style={{ width: 14, height: 14 }} />
            <span style={{ color: '#a78bfa', fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Pokéboard
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: accentColor,
            transition: 'width 0.05s linear',
          }} />
        </div>
      </div>
    </div>
  );
};

export default OverlayApprovals;
