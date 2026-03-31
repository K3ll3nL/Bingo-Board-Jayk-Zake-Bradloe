// ── Allowed Games List ────────────────────────────────────────────────────────
//
// To add a new game:
//   1. Add an entry to ALLOWED_GAMES below.
//   2. Upload logo image(s) to R2 at: assets/games/<filename>.png
//   3. Deploy.
//
// Fields:
//   key            — stable slug stored in the DB (never change after launch)
//   label          — display name shown to users
//   img_urls       — array of logo URLs from R2, up to 3 (for games with multiple
//                    version logos). Single-version games use a 1-item array.
//   shiny_label    — (optional) replaces "Proof of Shiny" label on the upload form
//                    e.g. "Overworld Screenshot" for games without a shiny flash
//   no_image_proof — (optional) if true, image upload fields are greyed out and
//                    disabled; use for games with no in-game screenshot capability
// ─────────────────────────────────────────────────────────────────────────────

const R2_BASE = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/games';

export const ALLOWED_GAMES = [
  {
    key: 'firered_leafgreen',
    label: 'Pokémon FireRed / LeafGreen',
    img_urls: [`${R2_BASE}/firered.png`,`${R2_BASE}/leafgreen.png`],
    no_image_proof: true,
  },
  {
    key: 'legends_za',
    label: 'Pokémon Legends: Z-A',
    img_urls: [`${R2_BASE}/legends_za.png`],
    shiny_label: 'Overworld Screenshot',
  },
  {
    key: 'scarlet_violet',
    label: 'Pokémon Scarlet / Violet',
    img_urls: [`${R2_BASE}/scarlet.png`, `${R2_BASE}/violet.png`],
  },
  {
    key: 'legends_arceus',
    label: 'Pokémon Legends: Arceus',
    img_urls: [`${R2_BASE}/legends_arceus.png`],
  },
  {
    key: 'brilliant_diamond_shining_pearl',
    label: 'Pokémon Brilliant Diamond / Shining Pearl',
    img_urls: [`${R2_BASE}/brilliant_diamond.png`, `${R2_BASE}/shining_pearl.png`],
  },
  {
    key: 'sword_shield',
    label: 'Pokémon Sword / Shield',
    img_urls: [`${R2_BASE}/sword.png`, `${R2_BASE}/shield.png`],
  },
  {
    key: 'lets_go_pikachu_eevee',
    label: 'Pokémon Lets Go Pikachu / Eevee',
    img_urls: [`${R2_BASE}/lets_go_pikachu.png`, `${R2_BASE}/lets_go_eevee.png`],
  },
  {
    key: 'ultra_sun_ultra_moon',
    label: 'Pokémon Ultra Sun / Ultra Moon',
    img_urls: [`${R2_BASE}/ultra_sun.png`, `${R2_BASE}/ultra_moon.png`],
  },
  {
    key: 'sun_moon',
    label: 'Pokémon Sun / Moon',
    img_urls: [`${R2_BASE}/sun.png`, `${R2_BASE}/moon.png`],
  },
  {
    key: 'omega_ruby_alpha_sapphire',
    label: 'Pokémon Omega Ruby / Alpha Sapphire',
    img_urls: [`${R2_BASE}/omega_ruby.png`, `${R2_BASE}/alpha_sapphire.png`],
  },
  {
    key: 'x_y',
    label: 'Pokémon X / Y',
    img_urls: [`${R2_BASE}/x.png`, `${R2_BASE}/y.png`],
  },
  {
    key: 'black2_white2',
    label: 'Pokémon Black 2 / White 2',
    img_urls: [`${R2_BASE}/black2.png`, `${R2_BASE}/white2.png`],
  },
  {
    key: 'black_white',
    label: 'Pokémon Black / White',
    img_urls: [`${R2_BASE}/black.png`, `${R2_BASE}/white.png`],
  },
  {
    key: 'heartgold_soulsilver',
    label: 'Pokémon HeartGold / SoulSilver',
    img_urls: [`${R2_BASE}/heartgold.png`, `${R2_BASE}/soulsilver.png`],
  },
  {
    key: 'platinum',
    label: 'Pokémon Platinum',
    img_urls: [`${R2_BASE}/platinum.png`],
  },
  {
    key: 'diamond_pearl',
    label: 'Pokémon Diamond / Pearl',
    img_urls: [`${R2_BASE}/diamond.png`, `${R2_BASE}/pearl.png`],
  },
  {
    key: 'emerald',
    label: 'Pokémon Emerald',
    img_urls: [`${R2_BASE}/emerald.png`],
    no_image_proof: true,
  },
  {
    key: 'ruby_sapphire',
    label: 'Pokémon Ruby / Sapphire',
    img_urls: [`${R2_BASE}/ruby.png`, `${R2_BASE}/sapphire.png`],
    no_image_proof: true,
  },
  {
    key: 'crystal',
    label: 'Pokémon Crystal',
    img_urls: [`${R2_BASE}/crystal.png`],
    no_image_proof: true,
  },
  {
    key: 'gold_silver',
    label: 'Pokémon Gold / Silver',
    img_urls: [`${R2_BASE}/gold.png`, `${R2_BASE}/silver.png`],
    no_image_proof: true,
  },
  {
    key: 'yellow',
    label: 'Pokémon Yellow',
    img_urls: [`${R2_BASE}/yellow.png`],
    no_image_proof: true,
  },
  {
    key: 'red_blue',
    label: 'Pokémon Red / Blue',
    img_urls: [`${R2_BASE}/red.png`, `${R2_BASE}/blue.png`],
    no_image_proof: true,
  },
];
