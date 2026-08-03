import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, supabase } from './contexts/AuthContext';
import { PageTitleContext } from './contexts/PageTitleContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import BingoBoard from './components/BingoBoard';
import Leaderboard from './components/Leaderboard';
import AuthCallback from './components/AuthCallback';
import Profile from './components/Profile';
import Pokedex from './components/Pokedex';
import TwitchAmbassadors from './components/TwitchAmbassadors';
import Upload from './components/Upload';
import Approvals from './components/Approvals';
import BoardBuilder from './components/BoardBuilder';
import GameBoard from './components/GameBoard';
import SubmissionHistory from './components/SubmissionHistory';
import NotificationToast from './components/NotificationToast';
import About from './components/About';
import Pro from './components/Pro';
import OverlayBoard from './components/OverlayBoard';
import OverlayLeaderboard from './components/OverlayLeaderboard';
import OverlayApprovals from './components/OverlayApprovals';
import BadgeUpload from './components/BadgeUpload';
import PokemonGameManager from './components/PokemonGameManager';
import FeedbackModal from './components/FeedbackModal';
import ModFeedback from './components/ModFeedback';
import BannerBar from './components/BannerBar';
import BannerManagerModal from './components/BannerManagerModal';
import MonthStats from './components/MonthStats';
import TierList from './components/TierList';
import HomeHighlights from './components/HomeHighlights';
import ShinyTools from './components/ShinyTools';
import SVSandwichCalculator from './components/tools/SVSandwichCalculator';
import BDSPRadar from './components/tools/BDSPRadar';
import Gen2ShinyBreeding from './components/tools/Gen2ShinyBreeding';
import DexNavCalculator from './components/tools/DexNavCalculator';
import CatchRateCalculator from './components/tools/CatchRateCalculator';
import XYRadar from './components/tools/XYRadar';
import XYRadarBuilder from './components/tools/XYRadarBuilder';
import Login from './components/Login';
import SafariZone from './components/tools/SafariZone';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import ConsentModal from './components/ConsentModal';
import logoImage from './Icons/pokemon-bounty-board.png';
import logoIcon from './Icons/logo-mobile.png';
import { getAuthHeaders } from './services/api';
import { GRADIENT } from './constants/theme';


// Nav link colouring — see docs/DESIGN_TOKENS.md §3. No destination owns a
// colour: every nav item is `text-body` at rest, `text-strong` on hover, and
// `text-accent` when it is the route you are on. That is the only thing the
// accent means in the nav, which is what makes "you are here" legible.
const navLinkClass = (isActive) =>
  isActive ? 'text-accent font-semibold' : 'text-body hover:text-strong';

// Shiny Tools is the one destination that keeps a standout colour: it is the
// only nav item that is a distinct product rather than a view of the bingo
// board, and it reads as the "extra" the site offers. It is `warn` (#fbbf24,
// 9.63:1) on ALL FOUR surfaces — drawer, header, footer, home teaser — which is
// the actual fix for the original bug: it used to be yellow-300 in two places,
// yellow-600 in the footer and pink on the teaser card. One colour, four places.
// Active state adds weight rather than swapping the hue, so the standout
// survives being the current route.
const toolsLinkClass = (isActive) =>
  isActive ? 'text-warn font-semibold' : 'text-warn hover:text-yellow-200';

// Small golden pulsing dot — mirrors the one on the Profile Badges tab so the
// "you have unseen badges" indicator is visually consistent across surfaces.
const NewBadgeDot = ({ className = '' }) => (
  <span className={`relative flex h-2 w-2 ${className}`}>
    <span className="absolute inline-flex h-full w-full rounded-full bg-warn opacity-60 animate-ping" />
    <span className="relative inline-flex rounded-full h-2 w-2 bg-warn"
      style={{ boxShadow: '0 0 6px 1px rgba(250,204,21,0.8)' }} />
  </span>
);

// Scroll to top on every route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  // Opt out of the browser's automatic scroll restoration so async page content
  // (e.g. the Profile fetch) can't get restored to a stale offset after load.
  React.useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);
  React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

// Shared layout: single adaptive header + page content via <Outlet />
const AppLayout = () => {
  const { user, signInWithDiscord, signOut, loading, isPro, isModerator } = useAuth();
  const { pageMeta } = React.useContext(PageTitleContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [bannerManagerOpen, setBannerManagerOpen] = React.useState(false);
  const [pendingApprovals, setPendingApprovals] = React.useState(0);
  const [unseenBadges, setUnseenBadges] = React.useState(0);
  const menuRef = React.useRef(null);

  const isHome = location.pathname === '/';

  // Moderator-only: track pending approval count for the header badge
  React.useEffect(() => {
    if (!isModerator) { setPendingApprovals(0); return; }
    let cancelled = false;
    const loadPending = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/approvals/pending?count=true', { headers });
        const data = res.ok ? await res.json() : { pending: 0, historical: 0 };
        const count = (data.pending || 0) + (data.historical || 0);
        if (!cancelled) setPendingApprovals(count);
      } catch { /* ignore */ }
    };
    loadPending();
    // Subscribe to the queue-changed topic the API actually broadcasts to
    // ('approvals-updates') so the badge count stays live without a refresh.
    const channel = supabase
      .channel('approvals-updates')
      .on('broadcast', { event: 'queue-changed' }, loadPending)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [isModerator]);

  // Close drawer on route change
  React.useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Unseen badge count for the avatar / menu / hamburger dots.
  // Refetched on every route change so viewing the Profile Badges tab (which
  // calls mark-seen per badge) clears the dot on navigation away.
  React.useEffect(() => {
    if (!user?.id) { setUnseenBadges(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/users/${user.id}/badges/unseen-count`, { headers });
        const data = res.ok ? await res.json() : { count: 0 };
        if (!cancelled) setUnseenBadges(data.count || 0);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id, location.pathname]);

  // Realtime: bump the dot the instant a new badge is awarded.
  React.useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`badge-awards-${user.id}`)
      .on('broadcast', { event: 'badge-earned' }, () => setUnseenBadges(c => c + 1))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithDiscord();
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const handleBack = () => {
    // For nested routes, go up to the parent rather than relying on history.
    if (location.pathname.startsWith('/tools/')) { navigate('/tools'); return; }
    if (location.pathname === '/tools') { navigate('/'); return; }
    // Otherwise go back in history, falling back to home if there's no history
    // (e.g. the user deep-linked or bookmarked the page directly).
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };

  // User avatar / dropdown — desktop only (mobile uses slide-out drawer)
  const displayName = user?.user_metadata?.custom_claims?.global_name || user?.user_metadata?.full_name || user?.user_metadata?.username || 'User';
  const avatarUrl = user?.user_metadata?.avatar_url;

  const userMenu = loading ? (
    <div className="w-9 h-9 rounded-full bg-edge animate-pulse" />
  ) : user ? (
    <div className="relative" ref={menuRef}>
      {/* Avatar trigger — icon fallback when no avatar */}
      <button
        onClick={() => setMenuOpen(o => !o)}
        className={`flex items-center justify-center w-9 h-9 rounded-full ring-2 transition-all overflow-hidden bg-outline ${menuOpen ? 'ring-accent' : 'ring-edge hover:ring-outline'}`}
        aria-label="Account menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} draggable={false} className="w-full h-full object-cover" />
        ) : (
          <svg className="w-5 h-5 text-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )}
      </button>
      {/* Dot is a sibling — the button's overflow-hidden (needed to clip the round avatar img) would otherwise clip the dot into the pic. NewBadgeDot's root is position:relative, so it needs an absolutely-positioned wrapper to escape the button's corner. */}
      {unseenBadges > 0 && (
        <span className="absolute -top-0.5 -right-0.5 pointer-events-none">
          <NewBadgeDot />
        </span>
      )}

      {/* Desktop dropdown */}
      <div
        className={`absolute right-0 mt-2 w-64 rounded-xl shadow-2xl border border-edge transition-all duration-150 z-50 overflow-hidden ${menuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'}`}
        style={{ background: GRADIENT.inset }}
      >
        {/* User info header */}
        <div className="px-4 py-3 border-b border-hairline flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-outline">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} draggable={false} className="w-full h-full object-cover" />
            ) : (
              <svg className="w-5 h-5 text-body" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-strong truncate">{displayName}</p>
            <Link to="/profile" onClick={() => setMenuOpen(false)} className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-strong transition-colors">
              View Profile
              {unseenBadges > 0 && <NewBadgeDot />}
            </Link>
          </div>
        </div>

        <div className="py-1.5 overflow-y-auto max-h-[70vh]">
          {/* My Account */}
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">My Account</div>
          {[
            { label: 'Upload', path: '/upload', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /> },
            { label: 'Notifications', path: '/history', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
            { label: 'Pokédex', path: '/pokedex', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
          ].map(({ label, path, icon }) => (
            <Link key={path} to={path} onClick={() => setMenuOpen(false)}
              className="w-full px-3 py-2 text-left text-sm text-body hover:bg-edge flex items-center gap-2.5 transition-colors">
              <svg className="w-4 h-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
              {label}
            </Link>
          ))}

          {(isPro || isModerator) && (
            <>
              <div className="border-t border-hairline my-1.5" />
              <div className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Pro</div>
              {isPro && (
                <Link to="/overlays" onClick={() => setMenuOpen(false)}
                  className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-edge flex items-center gap-2.5 transition-colors">
                  <svg className="w-4 h-4 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                  Stream Overlays
                </Link>
              )}
              {isModerator && (
                <Link to="/game-board" onClick={() => setMenuOpen(false)}
                  className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-edge flex items-center gap-2.5 transition-colors">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Game Board
                </Link>
              )}
            </>
          )}

          {isModerator && (
            <>
              <div className="border-t border-hairline my-1.5" />
              <div className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Moderator</div>
              {[
                { label: 'Approvals', path: '/approvals' },
                { label: 'Board Builder', path: '/board-builder' },
                { label: 'Badges', path: '/badge-upload' },
                { label: 'Game Manager', path: '/pokemon-game-manager' },
                { label: 'Feedback', path: '/feedback' },
              ].map(({ label, path }) => (
                <Link key={path} to={path} onClick={() => setMenuOpen(false)}
                  className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-edge flex items-center gap-2.5 transition-colors">
                  <span className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              ))}
              <button onClick={() => { setBannerManagerOpen(true); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-edge flex items-center gap-2.5 transition-colors">
                <span className="w-4 h-4 shrink-0" />
                Manage Banners
              </button>
            </>
          )}

          <div className="border-t border-hairline my-1.5" />
          <Link to="/about" onClick={() => setMenuOpen(false)}
            className="w-full px-3 py-2 text-left text-sm text-body hover:bg-edge flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            How to Play
          </Link>
          <button onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-body hover:bg-edge flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
            Suggestions & Bugs
          </button>
          <div className="border-t border-hairline my-1.5" />
          <button onClick={() => { signOut(); setMenuOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-edge flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Log out
          </button>
        </div>
      </div>
    </div>
  ) : (!import.meta.env.DEV || sessionStorage.getItem('realauth') === '1') ? (
    <Link to="/login" className="flex items-center gap-2 bg-accent-strong hover:bg-accent text-strong px-4 py-2 rounded-full transition-colors text-sm font-medium">
      Sign In / Sign Up
    </Link>
  ) : null;

  /* ── Shared action buttons (upload + bell) ── */
  const actionButtons = user && (
    <>
      {isModerator && (
        <Link to="/approvals" className="relative p-2 text-muted hover:text-strong hover:bg-edge rounded-lg transition-colors" title="Approvals">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {pendingApprovals > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-danger-strong text-strong text-[10px] font-bold leading-none">
              {pendingApprovals > 99 ? '99+' : pendingApprovals}
            </span>
          )}
        </Link>
      )}
      <Link to="/upload" className="p-2 text-muted hover:text-strong hover:bg-edge rounded-lg transition-colors" title="Upload">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
      </Link>
      <Link to="/history" className="p-2 text-muted hover:text-strong hover:bg-edge rounded-lg transition-colors" title="Notifications">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
      </Link>
    </>
  );

  /* ── Mobile hamburger button ── */
  const hamburger = (
    <button
      onClick={() => setDrawerOpen(true)}
      className="relative sm:hidden p-2 text-muted hover:text-strong hover:bg-edge rounded-lg transition-colors"
      aria-label="Open menu"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      {unseenBadges > 0 && (
        <span className="absolute top-1 right-1 pointer-events-none"><NewBadgeDot /></span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Slide-out drawer (mobile) ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-72 flex flex-col shadow-2xl" style={{ background: GRADIENT.inset }}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-hairline">
              {user ? (
                <div className="flex items-center gap-3">
                  {user.user_metadata?.avatar_url && (
                    <img src={user.user_metadata.avatar_url} alt="Profile" draggable={false} className="w-9 h-9 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-strong">
                      {user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.username || 'User'}
                    </p>
                    <Link to="/profile" onClick={() => setDrawerOpen(false)} className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-strong transition-colors">
                      View Profile
                      {unseenBadges > 0 && <NewBadgeDot />}
                    </Link>
                  </div>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-2 bg-accent-strong hover:bg-accent text-strong px-4 py-2 rounded-full transition-colors text-sm font-medium"
                >
                  Sign In / Sign Up
                </Link>
              )}
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-muted hover:text-strong rounded-lg hover:bg-edge transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Navigate</div>
              {[
                { label: 'Home', path: '/', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
                { label: 'Pokédex', path: '/pokedex', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
                { label: 'Month Stats', path: '/stats', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /> },
                { label: 'Tier List', path: '/tier-list', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h6" /> },
                { label: 'How to Play', path: '/about', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
              ].map(({ label, path, icon }) => (
                <Link key={path} to={path} onClick={() => setDrawerOpen(false)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-edge ${navLinkClass(location.pathname === path)}`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                  {label}
                </Link>
              ))}
              {/* Shiny Tools keeps its standout — see toolsLinkClass. `startsWith`
                  rather than `===` because /tools/* sub-routes are still "in" Tools. */}
              <Link to="/tools" onClick={() => setDrawerOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-edge ${toolsLinkClass(location.pathname.startsWith('/tools'))}`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" /></svg>
                Shiny Tools
              </Link>

              {user && (
                <>
                  <div className="border-t border-hairline my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">My Account</div>
                  {[
                    { label: 'Upload', path: '/upload', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /> },
                    { label: 'Notifications', path: '/history', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
                  ].map(({ label, path, icon }) => (
                    <Link key={path} to={path} onClick={() => setDrawerOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:text-strong hover:bg-edge transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                      {label}
                    </Link>
                  ))}
                </>
              )}

              {isModerator && (
                <>
                  <div className="border-t border-hairline my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Moderator</div>
                  {[
                    { label: 'Approvals', path: '/approvals' },
                    { label: 'Board Builder', path: '/board-builder' },
                    { label: 'Upload Badge', path: '/badge-upload' },
                    { label: 'Game Manager', path: '/pokemon-game-manager' },
                    { label: 'Feedback', path: '/feedback' },
                  ].map(({ label, path }) => (
                    <Link key={path} to={path} onClick={() => setDrawerOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-accent hover:bg-edge transition-colors">
                      <span className="w-4 h-4 shrink-0" />
                      {label}
                    </Link>
                  ))}
                  <button onClick={() => { setBannerManagerOpen(true); setDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-accent hover:bg-edge transition-colors">
                    <span className="w-4 h-4 shrink-0" />
                    Manage Banners
                  </button>
                  <div className="border-t border-hairline my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">Pro</div>
                  {isPro && (
                    <Link to="/overlays" onClick={() => setDrawerOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-accent hover:bg-edge transition-colors">
                      <svg className="w-4 h-4 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                      Stream Overlays
                    </Link>
                  )}
                  <Link to="/game-board" onClick={() => setDrawerOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-accent hover:bg-edge transition-colors">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Game Board
                  </Link>
                </>
              )}

              <div className="border-t border-hairline my-2" />
              <button onClick={() => { setFeedbackOpen(true); setDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:text-strong hover:bg-edge transition-colors">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                Suggestions & Bugs
              </button>
              {user && (
                <button onClick={() => { signOut(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-edge transition-colors">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Log out
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── Single adaptive header — full viewport width ── */}
      <header className="sticky top-0 z-50 shadow-md bg-surface-inset border-b border-hairline">
        <div className="px-4 sm:px-6 py-2 md:py-4">
          {isHome ? (
            /* Home: logo left | nav flows naturally after logo | actions right */
            <div className="flex items-center">
              {/* Both images always in DOM so logoImage is pre-decoded before returning home */}
              <Link to="/" className="shrink-0"><img src={logoImage} alt="Pokemon Bounty Board" draggable={false} className="h-10 sm:h-14 object-contain cursor-pointer" /></Link>
              {/* Same rule as the drawer: neutral at rest, accent when active.
                  The active state is net-new here — the header used to signal
                  the current route not at all. */}
              <nav className="hidden sm:flex items-center gap-0.5 ml-6">
                {[
                  { label: 'How to Play', path: '/about' },
                  { label: 'Month Stats', path: '/stats' },
                  { label: 'Tier List', path: '/tier-list' },
                  ...(user ? [{ label: 'Pokédex', path: '/pokedex' }] : []),
                  { label: 'Shiny Tools', path: '/tools' },
                ].map(({ label, path }) => (
                  <Link key={path} to={path}
                    className={`px-3 py-1.5 text-sm hover:bg-edge rounded-lg transition-colors ${
                      path === '/tools'
                        ? toolsLinkClass(location.pathname.startsWith(path))
                        : navLinkClass(location.pathname.startsWith(path))
                    }`}>
                    {label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-1 ml-auto">
                <div className="hidden sm:flex items-center gap-1">
                  {actionButtons}
                </div>
                <div className="hidden sm:block">{userMenu}</div>
                {hamburger}
              </div>
            </div>
          ) : (
            /* Sub-page: icon (home) | title | actions */
            <div className="flex items-center">
              {/* Hidden preload so logoImage is decoded before the user returns home */}
              <Link to="/" className="shrink-0" title="Home">
                <img
                  src={logoImage}
                  alt="Home"
                  draggable={false}
                  className="h-10 sm:h-14 object-contain cursor-pointer"
                />
              </Link>
              <div className="w-px h-5 ml-6 bg-edge" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-strong truncate">{pageMeta.title}</h1>
                  {pageMeta.badge === 'mod' && (
                    <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full font-medium shrink-0">Moderator</span>
                  )}
                  {pageMeta.badge === 'pro' && (
                    <span className="text-xs text-warn bg-warn/10 px-2 py-0.5 rounded-full font-medium shrink-0">Pro</span>
                  )}
                </div>
                {pageMeta.subtitle && (
                  <p className="text-xs text-muted mt-0.5">{pageMeta.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {pageMeta.completion && (
                  <div className="text-right mr-2 hidden sm:block">
                    <div className="text-xs text-muted">Caught</div>
                    <div className="text-lg font-bold text-accent">
                      {pageMeta.completion.caught} / {pageMeta.completion.total}
                    </div>
                  </div>
                )}
                <div className="hidden sm:flex items-center gap-1">
                  {actionButtons}
                </div>
                <div className="hidden sm:block">{userMenu}</div>
                {hamburger}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      <Outlet />

      {/* Footer */}
      <footer className="mt-12 border-t border-hairline py-6 text-center text-xs text-muted">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm">
            <Link to="/" className="hover:text-body transition-colors">Home</Link>
            <Link to="/pokedex" className="hover:text-body transition-colors">Pokédex</Link>
            <Link to="/about" className="hover:text-body transition-colors">How to Play</Link>
            {/* Same yellow as the header and drawer — it used to be yellow-600
                here, which is what made one link read as three colours. */}
            <Link to="/tools" className="text-warn hover:text-yellow-200 transition-colors">Shiny Tools</Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            <span>Pokeboard.net is not affiliated with Nintendo, Game Freak, or The Pokémon Company.</span>
            <span className="hidden sm:inline text-faint">|</span>
            <Link to="/privacy" className="hover:text-body transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-body transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <BannerManagerModal isOpen={bannerManagerOpen} onClose={() => setBannerManagerOpen(false)} />
    </div>
  );
};

// Home page content only (no header — AppLayout provides it)
const HomePage = () => {
  const { user } = useAuth();
  return (
    /* One vertical scale for the whole home page: `space-y-6` (24px) between
       every top-level block, matching the Board/Leaderboard grid's own gutter.
       The ad-hoc `mb-4`s that used to stack 16/16/24/32px are gone — see
       docs/LAYOUT_AUDIT.md Priority 3. */
    <main className="max-w-7xl mx-auto px-4 py-5 space-y-6">
      {!user && (!import.meta.env.DEV || sessionStorage.getItem('realauth') === '1') && (
        <Link to="/login" className="block rounded-xl p-4 text-center cursor-pointer border border-accent/40" style={{ background: GRADIENT.card }}>
          <p className="text-accent text-sm">
            👋 Sign in or create an account to track your own Pokémon progress!
          </p>
        </Link>
      )}
      {/* Every promo/announcement is a `banners` row now, including the tier-list
          prompt (condition = 'tier_list_incomplete'). See BannerBar.jsx. */}
      <BannerBar />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl shadow-xl p-6 border border-hairline lg:min-h-[720px]" style={{ background: GRADIENT.card }}>
          <BingoBoard />
        </div>
        <div className="relative rounded-xl shadow-xl overflow-hidden border border-hairline min-h-[480px] lg:min-h-[720px]" style={{ background: GRADIENT.card }}>
          <div className="absolute inset-0 p-6 flex flex-col">
            <Leaderboard />
          </div>
        </div>
      </div>

      <HomeHighlights />

      <TwitchAmbassadors />
    </main>
  );
};

// Consent gate: shown to any logged-in user who hasn't accepted the ToS yet.
// Bypassed in localhost dev (no real auth) unless ?force_tos=fresh|update
// is passed for manual QA of the modal copy.
const ConsentGate = ({ children }) => {
  const { user, loading } = useAuth();
  const { pathname, search } = useLocation();
  const [tosAccepted, setTosAccepted] = React.useState(null); // null = unknown
  const [isUpdate, setIsUpdate] = React.useState(false);

  const forceTos = React.useMemo(() => {
    if (!import.meta.env.DEV) return null;
    const v = new URLSearchParams(search).get('force_tos');
    return v === 'fresh' || v === 'update' ? v : null;
  }, [search]);

  React.useEffect(() => {
    if (forceTos) { setTosAccepted(false); setIsUpdate(forceTos === 'update'); return; }
    if (!user || import.meta.env.DEV) { setTosAccepted(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setTosAccepted(true); return; }
      fetch('/api/user/tos-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.json())
        .then(d => {
          setTosAccepted(!!d.accepted);
          setIsUpdate(!!d.is_update);
        })
        .catch(() => setTosAccepted(true)); // fail open so a network error doesn't lock users out
    });
  }, [user, forceTos]);

  const handleAccept = async () => {
    if (forceTos) { setTosAccepted(true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/user/accept-tos', {
      method: 'POST',
      headers: { Authorization: session ? `Bearer ${session.access_token}` : '' },
    });
    setTosAccepted(true);
  };

  const showModal = !loading && tosAccepted === false && pathname !== '/privacy' && pathname !== '/terms' && (forceTos || user);

  return (
    <>
      {children}
      {showModal && (
        <ConsentModal onAccept={handleAccept} isUpdate={isUpdate} />
      )}
    </>
  );
};

function App() {
  const [pageMeta, setPageMeta] = React.useState({ title: '', badge: null, subtitle: null, completion: null });

  return (
    <ErrorBoundary>
      <Router>
      <ScrollToTop />
      <AuthProvider>
        <PageTitleContext.Provider value={{ pageMeta, setPageMeta }}>
        <NotificationToast />
        <ConsentGate>
        <Routes>
          {/* Routes without the shared header */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/login" element={<Login />} />
          <Route path="/overlay/board" element={<OverlayBoard />} />
          <Route path="/overlay/leaderboard" element={<OverlayLeaderboard />} />
          <Route path="/overlay/approvals" element={<OverlayApprovals />} />

          {/* Routes with the shared header */}
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/profile/:userId" element={<Profile />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/pokedex" element={<Pokedex />} />
            <Route path="/stats" element={<MonthStats />} />
            <Route path="/tier-list" element={<TierList />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/history" element={<SubmissionHistory />} />
            <Route path="/board-builder" element={<BoardBuilder />} />
            <Route path="/game-board" element={<GameBoard />} />
            <Route path="/about" element={<About />} />
            <Route path="/overlays" element={<Pro />} />
            <Route path="/pro" element={<Navigate to="/overlays" replace />} />
            <Route path="/badge-upload" element={<BadgeUpload />} />
            <Route path="/pokemon-game-manager" element={<PokemonGameManager />} />
            <Route path="/feedback" element={<ModFeedback />} />
            <Route path="/tools" element={<ShinyTools />} />
            <Route path="/tools/sv-sandwich" element={<SVSandwichCalculator />} />
            <Route path="/tools/bdsp-radar" element={<BDSPRadar />} />
            <Route path="/tools/gen2-breeding" element={<Gen2ShinyBreeding />} />
            <Route path="/tools/dexnav" element={<DexNavCalculator />} />
            <Route path="/tools/catch-rate" element={<CatchRateCalculator />} />
            <Route path="/tools/xy-radar" element={<XYRadar />} />
            <Route path="/tools/xy-radar/builder" element={<XYRadarBuilder />} />
            <Route path="/tools/safari-zone" element={<SafariZone />} />
            <Route path="/tools/:toolId" element={<ShinyTools />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
        </ConsentGate>
        </PageTitleContext.Provider>
      </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
