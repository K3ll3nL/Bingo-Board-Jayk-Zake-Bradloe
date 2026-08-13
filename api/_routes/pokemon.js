/**
 * pokemon routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getActiveMonthId,
  getAuthenticatedUserId,
  isModerator,
  nowForMonth,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // Get user's Pokedex (all pokemon with caught status)
  app.get('/api/pokedex', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Get all pokemon
      const { data: allPokemon, error: pokemonError } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference, generation')
        .eq('shiny_available', true)
        .order('national_dex_id', { ascending: true })
        .order('id', { ascending: true });
      
      if (pokemonError) throw pokemonError;
      
      // Get user's caught pokemon (all entries, not just current month)
      const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('pokemon_id')
        .eq('user_id', userId);
      
      if (entriesError) throw entriesError;
      
      // Get months that have already started (exclude future months to avoid spoilers)
      const today = nowForMonth().toISOString().split('T')[0]; // 'YYYY-MM-DD'
      const { data: pastMonths, error: monthsError } = await supabase
        .from('bingo_months')
        .select('id')
        .lte('start_date', today);

      if (monthsError) throw monthsError;

      const pastMonthIds = (pastMonths || []).map(m => m.id);

      // Get all Pokemon that have ever been in a past or current monthly pool
      const { data: poolPokemon, error: poolError } = pastMonthIds.length > 0
        ? await supabase
            .from('monthly_pokemon_pool')
            .select('pokemon_id')
            .in('month_id', pastMonthIds)
        : { data: [], error: null };

      if (poolError) throw poolError;
      
      // Create set of caught pokemon_ids
      const caughtIds = new Set(entries.map(e => e.pokemon_id));

      // Create set of pokemon_ids that have been in pools
      const poolIds = new Set(poolPokemon.map(p => p.pokemon_id));

      // Build current-month pool set so client can route to regular vs historical upload
      const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
      const { data: currentPoolPokemon } = ACTIVE_MONTH_ID
        ? await supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID)
        : { data: [] };
      const currentPoolIds = new Set((currentPoolPokemon || []).map(p => p.pokemon_id));

      // Mark pokemon as caught or not, and if they've been in a pool
      const pokemon = allPokemon.map(p => ({
        id: p.id,
        national_dex_id: p.national_dex_id,
        name: p.name,
        display_name: p.display_name,
        form_id: p.form_id,
        forms_count: p.forms_count,
        custom_gender_code: p.custom_gender_code,
        genderless: p.genderless,
        has_gender_difference: p.has_gender_difference,
        has_major_gender_difference: p.has_major_gender_difference,
        generation: p.generation,
        caught: caughtIds.has(p.id),
        in_pool: poolIds.has(p.id),
        in_current_pool: currentPoolIds.has(p.id),
      }));
      
      const caughtCount = pokemon.filter(p => p.caught).length;
      
      res.json({
        pokemon,
        caughtCount,
        totalCount: pokemon.length
      });
    } catch (error) {
      console.error('Error fetching pokedex:', error);
      res.status(500).json({ error: 'Failed to fetch pokedex', details: error.message });
    }
  });

  // Get recent catches for a specific Pokemon
  app.get('/api/pokemon/:pokemonId/recent-catches', async (req, res) => {
    try {
      const { pokemonId } = req.params;
      const userId = await getAuthenticatedUserId(req);
      const requestedMonthId = req.query.monthId ? parseInt(req.query.monthId) : null;

      const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
      const pointsMonthId = requestedMonthId || ACTIVE_MONTH_ID;
      if (!pointsMonthId) {
        return res.json([]);
      }
      
      // Get recent APPROVED entries for this Pokemon (limit 10, most recent first)
      const { data: entries, error } = await supabase
        .from('entries')
        .select(`
          id,
          created_at,
          user_id,
          restricted_submission,
          game,
          historical,
          users!entries_user_id_fkey (
            display_name,
            avatar_url
          )
        `)
        .eq('pokemon_id', pokemonId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      if (!entries || entries.length === 0) {
        console.log('No entries found, returning empty array');
        return res.json([]);
      }
      
      const userIds = entries.map(e => e.user_id);
      
      // Get user points for the relevant month
      const { data: userPoints, error: pointsError } = await supabase
        .from('user_monthly_points')
        .select('user_id, points')
        .in('user_id', userIds)
        .eq('month_id', pointsMonthId);

      const pointsMap = {};
      if (!pointsError && userPoints) {
        userPoints.forEach(up => {
          pointsMap[up.user_id] = up.points;
        });
      }

      // Get user achievements for the relevant month
      const { data: achievements, error: achievementsError } = await supabase
        .from('bingo_achievements')
        .select('user_id, bingo_type')
        .in('user_id', userIds)
        .eq('month_id', pointsMonthId);
      
      const achievementsMap = {};
      if (!achievementsError && achievements) {
        achievements.forEach(a => {
          if (!achievementsMap[a.user_id]) {
            achievementsMap[a.user_id] = { row: false, column: false, x: false, blackout: false };
          }
          achievementsMap[a.user_id][a.bingo_type] = true;
        });
      }
      
      // Get hex codes for ambassadors
      const { data: ambassadors, error: ambassadorsError } = await supabase
        .from('twitch_ambassadors')
        .select('id, hex_code')
        .in('id', userIds);
      
      const hexCodeMap = {};
      if (!ambassadorsError && ambassadors) {
        ambassadors.forEach(amb => {
          hexCodeMap[amb.id] = amb.hex_code || '#9147ff';
        });
      }
      
      const formattedEntries = entries.map(entry => ({
        id: entry.id,
        caught_at: entry.created_at,
        user_id: entry.user_id,
        display_name: entry.users?.display_name || 'Unknown',
        avatar_url: entry.users?.avatar_url,
        points: pointsMap[entry.user_id] || 0,
        restricted_submission: !!entry.restricted_submission,
        game: entry.game || null,
        historical: !!entry.historical,
      }));
      
      console.log('Returning', formattedEntries.length, 'entries');
      res.json(formattedEntries);
    } catch (error) {
      console.error('Error fetching recent catches:', error);
      res.status(500).json({ error: 'Failed to fetch recent catches', details: error.message });
    }
  });

  // ── Pokémon search (mod use — collection tagger) ──────────────────────────────
  // GET /api/pokemon/search?q=rayquaza
  app.get('/api/pokemon/search', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const q = (req.query.q || '').trim();
      if (!q) return res.json([]);

      const { data, error } = await supabase
        .from('pokemon_master')
        .select('id, name, national_dex_id, collection_ids, game_slugs, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference')
        .ilike('name', `%${q}%`)
        .order('national_dex_id')
        .limit(20);

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

};
