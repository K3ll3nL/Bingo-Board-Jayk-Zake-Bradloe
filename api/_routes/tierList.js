/**
 * tierList routes (5).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 *
 * Two independent rankings per user per month: `standard` and `restricted`.
 * Restricted is COMPLETELY OPTIONAL — a user who ranks only Standard is a full
 * participant, and nothing here ever gates, nags, or penalises a missing
 * restricted row. Both modes rank the identical 24 board mons (owner decision
 * Q1 in docs/TIER_LIST_PLAN.md); the restricted pool is NOT subset by
 * pokemon_master.restricted_game_slugs.
 *
 * `sleeper` remains one of the five tiers (owner reversed docs/TIER_LIST_PLAN.md
 * Q4 on 2026-08-02) — there is no separate sleeper flag.
 */
const {
  POKEMON_IMAGE_FIELDS,
  VALID_TIER_CODES,
  TIER_LIST_MODES,
  DEFAULT_TIER_LIST_MODE,
  fetchTierSubmissions,
  getTierListSchema,
  isCompleteTiers,
  getAuthenticatedUserId,
  resolveStatsMonth,
  supabase,
} = require('../_lib/core');

const parseMode = (raw) => {
  const mode = String(raw || DEFAULT_TIER_LIST_MODE);
  return TIER_LIST_MODES.includes(mode) ? mode : null;
};

// Pool ids for a month, plus the display records the client needs for
// PokemonImage. POKEMON_IMAGE_FIELDS is mandatory here — without the
// gender/form columns genderless mons render a broken sprite (CLAUDE.md).
async function loadPool(monthId) {
  const { data: poolRows, error: poolError } = await supabase
    .from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', monthId);
  if (poolError) throw poolError;

  const poolIds = [...new Set((poolRows || []).map(r => r.pokemon_id).filter(Boolean))];
  if (!poolIds.length) return { poolIds, pool: [] };

  const { data, error } = await supabase
    .from('pokemon_master').select(POKEMON_IMAGE_FIELDS).in('id', poolIds);
  if (error) throw error;

  // Stable ordering by national dex number so the pool renders consistently.
  const pool = (data || [])
    .slice()
    .sort((a, b) => (a.national_dex_id || 0) - (b.national_dex_id || 0))
    .map(p => ({
      pokemon_id: p.id,
      // `name` is the human string ("Alolan Rattata"); `display_name` is the
      // sprite slug ("rattata-alolan") despite the name, and is what
      // PokemonImage resolves URLs from. Reading display_name first put the
      // slug on every chip. Do not swap these back.
      name: p.name || p.display_name,
      national_dex_id: p.national_dex_id,
      form_id: p.form_id ?? null,
      genderless: p.genderless,
      has_gender_difference: p.has_gender_difference,
      has_major_gender_difference: p.has_major_gender_difference,
      custom_gender_code: p.custom_gender_code,
      forms_count: p.forms_count,
    }));
  return { poolIds, pool };
}

// Per-mon plurality across every submission in one mode. Deliberately unchanged
// from the pre-mode behaviour (all rows, complete or not, first-wins on ties) —
// unifying this with the stricter definition in stats.js is explicitly deferred.
// The only change is that the rows fed in are now mode-scoped.
const buildConsensus = (poolIds, submissions) => poolIds.map(pokemonId => {
  const distribution = { easy: 0, medium: 0, hard: 0, super_hard: 0, sleeper: 0, unranked: 0 };
  submissions.forEach(sub => {
    const tier = (sub.tiers || {})[pokemonId];
    if (tier && distribution[tier] !== undefined) distribution[tier] += 1;
    else distribution.unranked += 1;
  });
  let majority_tier = null;
  let max = 0;
  VALID_TIER_CODES.forEach(t => { if (distribution[t] > max) { max = distribution[t]; majority_tier = t; } });
  return { pokemon_id: pokemonId, majority_tier, distribution, submission_count: submissions.length };
});

const progressFor = (row, poolIds) => ({
  ranked: row ? Object.keys(row.tiers || {}).filter(k => row.tiers[k]).length : 0,
  pool_size: poolIds.length,
  complete: row ? isCompleteTiers(row.tiers, poolIds) : false,
  started: Boolean(row),
  updated_at: row?.updated_at || null,
});

module.exports = function register(app) {

  // GET /api/tier-list — board pool, community consensus for one mode, and (if
  // authenticated) the viewer's own submission plus per-mode progress.
  app.get('/api/tier-list', async (req, res) => {
    try {
      const mode = parseMode(req.query.mode);
      if (!mode) return res.status(400).json({ error: `mode must be one of ${TIER_LIST_MODES.join(', ')}` });

      const viewerId = await getAuthenticatedUserId(req);
      const monthData = await resolveStatsMonth(req, viewerId, 'id, month_year_display');
      if (!monthData) return res.status(404).json({ error: 'Month not found' });
      const monthId = monthData.id;

      const [{ poolIds, pool }, { rows: allRows, schema }] = await Promise.all([
        loadPool(monthId),
        fetchTierSubmissions(monthId),
      ]);

      const byMode = (m) => allRows.filter(r => r.mode === m);
      const consensus = buildConsensus(poolIds, byMode(mode));

      // Complete lists only — this is the count worth showing next to "the
      // community said", and it is what the browse list is keyed on.
      const submission_counts = {};
      TIER_LIST_MODES.forEach(m => {
        submission_counts[m] = byMode(m).filter(r => isCompleteTiers(r.tiers, poolIds)).length;
      });

      // null (not { submitted: false }) signals "logged out" — distinct from
      // "logged in, not started". Shape preserved for BannerBar's
      // tier_list_incomplete resolver, which reads viewer_submission.tiers.
      let viewer_submission = null;
      let viewer_progress = null;
      if (viewerId) {
        const mine = byMode(mode).find(s => s.user_id === viewerId);
        viewer_submission = {
          submitted: !!mine?.submitted_at,
          tiers: mine?.tiers || {},
          submitted_at: mine?.submitted_at || null,
        };
        viewer_progress = {};
        TIER_LIST_MODES.forEach(m => {
          viewer_progress[m] = progressFor(byMode(m).find(s => s.user_id === viewerId), poolIds);
        });
      }

      res.json({
        month: { id: monthData.id, label: monthData.month_year_display },
        mode,
        // False until 20260802180000_tier_list_mode.sql is applied. The client
        // uses it to explain why Restricted can't be saved yet rather than
        // failing with a bare 500.
        schema_ready: schema.mode,
        pool,
        consensus,
        submission_counts,
        viewer_submission,
        viewer_progress,
      });
    } catch (err) {
      console.error('Error fetching tier list:', err);
      if (err?.transient) return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      res.status(500).json({ error: 'Failed to fetch tier list' });
    }
  });

  // GET /api/tier-list/submissions — who has ranked this month, per mode.
  // Public read: browsing other players' lists needs no auth.
  app.get('/api/tier-list/submissions', async (req, res) => {
    try {
      const mode = parseMode(req.query.mode);
      if (!mode) return res.status(400).json({ error: `mode must be one of ${TIER_LIST_MODES.join(', ')}` });

      const viewerId = await getAuthenticatedUserId(req);
      const monthData = await resolveStatsMonth(req, viewerId, 'id, month_year_display');
      if (!monthData) return res.status(404).json({ error: 'Month not found' });

      const [{ poolIds, pool }, { rows }] = await Promise.all([
        loadPool(monthData.id),
        fetchTierSubmissions(monthData.id, { mode }),
      ]);

      const userIds = [...new Set(rows.map(r => r.user_id))];
      let usersById = {};
      if (userIds.length) {
        const { data: users, error } = await supabase
          .from('users').select('id, display_name, username, avatar_url').in('id', userIds);
        if (error) throw error;
        (users || []).forEach(u => { usersById[u.id] = u; });
      }

      // `?include=tiers` returns every hunter's actual placements alongside the
      // pool, so the Community tab renders all of this month's boards from ONE
      // request. Without it the page would fire a request per hunter, and the
      // roster is the whole point of that tab — there is no meaningful state
      // where you want the names but not the boards.
      // Opt-in because BannerBar and the progress rail only need the counts.
      const withTiers = req.query.include === 'tiers';

      const submissions = rows
        .map(r => ({
          user_id: r.user_id,
          display_name: usersById[r.user_id]?.display_name || usersById[r.user_id]?.username || 'Unknown hunter',
          avatar_url: usersById[r.user_id]?.avatar_url || null,
          ...progressFor(r, poolIds),
          is_viewer: r.user_id === viewerId,
          ...(withTiers ? { tiers: r.tiers || {} } : {}),
        }))
        // Complete lists first, then most recently touched.
        .sort((a, b) => (b.complete - a.complete)
          || (b.ranked - a.ranked)
          || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

      res.json({
        month: { id: monthData.id, label: monthData.month_year_display },
        mode,
        submissions,
        ...(withTiers ? { pool } : {}),
      });
    } catch (err) {
      console.error('Error listing tier list submissions:', err);
      if (err?.transient) return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      res.status(500).json({ error: 'Failed to list tier list submissions' });
    }
  });

  // GET /api/tier-list/user/:userId — one player's list. Public / read-only.
  app.get('/api/tier-list/user/:userId', async (req, res) => {
    try {
      const mode = parseMode(req.query.mode);
      if (!mode) return res.status(400).json({ error: `mode must be one of ${TIER_LIST_MODES.join(', ')}` });

      const viewerId = await getAuthenticatedUserId(req);
      const monthData = await resolveStatsMonth(req, viewerId, 'id, month_year_display');
      if (!monthData) return res.status(404).json({ error: 'Month not found' });

      const [{ poolIds, pool }, { rows }, { data: userRow }] = await Promise.all([
        loadPool(monthData.id),
        fetchTierSubmissions(monthData.id, { mode, userId: req.params.userId }),
        supabase.from('users').select('id, display_name, username, avatar_url').eq('id', req.params.userId).maybeSingle(),
      ]);

      const row = rows[0] || null;
      if (!row) return res.status(404).json({ error: 'No tier list for that player in this mode' });

      res.json({
        month: { id: monthData.id, label: monthData.month_year_display },
        mode,
        user: {
          id: req.params.userId,
          display_name: userRow?.display_name || userRow?.username || 'Unknown hunter',
          avatar_url: userRow?.avatar_url || null,
        },
        pool,
        tiers: row.tiers || {},
        ...progressFor(row, poolIds),
      });
    } catch (err) {
      console.error('Error fetching player tier list:', err);
      if (err?.transient) return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      res.status(500).json({ error: 'Failed to fetch player tier list' });
    }
  });

  // POST /api/tier-list — upsert the authenticated user's submission for one mode.
  app.post('/api/tier-list', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { month_id, tiers } = req.body || {};
      const mode = parseMode(req.body?.mode);
      if (!mode) return res.status(400).json({ error: `mode must be one of ${TIER_LIST_MODES.join(', ')}` });

      const monthId = parseInt(month_id, 10);
      if (Number.isNaN(monthId)) return res.status(400).json({ error: 'month_id is required' });
      if (!tiers || typeof tiers !== 'object' || Array.isArray(tiers)) {
        return res.status(400).json({ error: 'tiers must be an object mapping pokemon_id to tier code' });
      }

      const schema = await getTierListSchema();
      if (mode !== DEFAULT_TIER_LIST_MODE && !schema.mode) {
        // Without the `mode` column a restricted row would collide with the
        // user's standard row on the legacy (user_id, month_id) unique key and
        // silently overwrite it. Refuse loudly instead.
        return res.status(409).json({
          error: 'Restricted tier lists need migration 20260802180000_tier_list_mode.sql applied.',
          migration_pending: true,
        });
      }

      const { data: poolRows, error: poolError } = await supabase
        .from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', monthId);
      if (poolError) throw poolError;
      const poolIdSet = new Set((poolRows || []).map(r => String(r.pokemon_id)));
      if (poolIdSet.size === 0) return res.status(400).json({ error: 'No pokemon pool found for that month' });

      for (const [pokemonId, tier] of Object.entries(tiers)) {
        if (!poolIdSet.has(String(pokemonId))) {
          return res.status(400).json({ error: `Pokemon ${pokemonId} is not in this month's pool` });
        }
        if (!VALID_TIER_CODES.includes(tier)) {
          return res.status(400).json({ error: `Invalid tier code "${tier}" — must be one of ${VALID_TIER_CODES.join(', ')}` });
        }
      }

      const now = new Date().toISOString();
      const payload = { user_id: userId, month_id: monthId, tiers, submitted_at: now, updated_at: now };
      if (schema.mode) payload.mode = mode;

      const { error: upsertError } = await supabase
        .from('tier_list_submissions')
        .upsert(payload, { onConflict: schema.mode ? 'user_id,month_id,mode' : 'user_id,month_id' });
      if (upsertError) throw upsertError;

      const rankedCount = Object.keys(tiers).length;
      res.json({
        success: true,
        mode,
        submitted_at: now,
        ranked_count: rankedCount,
        pool_size: poolIdSet.size,
        complete: rankedCount >= poolIdSet.size && [...poolIdSet].every(id => Boolean(tiers[id])),
      });
    } catch (err) {
      console.error('Error saving tier list:', err);
      res.status(500).json({ error: 'Failed to save tier list' });
    }
  });

};
