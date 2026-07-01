import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBackground from './PageBackground';
import PageHeader from './PageHeader';

const CATEGORY_COLORS = {
  Chaining:    { border: '#6366f1', tag: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',    glow: 'rgba(99,102,241,0.08)',  hex: '#6366f1' },
  Breeding:    { border: '#ec4899', tag: 'bg-pink-500/20 text-pink-300 border-pink-500/30',          glow: 'rgba(236,72,153,0.08)',  hex: '#ec4899' },
  Encounter:   { border: '#10b981', tag: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', glow: 'rgba(16,185,129,0.08)', hex: '#10b981' },
  Calculators: { border: '#f59e0b', tag: 'bg-amber-500/20 text-amber-300 border-amber-500/30',       glow: 'rgba(245,158,11,0.08)', hex: '#f59e0b' },
  Advisor:     { border: '#06b6d4', tag: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',          glow: 'rgba(6,182,212,0.08)',  hex: '#06b6d4' },
};

const GEN_GROUPS = ['Universal', 'Gen 9', 'Gen 8', 'Gen 7', 'Gen 6', 'Gen 4', 'Gen 2', 'Gen 1'];

const TOOLS = [
  {
    id: 'catch-rate',
    name: 'Catch Rate Calculator',
    description: 'Compute catch probability for any Pokéball, HP, and status condition.',
    icon: '⚾',
    category: 'Calculators',
    gen: 'Universal',
  },
  // {
  //   id: 'safari-zone',
  //   name: 'Safari Zone Advisor',
  //   description: 'Real-time bait/rock advisor with projected catch and flee rates for every safari zone.',
  //   icon: '🦁',
  //   category: 'Advisor',
  //   gen: 'Universal',
  //   live: true,
  // },
  {
    id: 'home-value',
    name: 'Pokémon Home Value Hub',
    description: 'Estimate the shiny trade value of a Pokémon based on rarity factors.',
    icon: '🏠',
    category: 'Calculators',
    gen: 'Universal',
  },
  {
    id: 'sv-sandwich',
    name: 'S/V Sandwich Calculator',
    description: 'Pick fillings and condiments to calculate your Meal Powers in Scarlet/Violet.',
    icon: '🥪',
    category: 'Encounter',
    gen: 'Gen 9',
    live: true,
  },
  {
    id: 'pla-permutation',
    name: 'PLA Permutation Calculator',
    description: 'Legends: Arceus RNG permutation finder for mass outbreaks and space-time distortions.',
    icon: '🎲',
    category: 'Calculators',
    gen: 'Gen 8',
  },
  {
    id: 'bdsp-radar',
    name: 'BDSP Radar Breakdown',
    description: 'Brilliant Diamond / Shining Pearl Poké Radar guide with updated mechanics.',
    icon: '📡',
    category: 'Chaining',
    gen: 'Gen 8',
    live: true,
  },
  {
    id: 'usum-warp',
    name: 'USUM Warp Ride Breakdown',
    description: 'Ultra Wormhole travel distances and shiny rates for each Pokémon.',
    icon: '🌀',
    category: 'Encounter',
    gen: 'Gen 7',
  },
  {
    id: 'xy-radar',
    name: 'XY Poké Radar',
    description: 'Interactive tile maps showing safe vs edge-patch tiles, plus zone analysis for radar chaining in X & Y.',
    icon: '📡',
    category: 'Chaining',
    gen: 'Gen 6',
    live: true,
  },
  {
    id: 'dexnav',
    name: 'DexNav',
    description: 'ORAS DexNav search level tracker and shiny probability calculator.',
    icon: '🔍',
    category: 'Chaining',
    gen: 'Gen 6',
    live: true,
  },
  {
    id: 'chain-fishing',
    name: 'Chain Fishing',
    description: 'Boost shiny odds by chaining fishing encounters without breaking the chain.',
    icon: '🎣',
    category: 'Chaining',
    gen: 'Gen 6',
  },
  {
    id: 'dp-radar',
    name: 'D/P Radar Breakdown',
    description: 'Poké Radar mechanics for Diamond and Pearl, including patch selection rules.',
    icon: '📡',
    category: 'Chaining',
    gen: 'Gen 4',
  },
  {
    id: 'plat-radar',
    name: 'Platinum Radar Breakdown',
    description: 'Platinum-specific Poké Radar behavior and chain optimization.',
    icon: '📡',
    category: 'Chaining',
    gen: 'Gen 4',
  },
  {
    id: 'gen2-breeding',
    name: 'Gen 2 Shiny Gene Breeding',
    description: 'Family tree tool for passing shiny DVs through Gen 2 breeding.',
    icon: '🧬',
    category: 'Breeding',
    gen: 'Gen 2',
    live: true,
  },
  {
    id: 'gen1-shiny',
    name: 'Gen 1 Shiny Calculator',
    description: 'Calculate shiny DVs and transfer compatibility for Gold/Silver.',
    icon: '⭐',
    category: 'Calculators',
    gen: 'Gen 1',
  },
];

const ALL_CATEGORIES = ['All', ...Object.keys(CATEGORY_COLORS)];

export default function ShinyTools() {
  const navigate = useNavigate();
  const [activeCat, setActiveCat] = useState('All');

  const liveCount = TOOLS.filter(t => t.live).length;

  const visibleTools = (gen) =>
    TOOLS.filter(t => t.gen === gen && (activeCat === 'All' || t.category === activeCat));

  return (
    <div className="min-h-screen" style={{ isolation: 'isolate', position: 'relative' }}>
      <PageBackground />
      <PageHeader title="Shiny Tools" />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm text-gray-400"><span className="text-green-400 font-semibold">{liveCount}</span> tools live</span>
          </div>
          <div className="text-sm text-gray-400"><span className="text-gray-300 font-semibold">{TOOLS.length - liveCount}</span> coming soon</div>
        </div>

        {/* Category filter */}
        <div className="flex overflow-x-auto gap-1.5 mb-6 pb-1">
          {ALL_CATEGORIES.map(cat => {
            const c = CATEGORY_COLORS[cat];
            const isActive = activeCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                  isActive
                    ? cat === 'All'
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : `border text-white`
                    : 'bg-transparent border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white'
                }`}
                style={isActive && c ? { backgroundColor: c.hex + '33', borderColor: c.hex, color: 'white' } : {}}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Tool grid grouped by gen */}
        <div className="space-y-8">
          {GEN_GROUPS.map(gen => {
            const tools = visibleTools(gen);
            if (!tools.length) return null;
            return (
              <div key={gen}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-purple-400">{gen}</h2>
                  <div className="flex-1 h-px bg-gray-700" />
                  <span className="text-xs text-gray-600">{tools.filter(t => t.live).length}/{tools.length} live</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {tools.map(tool => {
                    const c = CATEGORY_COLORS[tool.category];
                    return (
                      <button
                        key={tool.id}
                        onClick={() => tool.live && navigate(`/tools/${tool.id}`)}
                        className={`relative flex items-start gap-2 sm:gap-3 rounded-xl px-2.5 py-2.5 sm:px-4 sm:py-3.5 border text-left transition-all duration-150 group ${
                          tool.live
                            ? 'hover:brightness-110 hover:scale-[1.02] active:scale-[0.99] cursor-pointer'
                            : 'cursor-default'
                        }`}
                        style={{
                          backgroundColor: tool.live ? c.glow : 'rgba(30,32,36,0.6)',
                          borderColor: tool.live ? c.border : '#374151',
                        }}
                      >
                        {/* Live indicator dot */}
                        {tool.live && (
                          <span
                            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: c.hex }}
                          />
                        )}

                        <span className="text-lg sm:text-xl leading-none shrink-0 mt-0.5">{tool.icon}</span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5 mb-0.5 sm:mb-1">
                            <p className={`text-xs sm:text-sm font-semibold leading-tight ${tool.live ? 'text-white' : 'text-gray-400'}`}>
                              {tool.name}
                            </p>
                            {!tool.live && (
                              <span className="shrink-0 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded-full bg-gray-700/80 text-gray-300 border border-gray-500">
                                Soon
                              </span>
                            )}
                          </div>
                          <p className={`hidden sm:block text-xs leading-snug ${tool.live ? 'text-gray-400' : 'text-gray-600'}`}>
                            {tool.description}
                          </p>
                          <span className={`hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider mt-2 px-1.5 py-0.5 rounded border ${c.tag}`}>
                            {tool.category}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { TOOLS };
