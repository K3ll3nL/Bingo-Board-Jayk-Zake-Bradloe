import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../services/api';

const C = {
  bg:     'linear-gradient(160deg, #13151a 0%, #181a21 100%)',
  card:   'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)',
  input:  '#0d0f14',
  border: 'rgba(255,255,255,0.07)',
  borderSubt: 'rgba(255,255,255,0.04)',
};

const toLocalDatetimeValue = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultStartsAt = () => {
  const d = new Date(); d.setSeconds(0, 0);
  return toLocalDatetimeValue(d.toISOString());
};
const defaultExpiresAt = () => {
  const d = new Date(); d.setDate(d.getDate() + 5); d.setSeconds(0, 0);
  return toLocalDatetimeValue(d.toISOString());
};

const EMPTY_FORM = {
  message: '', link_url: '', link_label: '', image_url: '',
  starts_at: defaultStartsAt(), expires_at: defaultExpiresAt(),
};

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 border focus:border-purple-500 focus:outline-none transition-colors';
const inputStyle = { background: C.input, borderColor: C.border, colorScheme: 'dark' };

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const BannerManagerModal = ({ isOpen, onClose }) => {
  const [banners,    setBanners]    = useState([]);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const fetchBanners = async () => {
    try {
      const headers = await getAuthHeaders();
      const res  = await fetch('/api/banners', { headers });
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
    if (!form.starts_at)      { setError('Start time is required'); return; }
    if (!form.expires_at)     { setError('End time is required'); return; }
    if (new Date(form.expires_at) <= new Date(form.starts_at)) {
      setError('End time must be after start time'); return;
    }
    setSubmitting(true); setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/banners', {
        method: 'POST', headers,
        body: JSON.stringify({
          message:    form.message.trim(),
          link_url:   form.link_url.trim()   || null,
          link_label: form.link_label.trim() || null,
          image_url:  form.image_url.trim()  || null,
          starts_at:  new Date(form.starts_at).toISOString(),
          expires_at: new Date(form.expires_at).toISOString(),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        style={{ background: C.bg, border: `1px solid ${C.border}` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(147,51,234,0.15)', border: '1px solid rgba(147,51,234,0.3)' }}>
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <h2 className="text-white font-semibold">Manage Banners</h2>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/[0.08]"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Create form */}
          <form onSubmit={handleCreate} className="rounded-xl border overflow-hidden"
            style={{ borderColor: C.border }}>
            <div className="px-4 py-2.5 border-b"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: C.border }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">New Banner</p>
            </div>
            <div className="p-4 space-y-3.5" style={{ background: C.card }}>

              {error && (
                <div className="rounded-lg px-3 py-2.5 text-sm text-red-300 border"
                  style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }}>
                  {error}
                </div>
              )}

              <Field label="Message" required>
                <textarea value={form.message} rows={2}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  placeholder="Text shown to all users on the home page"
                  className={`${inputCls} resize-none`} style={inputStyle} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Link URL">
                  <input type="url" value={form.link_url}
                    onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                    placeholder="/about#restricted"
                    className={inputCls} style={inputStyle} />
                </Field>
                <Field label="Link Label">
                  <input type="text" value={form.link_label}
                    onChange={e => setForm(f => ({ ...f, link_label: e.target.value }))}
                    placeholder="Learn more"
                    className={inputCls} style={inputStyle} />
                </Field>
              </div>

              <Field label="Image URL">
                <input type="url" value={form.image_url}
                  onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://... (optional icon shown left of message)"
                  className={inputCls} style={inputStyle} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts at" required>
                  <input type="datetime-local" value={form.starts_at}
                    onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </Field>
                <Field label="Ends at" required>
                  <input type="datetime-local" value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                </Field>
              </div>

              <p className="text-[11px] text-gray-600">Times are in your local timezone.</p>

              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: submitting ? 'rgba(147,51,234,0.4)' : 'rgba(147,51,234,0.8)' }}
                onMouseEnter={e => { if (!submitting) e.currentTarget.style.background = 'rgba(147,51,234,1)'; }}
                onMouseLeave={e => { if (!submitting) e.currentTarget.style.background = 'rgba(147,51,234,0.8)'; }}>
                {submitting ? 'Creating…' : 'Create Banner'}
              </button>
            </div>
          </form>

          {/* Active banners list */}
          {banners.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
              <div className="px-4 py-2.5 border-b"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: C.border }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Active & Scheduled — {banners.length}
                </p>
              </div>
              <div className="divide-y" style={{ background: C.card, borderColor: C.borderSubt }}>
                {banners.map(banner => (
                  <div key={banner.id} className="flex items-start gap-3 px-4 py-3">
                    {banner.image_url && (
                      <img src={banner.image_url} alt=""
                        className="w-8 h-8 rounded-lg object-contain flex-shrink-0 mt-0.5"
                        style={{ background: 'rgba(255,255,255,0.04)' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 break-words leading-snug">{banner.message}</p>
                      {banner.link_url && (
                        <p className="text-xs text-purple-400 mt-0.5 truncate">{banner.link_label || banner.link_url}</p>
                      )}
                      <p className="text-[11px] text-gray-600 mt-1">
                        {new Date(banner.starts_at).toLocaleString()} → {new Date(banner.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <button onClick={() => handleDelete(banner.id)} aria-label="Delete banner"
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors mt-0.5"
                      style={{ color: 'rgba(255,255,255,0.25)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'transparent'; }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {banners.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-3">No active or scheduled banners.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BannerManagerModal;
