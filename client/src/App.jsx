import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import BingoBoard from './components/BingoBoard';
import Leaderboard from './components/Leaderboard';
import AuthCallback from './components/AuthCallback';
import Profile from './components/Profile';
import Pokedex from './components/Pokedex';
import TwitchAmbassadors from './components/TwitchAmbassadors';
import Upload from './components/Upload';
import Approvals from './components/Approvals';
import BoardBuilder from './components/BoardBuilder';
import SubmissionHistory from './components/SubmissionHistory';
import NotificationToast from './components/NotificationToast';
import About from './components/About';
import Pro from './components/Pro';
import OverlayBoard from './components/OverlayBoard';
import OverlayLeaderboard from './components/OverlayLeaderboard';
import BadgeUpload from './components/BadgeUpload';
import PokemonGameManager from './components/PokemonGameManager';
import FeedbackModal from './components/FeedbackModal';
import ModFeedback from './components/ModFeedback';
import logoImage from './Icons/pokemon-bounty-board.png';

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

const MainApp = () => {
  const { user, signInWithDiscord, signOut, loading, isPro, isModerator } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
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

  // Debug logging
  React.useEffect(() => {
    console.log('Auth state:', { user, loading });
    console.log('User metadata:', user?.user_metadata);
  }, [user, loading]);


  const handleLogin = async () => {
    try {
      await signInWithDiscord();
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-2 md:py-4">
          <div className="flex items-center justify-between md:justify-center md:relative gap-3">
            {/* Logo — left on mobile, centered on desktop */}
            <img
              src={logoImage}
              alt="Pokemon Bounty Board"
              className="h-10 sm:h-16 md:h-20 object-contain cursor-pointer max-w-[55%] sm:max-w-none"
              onClick={() => navigate('/')}
            />

            {/* Login/Profile Button — right on mobile, absolute right on desktop */}
            <div className="flex items-center gap-3 shrink-0 md:absolute md:right-0">
              {loading ? (
                <div className="w-10 h-10 rounded-full bg-gray-600 animate-pulse"></div>
              ) : user ? (
                <div className="relative group" ref={menuRef}>
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setMenuOpen(o => !o)}>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-white">
                        {user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.username || 'User'}
                      </p>
                    </div>
                    {user.user_metadata?.avatar_url && (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="Profile"
                        className={`w-10 h-10 rounded-full ring-2 transition-all ${menuOpen ? 'ring-purple-400' : 'ring-transparent'}`}
                      />
                    )}
                    {/* Hamburger icon — mobile only */}
                    <div className="sm:hidden flex flex-col justify-center gap-1.5 w-10 h-10 items-center">
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
                      <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </div>
                  </div>

                  {/* Dropdown Menu */}
                  <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg transition-all duration-200 z-50 ${menuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`} style={{ backgroundColor: '#35373b' }}>
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
                          <div className="border-t border-gray-600 my-1"></div>
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
                          <div className="border-t border-gray-600 my-1"></div>
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
                        </>
                      )}
                      <div className="border-t border-gray-600 my-1"></div>
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
              ) : !import.meta.env.DEV && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate('/about')}
                    className="hidden sm:flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    How to Play
                  </button>
                  <button
                    onClick={handleLogin}
                    className="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded-full transition-colors"
                  >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span className="text-sm font-medium">Login</span>
                </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-5">
        {!user && !import.meta.env.DEV && (
          <div className="mb-4 rounded-lg p-4 text-center" style={{ backgroundColor: '#35373b', borderColor: '#5865F2', borderWidth: '1px' }}>
            <p className="text-blue-300 text-sm">
              👋 Sign in with Discord to track your own Pokemon progress!
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bingo Board Module */}
          <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <BingoBoard />
          </div>

          {/* Leaderboard Module */}
          <div className="rounded-xl shadow-xl p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
            <Leaderboard />
          </div>
        </div>

        {/* Twitch Ambassadors Carousel */}
        <TwitchAmbassadors />
      </main>

      {/* Footer */}
      {/* <footer className="mt-12 pb-8 text-center text-gray-400 text-sm">
        <p>Made with 💜 for Pokemon trainers</p>
      </footer> */}

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationToast />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pokedex" element={<Pokedex />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/history" element={<SubmissionHistory />} />
          <Route path="/board-builder" element={<BoardBuilder />} />
          <Route path="/about" element={<About />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="/overlay/board" element={<OverlayBoard />} />
          <Route path="/overlay/leaderboard" element={<OverlayLeaderboard />} />
          <Route path="/badge-upload" element={<BadgeUpload />} />
          <Route path="/pokemon-game-manager" element={<PokemonGameManager />} />
          <Route path="/feedback" element={<ModFeedback />} />
          <Route path="*" element={<MainApp />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;