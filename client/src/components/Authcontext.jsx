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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ========================================
    // LOCALHOST AUTO-LOGIN - ALWAYS RUNS FIRST
    // ========================================
    console.log('===== LOCALHOST CHECK =====');
    console.log('Hostname:', window.location.hostname);
    console.log('Port:', window.location.port);
    console.log('Full URL:', window.location.href);
    
    // If we're on localhost (ANY port), force dev login
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('✅ LOCALHOST DETECTED - FORCING DEV LOGIN');
      
      const devUser = {
        id: '3bb8389d-5147-4405-ad47-156315248565',
        email: 'kellen@localhost',
        user_metadata: {
          display_name: 'KELLEN (LOCALHOST)',
          avatar_url: null
        }
      };
      
      const devSession = {
        user: devUser,
        access_token: 'localhost_dev_token_kellen'
      };
      
      // Force set immediately
      localStorage.setItem('dev_session', JSON.stringify(devSession));
      setUser(devUser);
      setLoading(false);
      
      console.log('✅ LOCALHOST AUTO-LOGIN COMPLETE');
      console.log('User ID:', devUser.id);
      console.log('Display Name:', devUser.user_metadata.display_name);
      
      // STOP HERE - don't run any other auth code
      return;
    }
    
    console.log('❌ NOT LOCALHOST - Using normal Supabase auth');
    
    // Normal Supabase session check (only runs if NOT localhost)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithDiscord = async () => {
    // DEVELOPMENT ONLY: Bypass Discord OAuth on localhost
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === '';
    
    if (isLocalhost) {
      console.log('🔧 Development mode: Signing in as mod account');
      
      // Create a mock user object for development
      const devUser = {
        id: '3bb8389d-5147-4405-ad47-156315248565',
        email: 'dev@localhost',
        user_metadata: {
          display_name: 'Dev Mode (Kellen)'
        }
      };
      
      // Store dev session in localStorage
      localStorage.setItem('dev_session', JSON.stringify({
        user: devUser,
        access_token: 'dev_token'
      }));
      
      setUser(devUser);
      return;
    }
    
    // Production: Normal Discord OAuth flow
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const signOut = async () => {
    // Clear dev session if in development
    if (window.location.hostname === 'localhost' && import.meta.env.DEV) {
      localStorage.removeItem('dev_session');
      setUser(null);
      return;
    }
    
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const getAuthToken = async () => {
    // DEVELOPMENT ONLY: Return dev token
    if (window.location.hostname === 'localhost' && import.meta.env.DEV) {
      const devSession = localStorage.getItem('dev_session');
      if (devSession) {
        try {
          const session = JSON.parse(devSession);
          return session.access_token;
        } catch (e) {
          return null;
        }
      }
      return null;
    }
    
    // Production: Get real Supabase token
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const value = {
    user,
    loading,
    signInWithDiscord,
    signOut,
    getAuthToken,
    supabase
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { supabase };