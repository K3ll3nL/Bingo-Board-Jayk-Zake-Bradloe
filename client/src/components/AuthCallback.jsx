import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../contexts/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        // Supabase automatically handles the OAuth callback when the page loads
        // Just wait a moment for it to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if we have a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Failed to sign in');
          return;
        }
        
        if (session) {
          console.log('Session established:', session.user.email);
          navigate('/');
        } else {
          console.error('No session after OAuth');
          setError('No session created');
        }
      } catch (err) {
        console.error('Callback error:', err);
        setError('Something went wrong');
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
              className="text-blue-600 hover:underline"
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