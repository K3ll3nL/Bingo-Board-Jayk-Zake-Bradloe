const express = require('express');
const router = express.Router();
const { dbAll, dbRun, dbGet } = require('../models/database');

// Get the entire bingo board
router.get('/board', async (req, res) => {
  try {
    const board = await dbAll('SELECT * FROM bingo_board ORDER BY id');
    res.json(board);
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
    const cell = await dbGet('SELECT * FROM bingo_board WHERE id = ?', [id]);
    
    if (!cell) {
      return res.status(404).json({ error: 'Cell not found' });
    }
    
    // Toggle the checked state
    const newChecked = cell.checked === 1 ? 0 : 1;
    await dbRun('UPDATE bingo_board SET checked = ? WHERE id = ?', [newChecked, id]);
    
    // Return updated cell
    const updatedCell = await dbGet('SELECT * FROM bingo_board WHERE id = ?', [id]);
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
    
    await dbRun('UPDATE bingo_board SET text = ? WHERE id = ?', [text, id]);
    
    const updatedCell = await dbGet('SELECT * FROM bingo_board WHERE id = ?', [id]);
    res.json(updatedCell);
  } catch (error) {
    console.error('Error updating cell text:', error);
    res.status(500).json({ error: 'Failed to update cell text' });
  }
});

// Reset all cells
router.post('/reset', async (req, res) => {
  try {
    await dbRun('UPDATE bingo_board SET checked = 0');
    const board = await dbAll('SELECT * FROM bingo_board ORDER BY id');
    res.json({ message: 'Board reset successfully', board });
  } catch (error) {
    console.error('Error resetting board:', error);
    res.status(500).json({ error: 'Failed to reset board' });
  }
});

module.exports = router;
