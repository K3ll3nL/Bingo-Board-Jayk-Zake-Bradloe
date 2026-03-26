// ── Badge Registry ────────────────────────────────────────────────────────────
//
// This is the single source of truth for all badge definitions.
// To add a new badge:
//   1. Add an entry to BADGE_REGISTRY below.
//   2. Run `node api/scripts/seedBadges.js` to upsert it into the DB.
//
// Fields:
//   key          — stable unique slug; never change this after seeding
//   check(ctx)   — called ONLY for badges the user hasn't earned yet;
//                  receives pre-built context for the trigger (see contextBuilders)
//
// Trigger types & what they count (via contextBuilders below):
//   'submission' — ctx.totalSubmissions      (all-time pending notifications)
//   'approved'   — ctx.totalApproved         (distinct caught Pokemon)
//                  ctx.restrictedApproved    (entries where restricted_submission = true)
//                  ctx.typeApproved/Total    ({ fire: N, ... } — distinct caught/available per type)
//                  ctx.genApproved/Total     ({ 1: N, ...    } — distinct caught/available per gen)
//                  ctx.collectionProgress    ({ weather_trio: { caught: 2, total: 3 }, ... })
//   'monthly_active' — ctx.activeMonths       (distinct months with at least one approved entry)
//   'rejected'       — ctx.totalRejected      (all-time rejected notifications)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/badges';

// ── Context builders ──────────────────────────────────────────────────────────
// Called ONCE per trigger invocation. The returned object is passed to every
// check() for that trigger — so DB round-trips stay at 1-2 regardless of
// how many badges exist for a given trigger.
const contextBuilders = {
  async submission(userId, supabase) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');
    return { totalSubmissions: count ?? 0 };
  },

  async approved(userId, supabase) {
    // Two queries, shared by every approved-trigger badge — no matter how many exist.
    const [{ data: userEntries }, { data: allPokemon }] = await Promise.all([
      supabase
        .from('entries')
        .select('pokemon_id, restricted_submission, pokemon_master!fk_entries_pokemon(type1, type2, generation, collection_ids)')
        .eq('user_id', userId),
      supabase
        .from('pokemon_master')
        .select('type1, type2, generation, collection_ids')
        .eq('shiny_available', true),
    ]);

    // Deduplicate entries — one record per distinct pokemon_id caught
    const seenIds    = new Set();
    const caughtMeta = []; // pokemon_master data for each unique caught pokemon
    let restrictedApproved = 0;

    for (const entry of (userEntries || [])) {
      if (entry.restricted_submission) restrictedApproved++;
      if (seenIds.has(entry.pokemon_id)) continue;
      seenIds.add(entry.pokemon_id);
      if (entry.pokemon_master) caughtMeta.push(entry.pokemon_master);
    }

    // ── Type ──────────────────────────────────────────────────────────────────
    const typeApproved = {};
    const typeTotal    = {};
    for (const p of caughtMeta) {
      if (p.type1) typeApproved[p.type1] = (typeApproved[p.type1] ?? 0) + 1;
      if (p.type2) typeApproved[p.type2] = (typeApproved[p.type2] ?? 0) + 1;
    }
    for (const p of (allPokemon || [])) {
      if (p.type1) typeTotal[p.type1] = (typeTotal[p.type1] ?? 0) + 1;
      if (p.type2) typeTotal[p.type2] = (typeTotal[p.type2] ?? 0) + 1;
    }

    // ── Generation ────────────────────────────────────────────────────────────
    const genApproved = {};
    const genTotal    = {};
    for (const p of caughtMeta) {
      if (p.generation) genApproved[p.generation] = (genApproved[p.generation] ?? 0) + 1;
    }
    for (const p of (allPokemon || [])) {
      if (p.generation) genTotal[p.generation] = (genTotal[p.generation] ?? 0) + 1;
    }

    // ── Collections ───────────────────────────────────────────────────────────
    const collectionCaught = {};
    const collectionTotal  = {};
    for (const p of caughtMeta) {
      for (const col of (p.collection_ids ?? [])) {
        collectionCaught[col] = (collectionCaught[col] ?? 0) + 1;
      }
    }
    for (const p of (allPokemon || [])) {
      for (const col of (p.collection_ids ?? [])) {
        collectionTotal[col] = (collectionTotal[col] ?? 0) + 1;
      }
    }
    const collectionProgress = {};
    for (const col of Object.keys(collectionTotal)) {
      collectionProgress[col] = { total: collectionTotal[col], caught: collectionCaught[col] ?? 0 };
    }

    return {
      totalApproved: seenIds.size,
      restrictedApproved,
      typeApproved,        // { fire: 3, water: 2, ... }
      typeTotal,           // { fire: 6, water: 4, ... }
      genApproved,         // { 1: 45, 2: 12, ... }
      genTotal,            // { 1: 80, 2: 30, ... }
      collectionProgress,  // { weather_trio: { caught: 2, total: 3 }, ... }
    };
  },

  async monthly_active(userId, supabase) {
    const { count } = await supabase
      .from('user_monthly_points')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    return { activeMonths: count ?? 0 };
  },

  async rejected(userId, supabase) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'rejected');
    return { totalRejected: count ?? 0 };
  },

  // Fired alongside monthly_active. Reads users.created_at and returns
  // accountAgeMonths — full calendar months elapsed since account creation.
  async account_age(userId, supabase) {
    const { data } = await supabase
      .from('users')
      .select('created_at')
      .eq('id', userId)
      .single();
    if (!data?.created_at) return { accountAgeMonths: 0 };
    const created = new Date(data.created_at);
    const now = new Date();
    const months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
    return { accountAgeMonths: Math.max(0, months) };
  },

  // Fired via Supabase webhook on INSERT into bingo_achievements.
  // Restricted variants (row_restricted, etc.) are folded into their base type
  // so check_qualifier uses plain names: 'row', 'column', 'x', 'blackout'.
  async bingo_achievement(userId, supabase) {
    const { data } = await supabase
      .from('bingo_achievements')
      .select('bingo_type')
      .eq('user_id', userId);

    const typeCounts = { row: 0, column: 0, x: 0, blackout: 0 };
    for (const a of (data || [])) {
      const base = a.bingo_type.replace('_restricted', '');
      if (base in typeCounts) typeCounts[base]++;
    }
    return {
      bingoTypeCounts: typeCounts,
      bingoTotalCount: (data || []).length,
    };
  },
};

// ── Badge definitions ─────────────────────────────────────────────────────────
const BADGE_REGISTRY = [

  // ── Submission Veteran ────────────────────────────────────────────────────
  // Earned by making N total submissions (approved, pending, or rejected).
  {
    key: 'sub_veteran_1',
    name: 'First Try',
    description: 'Made your very first submission.',
    image_url: `${BASE_URL}/sub_veteran_1.png`,
    is_secret: false,
    hint: 'Submit a catch to the board for the first time.',
    family: 'submission_veteran',
    family_order: 1,
    trigger: 'submission',
    trigger_count: 1,
    check_type: 'submission_count', check_value: 1, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 1,
  },
  {
    key: 'sub_veteran_2',
    name: 'Warming Up',
    description: 'Made 5 total submissions.',
    image_url: `${BASE_URL}/sub_veteran_2.png`,
    is_secret: false,
    hint: 'Submit 5 catches total.',
    family: 'submission_veteran',
    family_order: 2,
    trigger: 'submission',
    trigger_count: 5,
    check_type: 'submission_count', check_value: 5, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 5,
  },
  {
    key: 'sub_veteran_3',
    name: 'On a Roll',
    description: 'Made 10 total submissions.',
    image_url: `${BASE_URL}/sub_veteran_3.png`,
    is_secret: false,
    hint: 'Submit 10 catches total.',
    family: 'submission_veteran',
    family_order: 3,
    trigger: 'submission',
    trigger_count: 10,
    check_type: 'submission_count', check_value: 10, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 10,
  },
  {
    key: 'sub_veteran_4',
    name: 'Prolific',
    description: 'Made 25 total submissions.',
    image_url: `${BASE_URL}/sub_veteran_4.png`,
    is_secret: false,
    hint: 'Submit 25 catches total.',
    family: 'submission_veteran',
    family_order: 4,
    trigger: 'submission',
    trigger_count: 25,
    check_type: 'submission_count', check_value: 25, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 25,
  },
  {
    key: 'sub_veteran_5',
    name: 'Dedicated Hunter',
    description: 'Made 50 total submissions.',
    image_url: `${BASE_URL}/sub_veteran_5.png`,
    is_secret: false,
    hint: 'Submit 50 catches total.',
    family: 'submission_veteran',
    family_order: 5,
    trigger: 'submission',
    trigger_count: 50,
    check_type: 'submission_count', check_value: 50, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 50,
  },
  {
    key: 'sub_veteran_6',
    name: 'Century Hunter',
    description: 'Made 100 total submissions.',
    image_url: `${BASE_URL}/sub_veteran_6.png`,
    is_secret: false,
    hint: 'Submit 100 catches total.',
    family: 'submission_veteran',
    family_order: 6,
    trigger: 'submission',
    trigger_count: 100,
    check_type: 'submission_count', check_value: 100, check_qualifier: null,
    check: (ctx) => ctx.totalSubmissions >= 100,
  },

  // ── Restricted Veteran ────────────────────────────────────────────────────
  // Earned by having N restricted submissions approved.
  {
    key: 'restricted_veteran_1',
    name: 'Living Dangerously',
    description: 'Had your first restricted submission approved.',
    image_url: `${BASE_URL}/restricted_veteran_1.png`,
    is_secret: false,
    hint: 'Get a restricted catch approved.',
    family: 'restricted_veteran',
    family_order: 1,
    trigger: 'approved',
    trigger_count: 1,
    check_type: 'restricted_count', check_value: 1, check_qualifier: null,
    check: (ctx) => ctx.restrictedApproved >= 1,
  },
  {
    key: 'restricted_veteran_2',
    name: 'Thrill Seeker',
    description: 'Had 3 restricted submissions approved.',
    image_url: `${BASE_URL}/restricted_veteran_2.png`,
    is_secret: false,
    hint: 'Get 3 restricted catches approved.',
    family: 'restricted_veteran',
    family_order: 2,
    trigger: 'approved',
    trigger_count: 3,
    check_type: 'restricted_count', check_value: 3, check_qualifier: null,
    check: (ctx) => ctx.restrictedApproved >= 3,
  },
  {
    key: 'restricted_veteran_3',
    name: 'Rule Bender',
    description: 'Had 5 restricted submissions approved.',
    image_url: `${BASE_URL}/restricted_veteran_3.png`,
    is_secret: false,
    hint: 'Get 5 restricted catches approved.',
    family: 'restricted_veteran',
    family_order: 3,
    trigger: 'approved',
    trigger_count: 5,
    check_type: 'restricted_count', check_value: 5, check_qualifier: null,
    check: (ctx) => ctx.restrictedApproved >= 5,
  },
  {
    key: 'restricted_veteran_4',
    name: 'Chaos Agent',
    description: 'Had 10 restricted submissions approved.',
    image_url: `${BASE_URL}/restricted_veteran_4.png`,
    is_secret: false,
    hint: 'Get 10 restricted catches approved.',
    family: 'restricted_veteran',
    family_order: 4,
    trigger: 'approved',
    trigger_count: 10,
    check_type: 'restricted_count', check_value: 10, check_qualifier: null,
    check: (ctx) => ctx.restrictedApproved >= 10,
  },
  {
    key: 'restricted_veteran_5',
    name: 'The Restricted One',
    description: 'Had 25 restricted submissions approved.',
    image_url: `${BASE_URL}/restricted_veteran_5.png`,
    is_secret: false,
    hint: 'Get 25 restricted catches approved.',
    family: 'restricted_veteran',
    family_order: 5,
    trigger: 'approved',
    trigger_count: 25,
    check_type: 'restricted_count', check_value: 25, check_qualifier: null,
    check: (ctx) => ctx.restrictedApproved >= 25,
  },

  // ── Type Completion ───────────────────────────────────────────────────────
  // One family per type: catch 50% then 100% of all shiny-available Pokemon
  // of that type. Copy this block for each of the 18 types and update:
  //   - key, name, description, image_url, family, hint
  //   - the type string in check() ('normal' → 'fire', 'water', etc.)
  //
  // check() receives:
  //   ctx.typeApproved  — { normal: 3, fire: 1, ... }  distinct caught per type
  //   ctx.typeTotal     — { normal: 8, fire: 5, ... }  total available per type
  //
  // The 18 types: normal, fire, water, electric, grass, ice, fighting, poison,
  //               ground, flying, psychic, bug, rock, ghost, dragon, dark,
  //               steel, fairy

  // ── Normal ────────────────────────────────────────────────────────────────
  {
    key: 'type_normal_50',
    name: 'Basically Normal',
    description: 'Caught 50% of all shiny-available Normal-type Pokémon.',
    image_url: `${BASE_URL}/type_normal_50.png`,
    is_secret: false,
    hint: 'Get half of all Normal-type shinies approved.',
    family: 'type_normal',
    family_order: 1,
    trigger: 'approved',
    trigger_count: 1,
    check_type: 'type_percentage', check_value: 50, check_qualifier: 'normal',
    check: (ctx) => {
      const total = ctx.typeTotal['normal'] ?? 0;
      return total > 0 && (ctx.typeApproved['normal'] ?? 0) / total >= 0.5;
    },
  },
  {
    key: 'type_normal_100',
    name: 'Perfectly Normal',
    description: 'Caught every shiny-available Normal-type Pokémon.',
    image_url: `${BASE_URL}/type_normal_100.png`,
    is_secret: false,
    hint: 'Catch all Normal-type shinies.',
    family: 'type_normal',
    family_order: 2,
    trigger: 'approved',
    trigger_count: 1,
    check_type: 'type_percentage', check_value: 100, check_qualifier: 'normal',
    check: (ctx) => {
      const total = ctx.typeTotal['normal'] ?? 0;
      return total > 0 && (ctx.typeApproved['normal'] ?? 0) >= total;
    },
  },

  // ── Fire — copy from Normal above ─────────────────────────────────────────
  // { key: 'type_fire_50',  ... check: (ctx) => pct('fire', ctx) >= 0.5 },
  // { key: 'type_fire_100', ... check: (ctx) => pct('fire', ctx) >= 1.0 },

  // ── Monthly Activity ──────────────────────────────────────────────────────
  // Earned by participating in N distinct months (rows in user_monthly_points).
  // Triggered via Supabase webhook on INSERT into user_monthly_points —
  // only fires when the user is active in a brand-new month.
  // check() receives:
  //   ctx.activeMonths  — total distinct months the user has submitted in
  {
    key: 'monthly_active_1',
    name: 'First Month',
    description: 'Participated in your first month.',
    image_url: `${BASE_URL}/monthly_active_1.png`,
    is_secret: false,
    hint: 'Submit a catch in any month.',
    family: 'monthly_active',
    family_order: 1,
    trigger: 'monthly_active',
    trigger_count: 1,
    check_type: 'monthly_active_count', check_value: 1, check_qualifier: null,
    check: (ctx) => ctx.activeMonths >= 1,
  },
  {
    key: 'monthly_active_3',
    name: 'Regular',
    description: 'Participated in 3 different months.',
    image_url: `${BASE_URL}/monthly_active_3.png`,
    is_secret: false,
    hint: 'Keep showing up month after month.',
    family: 'monthly_active',
    family_order: 2,
    trigger: 'monthly_active',
    trigger_count: 3,
    check_type: 'monthly_active_count', check_value: 3, check_qualifier: null,
    check: (ctx) => ctx.activeMonths >= 3,
  },
  {
    key: 'monthly_active_6',
    name: 'Dedicated',
    description: 'Participated in 6 different months.',
    image_url: `${BASE_URL}/monthly_active_6.png`,
    is_secret: false,
    hint: 'Half a year of hunting.',
    family: 'monthly_active',
    family_order: 3,
    trigger: 'monthly_active',
    trigger_count: 6,
    check_type: 'monthly_active_count', check_value: 6, check_qualifier: null,
    check: (ctx) => ctx.activeMonths >= 6,
  },
  {
    key: 'monthly_active_12',
    name: 'Veteran',
    description: 'Participated in 12 different months.',
    image_url: `${BASE_URL}/monthly_active_12.png`,
    is_secret: false,
    hint: 'A full year of shiny hunting.',
    family: 'monthly_active',
    family_order: 4,
    trigger: 'monthly_active',
    trigger_count: 12,
    check_type: 'monthly_active_count', check_value: 12, check_qualifier: null,
    check: (ctx) => ctx.activeMonths >= 12,
  },
  {
    key: 'monthly_active_24',
    name: 'Legend',
    description: 'Participated in 24 different months.',
    image_url: `${BASE_URL}/monthly_active_24.png`,
    is_secret: false,
    hint: 'Two years of shiny hunting.',
    family: 'monthly_active',
    family_order: 5,
    trigger: 'monthly_active',
    trigger_count: 24,
    check_type: 'monthly_active_count', check_value: 24, check_qualifier: null,
    check: (ctx) => ctx.activeMonths >= 24,
  },

  // ── Generation Completion ─────────────────────────────────────────────────
  // Earned by catching every shiny-available Pokemon from a given generation.
  // check() receives:
  //   ctx.genApproved  — { 1: 45, 2: 12, ... }  distinct caught per generation
  //   ctx.genTotal     — { 1: 80, 2: 30, ... }  total shiny-available per generation
  {
    key: 'gen_1_complete',
    name: 'Kanto Complete',
    description: 'Caught every shiny-available Generation 1 Pokémon.',
    image_url: `${BASE_URL}/gen_1_complete.png`,
    is_secret: false,
    hint: 'Catch all 151... or however many are shiny-available.',
    family: 'gen_completion',
    family_order: 1,
    trigger: 'approved',
    trigger_count: 1,
    check_type: 'generation_percentage', check_value: 100, check_qualifier: '1',
    check: (ctx) => {
      const total = ctx.genTotal[1] ?? 0;
      return total > 0 && (ctx.genApproved[1] ?? 0) >= total;
    },
  },

  // ── Collections ───────────────────────────────────────────────────────────
  // Earned by catching every member of a named group.
  // Add new groups by tagging pokemon_master rows with collection_ids and
  // adding a badge here — no context builder changes needed.
  //
  // SQL to tag a group:
  //   UPDATE pokemon_master
  //     SET collection_ids = array_append(collection_ids, 'your_collection_slug')
  //     WHERE national_dex_id IN (...);
  //
  // check() receives:
  //   ctx.collectionProgress  — { weather_trio: { caught: 2, total: 3 }, ... }
  {
    key: 'weather_trio',
    name: 'Weather Trio',
    description: 'Caught Kyogre, Groudon, and Rayquaza.',
    image_url: `${BASE_URL}/weather_trio.png`,
    is_secret: false,
    hint: 'Three Pokémon control the world\'s weather — catch them all.',
    family: null,
    family_order: null,
    trigger: 'approved',
    trigger_count: 1,
    check_type: 'collection_complete', check_value: 100, check_qualifier: 'weather_trio',
    check: (ctx) => {
      const prog = ctx.collectionProgress['weather_trio'];
      return prog != null && prog.caught >= prog.total;
    },
  },

];

// Pre-grouped by trigger for O(1) lookup at award time
const REGISTRY_BY_TRIGGER = BADGE_REGISTRY.reduce((acc, badge) => {
  (acc[badge.trigger] ??= []).push(badge);
  return acc;
}, {});

// ── DB-driven check evaluator ─────────────────────────────────────────────────
// Used by awardBadgesForTrigger to evaluate badges created via the admin form
// (which have no hardcoded check() function — only check_type/value/qualifier).
// check_value for percentage types is 0–100 (e.g. 50 = 50%).
function buildCheckFromDB({ check_type, check_value, check_qualifier }) {
  switch (check_type) {
    case 'submission_count':     return (ctx) => ctx.totalSubmissions    >= check_value;
    case 'approved_count':       return (ctx) => ctx.totalApproved       >= check_value;
    case 'rejected_count':       return (ctx) => ctx.totalRejected       >= check_value;
    case 'restricted_count':     return (ctx) => ctx.restrictedApproved  >= check_value;
    case 'monthly_active_count': return (ctx) => ctx.activeMonths        >= check_value;
    case 'type_percentage': {
      const t = String(check_qualifier).toLowerCase();
      return (ctx) => {
        const total = ctx.typeTotal[t] ?? 0;
        return total > 0 && ((ctx.typeApproved[t] ?? 0) / total) * 100 >= check_value;
      };
    }
    case 'generation_percentage': {
      const g = Number(check_qualifier);
      return (ctx) => {
        const total = ctx.genTotal[g] ?? 0;
        return total > 0 && ((ctx.genApproved[g] ?? 0) / total) * 100 >= check_value;
      };
    }
    case 'collection_complete': {
      const col = String(check_qualifier);
      return (ctx) => {
        const prog = ctx.collectionProgress[col];
        return prog != null && prog.total > 0 && prog.caught >= prog.total;
      };
    }
    // ── Bingo achievement count ───────────────────────────────────────────────
    // check_qualifier: 'any' | comma-separated base types e.g. 'row,blackout'
    // Each base type includes its _restricted variant (folded in contextBuilder).
    case 'account_age_months':   return (ctx) => ctx.accountAgeMonths >= check_value;
    case 'bingo_achievement_count': {
      const types = (!check_qualifier || check_qualifier === 'any')
        ? ['row', 'column', 'x', 'blackout']
        : check_qualifier.split(',').map(t => t.trim()).filter(Boolean);
      return (ctx) => {
        const count = types.reduce((sum, t) => sum + (ctx.bingoTypeCounts?.[t] ?? 0), 0);
        return count >= check_value;
      };
    }
    default: return () => false;
  }
}

module.exports = { BADGE_REGISTRY, REGISTRY_BY_TRIGGER, contextBuilders, buildCheckFromDB };
