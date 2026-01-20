const express = require('express');
const router = express.Router();
const { dbAll, dbRun, dbGet } = require('../models/database');

// Get the leaderboard (sorted by points)
router.get('/', async (req, res) => {
  try {
    const leaderboard = await dbAll(
      'SELECT * FROM leaderboard ORDER BY points DESC, username ASC'
    );
    res.json(leaderboard);
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
    
    // Check if user already exists
    const existingUser = await dbGet(
      'SELECT * FROM leaderboard WHERE username = ?',
      [username]
    );
    
    if (existingUser) {
      // Update existing user
      await dbRun(
        'UPDATE leaderboard SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
        [points, username]
      );
    } else {
      // Insert new user
      await dbRun(
        'INSERT INTO leaderboard (username, points) VALUES (?, ?)',
        [username, points]
      );
    }
    
    const user = await dbGet('SELECT * FROM leaderboard WHERE username = ?', [username]);
    res.json(user);
  } catch (error) {
    console.error('Error adding/updating user:', error);
    res.status(500).json({ error: 'Failed to add/update user' });
  }
});

// Update user points
router.put('/user/:id/points', async (req, res) => {
  try {
    const { id } = req.params;
    const { points } = req.body;
    
    if (points === undefined || points === null) {
      return res.status(400).json({ error: 'Points value is required' });
    }
    
    await dbRun(
      'UPDATE leaderboard SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [points, id]
    );
    
    const user = await dbGet('SELECT * FROM leaderboard WHERE id = ?', [id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
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
    
    await dbRun(
      'UPDATE leaderboard SET points = points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [points, id]
    );
    
    const user = await dbGet('SELECT * FROM leaderboard WHERE id = ?', [id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error adding points:', error);
    res.status(500).json({ error: 'Failed to add points' });
  }
});

// Delete a user
router.delete('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dbRun('DELETE FROM leaderboard WHERE id = ?', [id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
