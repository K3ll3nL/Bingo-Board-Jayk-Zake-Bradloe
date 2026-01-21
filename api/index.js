const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

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
    
    // Check if user is authenticated (optional)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (user && !authError) {
          userId = user.id;
        }
      } catch (err) {
        // Ignore auth errors - just show public board
        console.log('Auth check failed, showing public board');
      }
    }

    const ACTIVE_MONTH_ID = 1;
    
    // Get month information
    const { data: monthData, error: monthError } = await supabase
      .from('bingo_months')
      .select('month_year_display, start_date, end_date')
      .eq('id', ACTIVE_MONTH_ID)
      .single();
    
    if (monthError) throw monthError;
    
    // Get entries - either for authenticated user or no one (show unchecked board)
    let completedPokemonIds = new Set();
    
    if (userId) {
      const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('national_dex_id')
        .eq('user_id', userId)
        .eq('month_id', ACTIVE_MONTH_ID);
      
      if (!entriesError && entries) {
        completedPokemonIds = new Set(entries.map(entry => entry.national_dex_id));
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
      .select('id, national_dex_id, name, gif_url')
      .in('id', pokemonIds);
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
            national_dex_id: pokemon.pokemon_master.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.pokemon_master.national_dex_id),
            pokemon_name: pokemon.pokemon_master.name || 'Unknown',
            pokemon_gif: pokemon.pokemon_master.gif_url,
          });
        }
      }
    }
    
    res.json({
      month: monthData.month_year_display,
      start_date: monthData.start_date,
      end_date: monthData.end_date,
      board: board,
      user_authenticated: !!userId
    });
  } catch (error) {
    console.error('Error fetching bingo board:', error);
    res.status(500).json({ error: 'Failed to fetch bingo board', details: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_monthly_points')
      .select(`
        id,
        user_id,
        points,
        users!user_monthly_points_user_id_fkey (
          username,
          display_name,
          created_at
        )
      `)
      .order('points', { ascending: false })
      .limit(10);
    
    if (error) throw error;
    
    const transformedData = data.map(entry => ({
      id: entry.id,
      user_id: entry.user_id,
      username: entry.users.username,
      display_name: entry.users.display_name,
      points: entry.points,
      created_at: entry.users.created_at
    }));
    
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
    
    const totalBingos = bingos ? bingos.filter(b => b.bingo_type === 'bingo').length : 0;
    const totalBlackouts = bingos ? bingos.filter(b => b.bingo_type === 'blackout').length : 0;
    
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
    
    console.log('Sending response:', response);
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
      .select('national_dex_id')
      .eq('user_id', userId)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    if (entriesError) throw entriesError;
    
    const completedPokemonIds = new Set(entries.map(entry => entry.national_dex_id));
    
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
      .select('id, national_dex_id, name, gif_url')
      .in('id', pokemonIds);
    
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
    let pokemonIndex = 0;
    
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
        const pokemon = data[pokemonIndex];
        if (pokemon) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            national_dex_id: pokemon.pokemon_master?.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.pokemon_master?.national_dex_id),
            pokemon_name: '',
            pokemon_gif: pokemon.pokemon_master?.gif_url,
          });
          pokemonIndex++;
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

// Export for Vercel serverless
module.exports = app;