const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Streaming Bingo API is running' });
});

// Get bingo board
app.get('/api/bingo/board', async (req, res) => {
  try {
    const DISPLAY_USER_ID = 'c2eb741a-a845-4db4-afa1-2eda30a20d8d';
    const ACTIVE_MONTH_ID = 1;
    
    // Get all entries for this user/month
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('national_dex_id')
      .eq('user_id', DISPLAY_USER_ID)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    if (entriesError) throw entriesError;
    
    // Create a Set of completed Pokemon IDs for fast lookup
    const completedPokemonIds = new Set(
      entries.map(entry => entry.national_dex_id)
    );
    
    // Get the user's board
    const { data, error } = await supabase
      .from('user_bingo_boards')
      .select(`
        id,
        position,
        national_dex_id,
        pokemon_master (
          name,
          gif_url,
          sprite_url
        )
      `)
      .eq('user_id', DISPLAY_USER_ID)
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true });
    
    if (error) throw error;
    
    // Mark as checked if Pokemon has an entry
    const transformedData = data.map(cell => ({
      id: cell.id,
      position: cell.position,
      national_dex_id: cell.national_dex_id,
      is_checked: cell.national_dex_id ? completedPokemonIds.has(cell.national_dex_id) : false,
      pokemon_name: cell.pokemon_master?.name || 'FREE SPACE',
      pokemon_gif: cell.pokemon_master?.gif_url,
      pokemon_sprite: cell.pokemon_master?.sprite_url
    }));
    
    res.json(transformedData);
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
        users!inner (
          username,
          display_name
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
      bingos_completed: entry.bingos_completed
    }));
    
    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Export for Vercel serverless
module.exports = app;