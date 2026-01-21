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
    
    // Get the month's Pokemon pool (the 24 Pokemon for this month)
    const { data, error } = await supabase
      .from('monthly_pokemon_pool')
      .select(`
        position,
        national_dex_id,
        pokemon_master (
          name,
          gif_url,
          sprite_url
        )
      `)
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true });
    
    if (error) throw error;
    
    // Build the 25-square board (24 Pokemon + 1 free space at position 13)
    const board = [];
    let pokemonIndex = 0;
    
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
          pokemon_sprite: null
        });
      } else {
        // Regular Pokemon square
        const pokemon = data[pokemonIndex];
        if (pokemon) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            national_dex_id: pokemon.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.national_dex_id),
            pokemon_name: pokemon.pokemon_master?.name || 'Unknown',
            pokemon_gif: pokemon.pokemon_master?.gif_url,
            pokemon_sprite: pokemon.pokemon_master?.sprite_url
          });
          pokemonIndex++;
        }
      }
    }
    
    res.json({
      month: monthData.month_year,
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
        points,
        bingos_completed,
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
      username: entry.users.username,
      display_name: entry.users.display_name,
      points: entry.points,
      bingos_completed: entry.bingos_completed,
      created_at: entry.users.created_at
    }));
    
    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Export for Vercel serverless
module.exports = app;