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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFile2, setMediaFile2] = useState(null);
  const [sortBy, setSortBy] = useState('dex');
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
      setMediaUrl('');
    }
  };

  const handleFile2Change = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMediaFile2(file);
      setMediaUrl('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedPokemon) {
      setError('Please select a Pokemon');
      return;
    }
    
    if (!mediaUrl && (!mediaFile || !mediaFile2)) {
      setError('Please provide either a Twitch link OR both proof images');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const formData = new FormData();
      formData.append('pokemon_id', selectedPokemon);
      
      if (mediaFile && mediaFile2) {
        formData.append('file', mediaFile);
        formData.append('file2', mediaFile2);
      } else if (mediaUrl) {
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
      setMediaFile2(null);
      
      setTimeout(() => {
        setSuccess(false);
        loadAvailablePokemon();
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to submit catch');
      console.error(err);
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
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-400">Please log in to upload catches</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-center text-white mb-6">Upload Catch</h2>
      
      <div className="rounded-lg shadow-lg p-6" style={{ backgroundColor: '#212326' }}>
        {error && (
          <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-3 bg-green-900 border border-green-700 rounded-lg text-green-200 text-sm">
            Catch submitted successfully!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Pokemon Selection Dropdown */}
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
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none flex items-center justify-between"
                disabled={loading || submitting}
              >
                {selectedPokemon ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.img_url}
                      alt="Selected Pokemon"
                      className="w-8 h-8 object-contain"
                    />
                    <span>
                      #{String(sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.national_dex_id).padStart(4, '0')} - {sortedPokemon.find(p => p.id === parseInt(selectedPokemon))?.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">Select a Pokemon...</span>
                )}
                <svg className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {dropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                  {sortedPokemon.map((poke) => (
                    <button
                      key={poke.id}
                      type="button"
                      onClick={() => {
                        setSelectedPokemon(String(poke.id));
                        setDropdownOpen(false);
                      }}
                      className="w-full p-3 flex items-center gap-3 hover:bg-gray-600 transition-colors text-left"
                    >
                      <img
                        src={poke.img_url}
                        alt={poke.name}
                        className="w-8 h-8 object-contain flex-shrink-0"
                      />
                      <span className="text-white">
                        #{String(poke.national_dex_id).padStart(4, '0')} - {poke.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* URL Text Box */}
          <div className="mb-3">
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setMediaFile(null);
                setMediaFile2(null);
              }}
              placeholder="Paste Twitch clip, VOD, or YouTube link here"
              className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              disabled={submitting || mediaFile !== null || mediaFile2 !== null}
            />
          </div>

          {/* OR Divider */}
          <div className="text-center text-gray-400 text-sm my-4">OR</div>

          {/* Two Image Upload Boxes */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {/* Proof of Shiny */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Proof of Shiny</label>
              <input
                type="file"
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
                id="file-upload-1"
                disabled={submitting || mediaUrl !== ''}
              />
              <label
                htmlFor="file-upload-1"
                className={`block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                  mediaUrl
                    ? 'border-gray-600 bg-gray-800 cursor-not-allowed'
                    : 'border-gray-600 bg-gray-700 hover:border-purple-500'
                }`}
              >
                {mediaFile ? (
                  <div className="text-white">
                    <svg className="w-6 h-6 mx-auto mb-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs truncate">{mediaFile.name}</p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-xs">Upload image</p>
                  </div>
                )}
              </label>
            </div>

            {/* Proof of Date */}
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-2">Proof of Date</label>
              <input
                type="file"
                onChange={handleFile2Change}
                accept="image/*,video/*"
                className="hidden"
                id="file-upload-2"
                disabled={submitting || mediaUrl !== ''}
              />
              <label
                htmlFor="file-upload-2"
                className={`block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                  mediaUrl
                    ? 'border-gray-600 bg-gray-800 cursor-not-allowed'
                    : 'border-gray-600 bg-gray-700 hover:border-purple-500'
                }`}
              >
                {mediaFile2 ? (
                  <div className="text-white">
                    <svg className="w-6 h-6 mx-auto mb-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs truncate">{mediaFile2.name}</p>
                  </div>
                ) : (
                  <div className="text-gray-400">
                    <svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-xs">Upload image</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !selectedPokemon || (!mediaUrl && (!mediaFile || !mediaFile2))}
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