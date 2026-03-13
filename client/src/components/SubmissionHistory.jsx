import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

const STATUS_CONFIG = {
  pending:  { label: 'Pending Review',       color: 'text-yellow-400', accentColor: '#facc15' },
  accepted: { label: 'Accepted',             color: 'text-green-400',  accentColor: '#4ade80' },
  rejected: { label: 'Rejected',             color: 'text-red-400',    accentColor: '#f87171' },
  award:    { label: 'Achievement Unlocked', color: 'text-purple-400', accentColor: '#9147ff' },
};

const AwardIcon = ({ type }) => {
  const cls = 'text-white';
  if (type === 'row') return (
    <svg className={`w-3 h-3 ${cls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
    </svg>
  );
  if (type === 'column') return (
    <svg className={`w-3 h-3 ${cls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
    </svg>
  );
  if (type === 'x') return (
    <svg className={`w-3 h-3 ${cls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  if (type === 'blackout') return (
    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 7.2h18M3 10.2h18M3 13.8h18M3 16.8h18" />
      <path d="M7.2 3v18M10.2 3v18M13.8 3v18M16.8 3v18" />
    </svg>
  );
  return null;
};

const AWARD_LABELS = {
  row: 'Row Bingo',
  column: 'Column Bingo',
  x: 'X Bingo',
  blackout: 'Blackout',
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const SubmissionHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': await getAuthHeader() },
      });
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      setNotifications(data);
    } catch (err) {
      setError('Failed to load submission history.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      {/* Header */}
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Submission History</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-400">{error}</div>
        )}

        {!loading && !error && notifications.length === 0 && (
          <div className="text-center py-12 text-gray-400">No submissions yet.</div>
        )}

        {!loading && !error && notifications.length > 0 && (
          <div className="flex flex-col gap-3">
            {notifications.map((n) => {
              const cfg = STATUS_CONFIG[n.status] || STATUS_CONFIG.pending;
              const isAward = n.status === 'award';

              return (
                <div
                  key={n.id}
                  className="rounded-xl shadow-xl p-4 flex items-start gap-4"
                  style={{ backgroundColor: '#35373b', borderLeft: `3px solid ${cfg.accentColor}` }}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    {isAward ? (
                      <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center">
                        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: '#9147ff' }}>
                          <AwardIcon type={n.message} />
                        </div>
                      </div>
                    ) : n.pokemon?.img_url ? (
                      <img
                        src={n.pokemon.img_url}
                        alt={n.pokemon.name}
                        className="w-10 h-10 object-contain"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                        {isAward && n.message && (
                          <span className="text-xs text-gray-300">— {AWARD_LABELS[n.message] || n.message}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 flex-shrink-0">{formatDate(n.created_at)}</span>
                    </div>

                    {n.pokemon && !isAward && (
                      <p className="text-sm text-gray-300 mt-0.5">
                        #{n.pokemon.national_dex_id} {n.pokemon.name}
                      </p>
                    )}

                    {n.message && !isAward && (
                      <p className="text-sm text-gray-400 mt-1 italic">"{n.message}"</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmissionHistory;
