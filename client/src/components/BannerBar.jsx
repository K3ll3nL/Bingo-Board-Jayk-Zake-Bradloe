import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, getAuthHeaders } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY = 'dismissed_banners';

const getDismissed = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

const Banner = ({ banner, onDismiss }) => {
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = () => {
    setDismissing(true);
    setTimeout(() => onDismiss(banner.id), 300);
  };

  return (
    <div
      className="relative overflow-hidden rounded-xl flex items-center gap-3.5 px-4 py-3 transition-all duration-300"
      style={{
        background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: '3px solid #9147ff',
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? 'translateY(-4px)' : 'translateY(0)',
        maxHeight: dismissing ? 0 : 200,
        marginBottom: dismissing ? 0 : undefined,
        paddingTop: dismissing ? 0 : undefined,
        paddingBottom: dismissing ? 0 : undefined,
      }}
    >
      {/* Subtle purple glow on left */}
      <div className="absolute left-0 top-0 bottom-0 w-24 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(147,51,234,0.08) 0%, transparent 100%)' }} />

      {/* Optional image */}
      {banner.image_url && (
        <img src={banner.image_url} alt="" draggable={false}
          className="w-9 h-9 rounded-lg object-contain flex-shrink-0 relative z-10"
          style={{ background: 'rgba(255,255,255,0.04)' }} />
      )}

      {/* Icon if no image */}
      {!banner.image_url && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative z-10"
          style={{ background: 'rgba(147,51,234,0.15)', border: '1px solid rgba(147,51,234,0.3)' }}>
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
      )}

      {/* Message */}
      <p className="flex-1 text-sm text-gray-200 leading-snug relative z-10">
        {banner.message}
        {banner.link_url && (
          <>
            {' '}
            {banner.link_url.startsWith('/') ? (
              // In-app destination — route without a full page reload.
              <Link to={banner.link_url}
                className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors font-medium">
                {banner.link_label || 'Learn more'}
              </Link>
            ) : (
              <a href={banner.link_url}
                className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors font-medium">
                {banner.link_label || 'Learn more'}
              </a>
            )}
          </>
        )}
      </p>

      {/* Dismiss */}
      <button onClick={handleDismiss} aria-label="Dismiss"
        className="flex-shrink-0 relative z-10 w-6 h-6 flex items-center justify-center rounded-full transition-all hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.3)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// A banner row may declare a `condition` — a per-viewer visibility rule on top of
// its starts_at/expires_at window (NULL = always show, the original behavior).
// The rules live here rather than in the API because they depend on who is
// looking. Adding one = a resolver here + an entry in BANNER_CONDITIONS in
// api/routes/banners.js; no migration needed.
const CONDITION_RESOLVERS = {
  // Show only to a signed-in user who has not ranked every mon in this month's pool.
  tier_list_incomplete: async (user) => {
    if (!user) return false;
    const data = await api.getTierList();
    const poolSize = (data.pool || []).length;
    if (!poolSize) return false;
    const ranked = Object.keys(data.viewer_submission?.tiers || {}).length;
    return ranked < poolSize;
  },
};

const BannerBar = () => {
  const { user } = useAuth();
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(getDismissed);
  // conditionName -> true/false. A condition stays hidden until it resolves.
  const [conditions, setConditions] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/banners', { headers });
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setBanners(data);
      } catch { /* banners are non-critical — fail silently */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolve each distinct condition once, only when a live banner actually uses it.
  useEffect(() => {
    let cancelled = false;
    const needed = [...new Set(banners.map(b => b.condition).filter(Boolean))];
    needed.forEach(async (name) => {
      const resolver = CONDITION_RESOLVERS[name];
      // Unknown condition (client older than the row) → stay hidden.
      if (!resolver) return;
      try {
        const show = await resolver(user);
        if (!cancelled) setConditions(prev => ({ ...prev, [name]: show }));
      } catch { /* leave unresolved → hidden */ }
    });
    return () => { cancelled = true; };
  }, [banners, user]);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setDismissed(next);
  };

  const visible = banners.filter(b =>
    !dismissed.includes(b.id) && (!b.condition || conditions[b.condition] === true)
  );
  if (!visible.length) return null;

  return (
    // No bottom margin: <main> owns the 24px rhythm via space-y-6. An mb-4 here
    // stacked on top of it and pushed the banner 40px off the board.
    <div className="space-y-2">
      {visible.map(banner => (
        <Banner key={banner.id} banner={banner} onDismiss={dismiss} />
      ))}
    </div>
  );
};

export default BannerBar;
