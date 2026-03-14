import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, supabase } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';

const TOAST_DURATION = 5000;

const BINGO_TYPE_LABELS = {
  row: 'Row Bingo',
  column: 'Column Bingo',
  x: 'Diagonal Bingo',
  blackout: 'Blackout Bingo',
};

const getBingoIcon = (bingoType, style = {}) => {
  const base = { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', ...style };
  switch (bingoType) {
    case 'row':
      return (
        <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" /></svg>
      );
    case 'column':
      return (
        <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" /></svg>
      );
    case 'x':
      return (
        <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      );
    case 'blackout':
      return (
        <svg {...base} strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
          <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
        </svg>
      );
    default:
      return (
        <svg {...base} fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
  }
};

const STATUS_CONFIG = {
  approved: {
    borderColor: '#22c55e',
    bgColor: '#071a0e',
    badgeBg: '#14532d',
    badgeText: '#86efac',
    label: 'Approved!',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  rejected: {
    borderColor: '#ef4444',
    bgColor: '#1a0707',
    badgeBg: '#450a0a',
    badgeText: '#fca5a5',
    label: 'Rejected',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  achievement: {
    borderColor: '#5865F2',
    bgColor: '#0c0e1f',
    badgeBg: '#1e2157',
    badgeText: '#a5b4fc',
    label: 'Achievement!',
    icon: null, // rendered dynamically from bingo_type
  },
};

const DEFAULT_CONFIG = {
  borderColor: '#5865F2',
  bgColor: '#0c0e1f',
  badgeBg: '#1e2157',
  badgeText: '#a5b4fc',
  label: 'Notification',
  icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};

const Toast = ({ notification, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const isAchievement = notification.status === 'award' || !!notification.achievement;
  const config = isAchievement
    ? STATUS_CONFIG.achievement
    : (STATUS_CONFIG[notification.status] || DEFAULT_CONFIG);

  useEffect(() => {
    // Trigger slide-in on next frame
    const frame = requestAnimationFrame(() => setVisible(true));

    // Progress bar countdown
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION) * 100);
      setProgress(remaining);
    }, 50);

    // Auto-dismiss
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 350);
    }, TOAST_DURATION);

    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 350);
  };

  const bingoType = notification.achievement?.bingo_type;
  const spriteUrl = notification.pokemon?.img_url
    || (notification.pokemon?.national_dex_id
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${notification.pokemon.national_dex_id}.png`
      : null);

  return (
    <div
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(calc(100% + 1.5rem))',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease',
        backgroundColor: config.bgColor,
        borderLeft: `4px solid ${config.borderColor}`,
        width: '300px',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        pointerEvents: 'all',
      }}
    >
      {/* Main content */}
      <div className="flex items-start gap-3 p-3">
        {/* Left icon: bingo type badge for achievements, pokemon sprite otherwise */}
        {isAchievement ? (
          <div style={{
            width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0,
            backgroundColor: config.badgeBg, border: `2px solid ${config.borderColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: config.badgeText,
          }}>
            {getBingoIcon(bingoType, { width: 28, height: 28 })}
          </div>
        ) : spriteUrl ? (
          <img
            src={spriteUrl}
            alt={notification.pokemon?.name || ''}
            style={{ width: '48px', height: '48px', imageRendering: 'pixelated', flexShrink: 0 }}
          />
        ) : null}

        {/* Text */}
        <div className="flex-1 min-w-0">
          {/* Badge */}
          <div className="flex items-center gap-1.5 mb-1">
            <span
              style={{
                backgroundColor: config.badgeBg,
                color: config.badgeText,
                fontSize: '11px',
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span style={{ color: config.badgeText, display: 'flex', alignItems: 'center' }}>
                {isAchievement
                  ? getBingoIcon(bingoType, { width: 12, height: 12 })
                  : config.icon}
              </span>
              {config.label}
            </span>
          </div>

          {/* Title */}
          {isAchievement ? (
            <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '14px', margin: 0, lineHeight: 1.3 }}>
              {notification.achievement?.bingo_type
                ? `You were awarded the first ${BINGO_TYPE_LABELS[notification.achievement.bingo_type] || notification.achievement.bingo_type}! Congrats!`
                : 'You earned an achievement! Congrats!'}
            </p>
          ) : (
            <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '14px', margin: 0, lineHeight: 1.3 }}>
              {notification.pokemon?.name
                ? `Your ${notification.pokemon.name} submission was ${notification.status}.`
                : `Your submission was ${notification.status}.`}
            </p>
          )}

          {/* Rejection reason */}
          {notification.status === 'rejected' && notification.message && (
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0', lineHeight: 1.4 }}>
              Reason: {notification.message}
            </p>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            padding: '2px',
            flexShrink: 0,
            lineHeight: 1,
          }}
          aria-label="Dismiss"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: '2px', backgroundColor: 'rgba(255,255,255,0.08)' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: config.borderColor,
            transition: 'width 0.05s linear',
          }}
        />
      </div>
    </div>
  );
};

const NotificationToast = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);

  const markNotified = useCallback(async (id) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/notifications/${id}/notified`, {
        method: 'PATCH',
        headers,
      });
    } catch (err) {
      console.error('Failed to mark notification as notified:', err);
    }
  }, []);

  const enqueue = useCallback((items) => {
    setQueue(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const fresh = items.filter(n => !existingIds.has(n.id));
      return [...prev, ...fresh];
    });
  }, []);

  const dismiss = useCallback((id) => {
    setQueue(prev => prev.filter(n => n.id !== id));
    markNotified(id);
  }, [markNotified]);

  // Fetch any unnotified notifications already in DB on mount (via API — works in dev too)
  useEffect(() => {
    if (!user?.id) return;

    const fetchUnnotified = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/notifications?unread=true', { headers });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.length) enqueue(data);
      } catch (err) {
        console.error('Failed to fetch unread notifications:', err);
      }
    };

    fetchUnnotified();
  }, [user?.id, enqueue]);

  // Subscribe to new notifications via postgres_changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          let notification = payload.new;

          // Fetch pokemon details if needed
          if (notification.pokemon_id) {
            const { data: pokemon } = await supabase
              .from('pokemon_master')
              .select('name, img_url, national_dex_id')
              .eq('id', notification.pokemon_id)
              .single();
            notification = { ...notification, pokemon };
          }

          // Fetch achievement details if needed
          if (notification.award) {
            const { data: achievement } = await supabase
              .from('bingo_achievements')
              .select('id, bingo_type')
              .eq('id', notification.award)
              .single();
            notification = { ...notification, achievement };
          }

          enqueue([notification]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id, enqueue]);

  if (!user || queue.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {queue.slice(0, 4).map(notification => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={() => dismiss(notification.id)}
        />
      ))}
    </div>
  );
};

export default NotificationToast;
