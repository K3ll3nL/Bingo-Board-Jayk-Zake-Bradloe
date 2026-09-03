import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

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
  const [tos, setTos] = useState(null); // { accepted, is_update, current_version } | null (unknown)

  // One request answers "who is this user?" for app boot — identities, ToS
  // status, moderator and pro flags. Replaces four separate endpoints
  // (/api/user/{identities,tos-status,is-moderator,is-pro}) the client used to
  // fire as four serverless invocations on every page load — see
  // GET /api/user/context. Fails open on ToS so a network blip never locks a
  // user out; permission flags fall back to their safe defaults.
  const refreshUserContext = async () => {
    try {
      let authHeader;
      if (useDevBypass()) {
        authHeader = 'Bearer dev_token';
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        authHeader = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/user/context', { headers: { Authorization: authHeader } });
      if (!res.ok) { setTos({ accepted: true, is_update: false }); return; }
      const d = await res.json();
      setIdentities(d.identities ?? []);
      setIsPro(!!d.isPro);
      setIsModerator(!!d.isModerator);
      setTos(d.tos ?? { accepted: true, is_update: false });
    } catch {
      setTos({ accepted: true, is_update: false });
    }
  };
  // Kept for callers that only need identities refreshed (e.g. after unlink) —
  // refreshing the whole context is a superset and costs the same one request.
  const refreshIdentities = refreshUserContext;

  // Load the consolidated context once auth settles; reset to safe defaults when
  // signed out. Gated on `loading` so a refresh doesn't briefly see user=null
  // and flip gated pages home (same reasoning the split pro/mod effects used).
  useEffect(() => {
    if (loading) return;
    if (!user) { setIdentities([]); setIsPro(false); setIsModerator(false); setTos(null); return; }
    refreshUserContext();
  }, [user, loading]);

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
      // Context (identities/tos/mod/pro) is loaded by the [user, loading] effect.
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
    refreshUserContext,
    identities,
    tos,
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
