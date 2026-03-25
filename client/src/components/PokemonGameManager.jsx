import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
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

// ── Slug Dropdown ─────────────────────────────────────────────────────────────
// Renders a button that opens a checklist of all ALLOWED_GAMES.
// `field` is either 'game_slugs' or 'restricted_game_slugs'.
// Opens upward automatically when the button is in the lower 55% of the viewport.

const SlugDropdown = ({ pokemonId, field, value, onChange, matchValue, reversed }) => {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setOpenUp(rect.bottom > window.innerHeight * 0.55);
    }
    setOpen(o => !o);
  };

  const toggle = (key) => {
    const next = value.includes(key)
      ? value.filter(k => k !== key)
      : [...value, key];
    onChange(pokemonId, field, next);
  };

  const label = value.length === 0
    ? <span className="text-gray-500">None</span>
    : <span className="text-white">{value.length} game{value.length !== 1 ? 's' : ''}</span>;

  const isRestricted = field === 'restricted_game_slugs';

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggleOpen}
        className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg border text-sm transition-colors ${
          isRestricted
            ? 'bg-gray-800 border-gray-600 hover:border-red-700'
            : 'bg-gray-700 border-gray-600 hover:border-purple-500'
        }`}
      >
        {label}
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-gray-400 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-y-auto ${
          openUp ? 'bottom-full mb-1' : 'top-full mt-1'
        }`} style={{ width: '1020px', left: '50%', transform: 'translateX(-50%)' }}>
          {/* Select all / Clear all / Match games */}
          <div className="flex gap-2 px-3 py-2.5 border-b border-gray-700 flex-wrap">
            <button
              type="button"
              onClick={() => onChange(pokemonId, field, ALLOWED_GAMES.map(g => g.key))}
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              Select all
            </button>
            <span className="text-gray-600">·</span>
            <button
              type="button"
              onClick={() => onChange(pokemonId, field, [])}
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
            {isRestricted && matchValue && (
              <>
                <span className="text-gray-600">·</span>
                <button
                  type="button"
                  onClick={() => onChange(pokemonId, field, [...matchValue])}
                  className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
                >
                  Match games
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 p-2">
            {(reversed ? [...ALLOWED_GAMES].reverse() : ALLOWED_GAMES).map((g) => {
              const checked = value.includes(g.key);
              return (
                <label
                  key={g.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                    checked
                      ? 'bg-gray-800 border-purple-600'
                      : 'border-transparent hover:bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(g.key)}
                    className="w-3.5 h-3.5 rounded accent-purple-500 flex-shrink-0"
                  />
                  <div className="flex items-center justify-center gap-1" style={{ width: '90px', flexShrink: 0 }}>
                    {(g.img_urls ?? []).slice(0, 3).map((url, i) => (
                      <img key={i} src={url} alt="" className="object-contain"
                        style={{ height: '27px', maxWidth: '40px' }} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-200 leading-tight">{g.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Save indicator ────────────────────────────────────────────────────────────

const SaveIndicator = ({ status }) => {
  if (status === 'saving') return (
    <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
  if (status === 'saved') return (
    <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
  if (status === 'error') return (
    <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
  return <div className="w-4 h-4 flex-shrink-0" />;
};

// ── Main component ────────────────────────────────────────────────────────────

const GRID = '52px 1fr 1fr 1fr 90px 72px 24px';

const PokemonGameManager = () => {
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [reversed, setReversed] = useState(false);
  const [clipboard, setClipboard] = useState(null); // { fromId, game_slugs, restricted_game_slugs }

  // Local data edits: { [pokemonId]: { game_slugs, restricted_game_slugs, shiny_available } }
  const [localData, setLocalData] = useState({});

  // Save state per pokemon: 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState({});

  // Debounce timers per pokemon
  const saveTimers = useRef({});

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/pokemon-game-slugs', {
          headers: { 'Authorization': await getAuthHeader() },
        });
        if (!res.ok) throw new Error('Failed to load pokemon');
        const data = await res.json();
        setPokemon(data);
        const init = {};
        for (const p of data) {
          init[p.id] = {
            game_slugs: p.game_slugs ?? [],
            restricted_game_slugs: p.restricted_game_slugs ?? [],
            shiny_available: p.shiny_available ?? false,
          };
        }
        setLocalData(init);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── Save (debounced per pokemon) ──────────────────────────────────────────

  // Keep a ref that always points to the latest localData so the debounced save
  // closure never reads stale state (e.g. when paste calls handleSlugChange twice
  // in rapid succession before React re-renders).
  const localDataRef = useRef(localData);
  useEffect(() => { localDataRef.current = localData; }, [localData]);

  const save = useCallback(async (pokemonId) => {
    setSaveState(prev => ({ ...prev, [pokemonId]: 'saving' }));
    try {
      const res = await fetch(`/api/admin/pokemon/${pokemonId}/game-slugs`, {
        method: 'PATCH',
        headers: {
          'Authorization': await getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(localDataRef.current[pokemonId]),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveState(prev => ({ ...prev, [pokemonId]: 'saved' }));
      setTimeout(() => setSaveState(prev => ({ ...prev, [pokemonId]: 'idle' })), 2000);
    } catch {
      setSaveState(prev => ({ ...prev, [pokemonId]: 'error' }));
    }
  }, []); // no localData dep needed — reads via ref

  const scheduleSave = (pokemonId) => {
    setSaveState(prev => ({ ...prev, [pokemonId]: 'saving' }));
    if (saveTimers.current[pokemonId]) clearTimeout(saveTimers.current[pokemonId]);
    saveTimers.current[pokemonId] = setTimeout(() => save(pokemonId), 800);
  };

  const handleSlugChange = (pokemonId, field, newValue) => {
    setLocalData(prev => ({
      ...prev,
      [pokemonId]: { ...prev[pokemonId], [field]: newValue },
    }));
    scheduleSave(pokemonId);
  };

  const handleShinyToggle = (pokemonId) => {
    setLocalData(prev => ({
      ...prev,
      [pokemonId]: { ...prev[pokemonId], shiny_available: !prev[pokemonId].shiny_available },
    }));
    scheduleSave(pokemonId);
  };

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = pokemon.filter(p => {
    const q = search.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || String(p.national_dex_id).includes(q);
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Pokémon Game Manager" />

      <div className="p-6">
        <div className="max-w-5xl mx-auto">

          {/* Search */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or dex #"
                className="w-full pl-9 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <span className="text-sm text-gray-400 ml-auto">
              {filtered.length} / {pokemon.length} Pokémon
            </span>
            {clipboard && (
              <div className="flex items-center gap-1.5 text-xs bg-purple-900/40 border border-purple-700 text-purple-300 px-2.5 py-1 rounded-full">
                <span>📋</span>
                <span>{clipboard.game_slugs.length ? clipboard.game_slugs.join(', ') : 'empty'}</span>
                <button
                  type="button"
                  onClick={() => setClipboard(null)}
                  className="ml-1 text-purple-400 hover:text-white transition-colors"
                >×</button>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-400 hover:text-gray-200 transition-colors">
              <input
                type="checkbox"
                checked={reversed}
                onChange={e => setReversed(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-500"
              />
              Reverse order
            </label>
          </div>

          {/* Section */}
          <div className="rounded-xl border border-gray-700" style={{ backgroundColor: '#1a1a2e' }}>

            {/* Column headers */}
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-700 rounded-t-xl"
              style={{ gridTemplateColumns: GRID, backgroundColor: '#12122a' }}>
              <div />
              <div>Pokémon</div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                Game Slugs
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                Restricted Slugs
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
                Shiny
              </div>
              <div />
              <div />
            </div>

            {/* Rows */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
            ) : error ? (
              <div className="text-red-400 text-sm py-8 text-center">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-gray-500 text-sm py-8 text-center">No Pokémon found</div>
            ) : filtered.map((p, i) => {
              const data = localData[p.id] ?? { game_slugs: [], restricted_game_slugs: [], shiny_available: false };
              const status = saveState[p.id] ?? 'idle';
              return (
                <div
                  key={p.id}
                  className="grid gap-3 items-center px-4 py-2.5 transition-colors hover:bg-white/5"
                  style={{
                    gridTemplateColumns: GRID,
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Sprite */}
                  <img src={p.img_url} alt={p.name} className="w-11 h-11 object-contain" />

                  {/* Name */}
                  <div>
                    <div className="text-white text-sm font-medium">{p.name}</div>
                    <div className="text-gray-500 text-xs">#{String(p.national_dex_id).padStart(4, '0')}</div>
                  </div>

                  {/* Game slugs */}
                  <SlugDropdown
                    pokemonId={p.id}
                    field="game_slugs"
                    value={data.game_slugs}
                    onChange={handleSlugChange}
                    reversed={reversed}
                  />

                  {/* Restricted game slugs */}
                  <SlugDropdown
                    pokemonId={p.id}
                    field="restricted_game_slugs"
                    value={data.restricted_game_slugs}
                    onChange={handleSlugChange}
                    matchValue={data.game_slugs}
                    reversed={reversed}
                  />

                  {/* Shiny available */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={data.shiny_available}
                        onChange={() => handleShinyToggle(p.id)}
                        className="sr-only"
                      />
                      <div className={`w-9 h-5 rounded-full transition-colors ${data.shiny_available ? 'bg-yellow-500' : 'bg-gray-600'}`} />
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${data.shiny_available ? 'translate-x-4' : ''}`} />
                    </div>
                  </label>

                  {/* Copy / Paste */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Copy slugs"
                      onClick={() => setClipboard({ fromId: p.id, game_slugs: [...data.game_slugs], restricted_game_slugs: [...data.restricted_game_slugs] })}
                      className={`p-1.5 rounded transition-colors text-sm ${clipboard?.fromId === p.id ? 'bg-purple-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                    >📋</button>
                    {clipboard && clipboard.fromId !== p.id && (
                      <button
                        type="button"
                        title="Paste slugs"
                        onClick={() => {
                          handleSlugChange(p.id, 'game_slugs', clipboard.game_slugs);
                          handleSlugChange(p.id, 'restricted_game_slugs', clipboard.restricted_game_slugs);
                        }}
                        className="p-1.5 rounded text-sm text-green-400 hover:text-white hover:bg-gray-700 transition-colors"
                      >📥</button>
                    )}
                  </div>

                  {/* Save indicator */}
                  <div className="flex items-center justify-center">
                    <SaveIndicator status={status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonGameManager;
