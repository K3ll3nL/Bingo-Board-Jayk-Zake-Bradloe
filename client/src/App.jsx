import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, supabase } from './contexts/AuthContext';
import { PageTitleContext } from './contexts/PageTitleContext';
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


// Scroll to top on every route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
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
  const menuRef = React.useRef(null);

  const isHome = location.pathname === '/';

  // Close drawer on route change
  React.useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

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
    <div className="w-9 h-9 rounded-full bg-gray-600 animate-pulse" />
  ) : user ? (
    <div className="relative" ref={menuRef}>
      {/* Avatar trigger — icon fallback when no avatar */}
      <button
        onClick={() => setMenuOpen(o => !o)}
        className={`flex items-center justify-center w-9 h-9 rounded-full ring-2 transition-all overflow-hidden ${menuOpen ? 'ring-purple-400' : 'ring-gray-600 hover:ring-gray-400'}`}
        style={{ backgroundColor: '#4b5563' }}
        aria-label="Account menu"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )}
      </button>

      {/* Desktop dropdown */}
      <div
        className={`absolute right-0 mt-2 w-64 rounded-xl shadow-2xl border border-gray-600/60 transition-all duration-150 z-50 overflow-hidden ${menuOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'}`}
        style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)' }}
      >
        {/* User info header */}
        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ backgroundColor: '#4b5563' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{displayName}</p>
            <button onClick={() => { navigate('/profile'); setMenuOpen(false); }} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">View Profile</button>
          </div>
        </div>

        <div className="py-1.5 overflow-y-auto max-h-[70vh]">
          {/* My Account */}
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">My Account</div>
          {[
            { label: 'Upload', path: '/upload', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /> },
            { label: 'Notifications', path: '/history', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
            { label: 'Pokédex', path: '/pokedex', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
          ].map(({ label, path, icon }) => (
            <button key={path} onClick={() => { navigate(path); setMenuOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
              {label}
            </button>
          ))}

          {(isPro || isModerator) && (
            <>
              <div className="border-t border-gray-700 my-1.5" />
              <div className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Pro</div>
              {isPro && (
                <button onClick={() => { navigate('/overlays'); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-purple-300 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
                  <svg className="w-4 h-4 shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                  Stream Overlays
                </button>
              )}
              {isModerator && (
                <button onClick={() => { navigate('/game-board'); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Game Board
                </button>
              )}
            </>
          )}

          {isModerator && (
            <>
              <div className="border-t border-gray-700 my-1.5" />
              <div className="px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-500">Moderator</div>
              {[
                { label: 'Approvals', path: '/approvals' },
                { label: 'Board Builder', path: '/board-builder' },
                { label: 'Upload Badge', path: '/badge-upload' },
                { label: 'Game Manager', path: '/pokemon-game-manager' },
                { label: 'Feedback', path: '/feedback' },
              ].map(({ label, path }) => (
                <button key={path} onClick={() => { navigate(path); setMenuOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
                  <span className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              ))}
              <button onClick={() => { setBannerManagerOpen(true); setMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm text-purple-400 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
                <span className="w-4 h-4 shrink-0" />
                Manage Banners
              </button>
            </>
          )}

          <div className="border-t border-gray-700 my-1.5" />
          <button onClick={() => { navigate('/about'); setMenuOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            How to Play
          </button>
          <button onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
            Suggestions & Bugs
          </button>
          <div className="border-t border-gray-700 my-1.5" />
          <button onClick={() => { signOut(); setMenuOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700/60 flex items-center gap-2.5 transition-colors">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Log out
          </button>
        </div>
      </div>
    </div>
  ) : (!import.meta.env.DEV || sessionStorage.getItem('realauth') === '1') ? (
    <button onClick={() => navigate('/login')} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-full transition-colors text-sm font-medium">
      Sign In / Sign Up
    </button>
  ) : null;

  /* ── Shared action buttons (upload + bell) ── */
  const actionButtons = user && (
    <>
      <button onClick={() => navigate('/upload')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors" title="Upload">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
      </button>
      <button onClick={() => navigate('/history')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors" title="Notifications">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
      </button>
    </>
  );

  /* ── Mobile hamburger button ── */
  const hamburger = (
    <button
      onClick={() => setDrawerOpen(true)}
      className="sm:hidden p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
      aria-label="Open menu"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );

  return (
    <div className="min-h-screen" style={{ background: '#0d0f14' }}>
      {/* ── Slide-out drawer (mobile) ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-72 flex flex-col shadow-2xl" style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)' }}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
              {user ? (
                <div className="flex items-center gap-3">
                  {user.user_metadata?.avatar_url && (
                    <img src={user.user_metadata.avatar_url} alt="Profile" className="w-9 h-9 rounded-full" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.username || 'User'}
                    </p>
                    <button onClick={() => { navigate('/profile'); setDrawerOpen(false); }} className="text-xs text-purple-400 hover:text-purple-300">View Profile</button>
                  </div>
                </div>
              ) : (
                <span className="text-sm font-semibold text-white">Menu</span>
              )}
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-2">
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Navigate</div>
              {[
                { label: 'Home', path: '/', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
                { label: 'Pokédex', path: '/pokedex', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /> },
                { label: 'How to Play', path: '/about', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
              ].map(({ label, path, icon }) => (
                <button key={path} onClick={() => { navigate(path); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-gray-700/60 ${location.pathname === path ? 'text-white font-medium' : 'text-gray-300'}`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                  {label}
                </button>
              ))}
              <button onClick={() => { navigate('/tools'); setDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-yellow-300 hover:bg-gray-700/60 transition-colors">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" /></svg>
                Shiny Tools
              </button>

              {user && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">My Account</div>
                  {[
                    { label: 'Upload', path: '/upload', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /> },
                    { label: 'Notifications', path: '/history', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
                  ].map(({ label, path, icon }) => (
                    <button key={path} onClick={() => { navigate(path); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/60 transition-colors">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
                      {label}
                    </button>
                  ))}
                </>
              )}

              {isModerator && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-500">Moderator</div>
                  {[
                    { label: 'Approvals', path: '/approvals' },
                    { label: 'Board Builder', path: '/board-builder' },
                    { label: 'Upload Badge', path: '/badge-upload' },
                    { label: 'Game Manager', path: '/pokemon-game-manager' },
                    { label: 'Feedback', path: '/feedback' },
                  ].map(({ label, path }) => (
                    <button key={path} onClick={() => { navigate(path); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-400 hover:bg-gray-700/60 transition-colors">
                      <span className="w-4 h-4 shrink-0" />
                      {label}
                    </button>
                  ))}
                  <button onClick={() => { setBannerManagerOpen(true); setDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-400 hover:bg-gray-700/60 transition-colors">
                    <span className="w-4 h-4 shrink-0" />
                    Manage Banners
                  </button>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Pro</div>
                  {isPro && (
                    <button onClick={() => { navigate('/overlays'); setDrawerOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-purple-300 hover:bg-gray-700/60 transition-colors">
                      <svg className="w-4 h-4 shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                      Stream Overlays
                    </button>
                  )}
                  <button onClick={() => { navigate('/game-board'); setDrawerOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-green-400 hover:bg-gray-700/60 transition-colors">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Game Board
                  </button>
                </>
              )}

              <div className="border-t border-gray-700 my-2" />
              <button onClick={() => { setFeedbackOpen(true); setDrawerOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-700/60 transition-colors">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                Suggestions & Bugs
              </button>
              {user && (
                <button onClick={() => { signOut(); setDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-gray-700/60 transition-colors">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Log out
                </button>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── Single adaptive header — full viewport width ── */}
      <header className="sticky top-0 z-50 shadow-md" style={{ background: '#13151a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className={`px-4 sm:px-6 py-2 md:py-4'}`}>
          {isHome ? (
            /* Home: logo left | nav flows naturally after logo | actions right */
            <div className="flex items-center">
              {/* Both images always in DOM so logoImage is pre-decoded before returning home */}
              <img src={logoImage} alt="Pokemon Bounty Board" className="h-10 sm:h-14 object-contain cursor-pointer shrink-0" onClick={() => navigate('/')} />
              <nav className="hidden sm:flex items-center gap-0.5 ml-6">
                <button onClick={() => navigate('/about')} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">How to Play</button>
                {user && <button onClick={() => navigate('/pokedex')} className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">Pokédex</button>}
                <button onClick={() => navigate('/tools')} className="px-3 py-1.5 text-sm text-yellow-300 hover:text-yellow-100 hover:bg-gray-700 rounded-lg transition-colors">Shiny Tools</button>
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
              <img
                src={logoImage}
                alt="Home"
                className="h-10 sm:h-14 object-contain cursor-pointer shrink-0"
                onClick={() => navigate('/')}
                title="Home"
              />
              <div className="w-pw h-5 pad-0.5 ml-6 bg-gray-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-white truncate">{pageMeta.title}</h1>
                  {pageMeta.badge === 'mod' && (
                    <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">Moderator</span>
                  )}
                  {pageMeta.badge === 'pro' && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">Pro</span>
                  )}
                </div>
                {pageMeta.subtitle && (
                  <p className="text-xs text-gray-400 mt-0.5">{pageMeta.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {pageMeta.completion && (
                  <div className="text-right mr-2 hidden sm:block">
                    <div className="text-xs text-gray-400">Caught</div>
                    <div className="text-lg font-bold text-purple-400">
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
      <footer className="mt-12 border-t border-gray-700 py-6 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm">
            <button onClick={() => navigate('/')} className="hover:text-gray-300 transition-colors">Home</button>
            <button onClick={() => navigate('/pokedex')} className="hover:text-gray-300 transition-colors">Pokédex</button>
            <button onClick={() => navigate('/about')} className="hover:text-gray-300 transition-colors">How to Play</button>
            <button onClick={() => navigate('/tools')} className="text-yellow-600 hover:text-yellow-400 transition-colors">Shiny Tools</button>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            <span>Pokeboard.net is not affiliated with Nintendo, Game Freak, or The Pokémon Company.</span>
            <span className="hidden sm:inline text-gray-700">|</span>
            <button onClick={() => navigate('/privacy')} className="hover:text-gray-300 transition-colors">Privacy Policy</button>
            <button onClick={() => navigate('/terms')} className="hover:text-gray-300 transition-colors">Terms of Service</button>
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
    <main className="max-w-7xl mx-auto px-4 py-5">
      {!user && (!import.meta.env.DEV || sessionStorage.getItem('realauth') === '1') && (
        <div className="mb-4 rounded-lg p-4 text-center cursor-pointer" onClick={() => navigate('/login')} style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', borderColor: 'rgba(147,51,234,0.4)', borderWidth: '1px' }}>
          <p className="text-purple-300 text-sm">
            👋 Sign in or create an account to track your own Pokémon progress!
          </p>
        </div>
      )}
      <BannerBar />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', borderColor: 'rgba(255,255,255,0.07)' }}>
          <BingoBoard />
        </div>
        <div className="relative rounded-xl shadow-xl overflow-hidden min-h-[480px] lg:min-h-0" style={{ background: 'linear-gradient(160deg, #1a1c23 0%, #1f2128 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="absolute inset-0 p-6 flex flex-col">
            <Leaderboard />
          </div>
        </div>
      </div>

      <TwitchAmbassadors />
    </main>
  );
};

// Consent gate: shown to any logged-in user who hasn't accepted the ToS yet.
// Bypassed in localhost dev (no real auth).
const ConsentGate = ({ children }) => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [tosAccepted, setTosAccepted] = React.useState(null); // null = unknown

  React.useEffect(() => {
    if (!user || import.meta.env.DEV) { setTosAccepted(true); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setTosAccepted(true); return; }
      fetch('/api/user/tos-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.json())
        .then(d => setTosAccepted(!!d.accepted))
        .catch(() => setTosAccepted(true)); // fail open so a network error doesn't lock users out
    });
  }, [user]);

  const handleAccept = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/user/accept-tos', {
      method: 'POST',
      headers: { Authorization: session ? `Bearer ${session.access_token}` : '' },
    });
    setTosAccepted(true);
  };

  return (
    <>
      {children}
      {!loading && user && tosAccepted === false && pathname !== '/privacy' && pathname !== '/terms' && (
        <ConsentModal onAccept={handleAccept} />
      )}
    </>
  );
};

function App() {
  const [pageMeta, setPageMeta] = React.useState({ title: '', badge: null, subtitle: null, completion: null });

  return (
    <Router>
      <ScrollToTop />
      <AuthProvider>
        <PageTitleContext.Provider value={{ pageMeta, setPageMeta }}>
        <NotificationToast />
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
        </PageTitleContext.Provider>
      </AuthProvider>
    </Router>
  );
}

export default App;
