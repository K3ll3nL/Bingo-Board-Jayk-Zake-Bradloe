import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Only true during `npm run dev` on localhost — statically false in production builds
const isLocalhostDev = () =>
  import.meta.env.DEV &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardVersion, setBoardVersion] = useState(0);
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [isModerator, setIsModerator] = useState(null);

  // Check pro status whenever the user changes
  useEffect(() => {
    if (!user) { setIsPro(false); return; }
    const checkPro = async () => {
      try {
        let authHeader;
        if (isLocalhostDev()) {
          authHeader = 'Bearer dev_token';
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          authHeader = session ? `Bearer ${session.access_token}` : null;
        }
        if (!authHeader) { setIsPro(false); return; }
        const API_BASE = isLocalhostDev() ? 'http://localhost:3000/api' : '/api';
        const res = await fetch(`${API_BASE}/user/is-pro`, { headers: { Authorization: authHeader } });
        const d = await res.json();
        setIsPro(!!d.isPro);
      } catch { setIsPro(false); }
    };
    checkPro();
  }, [user]);

  // Check moderator status whenever the user changes
  useEffect(() => {
    if (!user) { setIsModerator(false); return; }
    const checkMod = async () => {
      try {
        let authHeader;
        if (isLocalhostDev()) {
          authHeader = 'Bearer dev_token';
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          authHeader = session ? `Bearer ${session.access_token}` : null;
        }
        if (!authHeader) { setIsModerator(false); return; }
        const res = await fetch('/api/user/is-moderator', { headers: { Authorization: authHeader } });
        const d = await res.json();
        setIsModerator(!!d.isModerator);
      } catch { setIsModerator(false); }
    };
    checkMod();
  }, [user]);

  // Realtime subscriptions live here so they survive route changes
  useEffect(() => {
    const channels = [];

    // Broadcast: works in dev + prod without any DB setup
    const boardBroadcast = supabase
      .channel('board-updates')
      .on('broadcast', { event: 'board-changed' }, () => setBoardVersion(v => v + 1))
      .subscribe();
    channels.push(boardBroadcast);

    const leaderboardBroadcast = supabase
      .channel('leaderboard-updates')
      .on('broadcast', { event: 'leaderboard-changed' }, () => setLeaderboardVersion(v => v + 1))
      .subscribe();
    channels.push(leaderboardBroadcast);

    return () => channels.forEach(c => supabase.removeChannel(c));
  }, [user]);

  useEffect(() => {
    if (isLocalhostDev() && import.meta.env.VITE_DEV_USER_ID) {
      setUser({
        id: import.meta.env.VITE_DEV_USER_ID,
        email: 'dev@localhost',
        user_metadata: { full_name: 'Dev (localhost)' }
      });
      setLoading(false);
      return;
    }

    // Production: normal Supabase auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithDiscord = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: import.meta.env.DEV
          ? 'http://localhost:5173/auth/callback'
          : `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    if (isLocalhostDev()) {
      setUser(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signInWithDiscord,
    signOut,
    supabase,
    boardVersion,
    leaderboardVersion,
    isPro,
    isModerator,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { supabase };
