// Mirrors client/src/constants/games.js — duplicated here because that file is
// an ES module and this file is CommonJS. Keep labels in sync if games.js changes.
const GAME_LABELS = {
  firered_leafgreen: 'Pokémon FireRed / LeafGreen',
  legends_za: 'Pokémon Legends: Z-A',
  scarlet_violet: 'Pokémon Scarlet / Violet',
  legends_arceus: 'Pokémon Legends: Arceus',
  brilliant_diamond_shining_pearl: 'Pokémon Brilliant Diamond / Shining Pearl',
  sword_shield: 'Pokémon Sword / Shield',
  lets_go_pikachu_eevee: 'Pokémon Lets Go Pikachu / Eevee',
  ultra_sun_ultra_moon: 'Pokémon Ultra Sun / Ultra Moon',
  sun_moon: 'Pokémon Sun / Moon',
  omega_ruby_alpha_sapphire: 'Pokémon Omega Ruby / Alpha Sapphire',
  x_y: 'Pokémon X / Y',
  black2_white2: 'Pokémon Black 2 / White 2',
  black_white: 'Pokémon Black / White',
  heartgold_soulsilver: 'Pokémon HeartGold / SoulSilver',
  platinum: 'Pokémon Platinum',
  diamond_pearl: 'Pokémon Diamond / Pearl',
  emerald: 'Pokémon Emerald',
  ruby_sapphire: 'Pokémon Ruby / Sapphire',
  crystal: 'Pokémon Crystal',
  gold_silver: 'Pokémon Gold / Silver',
  yellow: 'Pokémon Yellow',
  red_blue: 'Pokémon Red / Blue',
};

// `entries.game` stores the display label ("Pokémon Emerald"), not the
// ALLOWED_GAMES key. Resolve either form to both, so callers can compare keys
// (pokemon_master.game_slugs, pokemon_master.collection_bonus) or show labels.
const GAME_KEY_BY_LABEL = Object.fromEntries(Object.entries(GAME_LABELS).map(([k, v]) => [v, k]));
const resolveGame = (raw) => {
  if (!raw) return { key: null, label: null };
  if (GAME_LABELS[raw]) return { key: raw, label: GAME_LABELS[raw] };
  return { key: GAME_KEY_BY_LABEL[raw] || null, label: raw };
};

module.exports = { GAME_LABELS, resolveGame };
