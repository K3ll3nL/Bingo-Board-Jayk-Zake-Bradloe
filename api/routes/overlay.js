/**
 * overlay routes (4).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  broadcastUpdate,
  getActiveMonth,
  pokeR2Url,
  supabase,
  validateApiKey,
} = require('../lib/core');

module.exports = function register(app) {

  // GET /api/overlay/board?key=pb_xxx&mode=live|template
  app.get('/api/overlay/board', async (req, res) => {
    try {
      const userId = await validateApiKey(req.query.key);
      if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

      const mode = req.query.mode === 'template' ? 'template' : 'live';
      const slim = req.query.slim === '1'; // slim=1: only return per-cell state, no pokemon data
      const monthData = await getActiveMonth();
      if (!monthData) return res.status(404).json({ error: 'No active bingo month' });
      const ACTIVE_MONTH_ID = monthData.id;

      // In slim mode we only need entries + approvals — skip pool and pokemon_master entirely
      if (slim && mode === 'live') {
        const [{ data: entries }, { data: approvals }] = await Promise.all([
          supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
          supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId),
        ]);

        const completedSet        = new Set((entries || []).map(e => e.pokemon_id));
        const restrictedSet       = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
        const historicalSet       = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
        const pendingSet          = new Set((approvals || []).map(a => a.pokemon_id));
        const pendingRestrictedSet = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));

        const { data: poolData, error: poolError } = await supabase
          .from('monthly_pokemon_pool')
          .select('position, pokemon_id')
          .eq('month_id', ACTIVE_MONTH_ID);

        if (poolError) throw poolError;

        const states = (poolData || []).map(({ position, pokemon_id }) => ({
          position,
          is_checked:           completedSet.has(pokemon_id),
          is_restricted:        restrictedSet.has(pokemon_id),
          is_historical:        historicalSet.has(pokemon_id),
          is_pending:           !completedSet.has(pokemon_id) && pendingSet.has(pokemon_id),
          is_pending_restricted: completedSet.has(pokemon_id) && !restrictedSet.has(pokemon_id) && pendingRestrictedSet.has(pokemon_id),
        }));

        res.set('Cache-Control', 'no-store');
        return res.json({ states });
      }

      const [
        { data: entries },
        { data: approvals },
        { data: poolData, error: poolError },
      ] = await Promise.all([
        mode === 'live'
          ? supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
          : Promise.resolve({ data: [] }),
        mode === 'live'
          ? supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId)
          : Promise.resolve({ data: [] }),
        supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
      ]);

      if (poolError) throw poolError;

      const completedSet        = new Set((entries || []).map(e => e.pokemon_id));
      const restrictedSet       = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
      const historicalSet       = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
      const pendingSet          = new Set((approvals || []).map(a => a.pokemon_id));
      const pendingRestrictedSet = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));
      const pokemonIds          = (poolData || []).map(p => p.pokemon_id).filter(Boolean);

      const { data: pokemonData } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
        .in('id', pokemonIds);

      const pokemonMap = {};
      (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

      const poolByPosition = {};
      (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

      const board = [];
      for (let pos = 1; pos <= 25; pos++) {
        if (pos === 13) {
          board.push({ position: 13, is_checked: true, is_pending: false, pokemon_name: 'FREE', pokemon_gif: null });
          continue;
        }
        const pool = poolByPosition[pos];
        const poke = pool ? pokemonMap[pool.pokemon_id] : null;
        board.push(poke ? {
          position: pos,
          is_checked:           mode === 'live' && completedSet.has(pool.pokemon_id),
          is_restricted:        mode === 'live' && restrictedSet.has(pool.pokemon_id),
          is_historical:        mode === 'live' && historicalSet.has(pool.pokemon_id),
          is_pending:           mode === 'live' && !completedSet.has(pool.pokemon_id) && pendingSet.has(pool.pokemon_id),
          is_pending_restricted: mode === 'live' && completedSet.has(pool.pokemon_id) && !restrictedSet.has(pool.pokemon_id) && pendingRestrictedSet.has(pool.pokemon_id),
          pokemon_name: poke.name || 'Unknown',
          pokemon: poke,
        } : {
          position: pos,
          is_checked: false,
          is_restricted: false,
          is_historical: false,
          is_pending: false,
          is_pending_restricted: false,
          pokemon_name: 'EMPTY',
          pokemon_gif: null,
        });
      }

      res.set('Cache-Control', 'no-store');
      res.json({ month: monthData.month_year_display, board });
    } catch (err) {
      console.error('Overlay board error:', err);
      res.status(500).json({ error: 'Failed to fetch overlay board' });
    }
  });

  // GET /api/overlay/leaderboard?key=pb_xxx&period=monthly|season|year|alltime&limit=5|10|20|25&pin=1
  app.get('/api/overlay/leaderboard', async (req, res) => {
    try {
      const userId = await validateApiKey(req.query.key);
      if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

      const VALID_PERIODS = ['monthly', 'season', 'year', 'alltime'];
      const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'monthly';
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = [5, 10, 20, 25].includes(rawLimit) ? rawLimit : 10;
      const pin = req.query.pin !== '0'; // append streamer's row if outside top N (opt-out with &pin=0)

      const PERIOD_LABELS = { monthly: 'This Month', season: 'This Season', year: 'This Year', alltime: 'All Time' };

      // Build the full sorted list (no slice yet — needed to find streamer's true rank)
      let fullRanked = []; // [{ user_id, points }], sorted desc

      if (period === 'alltime') {
        const { data: allPoints } = await supabase.from('user_monthly_points').select('user_id, points, last_updated');
        const byUser = {}, firstBy = {};
        (allPoints || []).forEach(row => {
          byUser[row.user_id] = (byUser[row.user_id] || 0) + row.points;
          if (!firstBy[row.user_id] || row.last_updated < firstBy[row.user_id]) firstBy[row.user_id] = row.last_updated;
        });
        fullRanked = Object.entries(byUser)
          .sort(([a, va], [b, vb]) => vb - va || (firstBy[a] < firstBy[b] ? -1 : 1))
          .map(([user_id, points]) => ({ user_id, points }));
      } else {
        const activeMonth = await getActiveMonth();
        if (!activeMonth) return res.json({ label: PERIOD_LABELS[period], rows: [] });

        let fromDate;
        if (period === 'monthly') {
          fromDate = activeMonth.start_date;
        } else if (period === 'season') {
          const m = new Date(activeMonth.start_date);
          fromDate = new Date(m.getFullYear(), Math.floor(m.getMonth() / 3) * 3, 1).toISOString();
        } else {
          fromDate = new Date(new Date(activeMonth.start_date).getFullYear(), 0, 1).toISOString();
        }

        const { data: months } = await supabase
          .from('bingo_months')
          .select('id')
          .gte('start_date', fromDate)
          .lte('start_date', activeMonth.start_date);

        const monthIds = (months || []).map(m => m.id);
        if (monthIds.length === 0) return res.json({ label: PERIOD_LABELS[period], rows: [] });

        const { data: groupPoints } = await supabase
          .from('user_monthly_points')
          .select('user_id, points, last_updated')
          .in('month_id', monthIds);

        const byUser = {}, firstBy = {};
        (groupPoints || []).forEach(row => {
          byUser[row.user_id] = (byUser[row.user_id] || 0) + row.points;
          if (!firstBy[row.user_id] || row.last_updated < firstBy[row.user_id]) firstBy[row.user_id] = row.last_updated;
        });
        fullRanked = Object.entries(byUser)
          .sort(([a, va], [b, vb]) => vb - va || (firstBy[a] < firstBy[b] ? -1 : 1))
          .map(([user_id, points]) => ({ user_id, points }));
      }

      if (fullRanked.length === 0) return res.json({ label: PERIOD_LABELS[period], rows: [] });

      // Find streamer's true rank before slicing
      const streamerIndex = fullRanked.findIndex(u => u.user_id === userId);
      const streamerOutside = pin && streamerIndex >= limit; // true rank is outside top N

      // Slice to limit for the main list
      const topN = fullRanked.slice(0, limit);

      // Collect user IDs to look up — include streamer if pinning them
      const userIds = topN.map(u => u.user_id);
      if (streamerOutside && !userIds.includes(userId)) userIds.push(userId);

      const { data: usersData } = await supabase
        .from('users')
        .select('id, display_name, username')
        .in('id', userIds);

      const usersMap = {};
      (usersData || []).forEach(u => { usersMap[u.id] = u; });

      // Fetch bingo achievements for current month to display in overlay
      const achievementsMap = {};
      try {
        const achMonth = await getActiveMonth();
        if (achMonth && userIds.length > 0) {
          const { data: achData } = await supabase
            .from('bingo_achievements')
            .select('user_id, bingo_type')
            .in('user_id', userIds)
            .eq('month_id', achMonth.id);
          (achData || []).forEach(a => {
            if (!achievementsMap[a.user_id]) achievementsMap[a.user_id] = {};
            achievementsMap[a.user_id][a.bingo_type] = true;
          });
        }
      } catch {}

      const rows = topN.map((u, i) => ({
        rank: i + 1,
        user_id: u.user_id,
        display_name: usersMap[u.user_id]?.display_name || 'Unknown',
        username: usersMap[u.user_id]?.username || '',
        points: u.points,
        pinned: false,
        achievements: achievementsMap[u.user_id] || {},
      }));

      // Append streamer row if they're outside the top N
      if (streamerOutside) {
        const su = fullRanked[streamerIndex];
        rows.push({
          rank: streamerIndex + 1,
          user_id: su.user_id,
          display_name: usersMap[su.user_id]?.display_name || 'Unknown',
          username: usersMap[su.user_id]?.username || '',
          points: su.points,
          pinned: true,
          achievements: achievementsMap[su.user_id] || {},
        });
      }

      res.set('Cache-Control', 'no-store');
      res.json({ label: PERIOD_LABELS[period], rows });
    } catch (err) {
      console.error('Overlay leaderboard error:', err);
      res.status(500).json({ error: 'Failed to fetch overlay leaderboard' });
    }
  });

  // GET /api/overlay/approvals?key=pb_xxx — mod API key required
  // Returns pending approval count and item list for stream overlays.
  app.get('/api/overlay/approvals', async (req, res) => {
    try {
      const userId = await validateApiKey(req.query.key);
      if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

      // Only moderators may use this overlay
      const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
      if (!mod) return res.status(403).json({ error: 'Moderator API key required' });

      const { data: approvals } = await supabase
        .from('approvals')
        .select('id, created_at, pokemon_id, restricted_submission, historical, game, users!approvals_user_id_fkey(display_name), pokemon_master!approvals_pokemon_id_fkey(id, name, national_dex_id, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference)')
        .eq('historical', false)
        .order('created_at', { ascending: true });

      const items = (approvals || []).map(a => ({
        id: a.id,
        pokemon_name: a.pokemon_master?.name || 'Unknown',
        pokemon_img: pokeR2Url(a.pokemon_master?.national_dex_id),
        display_name: a.users?.display_name || 'Unknown',
        restricted: !!a.restricted_submission,
        game: a.game || null,
        created_at: a.created_at,
      }));

      res.json({ count: items.length, items });
    } catch (err) {
      console.error('Error fetching overlay approvals:', err);
      res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
  });

  // POST /api/overlay/test-event?key=pb_xxx — mod API key required
  // Fires a queue-changed broadcast so the approvals overlay can be tested on stream.
  app.post('/api/overlay/test-event', async (req, res) => {
    try {
      const userId = await validateApiKey(req.query.key);
      if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

      const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
      if (!mod) return res.status(403).json({ error: 'Moderator API key required' });

      await broadcastUpdate('approvals-updates', 'queue-changed', {
        test: true,
        item: {
          id: 0,
          pokemon_name: 'Charizard',
          pokemon_img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png',
          display_name: 'TestUser',
          restricted: false,
          game: 'Scarlet/Violet',
        },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Error sending test overlay event:', err);
      res.status(500).json({ error: 'Failed to send test event' });
    }
  });

};
