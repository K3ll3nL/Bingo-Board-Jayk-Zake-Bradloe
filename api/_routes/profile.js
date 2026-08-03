/**
 * profile routes (4).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  POKEMON_IMAGE_FIELDS,
  getActiveMonth,
  getAuthenticatedUserId,
  refreshAvatarFromProvider,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // Get user profile stats
  app.get('/api/profile/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      console.log('Fetching profile for user:', userId);
      
      // Fetch all independent data in parallel
      const [
        { data: userData, error: userError },
        { count: totalShinies, error: shiniesError },
        { data: monthlyPoints, error: monthlyError },
        { data: allMonthlyPoints, error: rankError },
        { data: allBingos },
        { data: allEntries },
        { data: allPokemonData },
      ] = await Promise.all([
        supabase.from('users').select('username, display_name, avatar_url, created_at, twitch_url, youtube_url, shinydex_url').eq('id', userId).single(),
        supabase.from('entries').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('user_monthly_points').select('points, month_id, bingo_months!inner(month_year_display)').eq('user_id', userId).order('month_id', { ascending: true }),
        supabase.from('user_monthly_points').select('user_id, month_id, points, last_updated, bingo_months!inner(month_year_display)'),
        supabase.from('bingo_achievements').select('bingo_type').eq('user_id', userId),
        supabase.from('entries').select('pokemon_id').eq('user_id', userId),
        supabase.from('pokemon_master').select('id, type1, type2, generation').eq('shiny_available', true),
      ]);

      if (userError) throw userError;
      if (shiniesError) throw shiniesError;
      if (monthlyError) throw monthlyError;
      if (rankError) throw rankError;

      // If avatar_url is missing, try to recover it from the user's Discord identity
      if (userData && !userData.avatar_url) {
        const refreshed = await refreshAvatarFromProvider(userId);
        if (refreshed) userData.avatar_url = refreshed;
      }

      // Calculate total points and find best month
      const totalPoints = (monthlyPoints || []).reduce((sum, month) => sum + month.points, 0);
      const bestPointsMonth = (monthlyPoints || []).reduce((best, month) =>
        month.points > (best?.points || 0) ? month : best, null);

      // Compute overall rank and best monthly rank from the single allMonthlyPoints query
      const userTotals = {};
      const firstUpdatedByUser = {};
      const monthlyRankings = {};
      (allMonthlyPoints || []).forEach(entry => {
        userTotals[entry.user_id] = (userTotals[entry.user_id] || 0) + entry.points;
        if (!firstUpdatedByUser[entry.user_id] || entry.last_updated < firstUpdatedByUser[entry.user_id]) {
          firstUpdatedByUser[entry.user_id] = entry.last_updated;
        }
        if (!monthlyRankings[entry.month_id]) monthlyRankings[entry.month_id] = [];
        monthlyRankings[entry.month_id].push(entry);
      });

      const sortedUsers = Object.entries(userTotals)
        .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1));
      const overallRank = sortedUsers.findIndex(([id]) => id === userId) + 1;

      let bestRank = null;
      let bestRankMonth = null;
      Object.values(monthlyRankings).forEach(entries => {
        const sorted = entries.slice().sort((a, b) => b.points - a.points || (a.last_updated < b.last_updated ? -1 : 1));
        const userRank = sorted.findIndex(u => u.user_id === userId) + 1;
        if (userRank > 0 && (!bestRank || userRank < bestRank)) {
          bestRank = userRank;
          bestRankMonth = sorted.find(u => u.user_id === userId)?.bingo_months?.month_year_display;
        }
      });

      // Count bingo achievements from the single query
      const bingos = allBingos || [];
      const totalRows = bingos.filter(b => b.bingo_type === 'row').length;
      const totalColumns = bingos.filter(b => b.bingo_type === 'column').length;
      const totalBingos = totalRows + totalColumns;
      const totalXs = bingos.filter(b => b.bingo_type === 'x').length;
      const totalBlackouts = bingos.filter(b => b.bingo_type === 'blackout').length;
      const totalPersonalBlackouts = bingos.filter(b => b.bingo_type === 'personal_blackout').length;
      const restrictedRows = bingos.filter(b => b.bingo_type === 'row_restricted').length;
      const restrictedColumns = bingos.filter(b => b.bingo_type === 'column_restricted').length;
      const restrictedBingos = restrictedRows + restrictedColumns;
      const restrictedXs = bingos.filter(b => b.bingo_type === 'x_restricted').length;
      const restrictedBlackouts = bingos.filter(b => b.bingo_type === 'blackout_restricted').length;
      const restrictedPersonalBlackouts = bingos.filter(b => b.bingo_type === 'personal_blackout_restricted').length;

      const totalPokemon = allPokemonData ? allPokemonData.length : 0;
      const totalCaught = allEntries ? new Set(allEntries.map(e => e.pokemon_id)).size : 0;

      // Dex breakdown by type and generation
      const caughtIdSet = new Set(allEntries ? allEntries.map(e => e.pokemon_id) : []);
      const typeTotal = {}, typeCaughtMap = {};
      const genTotal = {}, genCaughtMap = {};
      (allPokemonData || []).forEach(p => {
        const isCaught = caughtIdSet.has(p.id);
        [p.type1, p.type2].filter(Boolean).forEach(t => {
          const type = t.charAt(0).toUpperCase() + t.slice(1);
          typeTotal[type] = (typeTotal[type] || 0) + 1;
          if (isCaught) typeCaughtMap[type] = (typeCaughtMap[type] || 0) + 1;
        });
        if (p.generation != null) {
          genTotal[p.generation] = (genTotal[p.generation] || 0) + 1;
          if (isCaught) genCaughtMap[p.generation] = (genCaughtMap[p.generation] || 0) + 1;
        }
      });
      const dexByType = Object.keys(typeTotal).sort().map(type => ({
        type, total: typeTotal[type], caught: typeCaughtMap[type] || 0
      }));
      const dexByGen = Object.keys(genTotal).map(Number).sort((a, b) => a - b).map(gen => ({
        gen, total: genTotal[gen], caught: genCaughtMap[gen] || 0
      }));

      // Format monthly data for graphs
      const monthlyData = monthlyPoints.map(month => ({
        month: month.bingo_months.month_year_display,
        points: month.points
      }));

      const monthsParticipated = monthlyPoints.length;
      const avgPointsPerMonth = monthsParticipated > 0 ? Math.round(totalPoints / monthsParticipated) : 0;

      // Recent catches — fetch more than needed to deduplicate by pokemon_id,
      // keeping only the most recent entry per unique pokemon.
      const { data: recentEntries } = await supabase
        .from('entries')
        .select('pokemon_id, restricted_submission')
        .eq('user_id', userId)
        .eq('historical', false)
        .order('created_at', { ascending: false })
        .limit(40);

      // Deduplicate: keep first (most recent) occurrence of each pokemon_id
      const seenPokemonIds = new Set();
      const uniqueRecentEntries = [];
      for (const e of (recentEntries || [])) {
        if (!seenPokemonIds.has(e.pokemon_id)) {
          seenPokemonIds.add(e.pokemon_id);
          uniqueRecentEntries.push(e);
          if (uniqueRecentEntries.length === 8) break;
        }
      }

      let recentPokemonData2 = [];
      if (uniqueRecentEntries.length) {
        const recentIds = uniqueRecentEntries.map(e => e.pokemon_id);
        const { data } = await supabase
          .from('pokemon_master')
          .select(POKEMON_IMAGE_FIELDS)
          .in('id', recentIds);
        recentPokemonData2 = data || [];
      }
      const pokemonById = Object.fromEntries(recentPokemonData2.map(p => [p.id, p]));
      const recentCatches = uniqueRecentEntries
        .map(e => ({ ...pokemonById[e.pokemon_id], restricted: e.restricted_submission }))
        .filter(e => e.national_dex_id);

      const response = {
        user: userData,
        stats: {
          totalShinies: totalShinies || 0,
          overallRank,
          totalPoints,
          totalCaught: totalCaught || 0,
          totalPokemon: totalPokemon || 0,
          highestPointMonth: bestPointsMonth ? {
            month: bestPointsMonth.bingo_months.month_year_display,
            points: bestPointsMonth.points
          } : null,
          bestRankedMonth: bestRankMonth ? {
            month: bestRankMonth,
            rank: bestRank
          } : null,
          totalBingos,
          totalRows,
          totalColumns,
          totalXs,
          totalBlackouts,
          totalPersonalBlackouts,
          restrictedBingos,
          restrictedRows,
          restrictedColumns,
          restrictedXs,
          restrictedBlackouts,
          restrictedPersonalBlackouts,
          monthsParticipated,
          avgPointsPerMonth,
          dexByType,
          dexByGen,
        },
        monthlyData,
        recentCatches,
      };
      
      console.log('Sending response with stats:', JSON.stringify(response.stats));
      res.json(response);
    } catch (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
    }
  });

  // Get user's current month board
  app.get('/api/profile/:userId/board', async (req, res) => {
    try {
      const { userId } = req.params;
      const viewerId = await getAuthenticatedUserId(req);

      // getActiveMonth returns the full record — no second bingo_months query needed
      const monthData = await getActiveMonth(viewerId);
      if (!monthData) {
        return res.status(404).json({ error: 'No active month found' });
      }
      const ACTIVE_MONTH_ID = monthData.id;

      // Fetch entries, approvals, and pool in parallel
      const [
        { data: entries, error: entriesError },
        { data: approvals, error: approvalsError },
        { data: poolData, error: poolError },
      ] = await Promise.all([
        supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
        supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId),
        supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
      ]);

      if (entriesError) throw entriesError;
      if (poolError) throw poolError;

      const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
      const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
      const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
      const pendingPokemonIds = new Set(
        (!approvalsError && approvals) ? approvals.map(a => a.pokemon_id) : []
      );
      const pendingRestrictedIds = new Set(
        (!approvalsError && approvals) ? approvals.filter(a => a.restricted_submission).map(a => a.pokemon_id) : []
      );

      // Get all pokemon details
      const pokemonIds = poolData.map(p => p.pokemon_id).filter(Boolean);

      const { data: pokemonData, error: pokemonError } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
        .in('id', pokemonIds)
        .eq('shiny_available', true);

      if (pokemonError) throw pokemonError;

      // Build lookup maps
      const pokemonMap = {};
      (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

      const poolByPosition = {};
      (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

      // Build the 25-square board
      const board = [];
      for (let position = 1; position <= 25; position++) {
        if (position === 13) {
          board.push({
            id: `free-space-${ACTIVE_MONTH_ID}`,
            position: 13,
            national_dex_id: null,
            is_checked: true,
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
              position,
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
              position,
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

      res.json({
        month: monthData.month_year_display,
        board,
      });
    } catch (error) {
      console.error('Error fetching profile board:', error);
      if (error?.transient) {
        return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      }
      res.status(500).json({ error: 'Failed to fetch profile board', details: error.message });
    }
  });

  // Get list of all past months that have a pokemon pool (strictly before the active month)
  app.get('/api/profile/:userId/past-months', async (req, res) => {
    try {
      const activeMonth = await getActiveMonth(null);
      const activeMonthId = activeMonth?.id;

      if (!activeMonthId) return res.json([]);

      // Only months that have at least one pokemon in their pool
      const { data: poolRows, error: poolError } = await supabase
        .from('monthly_pokemon_pool')
        .select('month_id')
        .lt('month_id', activeMonthId);

      if (poolError) throw poolError;

      const monthIds = [...new Set((poolRows || []).map(r => r.month_id))];
      if (monthIds.length === 0) return res.json([]);

      const { data: months, error: monthsError } = await supabase
        .from('bingo_months')
        .select('id, month_year_display')
        .in('id', monthIds)
        .order('id', { ascending: false });

      if (monthsError) throw monthsError;

      res.json(months || []);
    } catch (err) {
      console.error('Error fetching past months:', err);
      res.status(500).json({ error: 'Failed to fetch past months' });
    }
  });

  // Get board state for a specific past month
  app.get('/api/profile/:userId/board/:monthId', async (req, res) => {
    try {
      const { userId, monthId } = req.params;

      const [
        { data: monthData, error: monthError },
        { data: entries, error: entriesError },
        { data: approvals, error: approvalsError },
        { data: poolData, error: poolError },
      ] = await Promise.all([
        supabase.from('bingo_months').select('id, month_year_display').eq('id', monthId).single(),
        supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', monthId),
        supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId).eq('month_id', monthId),
        supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', monthId).order('position', { ascending: true }),
      ]);

      if (monthError || !monthData) return res.status(404).json({ error: 'Month not found' });
      if (entriesError) throw entriesError;
      if (poolError) throw poolError;

      const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
      const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
      const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
      const pendingPokemonIds = new Set(
        (!approvalsError && approvals) ? approvals.map(a => a.pokemon_id) : []
      );
      const pendingRestrictedIds = new Set(
        (!approvalsError && approvals) ? approvals.filter(a => a.restricted_submission).map(a => a.pokemon_id) : []
      );
      const pokemonIds = (poolData || []).map(p => p.pokemon_id).filter(Boolean);

      const { data: pokemonData, error: pokemonError } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
        .in('id', pokemonIds)
        .eq('shiny_available', true);

      if (pokemonError) throw pokemonError;

      const pokemonMap = {};
      (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

      const poolByPosition = {};
      (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

      const board = [];
      for (let position = 1; position <= 25; position++) {
        if (position === 13) {
          board.push({
            id: `free-space-${monthId}`,
            position: 13,
            national_dex_id: null,
            is_checked: true,
            is_pending: false,
            pokemon_name: 'FREE SPACE',
            pokemon_gif: null,
          });
        } else {
          const pool = poolByPosition[position];
          const poke = pool ? pokemonMap[pool.pokemon_id] : null;
          if (poke) {
            board.push({
              id: `${monthId}-${position}`,
              position,
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
              id: `empty-${monthId}-${position}`,
              position,
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

      res.json({ month: monthData.month_year_display, board });
    } catch (err) {
      console.error('Error fetching historical board:', err);
      res.status(500).json({ error: 'Failed to fetch board', details: err.message });
    }
  });

};
