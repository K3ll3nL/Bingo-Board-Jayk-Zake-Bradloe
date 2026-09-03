/**
 * banners routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getAuthenticatedUserId,
  isModerator,
  supabase,
} = require('../_lib/core');

// Visibility rules a banner row can declare. NULL/absent = always show inside
// the starts_at/expires_at window (the original behavior). The rule itself is
// evaluated client-side in BannerBar.jsx, because it depends on the viewer.
// Adding a rule = one entry here + one branch in BannerBar; no migration.
const BANNER_CONDITIONS = ['tier_list_incomplete'];

module.exports = function register(app) {

  app.get('/api/banners', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .lte('starts_at', now)
        .gt('expires_at', now)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      // Public + user-invariant (per-user `condition` is resolved client-side in
      // BannerBar), so the edge can share one response across all viewers. Set
      // only on success — errors stay uncached.
      res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch banners' });
    }
  });

  app.post('/api/banners', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });
      const { message, link_url, link_label, image_url, starts_at, expires_at, condition } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
      if (!starts_at) return res.status(400).json({ error: 'starts_at is required' });
      if (!expires_at) return res.status(400).json({ error: 'expires_at is required' });
      if (condition && !BANNER_CONDITIONS.includes(condition)) {
        return res.status(400).json({ error: `condition must be one of ${BANNER_CONDITIONS.join(', ')}` });
      }
      const { data, error } = await supabase.from('banners').insert({
        message: message.trim(),
        link_url: link_url?.trim() || null,
        link_label: link_label?.trim() || null,
        image_url: image_url?.trim() || null,
        starts_at,
        expires_at,
        condition: condition || null,
      }).select().single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create banner' });
    }
  });

  app.delete('/api/banners/:id', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });
      const { error } = await supabase.from('banners').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete banner' });
    }
  });

};
