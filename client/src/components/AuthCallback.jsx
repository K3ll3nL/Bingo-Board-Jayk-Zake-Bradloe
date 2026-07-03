import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../contexts/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');
        const action = params.get('action'); // 'link' when called from linkIdentity()

        if (errorParam) {
          setError(`Login failed: ${errorDescription || errorParam}`);
          return;
        }

        // Wait for Supabase to process the OAuth callback
        await new Promise(resolve => setTimeout(resolve, 1500));

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError('Failed to sign in');
          return;
        }

        if (session) {
          if (action !== 'link') {
            // Fresh login — sync avatar in background
            fetch('/api/user/sync-avatar', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
            }).catch(() => {});
          }
          navigate(action === 'link' ? '/profile' : '/');
        } else {
          setError('Authentication failed. Please try again.');
        }
      } catch {
        setError('Something went wrong. Please try again.');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0f14' }}>
      <div className="text-center">
        {error ? (
          <div
            className="rounded-2xl p-8 border max-w-sm mx-4"
            style={{ background: 'linear-gradient(160deg, #13151a 0%, #181a21 100%)', borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <p className="text-red-400 mb-5">{error}</p>
            <Link
              to="/"
              className="inline-block px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
            >
              Go back
            </Link>
          </div>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
