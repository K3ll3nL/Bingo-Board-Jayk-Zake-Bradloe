require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

// Debug: Check environment variables
console.log('=== Environment Variables Debug ===');
console.log('SUPABASE_URL exists:', !!process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY exists:', !!process.env.SUPABASE_ANON_KEY);
console.log('SUPABASE_URL value:', process.env.SUPABASE_URL?.substring(0, 30) + '...');
console.log('===================================');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Streaming Bingo API is running' });
});

// Get bingo board (public or user-specific)
app.get('/api/bingo/board', async (req, res) => {
  try {
    let userId = null;
    let timeOffsetDays = 0;
    
    // Check if user is authenticated (optional)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
          
          // Get user's time offset if they're a mod
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('time_offset_days')
            .eq('id', userId)
            .single();
          
          if (!userError && userData && userData.time_offset_days) {
            timeOffsetDays = userData.time_offset_days;
          }
        }
      } catch (err) {
        // Ignore auth errors - just show public board
        console.log('Auth check failed, showing public board');
      }
    }

    // Calculate effective date with offset
    const now = new Date();
    const effectiveDate = new Date(now.getTime() + (timeOffsetDays * 24 * 60 * 60 * 1000));
    const effectiveDateISO = effectiveDate.toISOString();
    
    console.log('Time offset days:', timeOffsetDays);
    console.log('Effective date:', effectiveDateISO);
    
    // Get active month based on effective date
    const { data: activeMonthData, error: activeMonthError } = await supabase
      .from('bingo_months')
      .select('id, month_year_display, start_date, end_date')
      .lte('start_date', effectiveDateISO)
      .gte('end_date', effectiveDateISO)
      .single();
    
    if (activeMonthError) {
      console.error('No active month found for date:', effectiveDateISO, activeMonthError);
      return res.status(404).json({ error: 'No active bingo month found' });
    }
    
    const ACTIVE_MONTH_ID = activeMonthData.id;
    const monthData = activeMonthData;
    
    // Get entries - either for authenticated user or no one (show unchecked board)
    let completedPokemonIds = new Set();
    
    if (userId) {
      const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('pokemon_id')
        .eq('user_id', userId)
        .eq('month_id', ACTIVE_MONTH_ID);
      
      if (!entriesError && entries) {
        completedPokemonIds = new Set(entries.map(entry => entry.pokemon_id));
      }
    }
    
    // Get the month's Pokemon pool
    // Using manual join due to Supabase schema cache delay
    const { data: poolData, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('position, pokemon_id')
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true });
    
    if (poolError) throw poolError;
    
    // Get all pokemon details
    const pokemonIds = poolData.map(p => p.pokemon_id).filter(Boolean);
    
    const { data: pokemonData, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);
    console.log("Pokemon query error:", pokemonError);
    console.log("Pokemon query result:", pokemonData);
    
    if (pokemonError) throw pokemonError;
    
    // Create lookup map
    const pokemonMap = {};
    pokemonData.forEach(p => {
      pokemonMap[p.id] = p;
    });
    
    // Combine data
    const data = poolData.map(pool => ({
      position: pool.position,
      pokemon_id: pool.pokemon_id,
      pokemon_master: pokemonMap[pool.pokemon_id]
    }));
    
    console.log('=== BINGO BOARD DEBUG ===');
    console.log('Pool data count:', poolData.length);
    console.log('Pokemon IDs:', pokemonIds);
    console.log('Pokemon data count:', pokemonData.length);
    console.log('Combined data:', JSON.stringify(data, null, 2));
    console.log('========================');
    
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
          pokemon_name: 'FREE SPACE',
          pokemon_gif: null,
        });
      } else {
        // Find Pokemon for this position
        const pokemon = data.find(p => p.position === position);
        if (pokemon && pokemon.pokemon_master) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon.pokemon_id,
            national_dex_id: pokemon.pokemon_master.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.pokemon_id),
            pokemon_name: pokemon.pokemon_master.name || 'Unknown',
            pokemon_gif: pokemon.pokemon_master.img_url,
          });
        } else {
          // Empty slot - no Pokemon assigned to this position
          board.push({
            id: `empty-${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon.pokemon_id,
            national_dex_id: null,
            is_checked: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }
    
    // Get bingo achievements for this month (for everyone, not just logged-in user)
    let achievements = { row: null, column: null, x: null, blackout: null };
    
    const { data: bingoAchievements, error: achievementsError } = await supabase
      .from('bingo_achievements')
      .select(`
        bingo_type,
        users!bingo_achievements_user_id_fkey (
          display_name
        )
      `)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    if (!achievementsError && bingoAchievements) {
      const rowAchievement = bingoAchievements.find(a => a.bingo_type === 'row');
      const columnAchievement = bingoAchievements.find(a => a.bingo_type === 'column');
      const xAchievement = bingoAchievements.find(a => a.bingo_type === 'x');
      const blackoutAchievement = bingoAchievements.find(a => a.bingo_type === 'blackout');
      
      achievements = {
        row: rowAchievement ? rowAchievement.users.display_name : null,
        column: columnAchievement ? columnAchievement.users.display_name : null,
        x: xAchievement ? xAchievement.users.display_name : null,
        blackout: blackoutAchievement ? blackoutAchievement.users.display_name : null
      };
    }
    
    res.json({
      month: monthData.month_year_display,
      start_date: monthData.start_date,
      end_date: monthData.end_date,
      board: board,
      user_authenticated: !!userId,
      achievements
    });
  } catch (error) {
    console.error('Error fetching bingo board:', error);
    res.status(500).json({ error: 'Failed to fetch bingo board', details: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const ACTIVE_MONTH_ID = 1;
    
    const { data, error } = await supabase
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
      .limit(10);
    
    if (error) throw error;
    
    // Get all bingo achievements for these users
    const userIds = data.map(entry => entry.user_id);
    const { data: achievements, error: achievementsError } = await supabase
      .from('bingo_achievements')
      .select('user_id, bingo_type')
      .eq('month_id', ACTIVE_MONTH_ID)
      .in('user_id', userIds);
    
    // Get hex codes for ambassadors
    const { data: ambassadors, error: ambassadorsError } = await supabase
      .from('twitch_ambassadors')
      .select('id, hex_code')
      .in('id', userIds);
    
    // Create hex code map
    const hexCodeMap = {};
    if (!ambassadorsError && ambassadors) {
      ambassadors.forEach(amb => {
        hexCodeMap[amb.id] = amb.hex_code || '#9147ff';
      });
    }
    
    // Check Twitch live status for users with twitch_url
    const twitchUsers = data.filter(entry => entry.users.twitch_url);
    const liveStatusMap = {};
    
    console.log('Checking live status for', twitchUsers.length, 'users with Twitch URLs');
    
    if (twitchUsers.length > 0) {
      try {
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        
        console.log('Twitch credentials present:', !!TWITCH_CLIENT_ID, !!TWITCH_CLIENT_SECRET);
        
        if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
          // Get Twitch access token
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
          });
          
          const tokenData = await tokenResponse.json();
          const { access_token } = tokenData;
          console.log('Got Twitch token:', !!access_token);
          
          // Extract usernames from URLs
          const usernames = twitchUsers.map(u => u.users.twitch_url.split('/').pop().toLowerCase());
          console.log('Checking usernames:', usernames);
          
          // Get user IDs
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Client-Id': TWITCH_CLIENT_ID
            }
          });
          
          const usersData = await usersResponse.json();
          console.log('Twitch users response:', usersData);
          
          // Check streams
          const twitchIds = usersData.data?.map(u => u.id) || [];
          console.log('Twitch IDs to check:', twitchIds);
          
          if (twitchIds.length > 0) {
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Client-Id': TWITCH_CLIENT_ID
              }
            });
            
            const streamsData = await streamsResponse.json();
            console.log('Streams data:', streamsData);
            
            // Map live status by username
            streamsData.data?.forEach(stream => {
              const user = usersData.data.find(u => u.id === stream.user_id);
              if (user) {
                console.log('User is live:', user.login);
                liveStatusMap[user.login.toLowerCase()] = true;
              }
            });
          }
          
          console.log('Final live status map:', liveStatusMap);
        }
      } catch (err) {
        console.error('Twitch live check error:', err);
      }
    }
    
    // Create achievements map
    const achievementsMap = {};
    if (!achievementsError && achievements) {
      achievements.forEach(a => {
        if (!achievementsMap[a.user_id]) {
          achievementsMap[a.user_id] = { row: false, column: false, x: false, blackout: false };
        }
        achievementsMap[a.user_id][a.bingo_type] = true;
      });
    }
    
    const transformedData = data.map(entry => {
      const username = entry.users.twitch_url ? entry.users.twitch_url.split('/').pop().toLowerCase() : null;
      return {
        id: entry.id,
        user_id: entry.user_id,
        username: entry.users.username,
        display_name: entry.users.display_name,
        points: entry.points,
        created_at: entry.users.created_at,
        twitch_url: entry.users.twitch_url,
        is_live: username ? (liveStatusMap[username] || false) : false,
        achievements: achievementsMap[entry.user_id] || { row: false, column: false, x: false, blackout: false },
        hex_code: hexCodeMap[entry.user_id] || '#9147ff'
      };
    });
    
    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Get user profile stats
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching profile for user:', userId);
    
    // Get user basic info
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('username, display_name, avatar_url, created_at')
      .eq('id', userId)
      .single();
    
    if (userError) {
      console.error('User fetch error:', userError);
      throw userError;
    }
    console.log('User data:', userData);
    
    // Get total shinies (entries count)
    const { count: totalShinies, error: shiniesError } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (shiniesError) {
      console.error('Shinies fetch error:', shiniesError);
      throw shiniesError;
    }
    console.log('Total shinies:', totalShinies);
    
    // Get all monthly points for graphs and totals
    const { data: monthlyPoints, error: monthlyError } = await supabase
      .from('user_monthly_points')
      .select(`
        points,
        month_id,
        bingo_months!inner (
          month_year_display
        )
      `)
      .eq('user_id', userId)
      .order('month_id', { ascending: true });
    
    if (monthlyError) {
      console.error('Monthly points fetch error:', monthlyError);
      throw monthlyError;
    }
    console.log('Monthly points:', monthlyPoints);
    
    // Calculate total points and find best month
    const totalPoints = monthlyPoints.reduce((sum, month) => sum + month.points, 0);
    const bestPointsMonth = monthlyPoints.reduce((best, month) => 
      month.points > (best?.points || 0) ? month : best, null);
    
    // Get overall ranking (position in total points)
    const { data: allUserPoints, error: rankError } = await supabase
      .from('user_monthly_points')
      .select('user_id, points');
    
    if (rankError) {
      console.error('Rank fetch error:', rankError);
      throw rankError;
    }
    
    // Calculate total points per user and rank
    const userTotals = {};
    allUserPoints.forEach(entry => {
      userTotals[entry.user_id] = (userTotals[entry.user_id] || 0) + entry.points;
    });
    
    const sortedUsers = Object.entries(userTotals)
      .sort(([, a], [, b]) => b - a);
    
    const overallRank = sortedUsers.findIndex(([id]) => id === userId) + 1;
    
    // Get best ranked month (lowest rank number = best)
    const { data: allMonthlyRankings, error: bestRankError } = await supabase
      .from('user_monthly_points')
      .select('user_id, month_id, points, bingo_months!inner (month_year_display)');
    
    if (bestRankError) {
      console.error('Best rank fetch error:', bestRankError);
      throw bestRankError;
    }
    
    // Calculate rankings per month
    const monthlyRankings = {};
    allMonthlyRankings.forEach(entry => {
      if (!monthlyRankings[entry.month_id]) {
        monthlyRankings[entry.month_id] = [];
      }
      monthlyRankings[entry.month_id].push(entry);
    });
    
    let bestRank = null;
    let bestRankMonth = null;
    
    Object.keys(monthlyRankings).forEach(monthId => {
      const sorted = monthlyRankings[monthId].sort((a, b) => b.points - a.points);
      const userRank = sorted.findIndex(u => u.user_id === userId) + 1;
      
      if (userRank > 0 && (!bestRank || userRank < bestRank)) {
        bestRank = userRank;
        const userEntry = sorted.find(u => u.user_id === userId);
        bestRankMonth = userEntry?.bingo_months?.month_year_display;
      }
    });
    
    // Get bingo achievements
    const { data: bingos, error: bingosError } = await supabase
      .from('bingo_achievements')
      .select('bingo_type')
      .eq('user_id', userId);
    
    if (bingosError) {
      console.error('Bingos fetch error:', bingosError);
      // Don't throw - this table might not exist yet
      console.log('Bingos table may not exist, setting to 0');
    }
    
    const totalBingos = bingos ? bingos.filter(b => (b.bingo_type === 'row'||b.bingo_type === 'column')).length : 0;
    const totalBlackouts = bingos ? bingos.filter(b => b.bingo_type === 'blackout').length : 0;
    
    // Get total Pokemon caught (distinct pokemon_id count from entries)
    const { data: allEntries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id')
      .eq('user_id', userId);
    
    if (entriesError) {
      console.error('Entries fetch error:', entriesError);
    }
    
    console.log('All entries for user:', allEntries);
    const totalCaught = allEntries ? new Set(allEntries.map(e => e.pokemon_id)).size : 0;
    console.log('Total caught:', totalCaught);
    
    // Get total Pokemon count
    const { count: totalPokemon, error: countError } = await supabase
      .from('pokemon_master')
      .select('*', { count: 'exact', head: true })
      .eq('shiny_available', true);
    
    if (countError) {
      console.error('Pokemon count error:', countError);
    }
    
    console.log('Total Pokemon:', totalPokemon);
    console.log('Total Caught value:', totalCaught);
    
    // Format monthly data for graphs
    const monthlyData = monthlyPoints.map(month => ({
      month: month.bingo_months.month_year_display,
      points: month.points
    }));
    
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
        totalBlackouts
      },
      monthlyData
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
    const ACTIVE_MONTH_ID = 1;
    
    // Get month information
    const { data: monthData, error: monthError } = await supabase
      .from('bingo_months')
      .select('month_year, month_year_display')
      .eq('id', ACTIVE_MONTH_ID)
      .single();
    
    if (monthError) throw monthError;
    
    // Get user's entries for this month
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id')
      .eq('user_id', userId)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    if (entriesError) throw entriesError;
    
    const completedPokemonIds = new Set(entries.map(entry => entry.pokemon_id));
    
    // Get the month's Pokemon pool
    // Using manual join due to Supabase schema cache delay
    const { data: poolData, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('position, pokemon_id')
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true });
    
    if (poolError) throw poolError;
    
    // Get all pokemon details
    const pokemonIds = poolData.map(p => p.pokemon_id).filter(Boolean);
    
    const { data: pokemonData, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);
    
    if (pokemonError) throw pokemonError;
    
    // Create lookup map
    const pokemonMap = {};
    pokemonData.forEach(p => {
      pokemonMap[p.id] = p;
    });
    
    // Combine data
    const data = poolData.map(pool => ({
      position: pool.position,
      pokemon_id: pool.pokemon_id,
      pokemon_master: pokemonMap[pool.pokemon_id]
    }));
    
    // Build the 25-square board
    const board = [];
    
    for (let position = 1; position <= 25; position++) {
      if (position === 13) {
        board.push({
          id: `free-space-${ACTIVE_MONTH_ID}`,
          position: 13,
          national_dex_id: null,
          is_checked: true,
          pokemon_name: 'FREE SPACE',
          pokemon_gif: null,
        });
      } else {
        // Find Pokemon for this position
        const pokemon = data.find(p => p.position === position);
        if (pokemon && pokemon.pokemon_master) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon.pokemon_id,
            national_dex_id: pokemon.pokemon_master.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.pokemon_id),
            pokemon_name: pokemon.pokemon_master.name || 'Unknown',
            pokemon_gif: pokemon.pokemon_master.img_url,
          });
        } else {
          // Empty slot - no Pokemon assigned to this position
          board.push({
            id: `empty-${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon.pokemon_id,
            national_dex_id: null,
            is_checked: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }
    
    res.json({
      month: monthData.month_year_display,
      board: board
    });
  } catch (error) {
    console.error('Error fetching profile board:', error);
    res.status(500).json({ error: 'Failed to fetch profile board', details: error.message });
  }
});

// Get user's Pokedex (all pokemon with caught status)
app.get('/api/pokedex', async (req, res) => {
  try {
    let userId = null;
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
        }
      } catch (err) {
        console.log('Auth check failed');
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all pokemon
    const { data: allPokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, display_name, img_url')
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
    
    // Get all Pokemon that have ever been in any monthly pool
    const { data: poolPokemon, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id');
    
    if (poolError) throw poolError;
    
    // Create set of caught pokemon_ids
    const caughtIds = new Set(entries.map(e => e.pokemon_id));
    
    // Create set of pokemon_ids that have been in pools
    const poolIds = new Set(poolPokemon.map(p => p.pokemon_id));
    
    // Mark pokemon as caught or not, and if they've been in a pool
    const pokemon = allPokemon.map(p => ({
      id: p.id,
      national_dex_id: p.national_dex_id,
      name: p.name,
      display_name: p.display_name,
      img_url: p.img_url,
      caught: caughtIds.has(p.id),  // Check by pokemon_master.id
      in_pool: poolIds.has(p.id)     // Check if ever in monthly pool
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

// Get Twitch ambassadors with live status
app.get('/api/ambassadors', async (req, res) => {
  try {
    // Get ambassadors from database
    const { data: ambassadors, error } = await supabase
      .from('twitch_ambassadors')
      .select(`
        id,
        twitch_url,
        hex_code,
        users!twitch_ambassadors_id_fkey (
          display_name
        )
      `);
    
    if (error) throw error;
    
    if (!ambassadors || ambassadors.length === 0) {
      return res.json([]);
    }
    
    // Extract Twitch usernames from URLs
    const twitchData = ambassadors.map(amb => {
      const username = amb.twitch_url.split('/').pop().toLowerCase();
      return {
        id: amb.id,
        username,
        display_name: amb.users?.display_name || username,
        twitch_url: amb.twitch_url,
        hex_code: amb.hex_code || '#9147ff' // Default to Twitch purple
      };
    });
    
    // Get Twitch OAuth token (you'll need to set these env vars)
    const twitchClientId = process.env.TWITCH_CLIENT_ID;
    const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    
    if (!twitchClientId || !twitchClientSecret) {
      console.warn('Twitch API credentials not configured');
      // Return basic data without live status
      return res.json(twitchData.map(amb => ({
        ...amb,
        profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: false,
        brand_color: amb.hex_code
      })));
    }
    
    try {
      // Get Twitch OAuth token
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`
      });
      
      const { access_token } = await tokenResponse.json();
      
      const headers = {
        'Client-ID': twitchClientId,
        'Authorization': `Bearer ${access_token}`
      };
      
      // Get user info for all ambassadors
      const usernames = twitchData.map(amb => amb.username);
      const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, { headers });
      const usersData = await usersResponse.json();
      
      // Get streams for all users
      const userIds = usersData.data.map(u => u.id);
      const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${userIds.map(id => `user_id=${id}`).join('&')}`, { headers });
      const streamsData = await streamsResponse.json();
      
      // Create live status map
      const liveStreams = {};
      streamsData.data?.forEach(stream => {
        liveStreams[stream.user_id] = {
          is_live: true,
          viewer_count: stream.viewer_count
        };
      });
      
      // Create user info map
      const userInfo = {};
      usersData.data?.forEach(user => {
        userInfo[user.login.toLowerCase()] = {
          profile_image_url: user.profile_image_url,
          brand_color: user.broadcaster_type === 'partner' ? '#9147ff' : user.broadcaster_type === 'affiliate' ? '#9147ff' : '#808080'
        };
      });
      
      // Combine all data
      const result = twitchData.map(amb => ({
        ...amb,
        profile_image_url: userInfo[amb.username]?.profile_image_url || `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
          liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.is_live || false : false,
        viewer_count: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
          liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.viewer_count : undefined,
        brand_color: amb.hex_code // Use custom hex code from database
      }));
      
      res.json(result);
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError);
      // Return basic data on Twitch API error
      return res.json(twitchData.map(amb => ({
        ...amb,
        profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: false,
        brand_color: amb.hex_code
      })));
    }
  } catch (error) {
    console.error('Error fetching ambassadors:', error);
    res.status(500).json({ error: 'Failed to fetch ambassadors' });
  }
});

// Get available Pokemon for upload (active months, not yet caught)
app.get('/api/upload/available-pokemon', async (req, res) => {
  try {
    let userId = null;
    let timeOffsetDays = 0;
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
          
          // Get user's time offset if they're a mod
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('time_offset_days')
            .eq('id', userId)
            .single();
          
          if (!userError && userData && userData.time_offset_days) {
            timeOffsetDays = userData.time_offset_days;
          }
        }
      } catch (err) {
        console.log('Auth check failed');
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Calculate effective date with offset
    const now = new Date();
    const effectiveDate = new Date(now.getTime() + (timeOffsetDays * 24 * 60 * 60 * 1000));
    const effectiveDateISO = effectiveDate.toISOString();
    
    // Get active months (effective date between start_date and end_date)
    const { data: activeMonths, error: monthsError } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', effectiveDateISO)
      .gte('end_date', effectiveDateISO);
    
    if (monthsError) throw monthsError;
    
    if (!activeMonths || activeMonths.length === 0) {
      return res.json([]);
    }
    
    const monthIds = activeMonths.map(m => m.id);
    
    // Get Pokemon in active months' pools
    const { data: poolPokemon, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id')
      .in('month_id', monthIds);
    
    if (poolError) throw poolError;
    
    const pokemonIds = [...new Set(poolPokemon.map(p => p.pokemon_id))];
    
    // Get user's already caught Pokemon
    const { data: userEntries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id')
      .eq('user_id', userId)
      .in('month_id', monthIds);
    
    if (entriesError) throw entriesError;
    
    const caughtPokemonIds = new Set(userEntries.map(e => e.pokemon_id));
    
    // Filter out already caught Pokemon
    const availablePokemonIds = pokemonIds.filter(id => !caughtPokemonIds.has(id));
    
    // Get Pokemon details
    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', availablePokemonIds)
      .eq('shiny_available', true);
    
    if (pokemonError) throw pokemonError;
    
    res.json(pokemon || []);
  } catch (error) {
    console.error('Error fetching available Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch available Pokemon' });
  }
});

// Submit catch
app.post('/api/upload/submission', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);
    
    let userId = null;
    
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
        }
      } catch (err) {
        console.log('Auth check failed');
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const pokemon_id = req.body.pokemon_id;
    const url = req.body.url;
    const file = req.files?.file?.[0];
    const file2 = req.files?.file2?.[0];
    
    console.log('Parsed values:', { pokemon_id, url, file: !!file, file2: !!file2 });
    
    if (!pokemon_id) {
      return res.status(400).json({ error: 'Pokemon ID required' });
    }
    
    // Validation: Either URL OR both files
    if (!url && (!file || !file2)) {
      return res.status(400).json({ error: 'Either Twitch link OR both proof images required' });
    }
    
    // Get active month
    const { data: activeMonth, error: monthError } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .single();
    
    if (monthError || !activeMonth) {
      return res.status(400).json({ error: 'No active bingo month' });
    }
    
    let proofUrl = url;
    let proofUrl2 = null;
    
    // If files uploaded, upload both to R2
    if (file && file2) {
      try {
        const R2_BUCKET_URL = process.env.R2_BUCKET_URL;
        const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
        const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
        const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'shiny-sprites';
        
        console.log('R2 Config check:', {
          hasUrl: !!R2_BUCKET_URL,
          hasAccessKey: !!R2_ACCESS_KEY_ID,
          hasSecretKey: !!R2_SECRET_ACCESS_KEY,
          hasAccountId: !!R2_ACCOUNT_ID
        });
        
        if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
          throw new Error('R2 credentials not configured. Please add R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ACCOUNT_ID to Vercel environment variables.');
        }
        
        if (!R2_BUCKET_URL) {
          throw new Error('R2_BUCKET_URL not configured');
        }
        
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
          },
        });
        
        // Upload first file (Proof of Shiny)
        const fileName1 = `approval/${userId}-${pokemon_id}-${Date.now()}-shiny-${file.originalname}`;
        
        console.log('Uploading file 1 to R2:', fileName1);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName1,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));
        
        proofUrl = `${R2_BUCKET_URL}/${fileName1}`;
        console.log('Upload 1 successful:', proofUrl);
        
        // Upload second file (Proof of Date)
        const fileName2 = `approval/${userId}-${pokemon_id}-${Date.now()}-date-${file2.originalname}`;
        
        console.log('Uploading file 2 to R2:', fileName2);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName2,
          Body: file2.buffer,
          ContentType: file2.mimetype,
        }));
        
        proofUrl2 = `${R2_BUCKET_URL}/${fileName2}`;
        console.log('Upload 2 successful:', proofUrl2);
      } catch (r2Error) {
        console.error('R2 upload error:', r2Error);
        return res.status(500).json({ 
          error: 'File upload failed', 
          details: r2Error.message 
        });
      }
    }
    
    // Create approval entry
    const { data: approval, error: approvalError } = await supabase
      .from('approvals')
      .insert({
        user_id: userId,
        pokemon_id: parseInt(pokemon_id),
        month_id: activeMonth.id,
        proof_url: proofUrl,
        proof_url2: proofUrl2
      })
      .select()
      .single();
    
    if (approvalError) throw approvalError;
    
    res.json({ success: true, approval });
  } catch (error) {
    console.error('Error submitting catch:', error);
    res.status(500).json({ error: 'Failed to submit catch', details: error.message });
  }
});

// Get recent catches for a specific Pokemon
app.get('/api/pokemon/:pokemonId/recent-catches', async (req, res) => {
  try {
    const { pokemonId } = req.params;
    
    console.log('Fetching recent catches for Pokemon ID:', pokemonId);
    
    // Get active month
    const { data: activeMonth, error: monthError } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .single();
    
    if (monthError || !activeMonth) {
      console.log('No active month found');
      return res.json([]);
    }
    
    const ACTIVE_MONTH_ID = activeMonth.id;
    
    // Get recent APPROVED entries for this Pokemon (limit 10, most recent first)
    const { data: entries, error } = await supabase
      .from('entries')
      .select(`
        id,
        created_at,
        user_id,
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
    
    // Get user points for this month
    const { data: userPoints, error: pointsError } = await supabase
      .from('user_monthly_points')
      .select('user_id, points')
      .in('user_id', userIds)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    const pointsMap = {};
    if (!pointsError && userPoints) {
      userPoints.forEach(up => {
        pointsMap[up.user_id] = up.points;
      });
    }
    
    // Get user achievements for this month
    const { data: achievements, error: achievementsError } = await supabase
      .from('bingo_achievements')
      .select('user_id, bingo_type')
      .in('user_id', userIds)
      .eq('month_id', ACTIVE_MONTH_ID);
    
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
      achievements: achievementsMap[entry.user_id] || { row: false, column: false, x: false, blackout: false },
      hex_code: hexCodeMap[entry.user_id] || '#9147ff'
    }));
    
    console.log('Returning', formattedEntries.length, 'entries');
    res.json(formattedEntries);
  } catch (error) {
    console.error('Error fetching recent catches:', error);
    res.status(500).json({ error: 'Failed to fetch recent catches', details: error.message });
  }
});

// Export for Vercel serverless
module.exports = app;

// Start server locally (not needed in Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}