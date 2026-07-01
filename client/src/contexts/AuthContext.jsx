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

// Returns true when the dev bypass (VITE_DEV_USER_ID) should be active.
// Visit /?realauth=1 to disable the bypass and use real OAuth on localhost.
// Visit /?realauth=0 (or a fresh tab) to restore the bypass.
const useDevBypass = () => {
  if (!isLocalhostDev() || !import.meta.env.VITE_DEV_USER_ID) return false;
  return sessionStorage.getItem('realauth') !== '1';
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardVersion, setBoardVersion] = useState(0);
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [isModerator, setIsModerator] = useState(null);
  const [identities, setIdentities] = useState([]);

  const refreshIdentities = async () => {
    try {
      let authHeader;
      if (useDevBypass()) {
        authHeader = 'Bearer dev_token';
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        authHeader = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/user/identities', { headers: { Authorization: authHeader } });
      if (!res.ok) return;
      const { identities: ids } = await res.json();
      setIdentities(ids ?? []);
    } catch { setIdentities([]); }
  };

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
        const res = await fetch('/api/user/is-pro', { headers: { Authorization: authHeader } });
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
    // Persist ?realauth param into sessionStorage so it survives OAuth redirects
    const params = new URLSearchParams(window.location.search);
    if (params.get('realauth') === '1') sessionStorage.setItem('realauth', '1');
    if (params.get('realauth') === '0') sessionStorage.removeItem('realauth');

    if (useDevBypass()) {
      setUser({
        id: import.meta.env.VITE_DEV_USER_ID,
        email: 'dev@localhost',
        user_metadata: { full_name: 'Dev (localhost)' }
      });
      setLoading(false);
      refreshIdentities();
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) refreshIdentities();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) refreshIdentities();
      else setIdentities([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  const callbackUrl = (action) => {
    const base = import.meta.env.DEV
      ? 'http://localhost:5173/auth/callback'
      : `${window.location.origin}/auth/callback`;
    return action ? `${base}?action=${action}` : base;
  };

  const signInWithOAuth = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() }
    });
    if (error) { console.error('Error signing in:', error); throw error; }
  };

  const signInWithDiscord = () => signInWithOAuth('discord');
  const signInWithGoogle  = () => signInWithOAuth('google');
  const signInWithTwitch  = () => signInWithOAuth('twitch');

  // Links a new OAuth provider to the currently signed-in account.
  // Redirects through OAuth; callback detects ?action=link and returns to /profile.
  const linkIdentity = async (provider) => {
    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo: callbackUrl('link') }
    });
    if (error) { console.error('Error linking identity:', error); throw error; }
  };

  // Unlinks a provider identity. Requires the user to have at least 2 linked providers.
  // Pass the provider string (e.g. 'discord').
  const unlinkIdentity = async (provider) => {
    // supabase.auth.unlinkIdentity needs the full identity object from the session
    const { data: { user: u } } = await supabase.auth.getUser();
    const fullIdentity = u?.identities?.find(i => i.provider === provider);
    if (!fullIdentity) throw new Error(`Identity not found for provider: ${provider}`);
    const { error } = await supabase.auth.unlinkIdentity(fullIdentity);
    if (error) { console.error('Error unlinking identity:', error); throw error; }
    await refreshIdentities();
  };

  const signOut = async () => {
    if (useDevBypass()) {
      setUser(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) { console.error('Error signing out:', error); throw error; }
  };

  const value = {
    user,
    loading,
    signInWithDiscord,
    signInWithGoogle,
    signInWithTwitch,
    linkIdentity,
    unlinkIdentity,
    refreshIdentities,
    identities,
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
