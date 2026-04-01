import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'dismissed_banners';

const getDismissed = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

const BannerBar = () => {
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(getDismissed);

  useEffect(() => {
    fetch('/api/banners')
      .then(r => r.json())
      .then(data => Array.isArray(data) && setBanners(data))
      .catch(() => {});
  }, []);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setDismissed(next);
  };

  const visible = banners.filter(b => !dismissed.includes(b.id));
  if (!visible.length) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map(banner => (
        <div
          key={banner.id}
          className="rounded-lg p-4 flex items-center gap-3"
          style={{ backgroundColor: '#35373b', borderColor: '#5865F2', borderWidth: '1px' }}
        >
          {banner.image_url && (
            <img
              src={banner.image_url}
              alt=""
              className="w-10 h-10 object-contain flex-shrink-0 rounded"
            />
          )}
          <p className="text-blue-300 text-sm flex-1">
            {banner.message}
            {banner.link_url && (
              <>
                {' '}
                <a
                  href={banner.link_url}
                  className="underline hover:text-blue-200 transition-colors"
                >
                  {banner.link_label || 'Learn more'}
                </a>
              </>
            )}
          </p>
          <button
            onClick={() => dismiss(banner.id)}
            className="flex-shrink-0 text-gray-400 hover:text-white transition-colors p-1 rounded"
            aria-label="Dismiss banner"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

export default BannerBar;
