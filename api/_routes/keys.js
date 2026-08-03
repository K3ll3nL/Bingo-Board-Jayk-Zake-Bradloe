/**
 * keys routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  apiKeyCache,
  crypto,
  getAuthenticatedUserId,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // GET /api/keys — return the user's single overlay key (including value, for URL building)
  app.get('/api/keys', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { data: pro } = await supabase.from('site_pro').select('user_id').eq('user_id', userId).maybeSingle();
      if (!pro) return res.status(403).json({ error: 'Pro access required' });
      const { data: key } = await supabase
        .from('api_keys')
        .select('id, key_value, created_at, last_used_at')
        .eq('user_id', userId)
        .maybeSingle();
      res.json(key || null); // null = no key yet
    } catch (err) {
      console.error('Get key error:', err);
      res.status(500).json({ error: 'Failed to load key' });
    }
  });

  // POST /api/keys — generate (or regenerate) the user's single overlay key
  app.post('/api/keys', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { data: pro } = await supabase.from('site_pro').select('user_id').eq('user_id', userId).maybeSingle();
      if (!pro) return res.status(403).json({ error: 'Pro access required' });

      // Remove any existing key first (one key per user) and clear cache
      await supabase.from('api_keys').delete().eq('user_id', userId);
      apiKeyCache.clear();

      // Generate: pb_ + 24 random bytes → 51-char key
      const rawKey = 'pb_' + crypto.randomBytes(24).toString('hex');
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
      const keyPrefix = rawKey.substring(0, 12);

      const { data: newKey, error: insertError } = await supabase
        .from('api_keys')
        .insert({ user_id: userId, key_hash: keyHash, key_prefix: keyPrefix, key_value: rawKey })
        .select('id, key_value, created_at')
        .single();

      if (insertError) throw insertError;

      res.json(newKey);
    } catch (err) {
      console.error('Create key error:', err);
      res.status(500).json({ error: 'Failed to create key' });
    }
  });

  // DELETE /api/keys — delete the user's overlay key
  app.delete('/api/keys', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      await supabase.from('api_keys').delete().eq('user_id', userId);
      apiKeyCache.clear();
      res.json({ success: true });
    } catch (err) {
      console.error('Delete key error:', err);
      res.status(500).json({ error: 'Failed to delete key' });
    }
  });

};
