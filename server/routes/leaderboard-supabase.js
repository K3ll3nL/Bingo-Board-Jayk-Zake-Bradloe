const express = require('express');
const router = express.Router();
const { supabase } = require('../models/supabase');

// Get the leaderboard (sorted by points)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('*')
      .order('points', { ascending: false })
      .order('username', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Add a new user or update existing user
router.post('/user', async (req, res) => {
  try {
    const { username, points = 0 } = req.body;
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    // Upsert user (insert or update if exists)
    const { data, error } = await supabase
      .from('leaderboard')
      .upsert(
        { username, points },
        { onConflict: 'username' }
      )
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding/updating user:', error);
    res.status(500).json({ error: 'Failed to add/update user' });
  }
});

// Update user points by ID
router.put('/user/:id/points', async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;
    
    if (points === undefined || points === null) {
      return res.status(400).json({ error: 'Points value is required' });
    }
    
    const { data, error } = await supabase
      .from('leaderboard')
      .update({ points })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating points:', error);
    res.status(500).json({ error: 'Failed to update points' });
  }
});

// Add points to a user (increment)
router.post('/user/:id/add-points', async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;
    
    if (points === undefined || points === null) {
      return res.status(400).json({ error: 'Points value is required' });
    }
    
    // First get current points
    const { data: currentUser, error: fetchError } = await supabase
      .from('leaderboard')
      .select('points')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update with new total
    const newPoints = currentUser.points + points;
    const { data, error } = await supabase
      .from('leaderboard')
      .update({ points: newPoints })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding points:', error);
    res.status(500).json({ error: 'Failed to add points' });
  }
});

// Delete a user
router.delete('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('leaderboard')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
