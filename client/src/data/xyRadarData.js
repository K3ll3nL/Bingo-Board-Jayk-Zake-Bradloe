// XY Poké Radar route data — scraped from https://docs.google.com/document/d/1UzGIwIWpLV3426tmnSopMav8ezsJFMwNZDdAYdpqBEM/pub
// Zone formulas from patch spawn mechanics doc

export const ZONE_SIZES = { A: 8, B: 16, C: 24, D: 32 };

export function calcIdealOdds(A, B, C, D) {
  if (A === 0 || B === 0 || C === 0 || D === 0) return 0;
  return (A / 8) * (B / 16) * (C / 24) * (D / 32) * (((A / 8) + (B / 16) + (C / 24)) / 3);
}

export function calcShinyOdds(A, B, C, D) {
  return ((A / 8) + (B / 16) + (C / 24) + (D / 32) + (((A / 8) + (B / 16) + (C / 24)) / 3)) / 200;
}

export function calcChainBreakOdds(A, B, C, D) {
  const a = (8 - A) / 8;
  const b = (16 - B) / 16;
  const c = (24 - C) / 24;
  const d = (32 - D) / 32;
  return a * b * c * d * ((a + b + c) / 3);
}

// grassType: 'grass' | 'red-flowers' | 'yellow-flowers' | 'purple-flowers'
// position type: 'chain' = best for chain building, 'shiny' = shiny reset tile, 'both' = good for both
export const XY_ROUTES = [
  {
    id: 'route-5-flowers',
    name: 'Route 5',
    grassType: 'purple-flowers',
    difficulty: 0,
    pokemon: ['Skiddo', 'Pancham', 'Furfrou', 'Bunnelby', 'Doduo', 'Gulpin', 'Plusle', 'Minun', 'Abra'],
    positions: [
      { label: 'Primary', safeTiles: 20, totalTiles: 32, idealOdds: 44, shinyOdds: 47, type: 'both' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1zR_7k6WrF4oQVwJIEUYVkaCC3zWMNL6OK0tJSwujwMs/pub',
    notes: null,
  },
  {
    id: 'route-7-grass',
    name: 'Route 7',
    grassType: 'grass',
    difficulty: 0,
    pokemon: ['Croagunk', 'Smeargle', 'Ducklett'],
    positions: [
      { label: 'Position A', safeTiles: 19, totalTiles: 21, idealOdds: 42, shinyOdds: 61, type: 'chain' },
      { label: 'Position B', safeTiles: 21, totalTiles: 24, idealOdds: 46, shinyOdds: 57, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 51, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1de7kKPqNEGndwYXeJ8QfKcF654p8B3MRvxhb4yZtiMY/pub',
    notes: null,
  },
  {
    id: 'route-7-flowers',
    name: 'Route 7',
    grassType: 'yellow-flowers',
    difficulty: 1,
    pokemon: ['Flabébé (Blue)', 'Flabébé (Orange)', 'Flabébé (Yellow)', 'Flabébé (White)', 'Swirlix', 'Spritzee', 'Volbeat', 'Illumise', 'Roselia'],
    positions: [
      { label: 'Primary', safeTiles: 17, totalTiles: 19, idealOdds: 37, shinyOdds: 71, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 60, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/18vYTcgo5mDyS-hPdIOcqC7Ex19XsdvX2jxO8OrxRYkw/pub',
    notes: null,
  },
  {
    id: 'pokemon-village',
    name: 'Pokémon Village',
    grassType: 'yellow-flowers',
    difficulty: 1,
    pokemon: ['Gothorita', 'Ditto', 'Amoonguss', 'Jigglypuff', 'Noctowl', 'Zoroark'],
    positions: [
      { label: 'Position A', safeTiles: 31, totalTiles: 31, idealOdds: 68, shinyOdds: 48, type: 'both' },
      { label: 'Position B', safeTiles: 32, totalTiles: 32, idealOdds: 70, shinyOdds: 50, type: 'both' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1QdCKksTe1aTpN72tVhOTLWjx3sVwpOtBiIhrhN5ak_U/pub',
    notes: null,
  },
  {
    id: 'azure-bay',
    name: 'Azure Bay',
    grassType: 'grass',
    difficulty: 2,
    pokemon: ['Slowpoke', 'Chatot', 'Exeggcute', 'Inkay'],
    positions: [
      { label: 'Primary', safeTiles: 32, totalTiles: 32, idealOdds: 70, shinyOdds: 48, type: 'both', note: '23 of 32 Zone 4 tiles are onscreen' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/19VIsJwijr961PG-7oKQbu836kMF3j2yD0HYKlUoP7D4/pub',
    notes: null,
  },
  {
    id: 'route-20-flowers',
    name: 'Route 20',
    grassType: 'red-flowers',
    difficulty: 2,
    pokemon: ['Trevenant'],
    positions: [
      { label: 'Primary', safeTiles: 17, totalTiles: 21, idealOdds: 37, shinyOdds: 64, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 58, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1ZOTTpt_vuY4zOAlmUpp7eFwriUsAMp6mon7hc9XMvss/pub',
    notes: null,
  },
  {
    id: 'route-22-flowers',
    name: 'Route 22',
    grassType: 'yellow-flowers',
    difficulty: 3,
    pokemon: ['Azurill', 'Bidoof', 'Psyduck', 'Azumarill', 'Bibarel', "Farfetch'd", 'Diggersby', 'Litleo', 'Dunsparce', 'Riolu'],
    positions: [
      { label: 'Position A', safeTiles: 12, totalTiles: 19, idealOdds: 26, shinyOdds: 65, type: 'chain' },
      { label: 'Position B', safeTiles: 12, totalTiles: 21, idealOdds: 26, shinyOdds: 64, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 63, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1OLAdR2qG930vcJbXeI1DiNMVIIjqLUB3xduvfi6pezE/pub',
    notes: null,
  },
  {
    id: 'route-2-grass',
    name: 'Route 2',
    grassType: 'grass',
    difficulty: 3,
    pokemon: ['Pidgey', 'Zigzagoon', 'Caterpie', 'Weedle', 'Fletchling', 'Scatterbug'],
    positions: [
      { label: 'Primary', safeTiles: 11, totalTiles: 13, idealOdds: 24, shinyOdds: 83, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 63, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1-QCYyjzSQJo3eKqc-T897ps6iGV4WFVIcykl7QBVCQ0/pub',
    notes: null,
  },
  {
    id: 'route-16-flowers',
    name: 'Route 16',
    grassType: 'yellow-flowers',
    difficulty: 3,
    pokemon: ['Weepinbell', 'Floatzel', 'Skorupi', 'Foongus', 'Klefki', 'Phantump'],
    positions: [
      { label: 'Position A', safeTiles: 12, totalTiles: 19, idealOdds: 26, shinyOdds: 71, type: 'chain' },
      { label: 'Position B', safeTiles: 14, totalTiles: 25, idealOdds: 31, shinyOdds: 59, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 53, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1QJJsUX9P_wGVDRBLciDewwyTAgMgtsf0hSGgveIU0Q8/pub',
    notes: null,
  },
  {
    id: 'santalune-forest',
    name: 'Santalune Forest',
    grassType: 'grass',
    difficulty: 4,
    pokemon: ['Pansear', 'Pansage', 'Panpour', 'Pikachu', 'Metapod', 'Kakuna'],
    positions: [
      { label: 'Position A', safeTiles: 17, totalTiles: 19, idealOdds: 37, shinyOdds: 71, type: 'chain', note: '12/13 tiles onscreen' },
      { label: 'Position B', safeTiles: 13, totalTiles: 15, idealOdds: 28, shinyOdds: 69, type: 'chain' },
      { label: 'Position C', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 60, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 52, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1RLT4zsWQwOzWI-UBYyu4RPFFLRj9rKy9PvkvB-lIWE8/pub',
    notes: null,
  },
  {
    id: 'route-20-grass',
    name: 'Route 20',
    grassType: 'grass',
    difficulty: 4,
    pokemon: ['Trevenant'],
    positions: [
      { label: 'Position A', safeTiles: 17, totalTiles: 21, idealOdds: 37, shinyOdds: 65, type: 'chain' },
      { label: 'Position B / Shiny Reset', safeTiles: 12, totalTiles: 16, idealOdds: 26, shinyOdds: 76, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1eJWp1N26mFeZnIyg8ID9DV8-HDaPvQTsJSJXlcbQ274/pub',
    notes: null,
  },
  {
    id: 'route-14-grass',
    name: 'Route 14',
    grassType: 'grass',
    difficulty: 5,
    pokemon: ['Carnivine', 'Quagsire', 'Karrablast', 'Shelmet', 'Goomy', 'Haunter'],
    positions: [
      { label: 'Position A', safeTiles: 9, totalTiles: 16, idealOdds: 20, shinyOdds: 76, type: 'chain' },
      { label: 'Position B', safeTiles: 9, totalTiles: 12, idealOdds: 20, shinyOdds: 91, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 66, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1duDerUu_dsHdFajIc1toiSPOOR2Re4gnryvs7YenQuI/pub',
    notes: null,
  },
  {
    id: 'route-21-flowers',
    name: 'Route 21',
    grassType: 'purple-flowers',
    difficulty: 5,
    pokemon: ['Spinda', 'Altaria', 'Scyther', 'Ursaring'],
    positions: [
      { label: 'Position A', safeTiles: 8, totalTiles: 12, idealOdds: 18, shinyOdds: 75, type: 'chain' },
      { label: 'Position B', safeTiles: 10, totalTiles: 14, idealOdds: 22, shinyOdds: 78, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 59, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1MhTzwetwgSAMRPyXkaMTRuA7rIJoi0Kagszwx_wJjD8/pub',
    notes: null,
  },
  {
    id: 'route-10-grass',
    name: 'Route 10',
    grassType: 'grass',
    difficulty: 6,
    pokemon: ['Hawlucha', 'Golett', 'Snubbull', 'Eevee', 'Houndour', 'Electrike', 'Emolga', 'Sigilyph'],
    positions: [
      { label: 'Position A', safeTiles: 11, totalTiles: 16, idealOdds: 24, shinyOdds: 69, type: 'chain' },
      { label: 'Position B', safeTiles: 10, totalTiles: 13, idealOdds: 22, shinyOdds: 91, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 65, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/e/2PACX-1vS0shlfiLItAPsSUfbjvJJLh1UQS8OY0jKZib43mmsZUw1d1AANJY71axxRMdLRLrd8fZQCiJxMn3Nn/pub',
    notes: null,
  },
  {
    id: 'route-12-flowers',
    name: 'Route 12',
    grassType: 'yellow-flowers',
    difficulty: 6,
    pokemon: ['Tauros', 'Miltank', 'Pinsir', 'Heracross', 'Pachirisu'],
    positions: [
      { label: 'Position A', safeTiles: 6, totalTiles: 9, idealOdds: 13, shinyOdds: 93, type: 'chain' },
      { label: 'Position B', safeTiles: 7, totalTiles: 10, idealOdds: 15, shinyOdds: 95, type: 'chain' },
      { label: 'Position C', safeTiles: 3, totalTiles: 18, idealOdds: 6.6, shinyOdds: 72, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 75, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1e1PlnFzkqayHXplpjNLwnMmcSNrizEUJ3gVh4p_orI4/pub',
    notes: null,
  },
  {
    id: 'route-15-grass',
    name: 'Route 15',
    grassType: 'grass',
    difficulty: 7,
    pokemon: ['Mightyena', 'Liepard', 'Watchog', 'Pawniard'],
    positions: [
      { label: 'Position A', safeTiles: 6, totalTiles: 9, idealOdds: 13, shinyOdds: 101, type: 'chain' },
      { label: 'Position B', safeTiles: 7, totalTiles: 15, idealOdds: 15, shinyOdds: 87, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 85, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1Yti-4_O8OobqxiBj-Pl5jTSRFM9m8GX4YRsxb92uMG4/pub',
    notes: null,
  },
  {
    id: 'route-22-grass',
    name: 'Route 22',
    grassType: 'grass',
    difficulty: 7,
    pokemon: ['Azurill', 'Bidoof', 'Psyduck', 'Azumarill', 'Bibarel', "Farfetch'd", 'Diggersby', 'Litleo', 'Dunsparce', 'Riolu'],
    positions: [
      { label: 'Position A', safeTiles: 5, totalTiles: 7, idealOdds: 11, shinyOdds: 132, type: 'chain' },
      { label: 'Position B', safeTiles: 6, totalTiles: 8, idealOdds: 13, shinyOdds: 137, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 95, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1E-a-SvQXUKinotirKNz3UvhrptyVTDqQR_IfYh8GvEg/pub',
    notes: null,
  },
  {
    id: 'route-19-flowers',
    name: 'Route 19',
    grassType: 'purple-flowers',
    difficulty: 7,
    pokemon: ['Sliggoo', 'Drapion'],
    positions: [
      { label: 'Position A', safeTiles: 5, totalTiles: 11, idealOdds: 11, shinyOdds: 93, type: 'chain' },
      { label: 'Position B', safeTiles: 4, totalTiles: 14, idealOdds: 8.8, shinyOdds: 87, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 85, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1bHY11MzsDfZOw_HR-269fKdWEZxTyEbBYof4LM2N-5k/pub',
    notes: null,
  },
  {
    id: 'route-8-grass',
    name: 'Route 8',
    grassType: 'grass',
    difficulty: 8,
    pokemon: ['Mienfoo', 'Drifloon', 'Absol', 'Spoink', 'Seviper', 'Zangoose', 'Bagon'],
    positions: [
      { label: 'Position A', safeTiles: 6, totalTiles: 11, idealOdds: 13, shinyOdds: 89, type: 'chain' },
      { label: 'Position B', safeTiles: 7, totalTiles: 8, idealOdds: 15, shinyOdds: 98, type: 'chain' },
      { label: 'Position C', safeTiles: 3, totalTiles: 11, idealOdds: 6.6, shinyOdds: 103, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 75, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/17x614zZ9v1xYSZjSTMMyuJQwHCBhjKO0SHC3_5tgOpY/pub',
    notes: null,
  },
  {
    id: 'route-18-flowers',
    name: 'Route 18',
    grassType: 'red-flowers',
    difficulty: 8,
    pokemon: ['Gurdurr', 'Torkoal', 'Graveler', 'Sandslash', 'Lairon', 'Pupitar', 'Durant', 'Heatmor'],
    positions: [
      { label: 'Primary', safeTiles: 4, totalTiles: 9, idealOdds: 8.8, shinyOdds: 128, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 88, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/13YYZ5tMDCtczU0qazt-5tXEcoXElEekbv5WjLZYVg7w/pub',
    notes: null,
  },
  {
    id: 'route-18-grass',
    name: 'Route 18',
    grassType: 'grass',
    difficulty: 8,
    pokemon: ['Gurdurr', 'Torkoal', 'Graveler', 'Sandslash', 'Lairon', 'Pupitar', 'Durant', 'Heatmor'],
    positions: [
      { label: 'Primary', safeTiles: 4, totalTiles: 10, idealOdds: 8.8, shinyOdds: 106, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 85, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1HXTptsEH55A7LKmqARMHZMxgoNvd5_h7kTSnJpSlCyI/pub',
    notes: null,
  },
  {
    id: 'route-3-grass',
    name: 'Route 3',
    grassType: 'grass',
    difficulty: 9,
    pokemon: ['Burmy'],
    positions: [
      { label: 'Primary', safeTiles: 3, totalTiles: 5, idealOdds: 6.6, shinyOdds: 132, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 112, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1XDjx8R26gwFirS2OSwsxHawEI1eEc9tq1fkDVv4AU9Q/pub',
    notes: null,
  },
  {
    id: 'route-11-grass',
    name: 'Route 11',
    grassType: 'grass',
    difficulty: 10,
    pokemon: ['Hariyama', 'Staravia', 'Sawk', 'Throh', 'Nidorino', 'Nidorina', 'Chingling', 'Stunky', 'Dedenne'],
    positions: [
      { label: 'Position A', safeTiles: 2, totalTiles: 6, idealOdds: 4.4, shinyOdds: 119, type: 'chain' },
      { label: 'Position B', safeTiles: 2, totalTiles: 4, idealOdds: 4.4, shinyOdds: 167, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 116, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1JEUT0VBaXPlFp6LifO93bADodtAk3qL6CrQw0Tr1wzg/pub',
    notes: null,
  },
  {
    id: 'route-4-flowers',
    name: 'Route 4',
    grassType: 'red-flowers',
    difficulty: 11,
    pokemon: ['Ledyba', 'Combee', 'Budew', 'Skitty', 'Ralts', 'Flabébé (Red)'],
    positions: [
      { label: 'North Area (Broken)', safeTiles: 0, totalTiles: 4, idealOdds: 0, shinyOdds: 154, type: 'chain', note: 'Poké Radar does not function correctly here' },
      { label: 'South Area', safeTiles: 1, totalTiles: 3, idealOdds: 2.2, shinyOdds: 214, type: 'chain' },
      { label: 'Shiny Reset Tile', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 153, type: 'shiny' },
      { label: 'Red Flower Reset', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 958, type: 'shiny' },
      { label: 'Secondary Reset', safeTiles: null, totalTiles: null, idealOdds: null, shinyOdds: 389, type: 'shiny' },
    ],
    edgePatchUrl: 'https://docs.google.com/presentation/d/1GzGShSDrlsGEtwD_Diw6TaL_FkbRGcvAxx-iORB7xq4/pub',
    notes: 'The Poké Radar is broken in the northern section of Route 4. Only use the designated southern hunting areas. This route is rated 11/10 difficulty.',
  },
];

// Derived helper: best shiny odds across all positions (lowest denominator = best)
export function getBestShinyOdds(route) {
  return Math.min(...route.positions.map(p => p.shinyOdds));
}

// Difficulty label + color
export function getDifficultyInfo(d) {
  if (d <= 3) return { label: 'Easy', color: '#4ade80' };
  if (d <= 6) return { label: 'Medium', color: '#fbbf24' };
  if (d <= 9) return { label: 'Hard', color: '#f97316' };
  return { label: 'Expert', color: '#f87171' };
}

export const GRASS_TYPE_INFO = {
  'grass':          { label: 'Grass',          color: '#4ade80', bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)' },
  'red-flowers':    { label: 'Red Flowers',    color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  'yellow-flowers': { label: 'Yellow Flowers', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' },
  'purple-flowers': { label: 'Purple Flowers', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.3)' },
};

// External resource links
export const RESOURCE_LINKS = {
  videoComprehensive: 'https://www.youtube.com/watch?v=oP4hDHPA8Cg',
  videoAbridged: 'https://www.youtube.com/watch?v=sud7NdlYzZs',
  videoPlaylist: 'https://www.youtube.com/playlist?list=PL875cuBcKwJ8DyrL1cMw3WSVmJt5i4UkY',
  textGuide: 'https://docs.google.com/presentation/d/1lg-wfWoBa7etT4Yd4jFOP4Z979Qr9-q_w0t6liFeftc/pub',
  questChecklist: 'https://docs.google.com/document/d/1Bd8PkXUv7FModCuZdslIbuEErCFtNy1Q9PgsoCYPJS0/pub',
  genDifferences: 'https://docs.google.com/document/d/1rKW5TwuKbEbMWWTPJGUV4i3Bu_rnDnk1t9AddBdgtjs/pub',
};

// Tile safety analysis given a flat tile array and player position
// Chebyshev distance naturally maps to Zone 1-4 (8/16/24/32 tiles each)
export function analyzePosition(tiles, width, height, px, py) {
  const isGrass = (x, y) =>
    x >= 0 && x < width && y >= 0 && y < height && tiles[y * width + x] === 1;

  let A = 0, B = 0, C = 0, D = 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (!isGrass(px + dx, py + dy)) continue;
      if (dist === 1) A++;
      else if (dist === 2) B++;
      else if (dist === 3) C++;
      else if (dist === 4) D++;
    }
  }
  const idealOdds = calcIdealOdds(A, B, C, D);
  const shinyOdds = calcShinyOdds(A, B, C, D);
  const chainBreakOdds = calcChainBreakOdds(A, B, C, D);
  return { A, B, C, D, idealOdds, shinyOdds, chainBreakOdds };
}

// Determine if a grass tile is an "edge patch" (has a non-grass neighbor in Zone 1)
export function isEdgePatch(tiles, width, height, x, y) {
  if (tiles[y * width + x] !== 1) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return true;
      if (tiles[ny * width + nx] !== 1) return true;
    }
  }
  return false;
}
