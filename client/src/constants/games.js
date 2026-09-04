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
//   proof_fields   — (optional) overrides DEFAULT_PROOF_FIELDS for this game.
//                    Use proofFieldsFor(key) rather than reading this directly;
//                    it applies the default and the no_image_proof rule.
//   manager_order  — sort key used ONLY by PokemonGameManager (higher = newer, shown
//                    first). Gaps of 10 leave room to slot re-releases in between
//                    without renumbering. Every other surface uses array order.
// ─────────────────────────────────────────────────────────────────────────────

const R2_BASE = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/games';

// ── Proof fields ──────────────────────────────────────────────────────────────
// Every submission carries an ordered set of proof images. `id` is stable and is
// what the API stores alongside the URL — never renumber or rename one after
// launch, or historical submissions lose the meaning of their own images.
//
// Most games need three separate shots. Let's Go Pikachu/Eevee shows the trainer
// ID and the date on the same screen, so it takes two.
export const DEFAULT_PROOF_FIELDS = [
  { id: 'overworld', label: 'Overworld Screenshot', required: true },
  { id: 'tid',       label: 'TID Proof',            required: true },
  { id: 'date',      label: 'Date Proof',           required: true },
];

export const LGPE_PROOF_FIELDS = [
  { id: 'overworld', label: 'Overworld Screenshot', required: true },
  { id: 'tid_date',  label: 'TID/Date Proof',       required: true },
];

// The one place that resolves which fields a game asks for. Games flagged
// `no_image_proof` (Gen 1-3 — no in-game screenshot capability) ask for none,
// which is what the About page's Gen 1-3 disclaimer explains.
export const proofFieldsFor = (gameKeyOrLabel) => {
  // Accepts either. The upload form stores the game LABEL in state (that is what
  // the API persists), while other callers hold the key — matching only on key
  // silently fell through to the default, which is how Let's Go ended up asking
  // for three images.
  const game = ALLOWED_GAMES.find(g => g.key === gameKeyOrLabel || g.label === gameKeyOrLabel);
  if (!game) return DEFAULT_PROOF_FIELDS;
  if (game.no_image_proof) return [];
  return game.proof_fields || DEFAULT_PROOF_FIELDS;
};

export const ALLOWED_GAMES = [
  {
    key: 'firered_leafgreen',
    label: 'Pokémon FireRed / LeafGreen',
    img_urls: [`${R2_BASE}/firered.png`,`${R2_BASE}/leafgreen.png`],
    no_image_proof: true,
    manager_order: 75,
  },
  {
    key: 'legends_za',
    label: 'Pokémon Legends: Z-A',
    img_urls: [`${R2_BASE}/legends_za.png`],
    shiny_label: 'Overworld Screenshot',
    restricted_checklist: [
      { id: 'lza_no_shiny_charm',  label: 'Proof I do not have shiny charm' },
      { id: 'lza_no_hyperspace',   label: 'I am not catching this shiny in hyperspace' },
      { id: 'lza_no_afk',          label: 'I was not hunting this Pokémon AFK' },
    ],
    manager_order: 220,
  },
  {
    key: 'scarlet_violet',
    label: 'Pokémon Scarlet / Violet',
    img_urls: [`${R2_BASE}/scarlet.png`, `${R2_BASE}/violet.png`],
    restricted_checklist: [
      { id: 'sv_no_shiny_charm', label: 'Proof I do not have shiny charm' },
      { id: 'sv_no_sandwich',    label: 'Proof that I was not using a sparkling power sandwich' },
      { id: 'sv_no_outbreak',    label: 'Proof that I am not using an outbreak' },
    ],
    manager_order: 210,
  },
  {
    key: 'legends_arceus',
    label: 'Pokémon Legends: Arceus',
    img_urls: [`${R2_BASE}/legends_arceus.png`],
    manager_order: 200,
  },
  {
    key: 'brilliant_diamond_shining_pearl',
    label: 'Pokémon Brilliant Diamond / Shining Pearl',
    img_urls: [`${R2_BASE}/brilliant_diamond.png`, `${R2_BASE}/shining_pearl.png`],
    manager_order: 190,
  },
  {
    key: 'sword_shield',
    label: 'Pokémon Sword / Shield',
    img_urls: [`${R2_BASE}/sword.png`, `${R2_BASE}/shield.png`],
    manager_order: 180,
  },
  {
    key: 'lets_go_pikachu_eevee',
    label: 'Pokémon Lets Go Pikachu / Eevee',
    img_urls: [`${R2_BASE}/lets_go_pikachu.png`, `${R2_BASE}/lets_go_eevee.png`],
    // TID and date share one screen in LGPE, so two shots cover what three do elsewhere.
    proof_fields: LGPE_PROOF_FIELDS,
    restricted_checklist: [
      { id: 'lgpe_chain_limit', label: 'My shiny charm chain is not above 11' },
    ],
    manager_order: 170,
  },
  {
    key: 'ultra_sun_ultra_moon',
    label: 'Pokémon Ultra Sun / Ultra Moon',
    img_urls: [`${R2_BASE}/ultra_sun.png`, `${R2_BASE}/ultra_moon.png`],
    restricted_checklist: [
      { id: 'usum_no_uwr', label: 'Proof that I was not in ultra warp ride' },
    ],
    manager_order: 160,
  },
  {
    key: 'sun_moon',
    label: 'Pokémon Sun / Moon',
    img_urls: [`${R2_BASE}/sun.png`, `${R2_BASE}/moon.png`],
    manager_order: 150,
  },
  {
    key: 'omega_ruby_alpha_sapphire',
    label: 'Pokémon Omega Ruby / Alpha Sapphire',
    img_urls: [`${R2_BASE}/omega_ruby.png`, `${R2_BASE}/alpha_sapphire.png`],
    restricted_checklist: [
      { id: 'oras_no_fishing', label: 'A shiny that was not caught while fishing' },
    ],
    manager_order: 140,
  },
  {
    key: 'x_y',
    label: 'Pokémon X / Y',
    img_urls: [`${R2_BASE}/x.png`, `${R2_BASE}/y.png`],
    restricted_checklist: [
      { id: 'xy_no_fishing', label: 'A shiny that was not caught while fishing' },
    ],
    manager_order: 130,
  },
  {
    key: 'black2_white2',
    label: 'Pokémon Black 2 / White 2',
    img_urls: [`${R2_BASE}/black2.png`, `${R2_BASE}/white2.png`],
    manager_order: 120,
  },
  {
    key: 'black_white',
    label: 'Pokémon Black / White',
    img_urls: [`${R2_BASE}/black.png`, `${R2_BASE}/white.png`],
    manager_order: 110,
  },
  {
    key: 'heartgold_soulsilver',
    label: 'Pokémon HeartGold / SoulSilver',
    img_urls: [`${R2_BASE}/heartgold.png`, `${R2_BASE}/soulsilver.png`],
    manager_order: 100,
  },
  {
    key: 'platinum',
    label: 'Pokémon Platinum',
    img_urls: [`${R2_BASE}/platinum.png`],
    manager_order: 90,
  },
  {
    key: 'diamond_pearl',
    label: 'Pokémon Diamond / Pearl',
    img_urls: [`${R2_BASE}/diamond.png`, `${R2_BASE}/pearl.png`],
    manager_order: 80,
  },
  {
    key: 'emerald',
    label: 'Pokémon Emerald',
    img_urls: [`${R2_BASE}/emerald.png`],
    no_image_proof: true,
    manager_order: 70,
  },
  {
    key: 'ruby_sapphire',
    label: 'Pokémon Ruby / Sapphire',
    img_urls: [`${R2_BASE}/ruby.png`, `${R2_BASE}/sapphire.png`],
    no_image_proof: true,
    manager_order: 60,
  },
  {
    key: 'crystal',
    label: 'Pokémon Crystal',
    img_urls: [`${R2_BASE}/crystal.png`],
    no_image_proof: true,
    manager_order: 50,
  },
  {
    key: 'gold_silver',
    label: 'Pokémon Gold / Silver',
    img_urls: [`${R2_BASE}/gold.png`, `${R2_BASE}/silver.png`],
    no_image_proof: true,
    manager_order: 40,
  },
  {
    key: 'yellow',
    label: 'Pokémon Yellow',
    img_urls: [`${R2_BASE}/yellow.png`],
    no_image_proof: true,
    manager_order: 30,
  },
  {
    key: 'red_blue',
    label: 'Pokémon Red / Blue',
    img_urls: [`${R2_BASE}/red.png`, `${R2_BASE}/blue.png`],
    no_image_proof: true,
    manager_order: 20,
  },
];

// Sorted view for the Game Manager admin page only. Higher manager_order = newer,
// shown first. Do NOT use this on Upload / BadgeUpload / BoardBuilder / etc. —
// those surfaces intentionally use ALLOWED_GAMES array order.
export const GAMES_BY_MANAGER_ORDER = [...ALLOWED_GAMES].sort(
  (a, b) => (b.manager_order ?? 0) - (a.manager_order ?? 0)
);
