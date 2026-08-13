/**
 * feedback routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getAuthenticatedUserId,
  isModerator,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  app.post('/api/feedback', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { type, title, description } = req.body;
      if (!['suggestion', 'bug'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!title?.trim() || !description?.trim()) return res.status(400).json({ error: 'Title and description are required' });
      if (title.length > 120) return res.status(400).json({ error: 'Title too long' });
      if (description.length > 2000) return res.status(400).json({ error: 'Description too long' });

      const { error } = await supabase.from('feedback').insert({
        user_id: userId,
        type,
        title: title.trim(),
        description: description.trim(),
      });
      if (error) throw error;

      res.json({ success: true });
    } catch (err) {
      console.error('Error saving feedback:', err);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  app.get('/api/mod/feedback', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { data, error } = await supabase
        .from('feedback')
        .select('id, user_id, type, title, description, status, created_at, users(display_name, username)')
        .order('created_at', { ascending: false });
      if (error) throw error;

      res.json(data || []);
    } catch (err) {
      console.error('Error fetching feedback:', err);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });

  app.patch('/api/mod/feedback/:id/status', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { status } = req.body;
      if (!['open', 'reviewed', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const { error } = await supabase.from('feedback').update({ status }).eq('id', req.params.id);
      if (error) throw error;

      res.json({ success: true });
    } catch (err) {
      console.error('Error updating feedback status:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  });

};
