import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import PageBackground from './PageBackground';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

const PERIODS = [
  { value: 'monthly', label: 'This Month' },
  { value: 'season',  label: 'This Season' },
  { value: 'year',    label: 'This Year' },
  { value: 'alltime', label: 'All Time' },
];
const LIMITS = [5, 10, 20, 25];

// ── Small reusable "copy URL" button ────────────────────────────────────────
const CopyButton = ({ text, label = 'Copy URL' }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{ backgroundColor: copied ? '#166534' : '#5865F2', color: '#fff' }}
    >
      {copied ? (
        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Copied!</>
      ) : (
        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>{label}</>
      )}
    </button>
  );
};

// ── Warning banner used in two places ───────────────────────────────────────
const KeyWarning = ({ children }) => (
  <div className="flex gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
    <span>{children}</span>
  </div>
);

// ── URL display row ──────────────────────────────────────────────────────────
const UrlRow = ({ label, url }) => (
  <div className="space-y-1.5">
    <div className="text-xs text-gray-400 font-medium">{label}</div>
    <div className="flex items-center gap-2">
      <code
        className="flex-1 text-xs rounded px-3 py-2 truncate"
        style={{ backgroundColor: '#161819', color: '#a78bfa', border: '1px solid #374151' }}
      >
        {url}
      </code>
      <CopyButton text={url} />
    </div>
  </div>
);

// ── Key generation modal ─────────────────────────────────────────────────────
const NewKeyModal = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { key, id, name, key_prefix }
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const origin = window.location.origin;

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a name for this key.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create key.'); return; }
      setResult(data);
      onCreated(data);
    } catch {
      setError('Failed to create key.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ backgroundColor: '#2a2d31', border: '1px solid #374151' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #374151' }}>
          <h2 className="text-lg font-bold text-white">
            {result ? '🔑 Save Your API Key' : 'Generate API Key'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!result ? (
            /* ── Step 1: Name the key ── */
            <>
              <p className="text-sm text-gray-400">
                Give this key a name so you can identify it later (e.g. "Home PC", "Stream Laptop").
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Key name</label>
                <input
                  ref={inputRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  maxLength={50}
                  placeholder="e.g. Home PC OBS"
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
                  style={{ backgroundColor: '#161819', border: '1px solid #374151' }}
                />
                {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
              </div>
              <KeyWarning>
                If you're not sure which overlay URLs you'll need, use the most restrictive option
                (Template mode for the board, shortest row count for the leaderboard). You can always
                delete this key and generate a new one.
              </KeyWarning>
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: submitting ? '#4b5563' : '#7c3aed' }}
                >
                  {submitting ? 'Generating…' : 'Generate Key'}
                </button>
              </div>
            </>
          ) : (
            /* ── Step 2: Show the key and ready-to-use URLs ── */
            <>
              <div className="p-3 rounded-lg" style={{ backgroundColor: '#161819', border: '1px solid #dc2626' }}>
                <p className="text-xs font-bold text-red-400 mb-2 uppercase tracking-wider">⚠ Save this key now — it will never be shown again</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono break-all" style={{ color: '#a78bfa' }}>{result.key}</code>
                  <CopyButton text={result.key} label="Copy Key" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-300">Ready-to-use overlay URLs:</p>
                <UrlRow label="Board — Live (shows your completion)" url={`${origin}/overlay/board?key=${result.key}&mode=live`} />
                <UrlRow label="Board — Template (layout only, no completion)" url={`${origin}/overlay/board?key=${result.key}&mode=template`} />
                <UrlRow label="Leaderboard — This Month, Top 10" url={`${origin}/overlay/leaderboard?key=${result.key}&period=monthly&limit=10`} />
              </div>

              <KeyWarning>
                These URLs contain your API key. Anyone with the URL can view your bingo board or the
                leaderboard. Never share them publicly or show them on stream.
              </KeyWarning>

              <div className="flex justify-end pt-1">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: '#374151' }}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Pro page ────────────────────────────────────────────────────────────
const Pro = () => {
  const { user, isPro } = useAuth();
  const navigate = useNavigate();

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // URL builder state
  const [boardMode, setBoardMode] = useState('live');
  const [lbPeriod, setLbPeriod] = useState('monthly');
  const [lbLimit, setLbLimit] = useState(10);

  const origin = window.location.origin;

  useEffect(() => {
    if (!user) return;
    loadKeys();
  }, [user]);

  // Redirect non-pro users
  useEffect(() => {
    if (!loading && !isPro) navigate('/');
  }, [loading, isPro]);

  const loadKeys = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/keys`, { headers });
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleKeyCreated = (newKey) => {
    // Add to list (without the secret key value)
    setKeys(prev => [{ id: newKey.id, name: newKey.name, key_prefix: newKey.key_prefix, created_at: newKey.created_at, last_used_at: null }, ...prev]);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this API key? Any overlay URLs using it will immediately stop working.')) return;
    setDeletingId(id);
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE_URL}/keys/${id}`, { method: 'DELETE', headers });
      setKeys(prev => prev.filter(k => k.id !== id));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  };

  const formatDate = (ts) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const boardTemplateUrl = `${origin}/overlay/board?key=<your-saved-key>&mode=${boardMode}`;
  const lbTemplateUrl = `${origin}/overlay/leaderboard?key=<your-saved-key>&period=${lbPeriod}&limit=${lbLimit}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#212326' }}>
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />

      {/* Header */}
      <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Stream Overlays</h1>
            <p className="text-xs text-gray-400">Manage API keys and browser source URLs</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Global warning */}
        <div className="flex gap-3 p-4 rounded-xl" style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)' }}>
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-red-300">
            <strong>Keep your overlay URLs private.</strong> Each URL embeds your API key, which grants
            read-only access to your bingo board and the leaderboard. Never display them on stream,
            share them in public chats, or commit them to source control. If a key is compromised,
            delete it here and generate a new one — old URLs will immediately stop working.
          </div>
        </div>

        {/* ── API Keys ── */}
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
          <div className="h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">API Keys</h2>
                <p className="text-xs text-gray-400 mt-0.5">Up to 5 keys. Keys are shown once at generation.</p>
              </div>
              {keys.length < 5 && (
                <button
                  onClick={() => setShowNewKeyModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: '#7c3aed' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Key
                </button>
              )}
            </div>

            {keys.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No keys yet. Generate one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span>Name</span>
                  <span>Prefix</span>
                  <span>Created</span>
                  <span>Last Used</span>
                </div>
                {keys.map(k => (
                  <div
                    key={k.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-3 py-3 rounded-lg"
                    style={{ backgroundColor: '#2a2d31' }}
                  >
                    <span className="text-sm font-medium text-white truncate">{k.name}</span>
                    <code className="text-xs font-mono" style={{ color: '#a78bfa' }}>{k.key_prefix}…</code>
                    <span className="text-xs text-gray-400">{formatDate(k.created_at)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{k.last_used_at ? formatDate(k.last_used_at) : 'Never'}</span>
                      <button
                        onClick={() => handleDelete(k.id)}
                        disabled={deletingId === k.id}
                        className="ml-2 text-gray-600 hover:text-red-400 transition-colors"
                        title="Delete key"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Board Overlay Builder ── */}
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
          <div className="h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />
          <div className="px-6 py-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Board Overlay</h2>
              <p className="text-xs text-gray-400 mt-0.5">Scales to any browser source size — set it to whatever fits your layout.</p>
            </div>

            {/* Mode toggle */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mode</label>
              <div className="flex gap-2">
                {[{ v: 'live', l: 'Live', d: 'Your real completion state, updates automatically' },
                  { v: 'template', l: 'Template', d: 'Board layout only, no personal data' }].map(({ v, l, d }) => (
                  <button
                    key={v}
                    onClick={() => setBoardMode(v)}
                    className="flex-1 px-4 py-3 rounded-lg text-left transition-all"
                    style={{
                      backgroundColor: boardMode === v ? 'rgba(124,58,237,0.2)' : '#2a2d31',
                      border: `1.5px solid ${boardMode === v ? '#7c3aed' : '#374151'}`,
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: boardMode === v ? '#a78bfa' : '#d1d5db' }}>{l}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{d}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <UrlRow label="Generated URL template" url={boardTemplateUrl} />
              <p className="text-xs text-gray-500">
                Replace <code className="text-purple-400 text-xs">&lt;your-saved-key&gt;</code> with the full key you copied when generating it.
                {keys.length === 0 && ' Generate a key above first.'}
              </p>
            </div>

            <KeyWarning>
              If you're unsure which mode to use, choose <strong>Template</strong> — it shares no personal completion data.
              This URL contains your API key. Do not display it on stream or share it publicly.
            </KeyWarning>
          </div>
        </section>

        {/* ── Leaderboard Overlay Builder ── */}
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
          <div className="h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />
          <div className="px-6 py-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Leaderboard Overlay</h2>
              <p className="text-xs text-gray-400 mt-0.5">Scales to any browser source size — taller layouts fit more rows cleanly.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Period */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Period</label>
                <select
                  value={lbPeriod}
                  onChange={e => setLbPeriod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-purple-500"
                  style={{ backgroundColor: '#2a2d31', border: '1px solid #374151' }}
                >
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* Rows */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Rows shown</label>
                <select
                  value={lbLimit}
                  onChange={e => setLbLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-purple-500"
                  style={{ backgroundColor: '#2a2d31', border: '1px solid #374151' }}
                >
                  {LIMITS.map(l => <option key={l} value={l}>Top {l}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <UrlRow label="Generated URL template" url={lbTemplateUrl} />
              <p className="text-xs text-gray-500">
                Replace <code className="text-purple-400 text-xs">&lt;your-saved-key&gt;</code> with the full key you copied when generating it.
                {keys.length === 0 && ' Generate a key above first.'}
              </p>
            </div>

            <KeyWarning>
              If you're unsure how many rows to show, choose <strong>Top 10</strong> — it's the most readable on stream.
              This URL contains your API key. Do not display it on stream or share it publicly.
            </KeyWarning>
          </div>
        </section>

      </div>

      {/* New key modal */}
      {showNewKeyModal && (
        <NewKeyModal
          onClose={() => setShowNewKeyModal(false)}
          onCreated={handleKeyCreated}
        />
      )}
    </div>
  );
};

export default Pro;
