import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../../contexts/AuthContext';
import PokemonImage from '../PokemonImage';
import {
  POKEMON_DATA,
  POKEMON_BY_ID,
  EGG_GROUP_LABELS,
  buildAdjacency,
  findShortestChain,
  sharedGroups,
} from './gen2EggGroups';

// Adjacency built once at module load
const ADJ = buildAdjacency();

// Pokémon that can appear as owned shinies (excludes shinyAlwaysMale — their shiny is always ♂)
const BREEDABLE_SOURCES = POKEMON_DATA.filter(p => p.groups[0] !== 'undiscovered' && !p.shinyAlwaysMale);
// All breedable Pokémon for the target search (shinyAlwaysMale are valid targets)
const BREEDABLE_TARGETS = POKEMON_DATA.filter(p => p.groups[0] !== 'undiscovered');

// Egg group pill colours
const GROUP_COLORS = {
  monster:    'bg-orange-500/20 text-orange-300 border-orange-500/30',
  water1:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  bug:        'bg-lime-500/20 text-lime-300 border-lime-500/30',
  flying:     'bg-sky-500/20 text-sky-300 border-sky-500/30',
  field:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  fairy:      'bg-pink-500/20 text-pink-300 border-pink-500/30',
  grass:      'bg-green-500/20 text-green-300 border-green-500/30',
  humanlike:  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  water3:     'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  mineral:    'bg-stone-400/20 text-stone-300 border-stone-400/30',
  amorphous:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  water2:     'bg-teal-500/20 text-teal-300 border-teal-500/30',
  dragon:     'bg-violet-500/20 text-violet-300 border-violet-500/30',
  ditto:      'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
};

function EggGroupPill({ group, small }) {
  const cls = GROUP_COLORS[group] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  return (
    <span className={`border rounded-full font-medium whitespace-nowrap
      ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} ${cls}`}>
      {EGG_GROUP_LABELS[group] ?? group}
    </span>
  );
}

// ── Pokémon search dropdown ───────────────────────────────────────────────────
function PokemonSearch({ placeholder, onSelect, excludeIds = [], clearOnSelect = false, pmMap, sourceList }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return sourceList
      .filter(p => !excludeIds.includes(p.id) && p.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, excludeIds, sourceList]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(p) {
    onSelect(p);
    if (clearOnSelect) setQuery('');
    else setQuery(p.name);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
          placeholder-gray-500 focus:outline-none focus:border-pink-500 transition"
        placeholder={placeholder}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {results.map(p => {
            const pm = pmMap[p.id];
            return (
              <button
                key={p.id}
                onMouseDown={() => select(p)}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-700 transition text-left"
              >
                {pm
                  ? <PokemonImage pokemon={pm} className="w-7 h-7" disableCycling />
                  : <div className="w-7 h-7 bg-gray-700 rounded animate-pulse" />
                }
                <span className="text-sm text-white flex-1">{p.name}</span>
                <span className="text-[10px] text-gray-500">#{String(p.id).padStart(3,'0')}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Ditto trick modal ─────────────────────────────────────────────────────────
function DittoModal({ onClose, dittoPm }) {
  const [page, setPage] = React.useState(0);

  const pages = [
    /* Page 1 — What & Why */
    <div key="p1" className="space-y-4 text-sm text-gray-300 leading-relaxed">
      <p>
        A shiny Ditto bypasses egg groups entirely — it can breed with almost any Pokémon
        and passes two shiny DVs to every offspring, raising shiny odds to <strong className="text-white">~1/64</strong>.
      </p>
      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-200 text-xs">
        <strong>Requires:</strong> a Gen 1 cartridge (Red, Blue, or Yellow) <em>and</em> a
        Gen 2 cartridge (Gold, Silver, or Crystal) with a Link Cable for trading.
      </div>
      <div>
        <h3 className="text-white font-semibold mb-1">Why 1/64?</h3>
        <p>
          Shininess requires Defense = 10, Speed = 10, Special = 10, and Attack ∈ {'{2, 6, 10, 14}'}.
          Breeding with a shiny Ditto passes <em>both</em> the Special DV and the Defense DV to
          the offspring, leaving only Speed (1/16) and Attack (4/16) to chance — giving
          1/16 × 1/4 = <span className="text-pink-300">1/64</span>.
        </p>
      </div>
    </div>,
    /* Page 2 — Steps */
    <div key="p2" className="space-y-4 text-sm text-gray-300 leading-relaxed">
      <div>
        <h3 className="text-white font-semibold mb-2">Step-by-step</h3>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>Use the <span className="text-yellow-300">Red Gyarados</span> from the Lake of Rage as your bait — it already has shiny DVs.</li>
          <li>Delete any Gen 2-exclusive moves at the <span className="text-yellow-300">Move Deleter in Blackthorn City</span>.</li>
          <li>Trade Gyarados to Gen 1 via the <span className="text-yellow-300">Time Capsule</span>. <span className="text-gray-400">(Keeps shiny DVs.)</span></li>
          <li>Get <span className="text-yellow-300">TM31 (Mimic)</span> from Copycat in Saffron City. Teach it to Gyarados.</li>
          <li>Find a wild Ditto — <span className="text-yellow-300">Route 15 or Cinnabar Island basement</span>.</li>
          <li><strong className="text-white">Use Mimic</strong> to copy Ditto's Transform. Gyarados permanently learns it.</li>
          <li>Let Ditto Transform into Gyarados, then Transform <strong className="text-white">a second time</strong>. This glitch locks Gyarados's shiny DVs into Ditto.</li>
          <li><strong className="text-white">Catch the Ditto</strong> — don't let it faint.</li>
          <li>Trade back to Gen 2. It appears as a <span className="text-fuchsia-300">bright blue shiny Ditto</span>.</li>
        </ol>
      </div>
      <div>
        <h3 className="text-white font-semibold mb-1">Then breed freely</h3>
        <p>Drop this Ditto in the Day-Care with <em>any</em> breedable Pokémon. At ~1/64 per egg, expect 30–100 eggs on average.</p>
      </div>
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-200 text-xs">
        <strong>Tip:</strong> The target must be breedable — legendaries and baby Pokémon can't be obtained this way.
      </div>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-xs w-full p-4 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {dittoPm
              ? <PokemonImage pokemon={dittoPm} className="w-10 h-10" disableCycling />
              : <div className="w-10 h-10 bg-gray-700 rounded animate-pulse" />}
            <h2 className="text-base font-bold text-white">Getting a Shiny Ditto</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition text-xl leading-none">✕</button>
        </div>

        {/* Page content */}
        {pages[page]}

        {/* Page navigation */}
        <div className="flex items-center justify-between mt-5 pt-3 border-t border-gray-700/60">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          {/* Dots */}
          <div className="flex gap-1.5">
            {pages.map((_, i) => (
              <button key={i} onClick={() => setPage(i)} className={`w-2 h-2 rounded-full transition-colors ${i === page ? 'bg-purple-400' : 'bg-gray-600 hover:bg-gray-500'}`} />
            ))}
          </div>
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Chain step card ───────────────────────────────────────────────────────────
function ChainStep({ pokemonId, stepIndex, totalSteps, connectingGroups, pmMap }) {
  const p = POKEMON_BY_ID[pokemonId];
  const pm = pmMap[pokemonId];
  if (!p) return null;

  const isSource = stepIndex === 0;
  const isTarget = stepIndex === totalSteps - 1;
  const isAlreadyOwned = totalSteps === 1;

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 90 }}>
      <div
        className={`relative rounded-xl border-2 p-2 flex flex-col items-center gap-1 transition
          ${isAlreadyOwned ? 'border-yellow-400 bg-yellow-400/10'
            : isSource    ? 'border-pink-400 bg-pink-400/10'
            : isTarget    ? 'border-emerald-400 bg-emerald-400/10'
            : 'border-gray-600 bg-gray-800'}`}
      >
        {/* Label badge */}
        {(isSource || isAlreadyOwned) && (
          <span className="absolute -top-2 -right-2 text-[10px] bg-yellow-400 text-black font-bold px-1.5 py-0.5 rounded-full leading-tight">
            ★ Shiny
          </span>
        )}
        {isTarget && !isAlreadyOwned && (
          <span className="absolute -top-2 -right-2 text-[10px] bg-emerald-400 text-black font-bold px-1.5 py-0.5 rounded-full leading-tight">
            Target
          </span>
        )}

        {pm
          ? <PokemonImage pokemon={pm} className="w-14 h-14" disableCycling />
          : <div className="w-14 h-14 bg-gray-700 rounded animate-pulse" />
        }

        <p className="text-xs font-semibold text-white text-center leading-tight">{p.name}</p>
        <p className="text-[10px] text-gray-500">#{String(p.id).padStart(3,'0')}</p>

        {p.gender === 'male-only' && (
          <span className="text-[10px] text-yellow-400 text-center leading-tight">♂ only — needs Ditto</span>
        )}
        {p.gender === 'genderless' && (
          <span className="text-[10px] text-yellow-400 text-center leading-tight">Genderless — needs Ditto</span>
        )}
      </div>

      {/* Egg groups */}
      <div className="flex flex-wrap gap-1 justify-center" style={{ maxWidth: 110 }}>
        {p.groups.map(g => <EggGroupPill key={g} group={g} small />)}
      </div>

      {/* Shared group label (except after the last node) */}
      {connectingGroups && connectingGroups.length > 0 && (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex gap-1 flex-wrap justify-center">
            {connectingGroups.map(g => <EggGroupPill key={g} group={g} small />)}
          </div>
          <span className="text-[9px] text-gray-500">shared</span>
        </div>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex flex-col items-center justify-center self-stretch shrink-0 pt-1 px-1">
      <span className="text-[10px] text-gray-500">breed</span>
      <span className="text-lg text-gray-400 leading-none">→</span>
      <span className="text-[10px] text-gray-500">with ♂</span>
    </div>
  );
}

// ── Owned shiny tag ───────────────────────────────────────────────────────────
function OwnedTag({ pokemon, pmMap, onRemove }) {
  const pm = pmMap[pokemon.id];
  return (
    <div className="flex items-center gap-1.5 bg-pink-500/15 border border-pink-500/30 rounded-full pl-1 pr-2 py-0.5">
      {pm
        ? <PokemonImage pokemon={pm} className="w-5 h-5" disableCycling />
        : <div className="w-5 h-5 bg-gray-700 rounded-full animate-pulse" />}
      <span className="text-xs text-pink-200 font-medium">{pokemon.name}</span>
      <button
        onClick={() => onRemove(pokemon.id)}
        className="text-pink-400 hover:text-white transition leading-none text-sm"
        title="Remove"
      >✕</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Gen2ShinyBreeding() {
  const [ownedIds, setOwnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gen2_owned_shinies') || '[]'); }
    catch { return []; }
  });
  const [targetId, setTargetId] = useState(null);
  const [dittoOpen, setDittoOpen] = useState(false);

  // pokemon_master records keyed by national_dex_id (= our id for Gen 1-2)
  const [pmMap, setPmMap] = useState({});

  // Fetch pokemon_master for all Gen 1+2 Pokémon on mount
  useEffect(() => {
    supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, display_name, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference')
      .lte('national_dex_id', 251)
      .order('national_dex_id')
      .order('form_id', { nullsFirst: true })
      .then(({ data }) => {
        if (!data) return;
        const map = {};
        for (const row of data) {
          // Keep first (lowest form_id) entry per national_dex_id = base form
          if (!map[row.national_dex_id]) {
            map[row.national_dex_id] = row;
          }
        }
        setPmMap(map);
      });
  }, []);

  // Persist owned shinies
  useEffect(() => {
    localStorage.setItem('gen2_owned_shinies', JSON.stringify(ownedIds));
  }, [ownedIds]);

  function addOwned(p) {
    if (!ownedIds.includes(p.id)) setOwnedIds(prev => [...prev, p.id]);
  }
  function removeOwned(id) { setOwnedIds(prev => prev.filter(x => x !== id)); }

  const result = useMemo(() => {
    if (!targetId || ownedIds.length === 0) return null;
    return findShortestChain(ownedIds, targetId, ADJ);
  }, [ownedIds, targetId]);

  const ownedPokemon = ownedIds.map(id => POKEMON_BY_ID[id]).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Gen 2 Shiny Gene Breeding</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Find the shortest breeding chain to pass shiny DVs from any Pokémon you already have
            shiny to your target. Shiny females pass their Special DV to all offspring, boosting
            shiny odds to ~1/1024 per egg.
          </p>
        </div>
        <button
          onClick={() => setDittoOpen(true)}
          className="shrink-0 flex items-center gap-1.5 bg-fuchsia-500/15 border border-fuchsia-500/30
            hover:bg-fuchsia-500/25 transition rounded-lg px-3 py-2 text-fuchsia-300 text-xs font-semibold"
          title="How to get a shiny Ditto"
        >
          {pmMap[132]
            ? <PokemonImage pokemon={pmMap[132]} className="w-6 h-6" disableCycling />
            : <div className="w-6 h-6 bg-gray-700 rounded animate-pulse" />}
          Ditto trick
        </button>
      </div>

      {/* Inputs */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {/* Owned shinies */}
        <div>
          <label className="block text-xs font-semibold text-pink-300 uppercase tracking-widest mb-1.5">
            Your Shiny Pokémon
          </label>
          <PokemonSearch
            placeholder="Search and add a shiny..."
            onSelect={addOwned}
            excludeIds={ownedIds}
            clearOnSelect
            pmMap={pmMap}
            sourceList={BREEDABLE_SOURCES}
          />
          {ownedPokemon.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ownedPokemon.map(p => (
                <OwnedTag key={p.id} pokemon={p} pmMap={pmMap} onRemove={removeOwned} />
              ))}
            </div>
          )}
          {ownedPokemon.length === 0 && (
            <p className="text-xs text-gray-600 mt-2 italic">Add at least one shiny Pokémon to begin.</p>
          )}
        </div>

        {/* Target */}
        <div>
          <label className="block text-xs font-semibold text-emerald-300 uppercase tracking-widest mb-1.5">
            Target Pokémon
          </label>
          <PokemonSearch
            placeholder="Search for your target..."
            onSelect={p => setTargetId(p.id)}
            pmMap={pmMap}
            sourceList={BREEDABLE_TARGETS}
          />
          {targetId && (
            <div className="flex items-center gap-2 mt-2">
              {pmMap[targetId]
                ? <PokemonImage pokemon={pmMap[targetId]} className="w-7 h-7" disableCycling />
                : <div className="w-7 h-7 bg-gray-700 rounded animate-pulse" />}
              <span className="text-sm text-white">{POKEMON_BY_ID[targetId]?.name}</span>
              <button
                onClick={() => setTargetId(null)}
                className="ml-auto text-gray-500 hover:text-white transition text-xs"
              >Clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {ownedIds.length > 0 && targetId && (
        <div className="mt-6">
          {result === null ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-5 text-center">
              <p className="text-red-300 font-semibold mb-1">No breeding path found</p>
              <p className="text-gray-400 text-sm">
                {POKEMON_BY_ID[targetId]?.groups[0] === 'undiscovered'
                  ? `${POKEMON_BY_ID[targetId]?.name} cannot breed.`
                  : "None of your shiny Pokémon share an egg group chain with the target. Try obtaining a shiny Ditto (see the Ditto trick button above)."}
              </p>
            </div>
          ) : result.path.length === 1 ? (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-4 text-center">
              <p className="text-yellow-300 font-semibold">You already own this shiny!</p>
            </div>
          ) : (
            <div>
              {/* Chain length summary */}
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
                  <span className="text-2xl font-bold text-white">{result.path.length - 1}</span>
                  <span className="text-xs text-gray-400 leading-tight">
                    breeding<br/>step{result.path.length - 1 !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-gray-400 text-sm">
                  {result.path.length === 2
                    ? `Breed your shiny ${POKEMON_BY_ID[result.path[0]]?.name} directly with a ${POKEMON_BY_ID[result.path[1]]?.name}.`
                    : `Breed through ${result.path.length - 2} intermediate Pokémon to reach ${POKEMON_BY_ID[result.path[result.path.length - 1]]?.name}.`}
                </p>
              </div>

              {/* Chain display */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 overflow-x-auto">
                <div className="flex items-start gap-2" style={{ minWidth: 'max-content' }}>
                  {result.path.map((id, i) => {
                    const nextId = result.path[i + 1];
                    const connecting = nextId ? sharedGroups(id, nextId) : null;
                    return (
                      <React.Fragment key={id}>
                        <ChainStep
                          pokemonId={id}
                          stepIndex={i}
                          totalSteps={result.path.length}
                          connectingGroups={connecting}
                          pmMap={pmMap}
                        />
                        {nextId && <Arrow />}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Step-by-step instructions */}
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  Step-by-step
                </h3>
                {result.path.slice(0, -1).map((id, i) => {
                  const nextId = result.path[i + 1];
                  const nextP = POKEMON_BY_ID[nextId];
                  const curP  = POKEMON_BY_ID[id];
                  const groups = sharedGroups(id, nextId);
                  const needsDitto = groups.includes('ditto') || nextP?.gender === 'genderless';
                  const isFinalStep = i === result.path.length - 2;
                  return (
                    <div key={id} className="flex gap-3 bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2.5 text-sm">
                      <span className="text-gray-500 font-mono shrink-0 w-5 text-center">{i + 1}.</span>
                      <div className="flex-1 text-gray-300">
                        {needsDitto ? (
                          <>
                            Breed your shiny <strong className="text-white">{curP?.name}</strong>{' '}
                            (as Ditto) with a{' '}
                            <strong className="text-white">{nextP?.name}</strong> to produce{' '}
                            {isFinalStep ? 'your target ' : ''}
                            <strong className="text-emerald-300">{nextP?.name}</strong> offspring.
                          </>
                        ) : (
                          <>
                            Breed your shiny <strong className="text-white">{curP?.name}</strong>{' '}
                            (female) with a male{' '}
                            <strong className="text-white">{nextP?.name}</strong>{' '}
                            <span className="text-gray-500">
                              (shared: {groups.map(g => EGG_GROUP_LABELS[g]).join(', ')})
                            </span>
                            {' '}— hatch eggs until you get a{isFinalStep ? ' ' : ' female '}
                            <strong className="text-emerald-300">{nextP?.name}</strong>
                            {isFinalStep ? '.' : ' to continue the chain.'}
                            {nextP?.gender === 'female-only' && (
                              <span className="ml-1 text-green-400">
                                (Always female — no need to check gender.)
                              </span>
                            )}
                            {nextP?.gender === 'male-only' && !isFinalStep && (
                              <span className="ml-1 text-yellow-400">
                                (Male-only — will need a Ditto for the next step.)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Shiny odds reminder */}
              <div className="mt-4 bg-pink-500/10 border border-pink-500/20 rounded-lg px-3 py-2.5 text-xs text-pink-200">
                <strong className="text-pink-300">Shiny odds at each step:</strong> ~1/1024 per egg
                (Special DV inherited from shiny mother). Expect ~500–1500 eggs per step on average.
                Each intermediate must be a shiny female before moving to the next step.
                With a shiny Ditto (see above), odds jump to ~1/64 and egg groups don't matter.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {(ownedIds.length === 0 || !targetId) && (
        <div className="mt-8 bg-gray-800/40 border border-gray-700/50 rounded-xl px-6 py-8 text-center text-gray-500">
          <p className="text-4xl mb-3">🧬</p>
          <p className="text-sm">
            Add your shiny Pokémon and pick a target to see the shortest breeding chain.
          </p>
        </div>
      )}

      {dittoOpen && <DittoModal onClose={() => setDittoOpen(false)} dittoPm={pmMap[132]} />}
    </div>
  );
}
