import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { ALLOWED_GAMES } from '../constants/games';
import PokemonImage from './PokemonImage';
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

const PANEL_WIDTH = 1020;

const SlugDropdown = ({ pokemonId, field, value, onChange, matchValue, reversed }) => {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside click — must check both trigger and portal panel
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close if the scroll container scrolls while open
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('scroll', handler, true);
    return () => document.removeEventListener('scroll', handler, true);
  }, [open]);

  const handleToggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const openUp = rect.bottom > window.innerHeight * 0.55;

      // Clamp left so panel never bleeds off-screen
      const idealLeft = rect.left + rect.width / 2 - PANEL_WIDTH / 2;
      const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - 8));

      setPanelStyle(openUp
        ? { position: 'fixed', width: PANEL_WIDTH, left: clampedLeft, bottom: window.innerHeight - rect.top + 4, zIndex: 9999 }
        : { position: 'fixed', width: PANEL_WIDTH, left: clampedLeft, top: rect.bottom + 4, zIndex: 9999 }
      );
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

  const panel = (
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-y-auto"
    >
      {/* Select all / Clear / Match games */}
      <div className="flex gap-2 px-3 py-2.5 border-b border-gray-700 flex-wrap">
        <button
          type="button"
          onClick={() => onChange(pokemonId, field, ALLOWED_GAMES.map(g => g.key))}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >Select all</button>
        <span className="text-gray-600">·</span>
        <button
          type="button"
          onClick={() => onChange(pokemonId, field, [])}
          className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >Clear</button>
        {isRestricted && matchValue && (
          <>
            <span className="text-gray-600">·</span>
            <button
              type="button"
              onClick={() => onChange(pokemonId, field, [...matchValue])}
              className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
            >Match games</button>
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
  );

  return (
    <div className="relative">
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

      {open && createPortal(panel, document.body)}
    </div>
  );
};

// ── Category Dropdown ────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'legendary', label: 'Legendary' },
  { key: 'baby', label: 'Baby' },
  { key: 'ultra_beast', label: 'Ultra Beast' },
  { key: 'paradox', label: 'Paradox' },
  { key: 'starter', label: 'Starter' },
  { key: 'fossil', label: 'Fossil' },
  { key: 'regional_alt', label: 'Regional Variant' },
  { key: 'pseudo_legendary', label: 'Pseudo-Legendary' },
];

const CategoryDropdown = ({ pokemonId, data, onChange }) => {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState({});
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('scroll', handler, true);
    return () => document.removeEventListener('scroll', handler, true);
  }, [open]);

  const handleToggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const openUp = rect.bottom > window.innerHeight * 0.55;
      const panelWidth = 220;
      const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
      const clampedLeft = Math.max(8, Math.min(idealLeft, window.innerWidth - panelWidth - 8));

      setPanelStyle(openUp
        ? { position: 'fixed', width: panelWidth, left: clampedLeft, bottom: window.innerHeight - rect.top + 4, zIndex: 9999 }
        : { position: 'fixed', width: panelWidth, left: clampedLeft, top: rect.bottom + 4, zIndex: 9999 }
      );
    }
    setOpen(o => !o);
  };

  const activeCount = CATEGORIES.filter(c => data[c.key]).length;

  const panel = (
    <div
      ref={panelRef}
      style={panelStyle}
      className="bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-y-auto max-h-96"
    >
      <div className="space-y-2 p-3">
        {CATEGORIES.map(cat => (
          <label key={cat.key} className="flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer select-none hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={data[cat.key] ?? false}
              onChange={() => onChange(cat.key, !data[cat.key])}
              className="w-3.5 h-3.5 rounded accent-cyan-500 flex-shrink-0"
            />
            <span className="text-xs text-gray-200">{cat.label}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggleOpen}
        className={`flex items-center justify-between gap-2 w-full px-3 py-1.5 rounded-lg border text-sm transition-colors bg-gray-700 border-gray-600 hover:border-purple-500`}
      >
        <span className="text-white text-xs">{activeCount > 0 ? `${activeCount}` : '0'}</span>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-gray-400 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && createPortal(panel, document.body)}
    </div>
  );
};

// ── Pokemon Row ──────────────────────────────────────────────────────────────

const PokemonRow = React.memo(({
  p, i, data, status, selected, isSelected,
  toggleSelected, handleSlugChange, handleShinyToggle, handleFormsCountChange, handleCategoryToggle,
  clipboard, setClipboard, reversed
}) => (
  <div
    className="grid gap-3 items-center px-4 py-2.5 transition-colors hover:bg-white/5"
    style={{
      gridTemplateColumns: GRID,
      backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    {/* Selection checkbox */}
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleSelected(p.id)}
        className="w-4 h-4 rounded accent-purple-500"
      />
    </div>

    {/* Sprite */}
    <PokemonImage pokemon={{ ...p, forms_count: data.forms_count }} className="w-11 h-11" />

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

    {/* Forms count */}
    <input
      type="number"
      min="1"
      value={data.forms_count}
      onChange={e => handleFormsCountChange(p.id, e.target.value)}
      className="w-full px-2 py-1 rounded bg-gray-700 border border-gray-600 text-white text-sm text-center focus:border-blue-400 focus:outline-none"
    />

    {/* Categories dropdown */}
    <CategoryDropdown
      pokemonId={p.id}
      data={data}
      onChange={(category, value) => handleCategoryToggle(p.id, category, value)}
    />

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
), (prev, next) => {
  // Custom comparison: only re-render if data actually changed
  return (
    prev.isSelected === next.isSelected &&
    prev.data === next.data &&
    prev.status === next.status &&
    prev.clipboard?.fromId === next.clipboard?.fromId &&
    prev.i === next.i
  );
});

PokemonRow.displayName = 'PokemonRow';

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

const GRID = '32px 52px 1fr 1fr 1fr 90px 72px 90px 72px 24px';

const PokemonGameManager = () => {
  const [pokemon, setPokemon] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [reversed, setReversed] = useState(false);
  const [clipboard, setClipboard] = useState(null); // { fromId, game_slugs, restricted_game_slugs }
  const [selected, setSelected] = useState(new Set()); // Set of pokemon IDs
  const selectedRef = useRef(new Set()); // Keep ref in sync with state for immediate access

  // Local data edits: { [pokemonId]: { game_slugs, restricted_game_slugs, shiny_available, forms_count, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt } }
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
            forms_count: p.forms_count ?? 1,
            legendary: p.legendary ?? false,
            baby: p.baby ?? false,
            ultra_beast: p.ultra_beast ?? false,
            paradox: p.paradox ?? false,
            starter: p.starter ?? false,
            fossil: p.fossil ?? false,
            regional_alt: p.regional_alt ?? false,
            pseudo_legendary: p.pseudo_legendary ?? false,
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
      const payload = localDataRef.current[pokemonId];
      const res = await fetch(`/api/admin/pokemon/${pokemonId}/game-slugs`, {
        method: 'PATCH',
        headers: {
          'Authorization': await getAuthHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const resText = await res.text();
      if (!res.ok) {
        throw new Error(`Save failed: ${resText}`);
      }
      setSaveState(prev => ({ ...prev, [pokemonId]: 'saved' }));
      setTimeout(() => setSaveState(prev => ({ ...prev, [pokemonId]: 'idle' })), 2000);
    } catch (err) {
      setSaveState(prev => ({ ...prev, [pokemonId]: 'error' }));
    }
  }, []); // no localData dep needed — reads via ref

  const scheduleSave = (pokemonId) => {
    setSaveState(prev => ({ ...prev, [pokemonId]: 'saving' }));
    if (saveTimers.current[pokemonId]) clearTimeout(saveTimers.current[pokemonId]);
    saveTimers.current[pokemonId] = setTimeout(() => save(pokemonId), 800);
  };

  const handleSlugChange = (pokemonId, field, newValue) => {
    const oldValue = localData[pokemonId]?.[field] ?? [];
    setLocalData(prev => ({
      ...prev,
      [pokemonId]: { ...prev[pokemonId], [field]: newValue },
    }));
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, field, newValue, oldValue);
    } else {
      scheduleSave(pokemonId);
    }
  };

  const handleShinyToggle = (pokemonId) => {
    const newValue = !localData[pokemonId]?.shiny_available;
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, 'shiny_available', newValue);
    } else {
      setLocalData(prev => ({
        ...prev,
        [pokemonId]: { ...prev[pokemonId], shiny_available: newValue },
      }));
      scheduleSave(pokemonId);
    }
  };

  const handleFormsCountChange = (pokemonId, value) => {
    const n = Math.max(1, parseInt(value, 10) || 1);
    if (selected.has(pokemonId)) {
      applyToSelected(pokemonId, 'forms_count', n);
    } else {
      setLocalData(prev => ({
        ...prev,
        [pokemonId]: { ...prev[pokemonId], forms_count: n },
      }));
      scheduleSave(pokemonId);
    }
  };

  const handleCategoryToggle = (pokemonId, category, value) => {
    const oldValue = localData[pokemonId]?.[category] ?? false;
    if (selected.has(pokemonId)) {
      setLocalData(prev => ({
        ...prev,
        [pokemonId]: { ...prev[pokemonId], [category]: value },
      }));
      applyToSelected(pokemonId, category, value, oldValue);
    } else {
      setLocalData(prev => ({
        ...prev,
        [pokemonId]: { ...prev[pokemonId], [category]: value },
      }));
      scheduleSave(pokemonId);
    }
  };

  // ── Bulk selection handlers ────────────────────────────────────────────────

  const toggleSelected = (pokemonId) => {
    selectedRef.current.has(pokemonId) ? selectedRef.current.delete(pokemonId) : selectedRef.current.add(pokemonId);
    setSelected(new Set(selectedRef.current));
  };

  const selectAll = () => {
    selectedRef.current = new Set(filtered.map(p => p.id));
    setSelected(new Set(selectedRef.current));
  };

  const clearSelection = () => {
    selectedRef.current = new Set();
    setSelected(new Set());
  };

  const applyToSelected = (pokemonId, field, newValue, oldValue) => {
    if (!selectedRef.current.has(pokemonId) || selectedRef.current.size === 0) return;

    // For slug fields, apply the delta (additions/removals) rather than replacing
    const isSlugField = field === 'game_slugs' || field === 'restricted_game_slugs';

    // Capture selected as an array to ensure stable iteration
    const selectedArray = Array.from(selectedRef.current);

    setLocalData(prev => {
      const next = { ...prev };

      if (isSlugField) {
        const added = newValue.filter(slug => !oldValue.includes(slug));
        const removed = oldValue.filter(slug => !newValue.includes(slug));

        // Apply the delta to all selected Pokemon
        for (const id of selectedArray) {
          const current = next[id]?.[field] ?? [];
          let updated = [...current];

          // Add the slugs that were added to the clicked Pokemon
          for (const slug of added) {
            if (!updated.includes(slug)) {
              updated.push(slug);
            }
          }

          // Remove the slugs that were removed from the clicked Pokemon
          for (const slug of removed) {
            updated = updated.filter(s => s !== slug);
          }

          next[id] = { ...(next[id] ?? {}), [field]: updated };
        }
      } else {
        // For non-slug fields, replace the value entirely
        for (const id of selectedArray) {
          next[id] = { ...(next[id] ?? {}), [field]: newValue };
        }
      }

      return next;
    });

    for (const id of selectedArray) {
      scheduleSave(id);
    }
  };

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pokemon.filter(p => !q || p.name.toLowerCase().includes(q) || String(p.national_dex_id).includes(q));
  }, [pokemon, search]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Pokémon Game Manager" badge="mod" />

      <div className="flex-1 overflow-hidden p-6">
        <div className="max-w-5xl mx-auto h-full flex flex-col">

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
              {selected.size > 0 && (
                <>
                  <span className="text-purple-400 font-medium">{selected.size} selected</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="ml-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >Clear</button>
                  <span className="mx-2">·</span>
                </>
              )}
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
          <div className="flex-1 overflow-y-auto rounded-xl border border-gray-700" style={{ backgroundColor: '#1a1a2e' }}>

            {/* Column headers */}
            <div className="grid gap-3 px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-700 rounded-t-xl sticky top-0 z-10"
              style={{ gridTemplateColumns: GRID, backgroundColor: '#12122a' }}>
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onChange={() => selected.size === filtered.length ? clearSelection() : selectAll()}
                  className="w-4 h-4 rounded accent-purple-500"
                />
              </div>
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
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                Forms
              </div>
              <div>Categories</div>
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
              const data = localData[p.id] ?? { game_slugs: [], restricted_game_slugs: [], shiny_available: false, forms_count: 1, legendary: false, baby: false, ultra_beast: false, paradox: false, starter: false, fossil: false, regional_alt: false, pseudo_legendary: false };
              const status = saveState[p.id] ?? 'idle';
              return (
                <PokemonRow
                  key={p.id}
                  p={p}
                  i={i}
                  data={data}
                  status={status}
                  selected={selected}
                  isSelected={selected.has(p.id)}
                  toggleSelected={toggleSelected}
                  handleSlugChange={handleSlugChange}
                  handleShinyToggle={handleShinyToggle}
                  handleFormsCountChange={handleFormsCountChange}
                  handleCategoryToggle={handleCategoryToggle}
                  clipboard={clipboard}
                  setClipboard={setClipboard}
                  reversed={reversed}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonGameManager;
