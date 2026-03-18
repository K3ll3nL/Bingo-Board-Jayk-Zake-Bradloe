import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { RESTRICTED_LAUNCH_DATE } from '../featureFlags';
import PageBackground from './PageBackground';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const getAuthHeader = async () => {
  if (import.meta.env.DEV &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'Bearer dev_token';
  }
  const { data: { session } } = await supabase.auth.getSession();
  return `Bearer ${session?.access_token}`;
};

const Upload = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isRestrictedEnabled = new Date() >= RESTRICTED_LAUNCH_DATE;
  const [availablePokemon, setAvailablePokemon] = useState([]);
  const [restrictedAvailablePokemon, setRestrictedAvailablePokemon] = useState(null);
  const [selectedPokemon, setSelectedPokemon] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFile2, setMediaFile2] = useState(null);
  const [sortBy, setSortBy] = useState('dex');
  const [loading, setLoading] = useState(true);
  const [isRestricted, setIsRestricted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipHideTimer = useRef(null);
  const tooltipShowTimer = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      loadAvailablePokemon();
    }
  }, [user]);

  useEffect(() => {
    if (isRestricted && isRestrictedEnabled && restrictedAvailablePokemon === null && user) {
      loadRestrictedAvailablePokemon();
    }
  }, [isRestricted]);

  useEffect(() => {
    // Pre-select Pokemon from URL param
    const params = new URLSearchParams(window.location.search);
    const pokemonId = params.get('pokemon');
    if (pokemonId && availablePokemon.length > 0) {
      setSelectedPokemon(pokemonId);
    }
  }, [availablePokemon]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownOpen && !e.target.closest('.pokemon-dropdown')) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const loadAvailablePokemon = async () => {
    try {
      const response = await fetch('/api/upload/available-pokemon', {
        headers: {
          'Authorization': await getAuthHeader()
        }
      });
      if (!response.ok) throw new Error('Failed to fetch available Pokemon');
      const data = await response.json();
      console.log('Available Pokemon data:', data);
      console.log('First Pokemon:', data[0]);
      setAvailablePokemon(data);
      setError(null);
    } catch (err) {
      setError('Failed to load available Pokemon');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRestrictedAvailablePokemon = async () => {
    try {
      const response = await fetch('/api/upload/available-pokemon-restricted', {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to fetch restricted available Pokemon');
      const data = await response.json();
      setRestrictedAvailablePokemon(data);
    } catch (err) {
      console.error('Error loading restricted available Pokemon:', err);
      // Keep null so currentPokemonList falls back to availablePokemon
      setRestrictedAvailablePokemon(null);
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
    
    if (isRestricted && !mediaUrl) {
      setError('Restricted submissions require a VOD or video link.');
      return;
    }

    if (!isRestricted && !mediaUrl && (!mediaFile || !mediaFile2)) {
      setError('Please provide either a Twitch link OR both proof images');
      return;
    }
    
    // Client-side file size validation (4MB limit)
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
    
    if (mediaFile && mediaFile.size > MAX_FILE_SIZE) {
      const sizeMB = (mediaFile.size / (1024 * 1024)).toFixed(1);
      setError(`Proof of Shiny image is too large (${sizeMB}MB). Please compress to under 4MB before uploading.`);
      return;
    }
    
    if (mediaFile2 && mediaFile2.size > MAX_FILE_SIZE) {
      const sizeMB = (mediaFile2.size / (1024 * 1024)).toFixed(1);
      setError(`Proof of Date image is too large (${sizeMB}MB). Please compress to under 4MB before uploading.`);
      return;
    }
    
    if (mediaFile && mediaFile2 && (mediaFile.size + mediaFile2.size) > MAX_FILE_SIZE) {
      const totalMB = ((mediaFile.size + mediaFile2.size) / (1024 * 1024)).toFixed(1);
      setError(`Combined images are too large (${totalMB}MB). Please compress both images to under 4MB total.`);
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('pokemon_id', selectedPokemon);
      formData.append('restricted_submission', isRestricted ? 'true' : 'false');

      if (mediaFile && mediaFile2) {
        formData.append('file', mediaFile);
        formData.append('file2', mediaFile2);
      } else if (mediaUrl) {
        formData.append('url', mediaUrl);
      }

      const response = await fetch('/api/upload/submission', {
        method: 'POST',
        headers: {
          'Authorization': await getAuthHeader()
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
      setIsRestricted(false);

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

  const currentPokemonList = (isRestricted && isRestrictedEnabled && restrictedAvailablePokemon !== null)
    ? restrictedAvailablePokemon
    : availablePokemon;

  const sortedPokemon = [...currentPokemonList].sort((a, b) => {
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
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-md" style={{ backgroundColor: '#35373b' }}>
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">Upload Catch</h1>
          </div>
        </div>
      </header>

      {/* Upload Form */}
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg shadow-lg p-6 border border-gray-600" style={{ backgroundColor: '#35373b' }}>
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
            
            <div className="relative pokemon-dropdown">
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

          {/* URL Text Box + Restricted Toggle */}
          <div className="mb-3 flex items-stretch gap-2">
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setMediaFile(null);
                setMediaFile2(null);
              }}
              placeholder="Paste Twitch clip, VOD, or YouTube link here"
              className="flex-1 p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              disabled={submitting || mediaFile !== null || mediaFile2 !== null}
            />

            {isRestrictedEnabled && (
              <div
                className="relative flex-shrink-0"
                onMouseEnter={() => {
                  clearTimeout(tooltipHideTimer.current);
                  tooltipShowTimer.current = setTimeout(() => setShowTooltip(true), 600);
                }}
                onMouseLeave={() => {
                  clearTimeout(tooltipShowTimer.current);
                  tooltipHideTimer.current = setTimeout(() => setShowTooltip(false), 150);
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = !isRestricted;
                    setIsRestricted(next);
                    if (next) {
                      setMediaFile(null);
                      setMediaFile2(null);
                    }
                  }}
                  className={`h-full flex items-center gap-1.5 px-3 rounded-lg border transition-colors ${
                    isRestricted
                      ? 'border-[#78150a] bg-[#78150a] text-white'
                      : 'border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-xs font-medium">Restricted</span>
                </button>

                {/* Tooltip */}
                {showTooltip && (
                  <div
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-52 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs z-10 shadow-lg"
                    onMouseEnter={() => {
                      clearTimeout(tooltipHideTimer.current);
                      clearTimeout(tooltipShowTimer.current);
                    }}
                    onMouseLeave={() => {
                      tooltipHideTimer.current = setTimeout(() => setShowTooltip(false), 150);
                    }}
                  >
                    <p className="font-medium text-white mb-1">Restricted Challenge</p>
                    <p className="text-gray-400 mb-2">Submit a VOD or stored video link to count toward the restricted challenge.</p>
                    <a href="/about#restricted" className="text-purple-400 hover:text-purple-300 transition-colors">
                      Learn more →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OR Divider + Image Upload (disabled when restricted) */}
          <div className={`transition-opacity duration-200 ${isRestricted ? 'opacity-40 pointer-events-none select-none' : ''}`}>
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
          </div>{/* end restricted-disabled wrapper */}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !selectedPokemon || (isRestricted ? !mediaUrl : !mediaUrl && (!mediaFile || !mediaFile2))}
            className="w-full py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Catch'}
          </button>
        </form>
      </div>
      </div>
      </div>
    </div>
  );
};

export default Upload;