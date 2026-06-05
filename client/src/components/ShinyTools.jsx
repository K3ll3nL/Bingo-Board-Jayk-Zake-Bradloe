import React from 'react';
import { useNavigate } from 'react-router-dom';

const CATEGORY_COLORS = {
  Chaining:    { border: '#6366f1', tag: 'bg-indigo-500/20 text-indigo-300', glow: 'rgba(99,102,241,0.12)' },
  Breeding:    { border: '#ec4899', tag: 'bg-pink-500/20 text-pink-300',    glow: 'rgba(236,72,153,0.12)' },
  Encounter:   { border: '#10b981', tag: 'bg-emerald-500/20 text-emerald-300', glow: 'rgba(16,185,129,0.12)' },
  Calculators: { border: '#f59e0b', tag: 'bg-amber-500/20 text-amber-300',  glow: 'rgba(245,158,11,0.12)' },
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
    name: 'X/Y Radar Breakdown',
    description: 'Maximize your Poké Radar chain in X/Y with step-by-step mechanics guidance.',
    icon: '📡',
    category: 'Chaining',
    gen: 'Gen 6',
  },
  {
    id: 'dexnav',
    name: 'DexNav',
    description: 'ORAS DexNav search level tracker and shiny probability calculator.',
    icon: '🔍',
    category: 'Chaining',
    gen: 'Gen 6',
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

export default function ShinyTools() {
  const navigate = useNavigate();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-white mb-1">Shiny Hunting Tools</h1>
        <p className="text-gray-400">Calculators and references grouped by generation.</p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(CATEGORY_COLORS).map(([cat, c]) => (
          <span key={cat} className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.tag}`}>{cat}</span>
        ))}
      </div>

      <div className="space-y-4">
        {GEN_GROUPS.map(gen => {
          const tools = TOOLS.filter(t => t.gen === gen);
          if (!tools.length) return null;
          return (
            <div key={gen}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">{gen}</h2>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                {tools.map(tool => {
                  const c = CATEGORY_COLORS[tool.category];
                  return (
                    <button
                      key={tool.id}
                      onClick={() => navigate(`/tools/${tool.id}`)}
                      className="flex items-start gap-2.5 shrink-0 rounded-lg px-3 py-2.5 border transition-all duration-150 hover:brightness-110 active:scale-[0.98] text-left"
                      style={{ backgroundColor: c.glow, borderColor: c.border, width: '280px' }}
                      title={tool.live ? tool.name : 'Coming soon'}
                    >
                      <span className="text-lg leading-none shrink-0 mt-0.5">{tool.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          <p className="text-white text-sm font-semibold leading-tight">{tool.name}</p>
                          {!tool.live && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-white/10 text-gray-500">Soon</span>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs leading-snug line-clamp-2">{tool.description}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 inline-block ${c.tag.split(' ')[1]}`}>
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
  );
}

export { TOOLS };
