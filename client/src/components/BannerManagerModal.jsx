import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../services/api';

const toLocalDatetimeValue = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultStartsAt = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return toLocalDatetimeValue(d.toISOString());
};

const defaultExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  d.setSeconds(0, 0);
  return toLocalDatetimeValue(d.toISOString());
};

const EMPTY_FORM = {
  message: '',
  link_url: '',
  link_label: '',
  image_url: '',
  starts_at: defaultStartsAt(),
  expires_at: defaultExpiresAt(),
};

const BannerManagerModal = ({ isOpen, onClose }) => {
  const [banners, setBanners] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const fetchBanners = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/banners', { headers });
      const data = await res.json();
      if (Array.isArray(data)) setBanners(data);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBanners();
      setForm({ ...EMPTY_FORM, starts_at: defaultStartsAt(), expires_at: defaultExpiresAt() });
      setError(null);
    }
  }, [isOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) { setError('Message is required'); return; }
    if (!form.starts_at) { setError('Start time is required'); return; }
    if (!form.expires_at) { setError('End time is required'); return; }
    if (new Date(form.expires_at) <= new Date(form.starts_at)) {
      setError('End time must be after start time');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/banners', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: form.message.trim(),
          link_url: form.link_url.trim() || null,
          link_label: form.link_label.trim() || null,
          image_url: form.image_url.trim() || null,
          starts_at: new Date(form.starts_at).toISOString(),
          expires_at: new Date(form.expires_at).toISOString(),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create banner');
      }
      setForm({ ...EMPTY_FORM, starts_at: defaultStartsAt(), expires_at: defaultExpiresAt() });
      await fetchBanners();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/banners/${id}`, { method: 'DELETE', headers });
      setBanners(prev => prev.filter(b => b.id !== id));
    } catch { /* silent */ }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-xl border border-gray-600 shadow-2xl flex flex-col max-h-[90vh]" style={{ backgroundColor: '#2b2d31' }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-white font-semibold text-lg">Manage Banners</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">

          {/* Create form */}
          <form onSubmit={handleCreate} className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">New Banner</h3>

            {error && (
              <div className="p-2 bg-red-900 border border-red-700 rounded text-red-200 text-xs">{error}</div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1">Message <span className="text-red-400">*</span></label>
              <textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                rows={2}
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm resize-none"
                placeholder="Banner text shown to all users"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Link URL</label>
                <input
                  type="url"
                  value={form.link_url}
                  onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                  className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
                  placeholder="/about#restricted"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Link Label</label>
                <input
                  type="text"
                  value={form.link_label}
                  onChange={e => setForm(f => ({ ...f, link_label: e.target.value }))}
                  className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
                  placeholder="Learn more"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Image URL</label>
              <input
                type="url"
                value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Starts at <span className="text-red-400">*</span></label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Ends at <span className="text-red-400">*</span></label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500">Times are in your local timezone.</p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Banner'}
            </button>
          </form>

          {/* Existing banners */}
          {banners.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-2">Active & Scheduled</h3>
              <div className="space-y-2">
                {banners.map(banner => (
                  <div key={banner.id} className="rounded-lg p-3 border border-gray-700 flex items-start gap-3" style={{ backgroundColor: '#35373b' }}>
                    {banner.image_url && (
                      <img src={banner.image_url} alt="" className="w-8 h-8 object-contain flex-shrink-0 rounded mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 break-words">{banner.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(banner.starts_at).toLocaleString()} → {new Date(banner.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(banner.id)}
                      className="flex-shrink-0 text-gray-500 hover:text-red-400 transition-colors p-1 rounded"
                      aria-label="Delete banner"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {banners.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">No active or scheduled banners.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BannerManagerModal;
