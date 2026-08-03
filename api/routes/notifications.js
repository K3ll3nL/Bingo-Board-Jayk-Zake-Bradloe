/**
 * notifications routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  getAuthenticatedUserId,
  supabase,
} = require('../lib/core');

module.exports = function register(app) {

  // Get notification history for the authenticated user
  app.get('/api/notifications', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const unreadOnly = req.query.unread === 'true';

      let query = supabase
        .from('notifications')
        .select('id, status, pokemon_id, award, message, created_at, notified')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (unreadOnly) query = query.eq('notified', false);

      const { data: notifications, error } = await query;

      if (error) throw error;

      // Enrich with pokemon details
      const pokemonIds = [...new Set(notifications.filter(n => n.pokemon_id).map(n => n.pokemon_id))];
      let pokemonMap = {};
      if (pokemonIds.length > 0) {
        const { data: pokemon, error: pokemonError } = await supabase
          .from('pokemon_master')
          .select('id, national_dex_id, name, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference')
          .in('id', pokemonIds);
        if (pokemonError) throw pokemonError;
        pokemonMap = Object.fromEntries(pokemon.map(p => [p.id, p]));
      }

      // Enrich with award (bingo achievement) details
      const awardIds = [...new Set(notifications.filter(n => n.award).map(n => n.award))];
      let awardMap = {};
      if (awardIds.length > 0) {
        const { data: awards, error: awardsError } = await supabase
          .from('bingo_achievements')
          .select('id, bingo_type')
          .in('id', awardIds);
        if (!awardsError && awards) awardMap = Object.fromEntries(awards.map(a => [a.id, a]));
      }

      // Enrich badge_earned notifications — message stores the badge UUID
      const badgeIds = [...new Set(
        notifications.filter(n => n.status === 'badge_earned' && n.message).map(n => n.message)
      )];
      let badgeMap = {};
      if (badgeIds.length > 0) {
        const { data: badges } = await supabase
          .from('badges')
          .select('id, name, description, image_url')
          .in('id', badgeIds);
        if (badges) badgeMap = Object.fromEntries(badges.map(b => [b.id, b]));
      }

      const enriched = notifications.map(n => ({
        ...n,
        pokemon:     n.pokemon_id ? (pokemonMap[n.pokemon_id] || null) : null,
        achievement: n.award      ? (awardMap[n.award]        || null) : null,
        badge:       n.status === 'badge_earned' && n.message ? (badgeMap[n.message] || null) : null,
      }));

      // When fetching for the toast (unread=true), also consume broadcast notifications
      let broadcasts = [];
      if (unreadOnly) {
        const { data: broadcastData, error: broadcastError } = await supabase
          .from('broadcast_notifications')
          .select('id, award, winner_user_id, created_at')
          .eq('user_id', userId);

        if (!broadcastError && broadcastData?.length) {
          // Delete immediately — read and consume
          await supabase
            .from('broadcast_notifications')
            .delete()
            .eq('user_id', userId)
            .in('id', broadcastData.map(b => b.id));

          // Enrich with achievement type
          const broadcastAwardIds = [...new Set(broadcastData.map(b => b.award))];
          let broadcastAwardMap = {};
          if (broadcastAwardIds.length > 0) {
            const { data: awards } = await supabase
              .from('bingo_achievements')
              .select('id, bingo_type, bingo_months(month_year_display)')
              .in('id', broadcastAwardIds);
            if (awards) broadcastAwardMap = Object.fromEntries(awards.map(a => [a.id, a]));
          }

          // Enrich with winner display name
          const winnerUserIds = [...new Set(broadcastData.map(b => b.winner_user_id))];
          let winnerMap = {};
          if (winnerUserIds.length > 0) {
            const { data: winners } = await supabase
              .from('users')
              .select('id, display_name')
              .in('id', winnerUserIds);
            if (winners) winnerMap = Object.fromEntries(winners.map(u => [u.id, u]));
          }

          broadcasts = broadcastData.map(b => {
            const ach = broadcastAwardMap[b.award] || null;
            return {
              id: b.id,
              status: 'award_broadcast',
              is_broadcast: true,
              created_at: b.created_at,
              achievement: ach ? {
                ...ach,
                month_name: ach.bingo_months?.month_year_display?.split(' ')[0] || null,
              } : null,
              winner: winnerMap[b.winner_user_id] || null,
            };
          });
        }
      }

      res.json([...enriched, ...broadcasts]);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // Delete a broadcast notification (read-and-consume on dismiss)
  app.delete('/api/broadcast-notifications/:id', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { id } = req.params;

      const { error } = await supabase
        .from('broadcast_notifications')
        .delete()
        .eq('id', id)
        .eq('user_id', userId); // ensures users can only delete their own

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting broadcast notification:', error);
      res.status(500).json({ error: 'Failed to delete broadcast notification' });
    }
  });

  // Mark a notification as notified
  app.patch('/api/notifications/:id/notified', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { id } = req.params;

      const { error } = await supabase
        .from('notifications')
        .update({ notified: true })
        .eq('id', id)
        .eq('user_id', userId); // ensures users can only mark their own

      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification as notified:', error);
      res.status(500).json({ error: 'Failed to mark notification' });
    }
  });

};
