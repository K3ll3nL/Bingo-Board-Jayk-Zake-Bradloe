import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AchievementIcon from './AchievementIcon';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import PokemonImage from './PokemonImage';

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
  pending:                        { label: 'Pending Review',        color: '#facc15', bg: 'rgba(250,204,21,0.12)',  border: 'rgba(250,204,21,0.3)'  },
  accepted:                       { label: 'Accepted',              color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)'  },
  accepted_historical:            { label: 'Accepted (Historical)', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)'  },
  accepted_restricted:            { label: 'Accepted (Restricted)', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)'  },
  accepted_downgraded:            { label: 'Accepted (Downgraded)', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'  },
  accepted_downgraded_historical: { label: 'Accepted (Historical)', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'  },
  accepted_upgraded:              { label: 'Accepted (Upgraded)',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.3)'  },
  accepted_upgraded_historical:   { label: 'Accepted (Historical)', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.3)'  },
  rejected:                       { label: 'Rejected',              color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.3)' },
  rejected_restricted_ban:        { label: 'Rejected',              color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.3)' },
  award:                          { label: 'Achievement',           color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.35)' },
  badge_earned:                   { label: 'Badge Earned',          color: '#e9c46a', bg: 'rgba(233,196,106,0.12)', border: 'rgba(233,196,106,0.35)'},
};

const AWARD_LABELS = {
  row: 'Row Bingo',
  column: 'Column Bingo',
  x: 'X Bingo',
  blackout: 'Blackout',
};

// Bingo achievements come in base and `_restricted` variants, and the DB writes
// several blackout aliases ('first blackout', 'personal_blackout'). Normalize to
// a canonical base type + restricted flag so labels and icons resolve correctly.
const normalizeBingoType = (raw) => {
  if (!raw) return { base: raw, restricted: false };
  const restricted = raw.endsWith('_restricted');
  let base = restricted ? raw.slice(0, -'_restricted'.length) : raw;
  // Collapse blackout aliases ('first blackout', 'personal_blackout') → 'blackout'
  if (base === 'first blackout' || base === 'personal_blackout') base = 'blackout';
  return { base, restricted };
};

const awardLabel = (raw) => {
  const { base, restricted } = normalizeBingoType(raw);
  const label = AWARD_LABELS[base] || base;
  return restricted ? `Restricted ${label}` : label;
};

const FILTERS = ['All', 'Pokémon', 'Badges', 'Achievements'];

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const monthKey = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

// ── Status pill ───────────────────────────────────────────────
const StatusPill = ({ cfg }) => (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
    style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
  >
    {cfg.label}
  </span>
);

// ── Summary stat ──────────────────────────────────────────────
const Stat = ({ value, label, color }) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-xl font-bold" style={{ color }}>{value}</span>
    <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
  </div>
);

const CARD_BG     = 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

const SubmissionHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        headers: { 'Authorization': await getAuthHeader() },
      });
      if (!response.ok) throw new Error('Failed to load');
      const data = await response.json();
      setNotifications(data);
    } catch (err) {
      setError('Failed to load notification history.');
    } finally {
      setLoading(false);
    }
  };

  // Summary counts
  const totalPokemon   = notifications.filter(n => !['award', 'badge_earned'].includes(n.status)).length;
  const totalAccepted  = notifications.filter(n => n.status.startsWith('accepted')).length;
  const totalBadges    = notifications.filter(n => n.status === 'badge_earned').length;
  const totalAchievements = notifications.filter(n => n.status === 'award').length;

  // Filter
  const filtered = notifications.filter(n => {
    if (filter === 'All') return true;
    if (filter === 'Pokémon') return !['award', 'badge_earned'].includes(n.status);
    if (filter === 'Badges') return n.status === 'badge_earned';
    if (filter === 'Achievements') return n.status === 'award';
    return true;
  });

  // Group by month
  const grouped = filtered.reduce((acc, n) => {
    const key = monthKey(n.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});
  const monthKeys = Object.keys(grouped);

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Notification History" />

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Summary card ────────────────────────────────────── */}
        {!loading && !error && notifications.length > 0 && (
          <div
            className="rounded-2xl shadow-xl border px-6 py-4"
            style={{ background: CARD_BG, borderColor: CARD_BORDER }}
          >
            <div className="grid grid-cols-4">
              <Stat value={totalPokemon}      label="Submissions"   color="#e2e8f0" />
              <div className="relative"><div className="absolute left-0 inset-y-2" style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} /><Stat value={totalAccepted}     label="Accepted"      color="#4ade80" /></div>
              <div className="relative"><div className="absolute left-0 inset-y-2" style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} /><Stat value={totalBadges}       label="Badges"        color="#e9c46a" /></div>
              <div className="relative"><div className="absolute left-0 inset-y-2" style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} /><Stat value={totalAchievements} label="Achievements"  color="#a855f7" /></div>
            </div>
          </div>
        )}

        {/* ── Filter tabs ──────────────────────────────────────── */}
        {!loading && !error && notifications.length > 0 && (
          <div
            className="rounded-2xl shadow-xl border px-2 py-1.5 flex gap-1"
            style={{ background: CARD_BG, borderColor: CARD_BORDER }}
          >
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-1 py-1.5 rounded-xl text-sm font-medium transition-all duration-150"
                style={filter === f
                  ? { background: 'rgba(145,71,255,0.18)', color: '#c084fc', border: '1px solid rgba(145,71,255,0.35)' }
                  : { color: '#6b7280', border: '1px solid transparent' }
                }
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────── */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && <div className="text-center py-12 text-red-400">{error}</div>}

        {!loading && !error && notifications.length === 0 && (
          <div className="text-center py-16 text-gray-500">No notifications yet.</div>
        )}

        {!loading && !error && filtered.length === 0 && notifications.length > 0 && (
          <div className="text-center py-10 text-gray-500">Nothing in this category.</div>
        )}

        {/* ── Grouped notification list ────────────────────────── */}
        {!loading && !error && monthKeys.map(month => (
          <div key={month} className="space-y-2">
            {/* Month divider */}
            <div className="flex items-center gap-3 px-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">{month}</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {grouped[month].map(n => {
              const cfg = STATUS_CONFIG[n.status] || STATUS_CONFIG.pending;
              const isAward = n.status === 'award';
              const isBadge = n.status === 'badge_earned';
              const isCelebration = isBadge || isAward;

              return (
                <div
                  key={n.id}
                  className="rounded-xl shadow-lg border flex items-center gap-4 px-4 py-3"
                  style={{
                    background: isCelebration
                      ? `linear-gradient(135deg, ${cfg.bg}, rgba(255,255,255,0.02))`
                      : CARD_BG,
                    borderColor: isCelebration ? cfg.border : CARD_BORDER,
                    borderLeft: `3px solid ${cfg.color}`,
                  }}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 52, height: 52 }}>
                    {isBadge && n.badge?.image_url ? (
                      <img src={n.badge.image_url} alt={n.badge.name} className="w-12 h-12 object-contain drop-shadow-lg" />
                    ) : isBadge ? (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(233,196,106,0.15)' }}>
                        <svg className="w-6 h-6" style={{ color: '#e9c46a' }} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    ) : isAward ? (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.15)' }}>
                        <AchievementIcon
                          type={normalizeBingoType(n.message).base}
                          restricted={normalizeBingoType(n.message).restricted}
                          containerClassName="w-7 h-7"
                          svgClassName={normalizeBingoType(n.message).base === 'blackout' ? 'w-5 h-5' : 'w-4 h-4'}
                        />
                      </div>
                    ) : n.pokemon?.national_dex_id ? (
                      <PokemonImage pokemon={n.pokemon} className="w-full h-full" disableCycling={true} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name / title */}
                    {isBadge && n.badge ? (
                      <p className="text-sm font-semibold text-white leading-tight">{n.badge.name}</p>
                    ) : isAward && n.message ? (
                      <p className="text-sm font-semibold text-white leading-tight">{awardLabel(n.message)}</p>
                    ) : n.pokemon ? (
                      <p className="text-sm font-semibold text-white leading-tight">
                        #{n.pokemon.national_dex_id} {n.pokemon.name}
                      </p>
                    ) : null}

                    {/* Sub-line */}
                    {isBadge && n.badge?.description && (
                      <p className="text-xs text-gray-400 mt-0.5 leading-snug line-clamp-1">{n.badge.description}</p>
                    )}
                    {n.message && !isAward && !isBadge && (
                      <p className="text-xs text-gray-400 mt-0.5 italic line-clamp-1">"{n.message}"</p>
                    )}

                    {/* Date */}
                    <p className="text-xs text-gray-600 mt-1">{formatDate(n.created_at)}</p>
                  </div>

                  {/* Status pill — right side */}
                  <div className="flex-shrink-0">
                    <StatusPill cfg={cfg} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubmissionHistory;
