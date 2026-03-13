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
    supabase
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { supabase };
