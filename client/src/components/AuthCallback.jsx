import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../contexts/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for errors in URL
        const params = new URLSearchParams(window.location.search);
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');
        
        if (errorParam) {
          setError(`Login failed: ${errorDescription || errorParam}`);
          return;
        }
        
        // Wait for Supabase to process the OAuth callback
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          setError('Failed to sign in');
          return;
        }
        
        if (session) {
          navigate('/');
        } else {
          setError('Authentication failed. Please try again.');
        }
      } catch (err) {
        setError('Something went wrong. Please try again.');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="text-center">
        {error ? (
          <div>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go back
            </button>
          </div>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;