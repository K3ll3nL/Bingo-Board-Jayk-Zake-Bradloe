import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AchievementIcon from './AchievementIcon';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

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
  pending:                       { label: 'Pending Review',             color: 'text-yellow-400', accentColor: '#facc15' },
  accepted:                      { label: 'Accepted',                   color: 'text-green-400',  accentColor: '#4ade80' },
  accepted_historical:           { label: 'Accepted (Historical)',      color: 'text-green-400',  accentColor: '#4ade80' },
  accepted_restricted:           { label: 'Accepted (Restricted)',      color: 'text-green-400',  accentColor: '#4ade80' },
  accepted_downgraded:           { label: 'Accepted (Downgraded)',      color: 'text-yellow-400', accentColor: '#fbbf24' },
  accepted_downgraded_historical:{ label: 'Accepted (Historical)',      color: 'text-yellow-400', accentColor: '#fbbf24' },
  rejected:                      { label: 'Rejected',                   color: 'text-red-400',    accentColor: '#f87171' },
  rejected_restricted_ban:       { label: 'Rejected',                   color: 'text-red-400',    accentColor: '#f87171' },
  award:                         { label: 'Achievement Awarded',        color: 'text-purple-400', accentColor: '#9147ff' },
};

// AwardIcon is now handled by AchievementIcon — kept as a thin wrapper for local use
const AwardIcon = ({ type, restricted = false }) => (
  <AchievementIcon
    type={type}
    restricted={restricted}
    containerClassName="w-5 h-5"
    svgClassName={type === 'blackout' ? 'w-4 h-4' : 'w-3 h-3'}
  />
);

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
      setError('Failed to load Notification history.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Header */}
      <PageHeader title="Notification History" />

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
                  style={{ backgroundColor: '#35373b', border: '1px solid #4b5563', borderLeft: `3px solid ${cfg.accentColor}` }}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    {isAward ? (
                      <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center">
                        <AwardIcon type={n.message} restricted={n.restricted ?? false} />
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
