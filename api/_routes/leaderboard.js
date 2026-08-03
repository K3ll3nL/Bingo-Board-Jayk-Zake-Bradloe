/**
 * leaderboard routes (2).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  LEADERBOARD_CACHE_TTL,
  enrichWithBadgeSlots,
  getActiveMonth,
  getAuthenticatedUserId,
  getTwitchToken,
  leaderboardCache,
  nowForMonth,
  supabase,
} = require('../lib/core');

module.exports = function register(app) {

  // List available historical leaderboard periods
  app.get('/api/leaderboard/periods', async (req, res) => {
    try {
      const today = nowForMonth().toISOString().split('T')[0];
      const { data: months, error } = await supabase
        .from('bingo_months')
        .select('id, month_year_display, start_date')
        .lte('start_date', today)
        .order('id', { ascending: false });

      if (error) throw error;

      const seenSeasons = new Set();
      const seenYears = new Set();
      const seasons = [];
      const years = [];
      const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Fall'];

      months.forEach(m => {
        const d = new Date(m.start_date + 'T00:00:00Z');
        const mon = d.getUTCMonth() + 1;
        const yr = d.getUTCFullYear();
        const gameYear = mon >= 3 ? yr : yr - 1;
        const q = mon >= 3 && mon <= 5 ? 1 : mon >= 6 && mon <= 8 ? 2 : mon >= 9 && mon <= 11 ? 3 : 0;
        const seasonKey = `${gameYear}-${q}`;
        const yearKey = `${gameYear}`;

        if (!seenSeasons.has(seasonKey)) {
          seenSeasons.add(seasonKey);
          seasons.push({ key: seasonKey, label: `${SEASON_NAMES[q]} ${gameYear}`, anchor_month_id: m.id });
        }
        if (!seenYears.has(yearKey)) {
          seenYears.add(yearKey);
          years.push({ key: yearKey, label: `${gameYear}–${String(gameYear + 1).slice(-2)}`, anchor_month_id: m.id });
        }
      });

      res.json({
        months: months
          .filter(m => new Date(m.start_date + 'T00:00:00Z').getUTCMonth() !== 0)
          .map(m => ({ id: m.id, label: m.month_year_display })),
        seasons,
        years,
      });
    } catch (err) {
      console.error('Error fetching leaderboard periods:', err);
      res.status(500).json({ error: 'Failed to fetch periods' });
    }
  });

  // Get leaderboard
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      const VALID_MODES = ['monthly', 'alltime', 'season', 'year'];
      const mode = VALID_MODES.includes(req.query.mode) ? req.query.mode : 'monthly';
      const periodMonthId = req.query.period_month_id ? parseInt(req.query.period_month_id) : null;

      // Count entries (Pokémon caught) per user, optionally scoped to a set of months.
      // Supabase JS has no group-by, so tally in JS — same pattern as points aggregation.
      const countEntriesByUser = async (userIds, monthIds /* null = all months */) => {
        if (!userIds || userIds.length === 0) return {};
        let q = supabase.from('entries').select('user_id').in('user_id', userIds);
        if (monthIds) q = q.in('month_id', monthIds);
        const { data } = await q;
        const counts = {};
        (data || []).forEach(r => { counts[r.user_id] = (counts[r.user_id] || 0) + 1; });
        return counts;
      };

      // Pre-fetch the reference month — either a specific historical month or the active one.
      let preloadedMonth = null;
      if (mode !== 'alltime') {
        if (periodMonthId) {
          const { data: historicalMonth } = await supabase
            .from('bingo_months')
            .select('id, start_date, month_year_display')
            .eq('id', periodMonthId)
            .single();
          preloadedMonth = historicalMonth;
        } else {
          preloadedMonth = await getActiveMonth(userId);
        }
      }

      if (mode !== 'alltime' && !preloadedMonth) {
        return res.status(404).json({ error: 'No active month found' });
      }
      const cacheKey = preloadedMonth ? `${mode}:${preloadedMonth.id}` : 'alltime';

      // Return cached leaderboard if still fresh
      const cached = leaderboardCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return res.json(cached.data);
      }

      // ── ALL-TIME BRANCH ──────────────────────────────────────────────────────
      if (mode === 'alltime') {

        // Sum points across all months per user
        const { data: allPoints, error: allPointsError } = await supabase
          .from('user_monthly_points')
          .select('user_id, points, last_updated');

        if (allPointsError) throw allPointsError;

        // Aggregate in JS — track earliest last_updated per user as tiebreaker
        const pointsByUser = {};
        const firstUpdatedByUser = {};
        allPoints.forEach(row => {
          pointsByUser[row.user_id] = (pointsByUser[row.user_id] || 0) + row.points;
          if (!firstUpdatedByUser[row.user_id] || row.last_updated < firstUpdatedByUser[row.user_id]) {
            firstUpdatedByUser[row.user_id] = row.last_updated;
          }
        });

        // Sort: higher points first; ties broken by who reached that score first
        const top10 = Object.entries(pointsByUser)
          .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1))
          .map(([user_id, points]) => ({ user_id, points }));

        if (top10.length === 0) {
          return res.json([]);
        }

        const userIds = top10.map(u => u.user_id);

        // Fetch user info, achievements, and hex codes in parallel
        const [
          { data: usersData, error: usersError },
          { data: allAchievements },
          { data: ambassadors },
          pokemonCounts,
        ] = await Promise.all([
          supabase.from('users').select('id, username, display_name, created_at, twitch_url').in('id', userIds),
          supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds),
          supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds),
          countEntriesByUser(userIds, null),
        ]);

        if (usersError) throw usersError;

        const usersMap = {};
        usersData.forEach(u => { usersMap[u.id] = u; });

        const achievementCounts = {};
        if (allAchievements) {
          allAchievements.forEach(ach => {
            if (!achievementCounts[ach.user_id]) {
              achievementCounts[ach.user_id] = { row: 0, column: 0, x: 0, blackout: 0 };
            }
            achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
          });
        }

        const hexCodeMap = {};
        if (ambassadors) ambassadors.forEach(a => { hexCodeMap[a.id] = a.hex_code || '#9147ff'; });

        // Twitch live status
        const liveStatusMap = {};
        try {
          const twitchUsers = top10.filter(u => usersMap[u.user_id]?.twitch_url);
          const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
          if (access_token) {
            const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
            const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
            const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            }).then(r => r.json());
            const twitchIds = twitchApiUsers?.map(u => u.id) || [];
            if (twitchIds.length > 0) {
              const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
                headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
              }).then(r => r.json());
              streams?.forEach(stream => {
                const u = twitchApiUsers.find(u => u.id === stream.user_id);
                if (u) liveStatusMap[u.login.toLowerCase()] = true;
              });
            }
          }
        } catch (err) {
          console.error('Twitch live check error (alltime):', err);
        }

        const transformedAllTime = top10.map((entry, index) => {
          const u = usersMap[entry.user_id] || {};
          const username = u.twitch_url ? u.twitch_url.split('/').pop().toLowerCase() : null;
          return {
            id: entry.user_id,
            user_id: entry.user_id,
            username: u.username,
            display_name: u.display_name,
            points: entry.points,
            pokemon_count: pokemonCounts[entry.user_id] || 0,
            rank: index + 1,
            created_at: u.created_at,
            twitch_url: index < 10 ? u.twitch_url : null,
            is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
            achievement_counts: achievementCounts[entry.user_id] || { row: 0, column: 0, x: 0, blackout: 0 },
            hex_code: hexCodeMap[entry.user_id] || '#9147ff'
          };
        });

        const enrichedAllTime = await enrichWithBadgeSlots(transformedAllTime);
        leaderboardCache.set(cacheKey, { data: enrichedAllTime, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
        res.set('Cache-Control', 'no-store');
        return res.json(enrichedAllTime);
      }

      // ── SEASON / YEAR BRANCH ─────────────────────────────────────────────────
      if (mode === 'season' || mode === 'year') {

        // preloadedMonth was fetched before the cache check — reuse it here
        const activeMonth = preloadedMonth;
        const ACTIVE_MONTH_ID = activeMonth.id;

        // Compute game year (March → February) and seasonal quarter from start_date
        const ad        = new Date(activeMonth.start_date + 'T00:00:00Z');
        const aMon      = ad.getUTCMonth() + 1; // 1-12
        const aYear     = ad.getUTCFullYear();
        const gameYear  = aMon >= 3 ? aYear : aYear - 1;
        // 0=Winter(Dec/Jan/Feb) 1=Spring(Mar-May) 2=Summer(Jun-Aug) 3=Fall(Sep-Nov)
        const activeQ   = aMon >= 3 && aMon <= 5  ? 1
                        : aMon >= 6 && aMon <= 8  ? 2
                        : aMon >= 9 && aMon <= 11 ? 3
                        : 0;

        // Fetch all months in this game year (Mar {gameYear} – Feb {gameYear+1})
        const { data: yearMonthRows, error: yearMonthsError } = await supabase
          .from('bingo_months')
          .select('id, start_date')
          .gte('start_date', `${gameYear}-03-01`)
          .lt('start_date', `${gameYear + 1}-03-01`);

        if (yearMonthsError) throw yearMonthsError;

        // For 'season' further filter to the same quarter
        const monthIds = (yearMonthRows || []).filter(m => {
          if (mode === 'year') return true;
          const d  = new Date(m.start_date + 'T00:00:00Z');
          const mn = d.getUTCMonth() + 1;
          const q  = mn >= 3 && mn <= 5  ? 1
                   : mn >= 6 && mn <= 8  ? 2
                   : mn >= 9 && mn <= 11 ? 3
                   : 0;
          return q === activeQ;
        }).map(m => m.id);

        // Sum points across those months
        const { data: groupPoints, error: groupPointsError } = await supabase
          .from('user_monthly_points')
          .select('user_id, points, last_updated')
          .in('month_id', monthIds);

        if (groupPointsError) throw groupPointsError;

        // Aggregate — track earliest last_updated per user as tiebreaker (consistent with monthly branch)
        const pointsByUser = {};
        const firstUpdatedByUser = {};
        groupPoints.forEach(row => {
          pointsByUser[row.user_id] = (pointsByUser[row.user_id] || 0) + row.points;
          if (!firstUpdatedByUser[row.user_id] || row.last_updated < firstUpdatedByUser[row.user_id]) {
            firstUpdatedByUser[row.user_id] = row.last_updated;
          }
        });

        // Sort: higher points first; ties broken by who reached that score first
        const sorted = Object.entries(pointsByUser)
          .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1))
          .map(([user_id, points]) => ({ user_id, points }));

        if (sorted.length === 0) {
          return res.json([]);
        }

        const userIds = sorted.map(u => u.user_id);

        // Fetch user info, achievements, and hex codes in parallel
        const [
          { data: usersData, error: usersError },
          { data: groupAchievements },
          { data: ambassadors },
          pokemonCounts,
        ] = await Promise.all([
          supabase.from('users').select('id, username, display_name, created_at, twitch_url').in('id', userIds),
          supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds).in('month_id', monthIds),
          supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds),
          countEntriesByUser(userIds, monthIds),
        ]);

        if (usersError) throw usersError;

        const usersMap = {};
        usersData.forEach(u => { usersMap[u.id] = u; });

        const achievementCounts = {};
        if (groupAchievements) {
          groupAchievements.forEach(ach => {
            if (!achievementCounts[ach.user_id]) achievementCounts[ach.user_id] = {};
            achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
          });
        }

        const hexCodeMap = {};
        if (ambassadors) ambassadors.forEach(a => { hexCodeMap[a.id] = a.hex_code || '#9147ff'; });

        // Twitch live status
        const liveStatusMap = {};
        try {
          const twitchUsers = sorted.filter(u => usersMap[u.user_id]?.twitch_url);
          const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
          if (access_token) {
            const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
            const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
            const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            }).then(r => r.json());
            const twitchIds = twitchApiUsers?.map(u => u.id) || [];
            if (twitchIds.length > 0) {
              const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
                headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
              }).then(r => r.json());
              streams?.forEach(stream => {
                const u = twitchApiUsers.find(u => u.id === stream.user_id);
                if (u) liveStatusMap[u.login.toLowerCase()] = true;
              });
            }
          }
        } catch (err) {
          console.error(`Twitch live check error (${mode}):`, err);
        }

        const result = sorted.map((entry, index) => {
          const u = usersMap[entry.user_id] || {};
          const username = u.twitch_url ? u.twitch_url.split('/').pop().toLowerCase() : null;
          return {
            id: entry.user_id,
            user_id: entry.user_id,
            username: u.username,
            display_name: u.display_name,
            points: entry.points,
            pokemon_count: pokemonCounts[entry.user_id] || 0,
            rank: index + 1,
            created_at: u.created_at,
            twitch_url: index < 10 ? u.twitch_url : null,
            is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
            achievement_counts: achievementCounts[entry.user_id] || {},
            hex_code: hexCodeMap[entry.user_id] || '#9147ff'
          };
        });

        const enrichedResult = await enrichWithBadgeSlots(result);
        leaderboardCache.set(cacheKey, { data: enrichedResult, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
        res.set('Cache-Control', 'no-store');
        return res.json(enrichedResult);
      }

      // ── MONTHLY BRANCH ───────────────────────────────────────────────────────
      // preloadedMonth was fetched before the cache check — reuse it here
      const ACTIVE_MONTH_ID = preloadedMonth.id;


      // Get monthly leaderboard
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('user_monthly_points')
        .select(`
          id,
          user_id,
          points,
          users!user_monthly_points_user_id_fkey (
            username,
            display_name,
            created_at,
            twitch_url
          )
        `)
        .eq('month_id', ACTIVE_MONTH_ID)
        .order('points', { ascending: false })
        .order('last_updated', { ascending: true }); // tiebreaker: reached score first
      
      if (monthlyError) throw monthlyError;
      const data = monthlyData;

      const userIds = data.map(entry => entry.user_id);

      // Fetch achievements and hex codes in parallel
      const [
        { data: achievements },
        { data: ambassadors },
        pokemonCounts,
      ] = await Promise.all([
        userIds.length > 0
          ? supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds).eq('month_id', ACTIVE_MONTH_ID)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds)
          : Promise.resolve({ data: [] }),
        countEntriesByUser(userIds, [ACTIVE_MONTH_ID]),
      ]);

      const achievementCounts = {};
      if (achievements) {
        achievements.forEach(ach => {
          if (!achievementCounts[ach.user_id]) {
            achievementCounts[ach.user_id] = { row: 0, column: 0, x: 0, blackout: 0 };
          }
          achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
        });
      }

      const dataWithAchievements = data.map(entry => ({
        ...entry,
        achievement_counts: achievementCounts[entry.user_id] || { row: 0, column: 0, x: 0, blackout: 0 }
      }));

      const hexCodeMap = {};
      if (ambassadors) {
        ambassadors.forEach(amb => { hexCodeMap[amb.id] = amb.hex_code || '#9147ff'; });
      }
      
      // Check Twitch live status
      const twitchUsers = dataWithAchievements.filter(entry => entry.users.twitch_url);
      const liveStatusMap = {};
      try {
        const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
        if (access_token) {
          const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
          const usernames = twitchUsers.map(u => u.users.twitch_url.split('/').pop().toLowerCase());
          const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          }).then(r => r.json());
          const twitchIds = twitchApiUsers?.map(u => u.id) || [];
          if (twitchIds.length > 0) {
            const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            }).then(r => r.json());
            streams?.forEach(stream => {
              const user = twitchApiUsers.find(u => u.id === stream.user_id);
              if (user) liveStatusMap[user.login.toLowerCase()] = true;
            });
          }
        }
      } catch (err) {
        console.error('Twitch live check error (monthly):', err);
      }
      
      const transformedData = dataWithAchievements.map((entry, index) => {
        const username = entry.users.twitch_url ? entry.users.twitch_url.split('/').pop().toLowerCase() : null;
        return {
          id: entry.id,
          user_id: entry.user_id,
          username: entry.users.username,
          display_name: entry.users.display_name,
          points: entry.points,
          pokemon_count: pokemonCounts[entry.user_id] || 0,
          rank: index + 1,
          created_at: entry.users.created_at,
          twitch_url: index < 10 ? entry.users.twitch_url : null,
          is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
          achievement_counts: entry.achievement_counts || { row: 0, column: 0, x: 0, blackout: 0 },
          hex_code: hexCodeMap[entry.user_id] || '#9147ff'
        };
      });

      const enrichedData = await enrichWithBadgeSlots(transformedData);
      leaderboardCache.set(cacheKey, { data: enrichedData, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
      res.set('Cache-Control', 'no-store');
      res.json(enrichedData);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      if (error?.transient) {
        return res.status(503).json({ error: 'Database temporarily unavailable', transient: true });
      }
      res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
    }
  });

};
