/**
 * users routes (8).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  TOS_VERSION,
  getAuthenticatedUserId,
  isModerator,
  refreshAvatarFromProvider,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // Returns the list of OAuth providers linked to the authenticated user's account.
  // Each entry has: { provider, identity_id, email, created_at }
  app.get('/api/user/identities', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
      if (error || !user) return res.status(404).json({ error: 'User not found' });

      const identities = (user.identities || []).map(i => ({
        provider: i.provider,
        identity_id: i.id,
        email: i.identity_data?.email ?? null,
        created_at: i.created_at,
      }));

      res.json({ identities });
    } catch (err) {
      console.error('identities error:', err.message);
      res.status(500).json({ error: 'Failed to fetch identities' });
    }
  });

  // Check if user is a moderator
  // Sync avatar from Discord identity — call after OAuth login to keep avatar_url fresh
  app.post('/api/user/sync-avatar', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const avatarUrl = await refreshAvatarFromProvider(userId);
      res.json({ success: true, avatar_url: avatarUrl });
    } catch (err) {
      console.error('sync-avatar error:', err.message);
      res.status(500).json({ error: 'Failed to sync avatar' });
    }
  });

  app.get('/api/user/tos-status', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { data, error } = await supabase
        .from('users')
        .select('tos_version_accepted')
        .eq('id', userId)
        .single();
      if (error) throw error;

      const accepted = (data?.tos_version_accepted ?? 0) >= TOS_VERSION;
      const isUpdate = data?.tos_version_accepted != null && data.tos_version_accepted < TOS_VERSION;
      res.json({ accepted, is_update: isUpdate, current_version: TOS_VERSION });
    } catch (err) {
      console.error('tos-status error:', err.message);
      res.status(500).json({ error: 'Failed to load ToS status' });
    }
  });

  app.post('/api/user/accept-tos', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { error } = await supabase
        .from('users')
        .update({
          tos_accepted_at: new Date().toISOString(),
          tos_version_accepted: TOS_VERSION,
        })
        .eq('id', userId);
      if (error) throw error;

      res.json({ success: true, version: TOS_VERSION });
    } catch (err) {
      console.error('accept-tos error:', err.message);
      res.status(500).json({ error: 'Failed to record ToS acceptance' });
    }
  });

  app.get('/api/user/is-moderator', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) {
        return res.json({ isModerator: false });
      }

      res.json({ isModerator: await isModerator(userId) });
    } catch (error) {
      console.error('Error checking moderator status:', error);
      res.json({ isModerator: false });
    }
  });

  // GET /api/user/is-pro
  app.get('/api/user/is-pro', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.json({ isPro: false });
      const { data } = await supabase.from('site_pro').select('user_id').eq('user_id', userId).maybeSingle();
      res.json({ isPro: !!data });
    } catch { res.json({ isPro: false }); }
  });

  // Update a user's social links (authenticated, own user only)
  app.put('/api/users/:userId/socials', async (req, res) => {
    try {
      const requestingUserId = await getAuthenticatedUserId(req);
      if (!requestingUserId) return res.status(401).json({ error: 'Unauthorized' });
      const { userId } = req.params;
      if (requestingUserId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const update = {};
      if ('twitch_url' in req.body) update.twitch_url = req.body.twitch_url || null;
      if ('youtube_url' in req.body) update.youtube_url = req.body.youtube_url || null;
      if ('shinydex_url' in req.body) update.shinydex_url = req.body.shinydex_url || null;

      const { error } = await supabase.from('users').update(update).eq('id', userId);
      if (error) throw error;
      res.json({ ok: true });
    } catch (error) {
      console.error('Error updating socials:', error);
      res.status(500).json({ error: 'Failed to update socials', details: error.message });
    }
  });

  app.put('/api/users/:userId/display-name', async (req, res) => {
    try {
      const requestingUserId = await getAuthenticatedUserId(req);
      if (!requestingUserId) return res.status(401).json({ error: 'Unauthorized' });
      const { userId } = req.params;
      if (requestingUserId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const { display_name } = req.body;
      if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
        return res.status(400).json({ error: 'Display name is required and cannot be empty' });
      }

      const trimmedName = display_name.trim();
      if (trimmedName.length > 24) {
        return res.status(400).json({ error: 'Display name must be 24 characters or less' });
      }

      const { error } = await supabase.from('users').update({ display_name: trimmedName }).eq('id', userId);
      if (error) throw error;
      res.json({ ok: true, display_name: trimmedName });
    } catch (error) {
      console.error('Error updating display name:', error);
      res.status(500).json({ error: 'Failed to update display name', details: error.message });
    }
  });

};
