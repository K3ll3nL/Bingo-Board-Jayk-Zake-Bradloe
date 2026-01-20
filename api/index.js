// Vercel Serverless Function for Express App
// This handles ALL /api/* routes

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Streaming Bingo API is running' });
});

// Get bingo board for a specific user (view-only for audience)
app.get('/api/bingo/board', async (req, res) => {
  try {
    // Hardcoded user - moderators update via Supabase dashboard
    const DISPLAY_USER_ID = 'c2eb741a-a845-4db4-afa1-2eda30a20d8d';
    const ACTIVE_MONTH_ID = 1;
    
    // Get user's board with Pokemon data
    const { data, error } = await supabase
      .from('user_bingo_boards')
      .select(`
        id,
        position,
        is_checked,
        checked_at,
        national_dex_id,
        pokemon_master (
          name,
          gif_url,
          sprite_url
        )
      `)
      .eq('user_id', DISPLAY_USER_ID)
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true});
    
    if (error) throw error;
    
    // Transform data to include Pokemon info at top level
    const transformedData = data.map(cell => ({
      id: cell.id,
      position: cell.position,
      is_checked: cell.is_checked,
      checked_at: cell.checked_at,
      national_dex_id: cell.national_dex_id,
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

// Toggle cell
app.put('/api/bingo/cell/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current state
    const { data: cell, error: fetchError } = await supabase
      .from('user_bingo_boards')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!cell) {
      return res.status(404).json({ error: 'Cell not found' });
    }
    
    // Toggle the checked state
    const newChecked = !cell.is_checked;
    
    const { data: updatedCell, error: updateError } = await supabase
      .from('user_bingo_boards')
      .update({ is_checked: newChecked })
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) throw updateError;
    
    res.json(updatedCell);
  } catch (error) {
    console.error('Error toggling cell:', error);
    res.status(500).json({ error: 'Failed to toggle cell' });
  }
});

// Reset board
app.post('/api/bingo/reset', async (req, res) => {
  try {
    const { error } = await supabase
      .from('user_bingo_boards')
      .update({ is_checked: false })
      .neq('id', 'none');
    
    if (error) throw error;
    
    const { data: board, error: fetchError } = await supabase
      .from('user_bingo_boards')
      .select('*')
      .order('id', { ascending: true });
    
    if (fetchError) throw fetchError;
    
    res.json({ message: 'Board reset successfully', board });
  } catch (error) {
    console.error('Error resetting board:', error);
    res.status(500).json({ error: 'Failed to reset board' });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_monthly_points')
      .select(`
        *,
        users (
          username,
          display_name
        )
      `)
      .order('points', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Export for Vercel
module.exports = app;