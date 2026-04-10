import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import FeedbackModal from './FeedbackModal';
import BannerManagerModal from './BannerManagerModal';

const maxWidthClasses = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '7xl': 'max-w-7xl',
};

/**
 * Unified page header used across all sub-pages.
 *
 * Props:
 *   title      {string}   Required. Page title.
 *   subtitle   {string}   Optional. Small descriptive text below the title.
 *   badge      {'mod'|'pro'} Optional. Hero badge shown next to the title.
 *   onBack     {function} Optional. Custom back handler. Defaults to navigate('/').
 *   completion {{ caught: number, total: number }} Optional. Pokédex completion shown on the right.
 *   maxWidth   {'3xl'|'4xl'|'7xl'} Optional. Inner max-width. Defaults to '7xl'.
 */
const PageHeader = ({
  title,
  subtitle,
  badge,
  onBack,
  completion,
  maxWidth = '7xl',
}) => {
  const navigate = useNavigate();
  const { user, signOut, loading, isPro, isModerator } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [bannerManagerOpen, setBannerManagerOpen] = React.useState(false);
  const menuRef = React.useRef(null);

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

  const handleBack = onBack ?? (() => navigate('/'));
  const widthClass = maxWidthClasses[maxWidth] ?? 'max-w-7xl';

  return (
    <>
      <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className={`${widthClass} mx-auto px-4 py-2 md:py-4`}>
          <div className="flex items-center justify-between gap-4">
            {/* Left: back button + title */}
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={handleBack}
                className="text-gray-400 hover:text-white transition-colors shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white truncate">{title}</h1>
                  {badge === 'mod' && (
                    <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">
                      Moderator
                    </span>
                  )}
                  {badge === 'pro' && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-medium shrink-0">
                      Pro
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>

            {/* Right: completion + user menu */}
            <div className="flex items-center gap-4 shrink-0">
              {completion && (
                <div className="text-right">
                  <div className="text-sm text-gray-400">Caught</div>
                  <div className="text-xl font-bold text-purple-400">
                    {completion.caught} / {completion.total}
                  </div>
                </div>
              )}

              {loading ? (
                <div className="w-10 h-10 rounded-full bg-gray-600 animate-pulse" />
              ) : user ? (
                <div className="relative" ref={menuRef}>
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setMenuOpen(o => !o)}>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-white">
                        {user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.username || 'User'}
                      </p>
                    </div>
                    {user.user_metadata?.avatar_url ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="Profile"
                        className={`w-10 h-10 rounded-full ring-2 transition-all ${menuOpen ? 'ring-purple-400' : 'ring-transparent'}`}
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full ring-2 transition-all flex items-center justify-center bg-gray-600 ${menuOpen ? 'ring-purple-400' : 'ring-transparent'}`}>
                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    {/* Hamburger — mobile only */}
                    <div className="sm:hidden flex flex-col justify-center gap-1.5 w-10 h-10 items-center">
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </div>
                  </div>

                  {/* Dropdown */}
                  <div
                    className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg transition-all duration-200 z-50 ${menuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
                    style={{ backgroundColor: '#35373b' }}
                  >
                    <div className="py-2">
                      <button
                        onClick={() => { navigate('/profile'); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </button>
                      <button
                        onClick={() => { navigate('/pokedex'); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Pokedex
                      </button>
                      <button
                        onClick={() => { navigate('/upload'); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Upload
                      </button>
                      <button
                        onClick={() => { navigate('/history'); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Notifications
                      </button>
                      {isPro && (
                        <>
                          <div className="border-t border-gray-600 my-1" />
                          <button
                            onClick={() => { navigate('/pro'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-300 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                            Stream Overlays
                          </button>
                        </>
                      )}
                      {isModerator && (
                        <>
                          <div className="border-t border-gray-600 my-1" />
                          <button
                            onClick={() => { navigate('/approvals'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Approvals
                          </button>
                          <button
                            onClick={() => { navigate('/board-builder'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                            </svg>
                            Board Builder
                          </button>
                          <button
                            onClick={() => { navigate('/badge-upload'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                            Upload Badge
                          </button>
                          <button
                            onClick={() => { navigate('/pokemon-game-manager'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
                            </svg>
                            Game Manager
                          </button>
                          <button
                            onClick={() => { navigate('/feedback'); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            Feedback
                          </button>
                          <button
                            onClick={() => { setBannerManagerOpen(true); setMenuOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-purple-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                            </svg>
                            Manage Banners
                          </button>
                        </>
                      )}
                      <div className="border-t border-gray-600 my-1" />
                      <button
                        onClick={() => { navigate('/about'); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        How to Play
                      </button>
                      <button
                        onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        Suggestions & Bugs
                      </button>
                      <button
                        onClick={() => { signOut(); setMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Log out
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <BannerManagerModal isOpen={bannerManagerOpen} onClose={() => setBannerManagerOpen(false)} />
    </>
  );
};

export default PageHeader;
