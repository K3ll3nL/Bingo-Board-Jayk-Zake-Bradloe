import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import BingoBoard from './components/BingoBoard';
import Leaderboard from './components/Leaderboard';
import AuthCallback from './components/AuthCallback';
import Profile from './components/Profile';
import Pokedex from './components/Pokedex';

const MainApp = () => {
  const { user, signInWithDiscord, signOut, loading } = useAuth();
  const navigate = useNavigate();

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
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl font-bold text-center text-white">
                🎮 Pokemon Bingo 🎮
              </h1>
            </div>
            
            {/* Login/Profile Button */}
            <div className="flex items-center gap-3">
              {loading ? (
                <div className="w-10 h-10 rounded-full bg-gray-600 animate-pulse"></div>
              ) : user ? (
                <div className="relative group">
                  <div className="flex items-center gap-3 cursor-pointer">
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {user.user_metadata?.custom_claims?.global_name || user.user_metadata?.full_name || user.user_metadata?.username || 'User'}
                      </p>
                    </div>
                    {user.user_metadata?.avatar_url && (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="Profile"
                        className="w-10 h-10 rounded-full ring-2 ring-transparent group-hover:ring-purple-400 transition-all"
                      />
                    )}
                  </div>
                  
                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-48 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50" style={{ backgroundColor: '#35373b' }}>
                    <div className="py-2">
                      <button
                        onClick={() => navigate('/profile')}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </button>
                      <button
                        onClick={() => navigate('/pokedex')}
                        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Pokedex
                      </button>
                      <div className="border-t border-gray-600 my-1"></div>
                      <button
                        onClick={signOut}
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
              ) : (
                <button
                  onClick={handleLogin}
                  className="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                  <span className="text-sm font-medium">Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {!user && (
          <div className="mb-6 rounded-lg p-4 text-center" style={{ backgroundColor: '#35373b', borderColor: '#5865F2', borderWidth: '1px' }}>
            <p className="text-blue-300 text-sm">
              👋 Sign in with Discord to track your own Pokemon progress!
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bingo Board Module */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <BingoBoard />
          </div>

          {/* Leaderboard Module */}
          <div className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
            <Leaderboard />
          </div>
        </div>
      </main>

      {/* Footer */}
      {/* <footer className="mt-12 pb-8 text-center text-gray-400 text-sm">
        <p>Made with 💜 for Pokemon trainers</p>
      </footer> */}
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/pokedex" element={<Pokedex />} />
          <Route path="*" element={<MainApp />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;