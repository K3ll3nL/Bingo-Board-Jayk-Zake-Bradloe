import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [availablePokemon, setAvailablePokemon] = useState([]);
  const [selectedPokemon, setSelectedPokemon] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [sortBy, setSortBy] = useState('dex'); // 'dex' or 'alpha'
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      loadAvailablePokemon();
    }
  }, [user]);

  const loadAvailablePokemon = async () => {
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/upload/available-pokemon', {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch available Pokemon');
      const data = await response.json();
      setAvailablePokemon(data);
      setError(null);
    } catch (err) {
      setError('Failed to load available Pokemon');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile(file);
      setMediaUrl(''); // Clear URL if file selected
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedPokemon) {
      setError('Please select a Pokemon');
      return;
    }
    
    if (!mediaUrl && !mediaFile) {
      setError('Please provide a media link or upload a file');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      
      const formData = new FormData();
      formData.append('pokemon_id', selectedPokemon);
      
      if (mediaFile) {
        formData.append('file', mediaFile);
      } else {
        formData.append('url', mediaUrl);
      }
      
      const response = await fetch('/api/upload/submission', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Submission failed');
      }
      
      setSuccess(true);
      setSelectedPokemon('');
      setMediaUrl('');
      setMediaFile(null);
      
      // Reload available Pokemon
      await loadAvailablePokemon();
      
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sortedPokemon = [...availablePokemon].sort((a, b) => {
    if (sortBy === 'dex') {
      return a.national_dex_id - b.national_dex_id;
    } else {
      return a.name.localeCompare(b.name);
    }
  });

  if (!user) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
        <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Upload Catch</h1>
            </div>
          </div>
        </header>
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-gray-400 mb-4">Please log in to upload</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#212326' }}>
      <header className="shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-white">Upload Catch</h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-8">
        {success && (
          <div className="mb-4 p-4 bg-green-500 bg-opacity-20 border border-green-500 rounded-lg">
            <p className="text-green-400">Submission successful!</p>
          </div>
        )}
        
        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-xl shadow-xl p-6" style={{ backgroundColor: '#35373b' }}>
          {/* Pokemon Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-200">
                Select Pokemon
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSortBy('dex')}
                  className={`px-3 py-1 text-xs rounded ${sortBy === 'dex' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  Dex #
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('alpha')}
                  className={`px-3 py-1 text-xs rounded ${sortBy === 'alpha' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  A-Z
                </button>
              </div>
            </div>
            
            <select
              value={selectedPokemon}
              onChange={(e) => setSelectedPokemon(e.target.value)}
              className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              disabled={loading || submitting}
            >
              <option value="">Select a Pokemon...</option>
              {sortedPokemon.map((poke) => (
                <option key={poke.id} value={poke.id}>
                  #{poke.national_dex_id} - {poke.name}
                </option>
              ))}
            </select>
            
            {selectedPokemon && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-gray-700 rounded-lg">
                <img
                  src={sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.img_url}
                  alt="Selected Pokemon"
                  className="w-16 h-16 object-contain"
                />
                <div>
                  <div className="text-white font-medium">
                    {sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.name}
                  </div>
                  <div className="text-gray-400 text-sm">
                    #{sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.national_dex_id}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Media Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-200 mb-2">
              Proof of Catch
            </label>
            
            {/* URL Input */}
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setMediaFile(null); // Clear file if URL entered
              }}
              placeholder="Or paste a link (e.g., Twitch clip, YouTube, image URL)"
              className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none mb-3"
              disabled={submitting || mediaFile !== null}
            />
            
            <div className="text-center text-gray-400 text-sm my-2">OR</div>
            
            {/* File Upload */}
            <div className="relative">
              <input
                type="file"
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
                id="file-upload"
                disabled={submitting || mediaUrl !== ''}
              />
              <label
                htmlFor="file-upload"
                className={`block w-full p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                  mediaFile || mediaUrl
                    ? 'border-gray-600 bg-gray-800 cursor-not-allowed'
                    : 'border-gray-600 bg-gray-700 hover:border-purple-500'
                }`}
              >
                {mediaFile ? (
                  <div className="text-white">
                    <svg className="w-8 h-8 mx-auto mb-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm">{mediaFile.name}</p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm">Click to upload image or video</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !selectedPokemon || (!mediaUrl && !mediaFile)}
            className="w-full py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Catch'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Upload;