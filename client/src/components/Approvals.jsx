import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import restrictedIcon from '../Icons/restricted-icon.png';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';
import { ALLOWED_GAMES } from '../constants/games';
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

// Game logo strip shown in approval rows
const GameBadge = ({ gameKey }) => {
  const game = ALLOWED_GAMES.find(g => g.key === gameKey);
  if (!game) return <span className="text-xs text-gray-500">{gameKey || '—'}</span>;
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {game.img_urls.map((url, i) => (
        <img key={i} src={url} alt="" className="h-4 object-contain" />
      ))}
      <span className="text-xs text-gray-400">{game.label}</span>
    </div>
  );
};

// Restricted rules checklist for a given game (shown to moderators as a reminder)
const GameRules = ({ gameKey }) => {
  const game = ALLOWED_GAMES.find(g => g.key === gameKey);
  if (!game?.restricted_checklist?.length) return null;
  return (
    <div className="mt-2 p-2 rounded bg-[#78150a]/10 border border-[#78150a]/30">
      <div className="text-xs font-semibold text-[#e07060] mb-1">Submitter confirmed:</div>
      <ul className="space-y-0.5">
        {game.restricted_checklist.map(item => (
          <li key={item.id} className="text-xs text-gray-300 flex items-start gap-1">
            <svg className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

const STATUS_CONFIG = {
  accepted:                     { label: 'Accepted',               color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700/40' },
  accepted_restricted:          { label: 'Accepted (Restricted)',   color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700/40' },
  accepted_historical:          { label: 'Accepted (Historical)',   color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-700/40' },
  accepted_downgraded:          { label: 'Accepted (Downgraded)',   color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700/40' },
  accepted_downgraded_historical: { label: 'Accepted (Hist. DG)',   color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700/40' },
  accepted_upgraded:            { label: 'Accepted (Upgraded)',     color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-700/40' },
  accepted_upgraded_historical: { label: 'Accepted (Upg. Hist.)',   color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-700/40' },
  rejected:                     { label: 'Rejected',               color: 'text-red-400',    bg: 'bg-red-900/30 border-red-700/40' },
  rejected_restricted_ban:      { label: 'Banned',                 color: 'text-red-400',    bg: 'bg-red-900/30 border-red-700/40' },
};

// Detect direct video files (R2 uploads or linked direct files) by extension
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|$)/i;
const isVideoUrl = (url) => typeof url === 'string' && VIDEO_EXT.test(url);

// Parse a YouTube / Twitch link into an embeddable player URL. Returns null for
// anything we can't safely iframe (most sites block embedding via X-Frame-Options).
// Twitch players require a `parent` param matching the current hostname.
const parseEmbed = (url) => {
  if (typeof url !== 'string') return null;
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // YouTube (watch, youtu.be, shorts, live, embed)
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { provider: 'YouTube', embedUrl: `https://www.youtube.com/embed/${m[1]}`, thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` };

  // Twitch clip (clips.twitch.tv/SLUG or twitch.tv/<channel>/clip/SLUG)
  m = url.match(/clips\.twitch\.tv\/([\w-]+)/) || url.match(/twitch\.tv\/\w+\/clip\/([\w-]+)/);
  if (m) return { provider: 'Twitch', embedUrl: `https://clips.twitch.tv/embed?clip=${m[1]}&parent=${parent}`, thumb: null };

  // Twitch VOD (twitch.tv/videos/123456789)
  m = url.match(/twitch\.tv\/videos\/(\d+)/);
  if (m) return { provider: 'Twitch', embedUrl: `https://player.twitch.tv/?video=${m[1]}&parent=${parent}&autoplay=false`, thumb: null };

  return null;
};

// True when a proof link can be shown inline (direct video file OR YouTube/Twitch)
const isEmbeddableLink = (url) => isVideoUrl(url) || !!parseEmbed(url);

// Build a unified ordered media list (images, videos, YouTube/Twitch embeds) for a
// submission/record. Links we can't safely iframe are left for the caller to render
// as external anchor links.
const buildMedia = (a) => {
  const items = [];
  const push = (url, label) => { if (url) items.push({ url, label, kind: isVideoUrl(url) ? 'video' : 'image' }); };
  push(a.proof_url, 'Proof of Shiny');
  push(a.proof_url2, 'Proof of Date');
  push(a.proof_url3, 'Evolution');
  push(a.proof_url4, 'Evolved Summary');
  (a.extra_images ?? []).forEach((url, i) => push(url, `Extra ${i + 1}`));
  (a.proof_link ?? []).forEach((url, i) => {
    if (isVideoUrl(url)) { items.push({ url, label: `Video ${i + 1}`, kind: 'video' }); return; }
    const e = parseEmbed(url);
    if (e) items.push({ url, label: e.provider, kind: 'embed', embedUrl: e.embedUrl, thumb: e.thumb, provider: e.provider });
  });
  return items;
};

// Thumbnail for an image or video media item. Video thumbnails render a muted
// <video> preview with a play overlay; clicking either opens the lightbox gallery.
const MediaThumb = ({ item, size = 'lg', onClick }) => {
  const box = size === 'lg' ? 'w-28 h-28' : 'w-20 h-20';
  const borderColor = item.label === 'Evolution' || item.label === 'Evolved Summary'
    ? 'border-blue-700 hover:border-blue-500'
    : 'border-gray-600 hover:border-purple-500';
  const isTwitch = item.provider === 'Twitch';
  return (
    <button onClick={onClick} className="block group">
      <div className={`relative ${box}`}>
        {item.kind === 'video' ? (
          <>
            <video
              src={item.url}
              className={`${box} object-cover rounded border ${borderColor} transition-colors cursor-pointer`}
              muted
              playsInline
              preload="metadata"
            />
            <PlayOverlay />
          </>
        ) : item.kind === 'embed' ? (
          <>
            {item.thumb ? (
              <img src={item.thumb} alt={item.label} className={`${box} object-cover rounded border ${borderColor} transition-colors cursor-pointer`} />
            ) : (
              <div className={`${box} flex items-center justify-center rounded border ${borderColor} transition-colors cursor-pointer ${isTwitch ? 'bg-[#6441a5]/30' : 'bg-red-900/30'}`}>
                <span className={`text-xs font-bold ${isTwitch ? 'text-purple-300' : 'text-red-300'}`}>{item.provider}</span>
              </div>
            )}
            <PlayOverlay />
          </>
        ) : (
          <img
            src={item.url}
            alt={item.label}
            className={`${box} object-cover rounded border ${borderColor} transition-colors cursor-pointer`}
          />
        )}
      </div>
      {size === 'lg' && <div className="text-xs text-gray-400 text-center mt-1">{item.label}</div>}
    </button>
  );
};

const PlayOverlay = () => (
  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black/55">
      <svg className="w-4 h-4 text-white translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
    </span>
  </span>
);

const Approvals = () => {
  const { user, isModerator } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('approvals');
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPanel, setExpandedPanel] = useState(null); // { id, action }
  const [actionNotes, setActionNotes] = useState({});
  const [lightbox, setLightbox] = useState(null); // { items: [{ url, label, kind }], index }
  const [approvalsLoaded, setApprovalsLoaded] = useState(false);
  const [historicalApprovals, setHistoricalApprovals] = useState([]);
  const [historicalLoaded, setHistoricalLoaded] = useState(false);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(true);

  // Redirect non-mods once the check resolves
  useEffect(() => {
    if (isModerator === false) navigate('/');
  }, [isModerator, navigate]);

  // ── Media lightbox (images + videos) with arrow-key navigation ──────────────
  const openLightbox = (items, index = 0) => setLightbox({ items, index });
  const closeLightbox = () => setLightbox(null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setLightbox(null); return; }
      if (e.key === 'ArrowRight') setLightbox(l => l && l.items.length > 1 ? { ...l, index: (l.index + 1) % l.items.length } : l);
      if (e.key === 'ArrowLeft')  setLightbox(l => l && l.items.length > 1 ? { ...l, index: (l.index - 1 + l.items.length) % l.items.length } : l);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  useEffect(() => {
    if (isModerator && !approvalsLoaded) {
      loadApprovals();
    } else if (isModerator && approvalsLoaded) {
      setLoading(false);
    }
  }, [isModerator, approvalsLoaded]);

  // Preload historical count so the chip always shows a number, even before its tab is opened
  useEffect(() => {
    if (isModerator && !historicalLoaded) loadHistoricalApprovals();
  }, [isModerator, historicalLoaded]);

  // Live queue updates — reload whichever tab is active
  useEffect(() => {
    if (!isModerator) return;
    const channel = supabase
      .channel('approvals-updates')
      .on('broadcast', { event: 'queue-changed' }, () => {
        if (activeTab === 'historical') loadHistoricalApprovals();
        else if (activeTab === 'approvals') loadApprovals();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [isModerator, activeTab]);


  const loadApprovals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/approvals/pending', {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to load approvals');
      const data = await response.json();
      setApprovals(data);
      setApprovalsLoaded(true);
    } catch (err) {
      console.error('Error loading approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalApprovals = async () => {
    try {
      setHistoricalLoading(true);
      const response = await fetch('/api/approvals/pending?historical=true', {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to load historical approvals');
      const data = await response.json();
      setHistoricalApprovals(data);
      setHistoricalLoaded(true);
    } catch (err) {
      console.error('Error loading historical approvals:', err);
    } finally {
      setHistoricalLoading(false);
    }
  };

  const loadHistory = async (page = 1, append = false) => {
    try {
      setHistoryLoading(true);
      const response = await fetch(`/api/approvals/history?page=${page}&limit=20`, {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to load history');
      const data = await response.json();
      if (append) {
        setHistoryData(prev => [...prev, ...data]);
      } else {
        setHistoryData(data);
      }
      setHistoryHasMore(data.length === 20);
      setHistoryLoaded(true);
      setHistoryPage(page);
    } catch (err) {
      console.error('Error loading approval history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const togglePanel = (approvalId, action) => {
    if (expandedPanel?.id === approvalId && expandedPanel?.action === action) {
      setExpandedPanel(null);
    } else {
      setExpandedPanel({ id: approvalId, action });
    }
  };

  const handleNoteChange = (approvalId, note) => {
    setActionNotes({ ...actionNotes, [approvalId]: note });
  };

  const removeApproval = (approvalId) => {
    setApprovals(prev => prev.filter(a => a.id !== approvalId));
    setExpandedPanel(null);
    setActionNotes(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
  };

  const removeHistoricalApproval = (approvalId) => {
    setHistoricalApprovals(prev => prev.filter(a => a.id !== approvalId));
    setExpandedPanel(null);
    setActionNotes(prev => { const n = { ...prev }; delete n[approvalId]; return n; });
  };

  const handleHistoricalApprove = async (approvalId) => {
    try {
      const response = await fetch(`/api/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted_historical' })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Approval failed');
      }
      removeHistoricalApproval(approvalId);
    } catch (error) {
      console.error('Error approving historical:', error);
      alert('Failed to approve: ' + error.message);
    }
  };

  const handleHistoricalRestrictedAction = async (approvalId, action) => {
    const message = actionNotes[approvalId] || '';
    try {
      let response;
      if (action === 'upgrade') {
        response = await fetch(`/api/approvals/${approvalId}/approve`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted_upgraded_historical', message })
        });
      } else if (action === 'downgrade') {
        response = await fetch(`/api/approvals/${approvalId}/approve`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted_downgraded_historical', message })
        });
      } else {
        response = await fetch(`/api/approvals/${approvalId}/reject`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, status: action })
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Action failed');
      }
      removeHistoricalApproval(approvalId);
    } catch (error) {
      console.error(`Error on historical ${action}:`, error);
      alert(`Failed to ${action}: ` + error.message);
    }
  };

  const handleHistoricalReject = async (approvalId) => {
    try {
      const response = await fetch(`/api/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: actionNotes[approvalId] || '', status: 'rejected' })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Rejection failed');
      }
      removeHistoricalApproval(approvalId);
    } catch (error) {
      console.error('Error rejecting historical:', error);
      alert('Failed to reject: ' + error.message);
    }
  };

  const handleApprove = async (approvalId) => {
    const approval = approvals.find(a => a.id === approvalId);
    const status = approval?.restricted_submission ? 'accepted_restricted' : 'accepted';
    try {
      const response = await fetch(`/api/approvals/${approvalId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Approval failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error('Error approving:', error);
      alert('Failed to approve submission: ' + error.message);
    }
  };

  const handleReject = async (approvalId) => {
    try {
      const response = await fetch(`/api/approvals/${approvalId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: actionNotes[approvalId] || '', status: 'rejected' })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Rejection failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Failed to reject submission: ' + error.message);
    }
  };

  const handleRestrictedAction = async (approvalId, action) => {
    const message = actionNotes[approvalId] || '';
    try {
      let response;
      if (action === 'upgrade') {
        response = await fetch(`/api/approvals/${approvalId}/approve`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted_upgraded', message })
        });
      } else if (action === 'downgrade') {
        response = await fetch(`/api/approvals/${approvalId}/approve`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted_downgraded', message })
        });
      } else {
        response = await fetch(`/api/approvals/${approvalId}/reject`, {
          method: 'POST',
          headers: { 'Authorization': await getAuthHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, status: action })
        });
      }
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Action failed');
      }
      removeApproval(approvalId);
    } catch (error) {
      console.error(`Error on ${action}:`, error);
      alert(`Failed to ${action}: ` + error.message);
    }
  };

  if (!user || isModerator !== true) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f14' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  // ── Shared row renderer for pending/historical approvals ─────────────────────
  const renderApprovalRow = (approval, isHistorical) => {
    const isOwnSubmission = approval.user_id === user.id;
    const isBan = (approval.restricted_strikes || 0) >= 2;
    const panelOpen = expandedPanel?.id === approval.id;
    const panelAction = expandedPanel?.action;
    const media = buildMedia(approval);
    const externalLinks = (approval.proof_link ?? []).filter(l => !isEmbeddableLink(l));

    return (
      <div key={approval.id}>
        {/* Main Row */}
        <div className="p-4 flex items-center gap-4">
          {/* Pokemon Image */}
          <div className="w-16 h-16 flex-shrink-0">
            <PokemonImage
              pokemon={approval.pokemon}
              className="w-full h-full"
              disableCycling={true}
            />
          </div>

          {/* Submission Info */}
          <div className="w-56 flex-shrink-0">
            <div className="text-white font-medium">{approval.display_name}</div>
            <div className="text-sm text-gray-400">
              #{String(approval.national_dex_id).padStart(4, '0')} — {approval.pokemon_name}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(approval.created_at).toLocaleString()}
            </div>

            {/* Game badge */}
            {approval.game && <GameBadge gameKey={approval.game} />}

            {/* Historical tag */}
            {isHistorical && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/50">
                Historical
              </span>
            )}

            {/* Restricted badge + strikes */}
            {approval.restricted_submission && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-[#78150a]/25 text-[#e07060] border border-[#78150a]/50">
                  <img src={restrictedIcon} alt="" className="w-3 h-3 object-contain" />
                  Restricted
                </span>
                {approval.restricted_strikes > 0 && (
                  <span className="text-xs text-orange-400 font-medium">
                    {approval.restricted_strikes} strike{approval.restricted_strikes !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Game rules reminder for restricted submissions */}
            {approval.restricted_submission && approval.game && (
              <GameRules gameKey={approval.game} />
            )}
          </div>

          {/* Proof */}
          <div className="flex-shrink-0">
            <div className="flex gap-2 items-start flex-wrap">
              {approval.caught_in_game && (
                <div className="self-center text-xs text-blue-300 bg-blue-900/40 border border-blue-700 rounded px-2 py-1">
                  Caught in: {approval.caught_in_game}
                </div>
              )}
              {media.map((item, i) => (
                <MediaThumb key={i} item={item} size="lg" onClick={() => openLightbox(media, i)} />
              ))}
              {externalLinks.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-center text-purple-400 hover:text-purple-300 underline text-sm"
                >
                  {externalLinks.length > 1 ? `Video ${i + 1} ↗` : 'View Video Link ↗'}
                </a>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          {/* Action Buttons */}
          {isOwnSubmission ? (
            <span className="text-xs text-gray-500 italic flex-shrink-0">Your submission</span>
          ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            {approval.restricted_submission && (
              <>
                {/* Warn / Ban (merged) */}
                <button
                  onClick={() => togglePanel(approval.id, isBan ? 'ban' : 'warn')}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                    panelOpen && panelAction === (isBan ? 'ban' : 'warn')
                      ? (isBan ? 'bg-red-800' : 'bg-orange-600')
                      : (isBan ? 'bg-red-700 hover:bg-red-800' : 'bg-orange-500 hover:bg-orange-600')
                  }`}
                  title={isBan ? 'Ban user' : 'Warn user'}
                >
                  {isBan ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </button>

                {/* Downgrade */}
                <button
                  onClick={() => togglePanel(approval.id, 'downgrade')}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors ${
                    panelOpen && panelAction === 'downgrade'
                      ? 'bg-blue-700 border-blue-600'
                      : 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-gray-500'
                  }`}
                  title="Downgrade to normal submission"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>

                <div className="w-px h-8 bg-gray-600 mx-1" />
              </>
            )}

            {!approval.restricted_submission && approval.proof_link?.length > 0 && (
              <>
                <button
                  onClick={() => togglePanel(approval.id, 'upgrade')}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors ${
                    panelOpen && panelAction === 'upgrade'
                      ? 'bg-yellow-600 border-yellow-500'
                      : 'bg-yellow-700 border-yellow-600 hover:bg-yellow-600 hover:border-yellow-500'
                  }`}
                  title="Upgrade to restricted submission"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 19V5m0 0l-7 7m7-7l7 7" />
                  </svg>
                </button>

                <div className="w-px h-8 bg-gray-600 mx-1" />
              </>
            )}

            {/* Approve */}
            <button
              onClick={() => isHistorical ? handleHistoricalApprove(approval.id) : handleApprove(approval.id)}
              className="w-10 h-10 flex items-center justify-center bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              title="Approve"
            >
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Reject */}
            <button
              onClick={() => togglePanel(approval.id, 'reject')}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                panelOpen && panelAction === 'reject' ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'
              }`}
              title="Reject"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          )}
        </div>

        {/* Submitter note — chat bubble below the row */}
        {approval.note && (
          <div className="px-4 pb-3 -mt-1 flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-500/70 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.83l-4 1 1.3-3.16A7.94 7.94 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <div className="max-w-2xl rounded-2xl rounded-tl-sm bg-yellow-900/20 border border-yellow-700/40 px-3 py-2">
              <div className="text-[11px] font-semibold text-yellow-400 mb-0.5">{approval.display_name}'s note</div>
              <div className="text-sm text-yellow-100 whitespace-pre-wrap break-words">{approval.note}</div>
            </div>
          </div>
        )}

        {/* Expanded Action Panel */}
        {panelOpen && (
          <div className="px-4 pb-4 bg-gray-800">
            <div className="p-4 rounded-lg border border-gray-600">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {panelAction === 'reject' && 'Rejection Notes'}
                {panelAction === 'upgrade' && 'Upgrade Notes - accept submission as restricted'}
                {panelAction === 'downgrade' && 'Downgrade Notes - accept submission, but as non-restricted'}
                {panelAction === 'warn' && 'Warning Message - give a strike to a user, reject submission'}
                {panelAction === 'ban' && "Ban Reason - this will revoke the user's ability to submit to the restricted challenge, reject submission"}
              </label>
              <textarea
                value={actionNotes[approval.id] || ''}
                onChange={(e) => handleNoteChange(approval.id, e.target.value)}
                placeholder={
                  panelAction === 'reject' ? 'Enter reason for rejection...' :
                  panelAction === 'upgrade' ? 'Explain why this is being upgraded to a restricted submission...' :
                  panelAction === 'downgrade' ? 'Explain why this is being downgraded to a normal submission...' :
                  panelAction === 'warn' ? 'Enter warning message for the user...' :
                  'Enter reason for ban...'
                }
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none mb-3"
                rows={3}
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (panelAction === 'reject') {
                      isHistorical ? handleHistoricalReject(approval.id) : handleReject(approval.id);
                    } else {
                      isHistorical
                        ? handleHistoricalRestrictedAction(approval.id, panelAction)
                        : handleRestrictedAction(approval.id, panelAction);
                    }
                  }}
                  disabled={!actionNotes[approval.id]?.trim()}
                  className={`px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed ${
                    panelAction === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                    panelAction === 'upgrade' ? 'bg-blue-600 hover:bg-blue-700' :
                    panelAction === 'downgrade' ? 'bg-blue-600 hover:bg-blue-700' :
                    panelAction === 'warn' ? 'bg-orange-500 hover:bg-orange-600' :
                    'bg-red-700 hover:bg-red-800'
                  }`}
                >
                  {panelAction === 'reject' && 'Submit Rejection'}
                  {panelAction === 'upgrade' && 'Upgrade Submission'}
                  {panelAction === 'downgrade' && 'Downgrade Submission'}
                  {panelAction === 'warn' && 'Issue Warning'}
                  {panelAction === 'ban' && 'Ban User'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Moderator Approvals" badge="mod" />

      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'approvals' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              Pending Approvals
              <span className="ml-2 bg-purple-700 text-white text-xs rounded-full px-1.5 py-0.5">
                {approvals.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('historical');
                if (!historicalLoaded) loadHistoricalApprovals();
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'historical' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              Historical
              <span className="ml-2 bg-purple-700/60 text-purple-200 text-xs rounded-full px-1.5 py-0.5">
                {historicalApprovals.length}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                if (!historyLoaded) loadHistory(1);
              }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'history' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              Approval History
            </button>
          </div>

          {/* Approvals List */}
          {activeTab === 'approvals' && (
            <div className="rounded-xl border" style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: 'rgba(255,255,255,0.07)' }}>
              {loading && !approvalsLoaded ? (
                <div className="text-center text-gray-400 py-8">Loading approvals...</div>
              ) : approvals.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No pending approvals</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {approvals.map(approval => renderApprovalRow(approval, false))}
                </div>
              )}
            </div>
          )}

          {/* Historical Tab */}
          {activeTab === 'historical' && (
            <div className="rounded-xl border" style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: 'rgba(255,255,255,0.07)' }}>
              {historicalLoading ? (
                <div className="text-center text-gray-400 py-8">Loading historical approvals...</div>
              ) : historicalApprovals.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No pending historical approvals</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {historicalApprovals.map(approval => renderApprovalRow(approval, true))}
                </div>
              )}
            </div>
          )}

          {/* Approval History Tab */}
          {activeTab === 'history' && (
            <div className="rounded-xl border" style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: 'rgba(255,255,255,0.07)' }}>
              {historyLoading && !historyLoaded ? (
                <div className="text-center text-gray-400 py-8">Loading history...</div>
              ) : historyData.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No approval history yet</div>
              ) : (
                <>
                  <div className="divide-y divide-gray-800">
                    {historyData.map(record => {
                      const statusCfg = STATUS_CONFIG[record.status] || { label: record.status, color: 'text-gray-400', bg: 'bg-gray-700/30 border-gray-600/40' };
                      const rMedia = buildMedia(record);
                      const rLinks = (record.proof_link ?? []).filter(l => !isEmbeddableLink(l));
                      return (
                        <div key={record.id} className="p-4 flex items-start gap-4">
                          {/* Pokemon image */}
                          {record.pokemon && (
                            <div className="w-14 h-14 flex-shrink-0">
                              <PokemonImage
                                pokemon={record.pokemon}
                                className="w-full h-full"
                                disableCycling={true}
                              />
                            </div>
                          )}

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-white font-medium">{record.display_name}</span>
                              <span className="text-gray-400 text-sm">
                                #{String(record.national_dex_id || '0').padStart(4, '0')} — {record.pokemon_name}
                              </span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusCfg.bg} ${statusCfg.color}`}>
                                {statusCfg.label}
                              </span>
                              {record.restricted_submission && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-[#78150a]/25 text-[#e07060] border border-[#78150a]/50">
                                  <img src={restrictedIcon} alt="" className="w-3 h-3 object-contain" />
                                  Restricted
                                </span>
                              )}
                              {record.historical && (
                                <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-900/40 text-blue-300 border border-blue-700/50">
                                  Historical
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 mt-1 flex-wrap">
                              <span className="text-xs text-gray-500">
                                Submitted: {new Date(record.created_at).toLocaleString()}
                              </span>
                              <span className="text-xs text-gray-500">
                                Processed: {new Date(record.processed_at).toLocaleString()}
                                {record.moderator_name && <> by <span className="text-gray-400">{record.moderator_name}</span></>}
                              </span>
                            </div>

                            {record.game && <div className="mt-1"><GameBadge gameKey={record.game} /></div>}
                          </div>

                          {/* Proof thumbnails */}
                          <div className="flex items-start gap-2 flex-shrink-0 flex-wrap">
                            {record.caught_in_game && (
                              <div className="self-center text-xs text-blue-300 bg-blue-900/40 border border-blue-700 rounded px-2 py-1">
                                Caught in: {record.caught_in_game}
                              </div>
                            )}
                            {rMedia.map((item, i) => (
                              <MediaThumb key={i} item={item} size="sm" onClick={() => openLightbox(rMedia, i)} />
                            ))}
                            {!record.proof_url && !record.proof_url2 && record.had_images && (
                              <span className="text-xs text-gray-500 italic self-center">Images purged</span>
                            )}
                            {rLinks.map((link, i) => (
                              <a
                                key={i}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 underline text-sm self-center"
                              >
                                {rLinks.length > 1 ? `Video ${i + 1} ↗` : 'Video ↗'}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load more */}
                  {historyHasMore && (
                    <div className="p-4 text-center">
                      <button
                        onClick={() => loadHistory(historyPage + 1, true)}
                        disabled={historyLoading}
                        className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm disabled:opacity-50"
                      >
                        {historyLoading ? 'Loading...' : 'Load more'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Media Lightbox (images + videos, arrow-key navigable) */}
      {lightbox && lightbox.items.length > 0 && (() => {
        const current = lightbox.items[lightbox.index];
        const multi = lightbox.items.length > 1;
        const step = (dir) => setLightbox(l => l ? { ...l, index: (l.index + dir + l.items.length) % l.items.length } : l);
        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
            onClick={closeLightbox}
          >
            {/* Close */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Prev */}
            {multi && (
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors z-10"
                title="Previous (←)"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              {current.kind === 'video' ? (
                <video
                  key={current.url}
                  src={current.url}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                  controls
                  autoPlay
                />
              ) : current.kind === 'embed' ? (
                <div className="w-[85vw] max-w-5xl aspect-video">
                  <iframe
                    key={current.embedUrl}
                    src={current.embedUrl}
                    title={current.label}
                    className="w-full h-full rounded-lg border-0"
                    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <img
                  src={current.url}
                  alt={current.label}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                />
              )}
              <div className="mt-3 text-sm text-gray-300">
                {current.label}{multi && <span className="text-gray-500"> · {lightbox.index + 1} / {lightbox.items.length}</span>}
              </div>
            </div>

            {/* Next */}
            {multi && (
              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-colors z-10"
                title="Next (→)"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default Approvals;
