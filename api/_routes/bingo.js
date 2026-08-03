/**
 * bingo routes (1).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getActiveMonth,
  getAuthenticatedUserId,
  supabase,
} = require('../_lib/core');

// Pokemon pool: the 24 pokemon assigned to a month never change mid-month.
// Keyed on month ID — auto-invalidates when a new month becomes active.
let pokemonPoolCache = { monthId: null, poolByPosition: null, pokemonMap: null };

module.exports = function register(app) {

  // Get bingo board (public or user-specific)
  app.get('/api/bingo/board', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);

      const monthData = await getActiveMonth(userId);
      if (!monthData) {
        return res.status(404).json({ error: 'No active bingo month found' });
      }
      const ACTIVE_MONTH_ID = monthData.id;

      // Fetch user-specific and achievement data in parallel (changes every request)
      const [
        { data: entries },
        { data: approvals },
        { data: bingoAchievements }
      ] = await Promise.all([
        userId
          ? supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
          : Promise.resolve({ data: [] }),
        userId
          ? supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId)
          : Promise.resolve({ data: [] }),
        supabase.from('bingo_achievements').select('bingo_type, users!bingo_achievements_user_id_fkey(display_name)').eq('month_id', ACTIVE_MONTH_ID),
      ]);

      const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
      const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
      const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
      const pendingPokemonIds = new Set((approvals || []).map(a => a.pokemon_id));
      const pendingRestrictedIds = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));

      // Use cached pool + pokemon data if still on the same month; otherwise re-fetch
      if (pokemonPoolCache.monthId !== ACTIVE_MONTH_ID) {
        const { data: poolData, error: poolError } = await supabase
          .from('monthly_pokemon_pool')
          .select('position, pokemon_id')
          .eq('month_id', ACTIVE_MONTH_ID)
          .order('position', { ascending: true });

        if (poolError) throw poolError;

        const pokemonIds = (poolData || []).map(p => p.pokemon_id).filter(Boolean);
        const { data: pokemonData, error: pokemonError } = await supabase
          .from('pokemon_master')
          .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
          .in('id', pokemonIds)
          .eq('shiny_available', true);

        if (pokemonError) throw pokemonError;

        const newPokemonMap = {};
        (pokemonData || []).forEach(p => { newPokemonMap[p.id] = p; });
        const newPoolByPosition = {};
        (poolData || []).forEach(pool => { newPoolByPosition[pool.position] = pool; });

        pokemonPoolCache = { monthId: ACTIVE_MONTH_ID, poolByPosition: newPoolByPosition, pokemonMap: newPokemonMap };
      }

      const { poolByPosition, pokemonMap } = pokemonPoolCache;

      // Build the 25-square board (24 Pokemon + 1 free space at position 13)
      const board = [];

      for (let position = 1; position <= 25; position++) {
        if (position === 13) {
          // Free space at position 13
          board.push({
            id: `free-space-${ACTIVE_MONTH_ID}`,
            position: 13,
            national_dex_id: null,
            is_checked: true, // Free space is always checked
            is_pending: false,
            pokemon_name: 'FREE SPACE',
            pokemon_gif: null,
          });
        } else {
          const pool = poolByPosition[position];
          const poke = pool ? pokemonMap[pool.pokemon_id] : null;
          if (poke) {
            board.push({
              id: `${ACTIVE_MONTH_ID}-${position}`,
              position: position,
              pokemon_id: pool.pokemon_id,
              national_dex_id: poke.national_dex_id,
              is_checked: completedPokemonIds.has(pool.pokemon_id),
              is_restricted: restrictedPokemonIds.has(pool.pokemon_id),
              is_historical: historicalPokemonIds.has(pool.pokemon_id),
              is_pending: !completedPokemonIds.has(pool.pokemon_id) && pendingPokemonIds.has(pool.pokemon_id),
              is_pending_restricted: completedPokemonIds.has(pool.pokemon_id) && !restrictedPokemonIds.has(pool.pokemon_id) && pendingRestrictedIds.has(pool.pokemon_id),
              pokemon_name: poke.name || 'Unknown',
              pokemon: poke,
            });
          } else {
            board.push({
              id: `empty-${ACTIVE_MONTH_ID}-${position}`,
              position: position,
              pokemon_id: pool?.pokemon_id ?? null,
              national_dex_id: null,
              is_checked: false,
              is_restricted: false,
              is_historical: false,
              is_pending: false,
              is_pending_restricted: false,
              pokemon_name: 'EMPTY',
              pokemon_gif: null,
            });
          }
        }
      }

      // Build achievements map from the already-fetched bingoAchievements
      let achievements = { row: null, column: null, x: null, blackout: null };
      if (bingoAchievements) {
        const find = type => bingoAchievements.find(a => a.bingo_type === type);
        const name = a => a?.users?.display_name ?? null;
        achievements = {
          row:                name(find('row')),
          column:             name(find('column')),
          x:                  name(find('x')),
          blackout:           name(find('blackout')),
          row_restricted:     name(find('row_restricted')),
          column_restricted:  name(find('column_restricted')),
          x_restricted:       name(find('x_restricted')),
          blackout_restricted: name(find('blackout_restricted')),
        };
      }
      
      const responseData = {
        month: monthData.month_year_display,
        start_date: monthData.start_date,
        end_date: monthData.end_date,
        board: board,
        user_authenticated: !!userId,
        achievements
      };
      
      res.set('Cache-Control', 'no-store');
      res.json(responseData);
    } catch (error) {
      console.error('Error fetching bingo board:', error);
      if (error?.transient) {
        return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      }
      res.status(500).json({ error: 'Failed to fetch bingo board', details: error.message });
    }
  });

};
