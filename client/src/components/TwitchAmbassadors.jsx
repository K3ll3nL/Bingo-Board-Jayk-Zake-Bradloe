import React, { useState, useEffect } from 'react';
import { SURFACE, TEXT, BRAND } from '../constants/theme';

// This component is only ever rendered inside HomePage's <main>, which already
// supplies `max-w-7xl mx-auto px-4`. It used to re-declare that container (plus
// a redundant page background), which double-applied px-4 and pushed the whole
// block 16px right of every card above it. Both containers are gone — vertical
// spacing is the parent's job too (LAYOUT_AUDIT priorities 2 and 3).

const TwitchAmbassadors = () => {
  const [ambassadors, setAmbassadors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAmbassadors();
    // Refresh every 5 minutes
    const interval = setInterval(loadAmbassadors, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadAmbassadors = async () => {
    try {
      const response = await fetch('/api/ambassadors');
      if (!response.ok) throw new Error('Failed to fetch ambassadors');
      const data = await response.json();
      setAmbassadors(data);
    } catch (err) {
      console.error('Failed to load ambassadors:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="min-w-0 animate-pulse">
        <div className="h-4 bg-gray-700/60 rounded mb-4" style={{ width: 220 }} />
        <div className="flex pb-4 overflow-hidden" style={{ gap: '10.9px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center" style={{ width: 110 }}>
              <div className="w-20 h-20 rounded-full bg-gray-700/50" />
              <div className="h-5 rounded bg-gray-700/40 mt-2" style={{ width: 70 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (ambassadors.length === 0) {
    return null;
  }

  return (
    <section className="min-w-0">
      {/* A section label, not a page headline — this is the least important block
          on the page and used to own its largest heading (LAYOUT_AUDIT 4a). */}
      <h2 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">Check out these streamers!</h2>

      <div className="flex overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin', gap: '10.9px' }}>
        {ambassadors.map((ambassador) => (
          <a
            key={ambassador.id}
            href={ambassador.twitch_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 group flex flex-col items-center"
            style={{ width: '110px' }}
          >
            <div className="relative">
              {/* Profile Picture with Border */}
              <div
                className="w-20 h-20 rounded-full overflow-hidden"
                style={{
                  border: `3px solid ${ambassador.is_live ? ambassador.brand_color || BRAND.twitch : TEXT.faint}`,
                  padding: '2px',
                  backgroundColor: SURFACE.page
                }}
              >
                <img
                  src={ambassador.profile_image_url}
                  alt={ambassador.display_name}
                  draggable={false}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>

              {/* Live Indicator — brand colour as a FILL, label in text-strong (§2.6) */}
              {ambassador.is_live && (
                <div
                  className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded text-xs font-bold text-white"
                  style={{ backgroundColor: ambassador.brand_color || BRAND.twitch }}
                >
                  LIVE
                </div>
              )}
            </div>

            {/* Username — Twitch-tinted TEXT must be `twitch-text` (#a98ff3), not
                the 3.48:1 brand fill (§2.6 / §5.2). */}
            <div className="mt-2 w-full min-w-0 text-center">
              {/* w-full + truncate: `items-center` on the column sizes children to
                  their content, so a long display name (21+ chars) overflowed the
                  fixed 110px track and painted over its neighbours. */}
              <div
                className="text-sm text-white font-medium truncate group-hover:text-twitch-text transition-colors"
                title={ambassador.display_name}
              >
                {ambassador.display_name}
              </div>
              {ambassador.is_live && ambassador.viewer_count !== undefined && (
                <div className="text-xs text-muted">
                  {ambassador.viewer_count.toLocaleString()} viewers
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default TwitchAmbassadors;
