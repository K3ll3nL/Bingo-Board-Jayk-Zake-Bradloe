import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthHeaders } from '../services/api';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:3000/api' : '/api';

const PERIODS = [
  { value: 'monthly', label: 'This Month' },
  { value: 'season',  label: 'This Season' },
  { value: 'year',    label: 'This Year' },
  { value: 'alltime', label: 'All Time' },
];
const LIMITS = [5, 10, 20, 25];

// ── Copy button ──────────────────────────────────────────────────────────────
const CopyButton = ({ text, label = 'Copy URL', disabled = false }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    if (disabled || !text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

// ── URL display row ──────────────────────────────────────────────────────────
const UrlRow = ({ label, url, disabled }) => (
  <div className="space-y-1.5">
    <div className="text-xs text-gray-400 font-medium">{label}</div>
    <div className="flex items-center gap-2">
      <code
        className="flex-1 text-xs rounded px-3 py-2 truncate"
        style={{
          backgroundColor: '#161819',
          color: disabled ? '#4b5563' : '#a78bfa',
          border: `1px solid ${disabled ? '#1f2937' : '#374151'}`,
        }}
      >
        {url}
      </code>
      <CopyButton text={url} disabled={disabled} />
    </div>
  </div>
);

// ── Warning banner ───────────────────────────────────────────────────────────
const Warn = ({ children }) => (
  <div className="flex gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }}>
    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
    <span>{children}</span>
  </div>
);

// ── Main ─────────────────────────────────────────────────────────────────────
const Pro = () => {
  const { user, isPro, isModerator } = useAuth();
  const navigate = useNavigate();

  // undefined = loading, null = no key, object = has key
  const [keyInfo, setKeyInfo]       = useState(undefined);
  const [generating, setGenerating] = useState(false);
  const [regenConfirm, setRegenConfirm] = useState(false);

  const [boardMode, setBoardMode] = useState('live');
  const [lbPeriod, setLbPeriod]   = useState('monthly');
  const [lbLimit, setLbLimit]     = useState(10);
  const [lbPin, setLbPin]         = useState(true);
  const [aqLimit, setAqLimit]     = useState(5);
  const [aqNames, setAqNames]     = useState(true);
  const [testEventState, setTestEventState] = useState('idle'); // 'idle' | 'loading' | 'sent' | 'error'

  const origin   = window.location.origin;
  const keyValue = keyInfo?.key_value ?? null;
  const hasKey   = !!keyValue;

  const boardUrl = hasKey
    ? `${origin}/overlay/board?key=${keyValue}&mode=${boardMode}`
    : `${origin}/overlay/board?key=generate-your-key&mode=${boardMode}`;

  const lbUrl = hasKey
    ? `${origin}/overlay/leaderboard?key=${keyValue}&period=${lbPeriod}&limit=${lbLimit}${lbPin ? '' : '&pin=0'}`
    : `${origin}/overlay/leaderboard?key=generate-your-key&period=${lbPeriod}&limit=${lbLimit}${lbPin ? '' : '&pin=0'}`;

  const aqUrl = hasKey
    ? `${origin}/overlay/approvals?key=${keyValue}&limit=${aqLimit}${aqNames ? '' : '&show_names=0'}`
    : `${origin}/overlay/approvals?key=generate-your-key&limit=${aqLimit}${aqNames ? '' : '&show_names=0'}`;

  useEffect(() => { if (user) loadKey(); }, [user]);

  useEffect(() => {
    if (keyInfo !== undefined && !isPro) navigate('/');
  }, [keyInfo, isPro]);

  const loadKey = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/keys`, { headers });
      const data = res.ok ? await res.json() : null;
      if (data) {
        setKeyInfo(data);
      } else {
        // No key yet — generate one automatically
        const genRes = await fetch(`${API_BASE_URL}/keys`, { method: 'POST', headers });
        setKeyInfo(genRes.ok ? await genRes.json() : null);
      }
    } catch { setKeyInfo(null); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setRegenConfirm(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/keys`, { method: 'POST', headers });
      if (res.ok) setKeyInfo(await res.json());
    } catch { /* ignore */ }
    finally { setGenerating(false); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete your overlay key? Your existing browser source URLs will immediately stop working.')) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE_URL}/keys`, { method: 'DELETE', headers });
      setKeyInfo(null);
      setRegenConfirm(false);
    } catch { /* ignore */ }
  };

  const formatDate = (ts) =>
    ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

  if (keyInfo === undefined) {
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
      <PageHeader
        title="Stream Overlays"
        subtitle="Browser source URLs for OBS and other streaming software"
        badge="pro"
        onBack={() => navigate(-1)}
        maxWidth="3xl"
      />

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Privacy warning */}
        <div className="flex gap-3 p-4 rounded-xl" style={{ backgroundColor: 'rgba(220,38,38,0.5)', border: '1px solid rgba(220,38,38,0.3)' }}>
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-m text-red-300">
            <strong>Keep your overlay URLs private.</strong> They grant read-only access to your bingo board
            and the leaderboard. Never display them on stream or share screenshots of your OBS source list. 
            If a URL is exposed, click <strong>the regenerate message at the bottom of the page.</strong> Old 
            URLs will stop working immediately.
          </div>
        </div>

        {/* ── Regenerate (collapsed, bottom of page intent — shown here as a low-profile row) ── */}
        {regenConfirm && (
          <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-sm text-red-300">
              This will invalidate your current overlay URLs immediately. Any browser sources using them
              will go blank until you paste in the new URL.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ backgroundColor: '#dc2626' }}
              >
                {generating ? 'Regenerating…' : 'Yes, Regenerate'}
              </button>
              <button
                onClick={() => setRegenConfirm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Board Overlay ── */}
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
          <div className="h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />
          <div className="px-6 py-5 space-y-4">
            <div>
              <h2 className="text-base text-white">Board Overlay</h2>
              <p className="text-xs text-gray-400 mt-0.5">Scales to any browser source size.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Mode</label>
              <div className="flex gap-2">
                {[
                  { v: 'live',     l: 'Live',     d: 'Your real completion, updates automatically' },
                  { v: 'template', l: 'Template', d: 'Board layout only, no personal data' },
                ].map(({ v, l, d }) => (
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

            <UrlRow label="Browser source URL" url={boardUrl} disabled={!hasKey} />
            <Warn>
              If unsure which mode to use, choose <strong>Template</strong> — it shares no personal completion data.
              Do not display this URL on stream or share it publicly.
            </Warn>
          </div>
        </section>

        {/* ── Leaderboard Overlay ── */}
        <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
          <div className="h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-400" />
          <div className="px-6 py-5 space-y-4">
            <div>
              <h2 className="text-base text-white">Leaderboard Overlay</h2>
              <p className="text-xs text-gray-400 mt-0.5">Scales to any browser source size — taller layouts fit more rows.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            {/* Pin my rank toggle */}
            <button
              onClick={() => setLbPin(v => !v)}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-all"
              style={{
                backgroundColor: lbPin ? 'rgba(124,58,237,0.15)' : '#2a2d31',
                border: `1.5px solid ${lbPin ? '#7c3aed' : '#374151'}`,
              }}
            >
              <div
                className="w-9 h-5 rounded-full flex-shrink-0 relative transition-colors"
                style={{ backgroundColor: lbPin ? '#7c3aed' : '#374151' }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: lbPin ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </div>
              <div>
                <div className="text-sm font-semibold" style={{ color: lbPin ? '#a78bfa' : '#d1d5db' }}>
                  Always show my rank
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  If you're outside the top {lbLimit}, your row is pinned at the bottom with your actual rank
                </div>
              </div>
            </button>

            <UrlRow label="Browser source URL" url={lbUrl} disabled={!hasKey} />
            <Warn>
              If unsure how many rows to show, <strong>Top 10</strong> is the most readable on stream.
              Do not display this URL on stream or share it publicly.
            </Warn>
          </div>
        </section>

        {/* ── Pending Approvals Overlay (mod only) ── */}
        {isModerator && (
          <section className="rounded-2xl shadow-xl overflow-hidden" style={{ backgroundColor: '#35373b', border: '1px solid #4b5563' }}>
            <div className="h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-400" />
            <div className="px-6 py-5 space-y-4">
              <div>
                <h2 className="text-base text-white">Pending Approvals Overlay <span className="text-xs font-semibold ml-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>Mod only</span></h2>
                <p className="text-xs text-gray-400 mt-0.5">Shows a queue of pending submissions. Disappears automatically when the queue is empty.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Max items shown</label>
                  <select
                    value={aqLimit}
                    onChange={e => setAqLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ backgroundColor: '#2a2d31', border: '1px solid #374151' }}
                  >
                    {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} items</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <button
                    onClick={() => setAqNames(v => !v)}
                    className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-all"
                    style={{
                      backgroundColor: aqNames ? 'rgba(124,58,237,0.15)' : '#2a2d31',
                      border: `1.5px solid ${aqNames ? '#7c3aed' : '#374151'}`,
                    }}
                  >
                    <div
                      className="w-9 h-5 rounded-full flex-shrink-0 relative transition-colors"
                      style={{ backgroundColor: aqNames ? '#7c3aed' : '#374151' }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                        style={{ transform: aqNames ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: aqNames ? '#a78bfa' : '#d1d5db' }}>Show names</div>
                      <div className="text-xs text-gray-500">Display submitter names</div>
                    </div>
                  </button>
                </div>
              </div>

              <UrlRow label="Browser source URL (moderator key required)" url={aqUrl} disabled={!hasKey} />
              <div className="flex items-center gap-3">
                <button
                  disabled={!hasKey || testEventState === 'loading'}
                  onClick={async () => {
                    setTestEventState('loading');
                    try {
                      const res = await fetch(`${API_BASE_URL}/overlay/test-event?key=${encodeURIComponent(keyValue)}`, { method: 'POST' });
                      setTestEventState(res.ok ? 'sent' : 'error');
                    } catch {
                      setTestEventState('error');
                    }
                    setTimeout(() => setTestEventState('idle'), 3000);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: testEventState === 'sent' ? 'rgba(34,197,94,0.15)' : testEventState === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)',
                    border: `1.5px solid ${testEventState === 'sent' ? '#22c55e' : testEventState === 'error' ? '#ef4444' : '#7c3aed'}`,
                    color: testEventState === 'sent' ? '#86efac' : testEventState === 'error' ? '#fca5a5' : '#a78bfa',
                    opacity: (!hasKey || testEventState === 'loading') ? 0.5 : 1,
                    cursor: (!hasKey || testEventState === 'loading') ? 'not-allowed' : 'pointer',
                  }}
                >
                  {testEventState === 'loading' ? 'Sending…' : testEventState === 'sent' ? 'Event sent!' : testEventState === 'error' ? 'Failed' : 'Send test notification'}
                </button>
                <span className="text-xs text-gray-500">Fires a real queue-changed event — your overlay will drop down if it's live.</span>
              </div>
              <Warn>
                This overlay requires your API key to belong to a moderator account. Non-moderator keys will receive a 403 error.
              </Warn>
            </div>
          </section>
        )}

        {/* Regenerate footer */}
        <div className="text-center pb-2">
          <button
            onClick={() => setRegenConfirm(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            If your overlay URLs stop working, regenerate your key here.
          </button>
        </div>

      </div>
    </div>
  );
};

export default Pro;
