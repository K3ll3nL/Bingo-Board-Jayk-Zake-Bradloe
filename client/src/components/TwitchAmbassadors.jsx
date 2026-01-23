import React, { useState, useEffect } from 'react';

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

  if (loading || ambassadors.length === 0) {
    return null;
  }

  return (
    <div className="w-full" style={{ backgroundColor: '#212326' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin' }}>
          {ambassadors.map((ambassador) => (
            <a
              key={ambassador.id}
              href={ambassador.twitch_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 group"
            >
              <div className="relative">
                {/* Profile Picture with Border */}
                <div
                  className="w-20 h-20 rounded-full overflow-hidden"
                  style={{
                    border: `3px solid ${ambassador.is_live ? ambassador.brand_color || '#9147ff' : '#808080'}`,
                    padding: '2px',
                    backgroundColor: '#212326'
                  }}
                >
                  <img
                    src={ambassador.profile_image_url}
                    alt={ambassador.display_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                
                {/* Live Indicator */}
                {ambassador.is_live && (
                  <div
                    className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded text-xs font-bold text-white"
                    style={{ backgroundColor: ambassador.brand_color || '#9147ff' }}
                  >
                    LIVE
                  </div>
                )}
              </div>
              
              {/* Username */}
              <div className="mt-2 text-center">
                <div className="text-sm text-white font-medium group-hover:text-purple-400 transition-colors">
                  {ambassador.display_name}
                </div>
                {ambassador.is_live && ambassador.viewer_count !== undefined && (
                  <div className="text-xs text-gray-400">
                    {ambassador.viewer_count.toLocaleString()} viewers
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TwitchAmbassadors;