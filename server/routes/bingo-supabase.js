const express = require('express');
const router = express.Router();
const { supabase, dbAll, dbGet, dbUpdate } = require('../models/supabase');

// Get the entire bingo board
router.get('/board', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('bingo_board')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching bingo board:', error);
    res.status(500).json({ error: 'Failed to fetch bingo board' });
  }
});

// Toggle a specific cell
router.put('/cell/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current state
    const { data: cell, error: fetchError } = await supabase
      .from('bingo_board')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError) throw fetchError;
    
    if (!cell) {
      return res.status(404).json({ error: 'Cell not found' });
    }
    
    // Toggle the checked state
    const newChecked = cell.checked === 1 ? 0 : 1;
    
    const { data: updatedCell, error: updateError } = await supabase
      .from('bingo_board')
      .update({ checked: newChecked })
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

// Update cell text
router.put('/cell/:id/text', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const { data: updatedCell, error } = await supabase
      .from('bingo_board')
      .update({ text })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json(updatedCell);
  } catch (error) {
    console.error('Error updating cell text:', error);
    res.status(500).json({ error: 'Failed to update cell text' });
  }
});

// Reset all cells
router.post('/reset', async (req, res) => {
  try {
    const { error } = await supabase
      .from('bingo_board')
      .update({ checked: 0 })
      .neq('id', 0); // Update all rows
    
    if (error) throw error;
    
    const { data: board, error: fetchError } = await supabase
      .from('bingo_board')
      .select('*')
      .order('id', { ascending: true });
    
    if (fetchError) throw fetchError;
    
    res.json({ message: 'Board reset successfully', board });
  } catch (error) {
    console.error('Error resetting board:', error);
    res.status(500).json({ error: 'Failed to reset board' });
  }
});

module.exports = router;
