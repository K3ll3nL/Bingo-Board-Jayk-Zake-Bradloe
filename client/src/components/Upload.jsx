import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createClient } from '@supabase/supabase-js';
import { isRestrictedEnabled } from '../featureFlags';
import { ALLOWED_GAMES } from '../constants/games';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

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

// ── Historical Upload Section ────────────────────────────────────────────────

const HistoricalUploadSection = () => {
  const { isModerator } = useAuth();
  const restrictedEnabled = isRestrictedEnabled(isModerator);
  const [pokemon, setPokemon] = useState(null); // null = loading
  const [selectedPokemon, setSelectedPokemon] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [game, setGame] = useState('');
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFile2, setMediaFile2] = useState(null);
  const [sortBy, setSortBy] = useState('dex');
  const [isRestricted, setIsRestricted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipHideTimer = useRef(null);
  const tooltipShowTimer = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadPokemon();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownOpen && !e.target.closest('.hist-pokemon-dropdown')) setDropdownOpen(false);
      if (gameDropdownOpen && !e.target.closest('.hist-game-dropdown')) setGameDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, gameDropdownOpen]);

  const loadPokemon = async () => {
    try {
      const response = await fetch('/api/upload/available-pokemon-historical', {
        headers: { 'Authorization': await getAuthHeader() }
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setPokemon(data);
    } catch (err) {
      console.error('Error loading historical Pokemon:', err);
      setPokemon([]);
    }
  };

  const selectedPokeData = (pokemon || []).find(p => p.id === parseInt(selectedPokemon)) ?? null;
  const selectedGameObj  = ALLOWED_GAMES.find(g => g.label === game) ?? null;
  const selectedGameKey  = selectedGameObj?.key ?? null;

  // Game-specific proof config (from games.js)
  const shinyLabel   = selectedGameObj?.shiny_label ?? 'Proof of Shiny';
  const noImageProof = !!selectedGameObj?.no_image_proof;

  const slugField = isRestricted ? 'restricted_game_slugs' : 'game_slugs';

  let filteredGames;
  if (selectedPokemon && selectedPokeData) {
    filteredGames = ALLOWED_GAMES.filter(g => (selectedPokeData[slugField] ?? []).includes(g.key));
  } else if (isRestricted) {
    const restrictedKeys = new Set((pokemon || []).flatMap(p => p.restricted_game_slugs ?? []));
    filteredGames = ALLOWED_GAMES.filter(g => restrictedKeys.has(g.key));
  } else {
    filteredGames = ALLOWED_GAMES;
  }

  let isRestrictedAvailable;
  if (selectedPokemon && selectedGameKey) {
    isRestrictedAvailable = (selectedPokeData?.restricted_game_slugs ?? []).includes(selectedGameKey);
  } else if (selectedPokemon) {
    isRestrictedAvailable = (selectedPokeData?.restricted_game_slugs ?? []).length > 0;
  } else if (selectedGameKey) {
    isRestrictedAvailable = (pokemon || []).some(p => (p.restricted_game_slugs ?? []).includes(selectedGameKey));
  } else {
    isRestrictedAvailable = true;
  }

  const sortedPokemon = [...(pokemon || [])].sort((a, b) =>
    sortBy === 'dex' ? a.national_dex_id - b.national_dex_id : a.name.localeCompare(b.name)
  );

  const handleSelectPokemon = (pokeId) => {
    setSelectedPokemon(String(pokeId));
    setDropdownOpen(false);
    const poke = (pokemon || []).find(p => p.id === pokeId);
    if (game) {
      const gameKey = ALLOWED_GAMES.find(g => g.label === game)?.key;
      if (gameKey && !(poke?.[slugField] ?? []).includes(gameKey)) setGame('');
    }
    if (isRestricted && !(poke?.restricted_game_slugs ?? []).length) setIsRestricted(false);
  };

  const handleSelectGame = (gameLabel) => {
    const gameKey = ALLOWED_GAMES.find(g => g.label === gameLabel)?.key;
    setGame(gameLabel);
    setGameDropdownOpen(false);
    if (selectedPokemon && gameKey && !(selectedPokeData?.[slugField] ?? []).includes(gameKey)) {
      setSelectedPokemon('');
    }
    if (isRestricted && gameKey && !(selectedPokeData?.restricted_game_slugs ?? []).includes(gameKey)) {
      setIsRestricted(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPokemon)    { setError('Please select a Pokemon'); return; }
    if (!game.trim())        { setError('Please select the game you hunted in'); return; }
    if (isRestricted && !mediaUrl.trim()) { setError('Restricted submissions require a VOD or video link.'); return; }
    if (!isRestricted && !mediaUrl.trim() && (!mediaFile || !mediaFile2)) {
      setError('Please provide either both proof images or a video link');
      return;
    }

    const MAX_FILE_SIZE = 4 * 1024 * 1024;
    if (mediaFile  && mediaFile.size  > MAX_FILE_SIZE) { setError(`Proof of Shiny is too large (${(mediaFile.size  / 1048576).toFixed(1)}MB). Compress to under 4MB.`); return; }
    if (mediaFile2 && mediaFile2.size > MAX_FILE_SIZE) { setError(`Proof of Date is too large (${(mediaFile2.size / 1048576).toFixed(1)}MB). Compress to under 4MB.`); return; }
    if (mediaFile && mediaFile2 && (mediaFile.size + mediaFile2.size) > MAX_FILE_SIZE) { setError(`Combined images are too large. Compress both to under 4MB total.`); return; }

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('pokemon_id', selectedPokemon);
      formData.append('restricted_submission', isRestricted ? 'true' : 'false');
      formData.append('game', game.trim());
      formData.append('month_id', String(selectedPokeData.month_id));
      if (isRestricted) {
        formData.append('link', mediaUrl.trim());
      } else {
        if (mediaFile)           formData.append('file', mediaFile);
        if (mediaFile2)          formData.append('file2', mediaFile2);
        if (mediaUrl.trim())     formData.append('link', mediaUrl.trim());
      }

      const response = await fetch('/api/upload/historical-submission', {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader() },
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Submission failed');
      }
      setSuccess(true);
      setSelectedPokemon('');
      setGame('');
      setMediaUrl('');
      setMediaFile(null);
      setMediaFile2(null);
      setTimeout(() => { setSuccess(false); loadPokemon(); }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to submit catch');
    } finally {
      setSubmitting(false);
    }
  };

  if (pokemon === null) {
    return <div className="text-center text-gray-500 py-6 text-sm">Loading historical Pokémon...</div>;
  }

  if (pokemon.length === 0) {
    return <div className="text-center text-gray-500 py-6 text-sm">No historical Pokémon available to submit.</div>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-900 border border-green-700 rounded-lg text-green-200 text-sm">
          Historical catch submitted successfully!
        </div>
      )}

      {/* Pokemon selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-200">Select Pokemon</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSortBy('dex')}
              className={`px-3 py-1 text-xs rounded ${sortBy === 'dex' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
              Dex #
            </button>
            <button type="button" onClick={() => setSortBy('alpha')}
              className={`px-3 py-1 text-xs rounded ${sortBy === 'alpha' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
              A-Z
            </button>
          </div>
        </div>
        <div className="relative hist-pokemon-dropdown">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={submitting}
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none flex items-center justify-between"
          >
            {selectedPokemon && selectedPokeData ? (
              <div className="flex items-center gap-3 min-w-0">
                <img src={selectedPokeData.img_url} alt={selectedPokeData.name} className="w-8 h-8 object-contain flex-shrink-0" />
                <span className="truncate">
                  #{String(selectedPokeData.national_dex_id).padStart(4, '0')} — {selectedPokeData.name}
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{selectedPokeData.month_label}</span>
              </div>
            ) : (
              <span className="text-gray-400">Select a Pokemon...</span>
            )}
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {selectedPokemon && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedPokemon(''); }}
                  className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              )}
              <svg className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {dropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
              {sortedPokemon.map(poke => (
                <button
                  key={poke.id}
                  type="button"
                  onClick={() => handleSelectPokemon(poke.id)}
                  className={`w-full p-3 flex items-center gap-3 hover:bg-gray-600 transition-colors text-left ${selectedPokemon === String(poke.id) ? 'bg-gray-600' : ''}`}
                >
                  <img src={poke.img_url} alt={poke.name} className="w-8 h-8 object-contain flex-shrink-0" />
                  <span className="text-white flex-1">
                    #{String(poke.national_dex_id).padStart(4, '0')} — {poke.name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{poke.month_label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Game selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-200 mb-2">
          Game Hunted In <span className="text-red-400">*</span>
        </label>
        <div className="relative hist-game-dropdown">
          <button
            type="button"
            onClick={() => setGameDropdownOpen(!gameDropdownOpen)}
            disabled={submitting}
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none flex items-center justify-between"
          >
            {game && selectedGameObj ? (
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex items-center gap-1 flex-shrink-0"
                  style={{ width: '88px', justifyContent: (selectedGameObj.img_urls?.length ?? 0) === 1 ? 'center' : 'flex-start' }}
                >
                  {(selectedGameObj.img_urls ?? []).slice(0, 2).map((url, i) => (
                    <div key={i} className="flex items-center justify-center flex-shrink-0" style={{ width: '42px', height: '24px' }}>
                      <img src={url} alt="" className="object-contain" style={{ maxHeight: '24px', maxWidth: '42px' }} />
                    </div>
                  ))}
                </div>
                <span className="text-sm truncate">{game}</span>
              </div>
            ) : (
              <span className="text-gray-400">Select a game...</span>
            )}
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {game && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setGame(''); }}
                  className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
              )}
              <svg className={`w-5 h-5 transition-transform ${gameDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {gameDropdownOpen && (
            <div className="absolute z-20 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {filteredGames.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">No games available for this Pokémon</div>
              ) : filteredGames.map(g => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => handleSelectGame(g.label)}
                  className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-600 transition-colors text-left ${game === g.label ? 'bg-gray-600' : ''}`}
                >
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    style={{ width: '88px', justifyContent: (g.img_urls?.length ?? 0) === 1 ? 'center' : 'flex-start' }}
                  >
                    {(g.img_urls ?? []).slice(0, 2).map((url, i) => (
                      <div key={i} className="flex items-center justify-center flex-shrink-0" style={{ width: '42px', height: '28px' }}>
                        <img src={url} alt="" className="object-contain" style={{ maxHeight: '28px', maxWidth: '42px' }} />
                      </div>
                    ))}
                  </div>
                  <span className="text-white text-sm">{g.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Video link + restricted button */}
      <div className="mb-6 flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-300 mb-2">
            {isRestricted || noImageProof
              ? <><span>Video Link</span> <span className="text-red-400">*</span></>
              : <span className="text-gray-400">Supplemental Video Link <span className="text-gray-500">(optional)</span></span>
            }
          </label>
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Twitch clip, VOD, or YouTube link"
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
            disabled={submitting}
          />
        </div>

        {restrictedEnabled && (
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
              disabled={!isRestrictedAvailable}
              onClick={() => {
                if (!isRestrictedAvailable) return;
                const next = !isRestricted;
                setIsRestricted(next);
                if (next) {
                  setMediaFile(null);
                  setMediaFile2(null);
                }
              }}
              className={`h-[46px] flex items-center gap-1.5 px-3 rounded-lg border transition-colors ${
                !isRestrictedAvailable
                  ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                  : isRestricted
                    ? 'border-[#78150a] bg-[#78150a] text-white'
                    : 'border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-xs font-medium">Restricted</span>
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {showTooltip && (
              <div
                className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-52 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs z-10 shadow-lg"
                onMouseEnter={() => { clearTimeout(tooltipHideTimer.current); clearTimeout(tooltipShowTimer.current); }}
                onMouseLeave={() => { tooltipHideTimer.current = setTimeout(() => setShowTooltip(false), 150); }}
              >
                <p className="font-medium text-white mb-1">Restricted Challenge</p>
                <p className="text-gray-400 mb-2">Submit a VOD or stored video link to count toward the restricted challenge.</p>
                <a href="/about#restricted" className="text-purple-400 hover:text-purple-300 transition-colors">Learn more →</a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Proof uploads */}
      <div className={`grid grid-cols-2 gap-4 mb-4 transition-opacity duration-200 ${noImageProof ? 'opacity-40 pointer-events-none select-none' : ''}`}>
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-2">
            {isRestricted || noImageProof
              ? <>{shinyLabel} <span className="text-gray-500">(optional)</span></>
              : <>{shinyLabel} <span className="text-red-400">*</span></>
            }
          </label>
          <input type="file" onChange={(e) => { if (e.target.files[0]) setMediaFile(e.target.files[0]); }} accept="image/*,video/*" className="hidden" id="hist-file-1" disabled={submitting} />
          <label htmlFor="hist-file-1" className="block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors border-gray-600 bg-gray-700 hover:border-purple-500">
            {mediaFile ? (
              <div className="text-white"><svg className="w-6 h-6 mx-auto mb-2 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg><p className="text-xs truncate">{mediaFile.name}</p></div>
            ) : (
              <div className="text-gray-400"><svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-xs">Upload image</p></div>
            )}
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-300 mb-2">
            {isRestricted || noImageProof
              ? <>Proof of Date <span className="text-gray-500">(optional)</span></>
              : <>Proof of Date <span className="text-red-400">*</span></>
            }
          </label>
          <input type="file" onChange={(e) => { if (e.target.files[0]) setMediaFile2(e.target.files[0]); }} accept="image/*,video/*" className="hidden" id="hist-file-2" disabled={submitting} />
          <label htmlFor="hist-file-2" className="block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors border-gray-600 bg-gray-700 hover:border-purple-500">
            {mediaFile2 ? (
              <div className="text-white"><svg className="w-6 h-6 mx-auto mb-2 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg><p className="text-xs truncate">{mediaFile2.name}</p></div>
            ) : (
              <div className="text-gray-400"><svg className="w-6 h-6 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><p className="text-xs">Upload image</p></div>
            )}
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !selectedPokemon || !game.trim() || (isRestricted || noImageProof ? !mediaUrl.trim() : (!mediaUrl.trim() && (!mediaFile || !mediaFile2)))}
        className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? 'Submitting...' : 'Submit Historical Catch'}
      </button>
    </form>
  );
};

// ── Main Upload Component ────────────────────────────────────────────────────

const Upload = () => {
  const { user, isModerator } = useAuth();
  const navigate = useNavigate();
  const restrictedEnabled = isRestrictedEnabled(isModerator);
  const [availablePokemon, setAvailablePokemon] = useState([]);
  const [restrictedAvailablePokemon, setRestrictedAvailablePokemon] = useState(null);
  const [selectedPokemon, setSelectedPokemon] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  // game state stores the label string (human-readable, written to DB)
  const [game, setGame] = useState('');
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaFile2, setMediaFile2] = useState(null);
  const [sortBy, setSortBy] = useState('dex');
  const [loading, setLoading] = useState(true);
  const [isRestricted, setIsRestricted] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipHideTimer = useRef(null);
  const tooltipShowTimer = useRef(null);
  const [checkedItems, setCheckedItems] = useState(() => {
    const result = {};
    for (const g of ALLOWED_GAMES) {
      for (const item of g.restricted_checklist ?? []) {
        result[item.id] = localStorage.getItem(`restricted_check_${item.id}`) === 'true';
      }
    }
    return result;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [isHistoricalMode, setIsHistoricalMode] = useState(false);

  useEffect(() => {
    if (user) loadAvailablePokemon();
  }, [user]);

  useEffect(() => {
    if (isRestricted && restrictedEnabled && restrictedAvailablePokemon === null && user) {
      loadRestrictedAvailablePokemon();
    }
  }, [isRestricted]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pokemonId = params.get('pokemon');
    if (pokemonId && availablePokemon.length > 0) {
      setSelectedPokemon(pokemonId);
    }
  }, [availablePokemon]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownOpen && !e.target.closest('.pokemon-dropdown')) setDropdownOpen(false);
      if (gameDropdownOpen && !e.target.closest('.game-dropdown')) setGameDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen, gameDropdownOpen]);

  const loadAvailablePokemon = async () => {
    try {
      const response = await fetch('/api/upload/available-pokemon', {
        headers: { 'Authorization': await getAuthHeader() }
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
      setRestrictedAvailablePokemon(null);
    }
  };

  const handleFileChange  = (e) => { if (e.target.files[0]) setMediaFile(e.target.files[0]); };
  const handleFile2Change = (e) => { if (e.target.files[0]) setMediaFile2(e.target.files[0]); };

  // ── Derived values ──────────────────────────────────────────────────────────

  const currentPokemonList = (isRestricted && restrictedEnabled && restrictedAvailablePokemon !== null)
    ? restrictedAvailablePokemon
    : availablePokemon;

  // The key slug for the currently selected game (used for filtering)
  const selectedGameObj = ALLOWED_GAMES.find(g => g.label === game) ?? null;
  const selectedGameKey = selectedGameObj?.key ?? null;

  // Game-specific proof config (from games.js)
  const shinyLabel       = selectedGameObj?.shiny_label ?? 'Proof of Shiny';
  const noImageProof     = !!selectedGameObj?.no_image_proof;
  const activeChecklist  = selectedGameObj?.restricted_checklist ?? [];

  const toggleCheck = (id) => {
    const next = !checkedItems[id];
    localStorage.setItem(`restricted_check_${id}`, String(next));
    setCheckedItems(prev => ({ ...prev, [id]: next }));
  };

  // Pokemon data object for the currently selected Pokemon
  const selectedPokemonData = currentPokemonList.find(p => p.id === parseInt(selectedPokemon)) ?? null;

  // ── Filtered Pokemon list ───────────────────────────────────────────────────
  let filteredPokemonList;
  if (selectedGameKey) {
    const slugField = isRestricted ? 'restricted_game_slugs' : 'game_slugs';
    filteredPokemonList = currentPokemonList.filter(p => (p[slugField] ?? []).includes(selectedGameKey));
  } else if (isRestricted) {
    filteredPokemonList = currentPokemonList.filter(p => (p.restricted_game_slugs ?? []).length > 0);
  } else {
    filteredPokemonList = currentPokemonList;
  }

  const sortedPokemon = [...filteredPokemonList].sort((a, b) =>
    sortBy === 'dex' ? a.national_dex_id - b.national_dex_id : a.name.localeCompare(b.name)
  );

  // ── Filtered games list ─────────────────────────────────────────────────────
  let filteredGames;
  if (selectedPokemon) {
    const slugField = isRestricted ? 'restricted_game_slugs' : 'game_slugs';
    filteredGames = ALLOWED_GAMES.filter(g => (selectedPokemonData?.[slugField] ?? []).includes(g.key));
  } else if (isRestricted) {
    const restrictedKeys = new Set(currentPokemonList.flatMap(p => p.restricted_game_slugs ?? []));
    filteredGames = ALLOWED_GAMES.filter(g => restrictedKeys.has(g.key));
  } else {
    filteredGames = ALLOWED_GAMES;
  }

  // ── Restricted button availability ──────────────────────────────────────────
  let isRestrictedAvailable;
  if (selectedPokemon && selectedGameKey) {
    isRestrictedAvailable = (selectedPokemonData?.restricted_game_slugs ?? []).includes(selectedGameKey);
  } else if (selectedPokemon) {
    isRestrictedAvailable = (selectedPokemonData?.restricted_game_slugs ?? []).length > 0;
  } else if (selectedGameKey) {
    isRestrictedAvailable = currentPokemonList.some(p => (p.restricted_game_slugs ?? []).includes(selectedGameKey));
  } else {
    isRestrictedAvailable = true;
  }

  // True when the selected pokemon already has a standard entry — forces restricted mode
  const isLockedRestricted = restrictedEnabled && !!selectedPokemonData?.has_standard_entry;

  // Force restricted on when a standard entry exists for the selected pokemon
  useEffect(() => {
    if (isLockedRestricted && !isRestricted) {
      setIsRestricted(true);
      setMediaFile(null);
      setMediaFile2(null);
    }
  }, [isLockedRestricted]);

  // ── Selection handlers with cross-invalidation ──────────────────────────────

  const handleSelectPokemon = (pokeId) => {
    const poke = currentPokemonList.find(p => p.id === pokeId);
    setSelectedPokemon(String(pokeId));
    setDropdownOpen(false);
    if (game && selectedGameKey && !(poke?.game_slugs ?? []).includes(selectedGameKey)) {
      setGame('');
    }
  };

  const handleSelectGame = (gameLabel) => {
    const gameKey = ALLOWED_GAMES.find(g => g.label === gameLabel)?.key;
    setGame(gameLabel);
    setGameDropdownOpen(false);
    if (selectedPokemon && gameKey && !(selectedPokemonData?.game_slugs ?? []).includes(gameKey)) {
      setSelectedPokemon('');
    }
  };

  const handleClearPokemon = (e) => {
    e.stopPropagation();
    setSelectedPokemon('');
  };

  const handleClearGame = (e) => {
    e.stopPropagation();
    setGame('');
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedPokemon) { setError('Please select a Pokemon'); return; }
    if (!game.trim())     { setError('Please select the game you hunted in'); return; }
    if (isRestricted && !mediaUrl) { setError('Restricted submissions require a VOD or video link.'); return; }
    if (!isRestricted && !mediaUrl.trim() && (!mediaFile || !mediaFile2)) { setError('Please provide either both proof images or a video link'); return; }

    const MAX_FILE_SIZE = 4 * 1024 * 1024;
    if (mediaFile && mediaFile.size > MAX_FILE_SIZE) {
      setError(`Proof of Shiny is too large (${(mediaFile.size / 1048576).toFixed(1)}MB). Compress to under 4MB.`);
      return;
    }
    if (mediaFile2 && mediaFile2.size > MAX_FILE_SIZE) {
      setError(`Proof of Date is too large (${(mediaFile2.size / 1048576).toFixed(1)}MB). Compress to under 4MB.`);
      return;
    }
    if (mediaFile && mediaFile2 && (mediaFile.size + mediaFile2.size) > MAX_FILE_SIZE) {
      setError(`Combined images are too large (${((mediaFile.size + mediaFile2.size) / 1048576).toFixed(1)}MB). Compress both to under 4MB total.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('pokemon_id', selectedPokemon);
      formData.append('restricted_submission', isRestricted ? 'true' : 'false');
      formData.append('game', game.trim());

      if (isRestricted) {
        formData.append('url', mediaUrl);
      } else {
        formData.append('file', mediaFile);
        formData.append('file2', mediaFile2);
        if (mediaUrl.trim()) formData.append('link', mediaUrl.trim());
      }

      const response = await fetch('/api/upload/submission', {
        method: 'POST',
        headers: { 'Authorization': await getAuthHeader() },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Submission failed');
      }

      setSuccess(true);
      setSelectedPokemon('');
      setGame('');
      setMediaUrl('');
      setMediaFile(null);
      setMediaFile2(null);
      setIsRestricted(false);

      setTimeout(() => { setSuccess(false); loadAvailablePokemon(); }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to submit catch');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (!user) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-lg text-gray-400">Please log in to upload catches</div>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-lg text-gray-400">Loading...</div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedPokeObj = sortedPokemon.find(p => p.id === parseInt(selectedPokemon))
    ?? currentPokemonList.find(p => p.id === parseInt(selectedPokemon));

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Upload Catch" />

      <div className="p-8">
        <div className="max-w-2xl mx-auto">

          {/* Mode toggle */}
          {restrictedEnabled && (
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setIsHistoricalMode(false)}
                className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
                  !isHistoricalMode ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Current Month
              </button>
              <button
                type="button"
                onClick={() => setIsHistoricalMode(true)}
                className={`px-5 py-2 rounded-lg font-medium text-sm transition-colors ${
                  isHistoricalMode ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Historical
              </button>
            </div>
          )}

          {/* ── Historical Form ─────────────────────────────────────────────── */}
          {restrictedEnabled && (
            <div className={`rounded-lg shadow-lg p-6 border border-gray-600 ${!isHistoricalMode ? 'hidden' : ''}`} style={{ backgroundColor: '#35373b' }}>
              <HistoricalUploadSection />
            </div>
          )}

          {/* ── Current Month Form ──────────────────────────────────────────── */}
          <div className={`rounded-lg shadow-lg p-6 border border-gray-600 ${isHistoricalMode && restrictedEnabled ? 'hidden' : ''}`} style={{ backgroundColor: '#35373b' }}>

            {error && (
              <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-200 text-sm">{error}</div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-900 border border-green-700 rounded-lg text-green-200 text-sm">
                Catch submitted successfully!
              </div>
            )}

            <form onSubmit={handleSubmit}>

              {/* Pokemon Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-200">
                    Select Pokemon
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSortBy('dex')}
                      className={`px-3 py-1 text-xs rounded ${sortBy === 'dex' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
                      Dex #
                    </button>
                    <button type="button" onClick={() => setSortBy('alpha')}
                      className={`px-3 py-1 text-xs rounded ${sortBy === 'alpha' ? 'bg-purple-500 text-white' : 'bg-gray-700 text-gray-300'}`}>
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
                    {selectedPokemon && selectedPokeObj ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={selectedPokeObj.img_url} alt={selectedPokeObj.name} className="w-8 h-8 object-contain flex-shrink-0" />
                        <span className="truncate">
                          #{String(selectedPokeObj.national_dex_id).padStart(4, '0')} — {selectedPokeObj.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Select a Pokemon...</span>
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {selectedPokemon && (
                        <span
                          role="button"
                          onClick={handleClearPokemon}
                          className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                          aria-label="Clear Pokemon selection"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                      <svg className={`w-5 h-5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                      {sortedPokemon.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">No Pokémon available for this game</div>
                      ) : sortedPokemon.map((poke) => (
                        <button
                          key={poke.id}
                          type="button"
                          onClick={() => handleSelectPokemon(poke.id)}
                          className={`w-full p-3 flex items-center gap-3 hover:bg-gray-600 transition-colors text-left ${selectedPokemon === String(poke.id) ? 'bg-gray-600' : ''}`}
                        >
                          <img src={poke.img_url} alt={poke.name} className="w-8 h-8 object-contain flex-shrink-0" />
                          <span className="text-white">
                            #{String(poke.national_dex_id).padStart(4, '0')} — {poke.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Game Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  Game Hunted In <span className="text-red-400">*</span>
                </label>
                <div className="relative game-dropdown">
                  <button
                    type="button"
                    onClick={() => setGameDropdownOpen(!gameDropdownOpen)}
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none flex items-center justify-between"
                    disabled={submitting}
                  >
                    {game && selectedGameObj ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="flex items-center gap-1 flex-shrink-0"
                          style={{
                            width: '88px',
                            justifyContent: (selectedGameObj.img_urls?.length ?? 0) === 1 ? 'center' : 'flex-start',
                          }}
                        >
                          {(selectedGameObj.img_urls ?? []).slice(0, 2).map((url, i) => (
                            <div key={i} className="flex items-center justify-center flex-shrink-0" style={{ width: '42px', height: '24px' }}>
                              <img src={url} alt="" className="object-contain" style={{ maxHeight: '24px', maxWidth: '42px' }} />
                            </div>
                          ))}
                        </div>
                        <span className="text-sm truncate">{game}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Select a game...</span>
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      {game && (
                        <span
                          role="button"
                          onClick={handleClearGame}
                          className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                          aria-label="Clear game selection"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </span>
                      )}
                      <svg className={`w-5 h-5 transition-transform ${gameDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {gameDropdownOpen && (
                    <div className="absolute z-20 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                      {filteredGames.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">No games available for this Pokémon</div>
                      ) : filteredGames.map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => handleSelectGame(g.label)}
                          className={`w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-600 transition-colors text-left ${game === g.label ? 'bg-gray-600' : ''}`}
                        >
                          <div
                            className="flex items-center gap-1 flex-shrink-0"
                            style={{
                              width: '88px',
                              justifyContent: (g.img_urls?.length ?? 0) === 1 ? 'center' : 'flex-start',
                            }}
                          >
                            {(g.img_urls ?? []).slice(0, 2).map((url, i) => (
                              <div key={i} className="flex items-center justify-center flex-shrink-0" style={{ width: '42px', height: '28px' }}>
                                <img src={url} alt="" className="object-contain" style={{ maxHeight: '28px', maxWidth: '42px' }} />
                              </div>
                            ))}
                          </div>
                          <span className="text-white text-sm">{g.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Video Link + Restricted Toggle */}
              <div className="mb-6 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-300 mb-2">
                    {isRestricted || noImageProof
                      ? <><span>Video Link</span> <span className="text-red-400">*</span></>
                      : <span className="text-gray-400">Supplemental Video Link <span className="text-gray-500">(optional)</span></span>
                    }
                  </label>
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Twitch clip, VOD, or YouTube link"
                    className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                    disabled={submitting}
                  />
                </div>

                {restrictedEnabled && (
                  <div
                    className="relative flex-shrink-0"
                    onMouseEnter={() => {
                      if (isRestricted && !isLockedRestricted) return;
                      clearTimeout(tooltipHideTimer.current);
                      tooltipShowTimer.current = setTimeout(() => setShowTooltip(true), 600);
                    }}
                    onMouseLeave={() => {
                      if (isRestricted && !isLockedRestricted) return;
                      clearTimeout(tooltipShowTimer.current);
                      tooltipHideTimer.current = setTimeout(() => setShowTooltip(false), 150);
                    }}
                  >
                    <button
                      type="button"
                      disabled={!isRestrictedAvailable || isLockedRestricted}
                      onClick={() => {
                        if (!isRestrictedAvailable || isLockedRestricted) return;
                        const next = !isRestricted;
                        setIsRestricted(next);
                        if (next) {
                          setMediaFile(null);
                          setMediaFile2(null);
                        }
                      }}
                      className={`h-[46px] flex items-center gap-1.5 px-3 rounded-lg border transition-colors ${
                        !isRestrictedAvailable
                          ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
                          : isLockedRestricted
                            ? 'border-[#78150a] bg-[#78150a] text-white cursor-not-allowed'
                            : isRestricted
                              ? 'border-[#78150a] bg-[#78150a] text-white'
                              : 'border-gray-600 bg-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-xs font-medium">Restricted</span>
                      <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>

                    {isRestricted && !isLockedRestricted && activeChecklist.length > 0 ? (
                      <div className="absolute left-full top-0 ml-2 w-56 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs z-10 shadow-lg">
                        <p className="font-medium text-white mb-2">My video includes...</p>
                        <div className="space-y-2">
                          {activeChecklist.map(item => (
                            <label key={item.id} className="flex items-start gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!checkedItems[item.id]}
                                onChange={() => toggleCheck(item.id)}
                                className="mt-0.5 flex-shrink-0 accent-purple-500"
                              />
                              <span className="text-gray-300 leading-tight">{item.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : showTooltip ? (
                      <div
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-52 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs z-10 shadow-lg"
                        onMouseEnter={() => { clearTimeout(tooltipHideTimer.current); clearTimeout(tooltipShowTimer.current); }}
                        onMouseLeave={() => { tooltipHideTimer.current = setTimeout(() => setShowTooltip(false), 150); }}
                      >
                        {isLockedRestricted ? (
                          <p className="text-yellow-300">You already have a standard submission for this Pokémon — restricted only.</p>
                        ) : (
                          <>
                            <p className="font-medium text-white mb-1">Restricted Challenge</p>
                            <p className="text-gray-400 mb-2">Submit a VOD or stored video link to count toward the restricted challenge.</p>
                            <a href="/about#restricted" className="text-purple-400 hover:text-purple-300 transition-colors">Learn more →</a>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Image Uploads */}
              <div className={`transition-opacity duration-200 ${noImageProof ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      {isRestricted || noImageProof
                        ? <>{shinyLabel} <span className="text-gray-500">(optional)</span></>
                        : <>{shinyLabel} <span className="text-red-400">*</span></>
                      }
                    </label>
                    <input type="file" onChange={handleFileChange} accept="image/*,video/*" className="hidden" id="file-upload-1" disabled={submitting} />
                    <label htmlFor="file-upload-1" className="block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors border-gray-600 bg-gray-700 hover:border-purple-500">
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

                  <div>
                    <label className="block text-xs font-medium text-gray-300 mb-2">
                      {isRestricted || noImageProof
                        ? <>Proof of Date <span className="text-gray-500">(optional)</span></>
                        : <>Proof of Date <span className="text-red-400">*</span></>
                      }
                    </label>
                    <input type="file" onChange={handleFile2Change} accept="image/*,video/*" className="hidden" id="file-upload-2" disabled={submitting} />
                    <label htmlFor="file-upload-2" className="block w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors border-gray-600 bg-gray-700 hover:border-purple-500">
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
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !selectedPokemon || !game.trim() || (isRestricted || noImageProof ? !mediaUrl : (!mediaUrl.trim() && (!mediaFile || !mediaFile2)))}
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
