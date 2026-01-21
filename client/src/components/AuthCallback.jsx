import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../contexts/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [debug, setDebug] = useState([]);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Log the current URL and params
        const url = window.location.href;
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        
        setDebug(prev => [...prev, `URL: ${url}`]);
        setDebug(prev => [...prev, `Search params: ${params.toString()}`]);
        setDebug(prev => [...prev, `Hash: ${hash}`]);
        
        // Check for errors in URL
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');
        
        if (errorParam) {
          setDebug(prev => [...prev, `Error in URL: ${errorParam} - ${errorDescription}`]);
          setError(`OAuth Error: ${errorDescription || errorParam}`);
          return;
        }
        
        // Wait for Supabase to process the OAuth callback
        setDebug(prev => [...prev, 'Waiting for Supabase to process...']);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        setDebug(prev => [...prev, `Session check: ${session ? 'Found' : 'None'}`]);
        
        if (sessionError) {
          setDebug(prev => [...prev, `Session error: ${sessionError.message}`]);
          setError('Failed to sign in: ' + sessionError.message);
          return;
        }
        
        if (session) {
          setDebug(prev => [...prev, `User: ${session.user.email}`]);
          navigate('/');
        } else {
          setDebug(prev => [...prev, 'No session found after OAuth']);
          setError('No session created');
        }
      } catch (err) {
        setDebug(prev => [...prev, `Exception: ${err.message}`]);
        setError('Something went wrong: ' + err.message);
      }
    };

    handleCallback();
  }, [navigate, location]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-2xl w-full">
        {error ? (
          <div>
            <p className="text-red-600 mb-4 font-semibold">{error}</p>
            <div className="bg-gray-100 p-4 rounded mb-4 text-xs overflow-auto max-h-96">
              <p className="font-semibold mb-2">Debug Info:</p>
              {debug.map((msg, i) => (
                <div key={i} className="mb-1">{msg}</div>
              ))}
            </div>
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
            <p className="text-gray-600 text-center mb-4">Signing you in...</p>
            <div className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-64">
              {debug.map((msg, i) => (
                <div key={i} className="mb-1">{msg}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;