/**
 * badges routes (8).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  computeBadgeRarity,
  getAuthenticatedUserId,
  supabase,
  upload,
} = require('../_lib/core');

module.exports = function register(app) {

  // Get all badges with hint/description visibility resolved for the current user.
  // Unauthenticated users see the same view as a user with no earned badges.
  app.get('/api/badges', async (req, res) => {
    try {
      const requesterId = await getAuthenticatedUserId(req);
      // Caller may pass ?userId= to compute hint visibility for a specific user
      // (e.g. viewing another user's badge picker). Falls back to the authenticated user.
      const userId = req.query.userId || requesterId;

      const { data: badges, error } = await supabase
        .from('badges')
        .select('*')
        .order('family', { ascending: true, nullsFirst: false })
        .order('family_order', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true });

      if (error) throw error;

      const { percentByBadge } = await computeBadgeRarity();

      // Fetch this user's earned badges (with seen flag for the "new badge" glow)
      let earnedBadgeIds = new Set();
      let seenByBadge = {};
      if (userId) {
        const { data: earned } = await supabase
          .from('user_badges')
          .select('badge_id, seen')
          .eq('user_id', userId);
        earnedBadgeIds = new Set((earned || []).map(e => e.badge_id));
        (earned || []).forEach(e => { seenByBadge[e.badge_id] = e.seen; });
      }

      // Group badges by family, sorted by family_order (nulls sort last).
      // This index-based approach handles null/non-consecutive family_order values
      // correctly — a badge's hint is locked if any badge before it in the chain
      // hasn't been earned yet.
      const familyChains = {}; // family -> Badge[] sorted by position
      for (const badge of (badges || [])) {
        if (badge.family) {
          if (!familyChains[badge.family]) familyChains[badge.family] = [];
          familyChains[badge.family].push(badge);
        }
      }
      for (const family in familyChains) {
        familyChains[family].sort((a, b) => {
          const ao = a.family_order ?? Infinity;
          const bo = b.family_order ?? Infinity;
          return ao - bo;
        });
      }

      const result = (badges || []).map(badge => {
        const isEarned = earnedBadgeIds.has(badge.id);

        const earned_percent = percentByBadge[badge.id] ?? null;

        if (isEarned) {
          return { ...badge, is_earned: true, hint_visible: true, earned_percent, seen: seenByBadge[badge.id] !== false };
        }

        // Secret + not earned: reveal nothing
        if (badge.is_secret) {
          return {
            id: badge.id,
            name: '???',
            description: null,
            image_url: null,
            is_secret: true,
            hint: null,
            hint_visible: false,
            family: badge.family,
            family_order: badge.family_order,
            trigger: badge.trigger,
            trigger_count: badge.trigger_count,
            is_earned: false,
            earned_percent,
          };
        }

        // Non-secret: hint is visible only if every badge that precedes this one
        // in its family chain has already been earned.
        let hintVisible = true;
        if (badge.family) {
          const chain = familyChains[badge.family] || [];
          const idx = chain.findIndex(b => b.id === badge.id);
          for (let i = 0; i < idx; i++) {
            if (!earnedBadgeIds.has(chain[i].id)) {
              hintVisible = false;
              break;
            }
          }
        }

        return {
          ...badge,
          is_earned: false,
          hint_visible: hintVisible,
          hint: hintVisible ? badge.hint : null,
          earned_percent,
        };
      });

      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      console.error('Error fetching badges:', error);
      res.status(500).json({ error: 'Failed to fetch badges', details: error.message });
    }
  });

  // Get all badges earned by a specific user (public — for profile pages)
  app.get('/api/users/:userId/badges', async (req, res) => {
    try {
      const { userId } = req.params;

      const { data, error } = await supabase
        .from('user_badges')
        .select('badge_id, earned_at, seen, badges(*, badge_families(display_order))')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });

      if (error) throw error;

      const { percentByBadge } = await computeBadgeRarity();

      // Flag which of these badges the *viewer* has personally earned, so the
      // client shows the description (earned) or the hint (not earned) — never both.
      const viewerId = await getAuthenticatedUserId(req);
      let viewerEarned = new Set();
      if (viewerId) {
        const badgeIds = (data || []).map(ub => ub.badge_id);
        if (badgeIds.length) {
          const { data: earnedRows } = await supabase
            .from('user_badges')
            .select('badge_id')
            .eq('user_id', viewerId)
            .in('badge_id', badgeIds);
          viewerEarned = new Set((earnedRows || []).map(r => r.badge_id));
        }
      }

      const enriched = (data || []).map(ub => ({
        ...ub,
        badges: ub.badges
          ? {
              ...ub.badges,
              earned_percent: percentByBadge[ub.badge_id] ?? null,
              viewer_earned: viewerEarned.has(ub.badge_id),
            }
          : ub.badges,
      }));

      res.set('Cache-Control', 'no-store');
      res.json(enriched);
    } catch (error) {
      console.error('Error fetching user badges:', error);
      res.status(500).json({ error: 'Failed to fetch user badges', details: error.message });
    }
  });

  // Public badge family ordering (display_order from badge_families table)
  app.get('/api/badge-families', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('badge_families')
        .select('id, display_name, display_order')
        .order('display_order', { ascending: true });
      if (error) throw error;
      res.set('Cache-Control', 'no-store');
      res.json(data || []);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch badge families', details: error.message });
    }
  });

  // Get a user's equipped badge slots — reads slot column on user_badges (public)
  app.get('/api/users/:userId/badge-slots', async (req, res) => {
    try {
      const { userId } = req.params;
      const { data, error } = await supabase
        .from('user_badges')
        .select('slot, badge_id, badges(*)')
        .eq('user_id', userId)
        .not('slot', 'is', null)
        .order('slot', { ascending: true });
      if (error) throw error;

      const { percentByBadge } = await computeBadgeRarity();

      // Determine which of these badges the *viewer* has personally earned, so
      // the client can show the full description only for badges the viewer owns
      // and fall back to the hint otherwise. Anonymous viewers earn nothing.
      const viewerId = await getAuthenticatedUserId(req);
      let viewerEarned = new Set();
      if (viewerId) {
        const badgeIds = (data || []).map(row => row.badge_id);
        if (badgeIds.length) {
          const { data: earnedRows } = await supabase
            .from('user_badges')
            .select('badge_id')
            .eq('user_id', viewerId)
            .in('badge_id', badgeIds);
          viewerEarned = new Set((earnedRows || []).map(r => r.badge_id));
        }
      }

      const enriched = (data || []).map(row => ({
        ...row,
        badges: row.badges
          ? {
              ...row.badges,
              earned_percent: percentByBadge[row.badge_id] ?? null,
              viewer_earned: viewerEarned.has(row.badge_id),
            }
          : row.badges,
      }));

      res.set('Cache-Control', 'no-store');
      res.json(enriched);
    } catch (error) {
      console.error('Error fetching badge slots:', error);
      res.status(500).json({ error: 'Failed to fetch badge slots', details: error.message });
    }
  });

  // Save a user's badge slot assignments — updates slot column on user_badges rows (authenticated, own user only)
  app.put('/api/users/:userId/badge-slots', async (req, res) => {
    try {
      const requestingUserId = await getAuthenticatedUserId(req);
      if (!requestingUserId) return res.status(401).json({ error: 'Unauthorized' });
      const { userId } = req.params;
      if (requestingUserId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const { slots } = req.body;
      if (!Array.isArray(slots)) return res.status(400).json({ error: 'slots must be an array' });

      const valid = slots.filter(s => s.slot >= 1 && s.slot <= 8 && s.badge_id);

      // Clear all existing slot assignments for this user
      const { error: clearError } = await supabase
        .from('user_badges')
        .update({ slot: null })
        .eq('user_id', userId)
        .not('slot', 'is', null);
      if (clearError) throw clearError;

      // Set each new slot assignment
      await Promise.all(
        valid.map(({ slot, badge_id }) =>
          supabase
            .from('user_badges')
            .update({ slot })
            .eq('user_id', userId)
            .eq('badge_id', badge_id)
        )
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating badge slots:', error);
      res.status(500).json({ error: 'Failed to update badge slots', details: error.message });
    }
  });

  // Count of the user's earned-but-unseen badges (own user only — drives the "new badge" dot)
  app.get('/api/users/:userId/badges/unseen-count', async (req, res) => {
    try {
      const requestingUserId = await getAuthenticatedUserId(req);
      if (!requestingUserId) return res.status(401).json({ error: 'Unauthorized' });
      const { userId } = req.params;
      if (requestingUserId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const { count, error } = await supabase
        .from('user_badges')
        .select('badge_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('seen', false);
      if (error) throw error;

      res.set('Cache-Control', 'no-store');
      res.json({ count: count || 0 });
    } catch (error) {
      console.error('Error fetching unseen badge count:', error);
      res.status(500).json({ error: 'Failed to fetch unseen badge count', details: error.message });
    }
  });

  // Mark badges as seen (own user only) — clears the "new badge" glow/dot.
  // Body: { badge_ids: [...] } to mark specific badges, or omit to mark all.
  app.post('/api/users/:userId/badges/mark-seen', async (req, res) => {
    try {
      const requestingUserId = await getAuthenticatedUserId(req);
      if (!requestingUserId) return res.status(401).json({ error: 'Unauthorized' });
      const { userId } = req.params;
      if (requestingUserId !== userId) return res.status(403).json({ error: 'Forbidden' });

      const { badge_ids } = req.body || {};
      let query = supabase
        .from('user_badges')
        .update({ seen: true })
        .eq('user_id', userId)
        .eq('seen', false);
      if (Array.isArray(badge_ids) && badge_ids.length) {
        query = query.in('badge_id', badge_ids);
      }
      const { error } = await query;
      if (error) throw error;

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking badges seen:', error);
      res.status(500).json({ error: 'Failed to mark badges seen', details: error.message });
    }
  });

  // Create a new badge (moderator only) — uploads image to R2 and inserts DB record
  app.post('/api/badges', upload.single('image'), async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
      if (!mod) return res.status(403).json({ error: 'Forbidden: moderators only' });

      const { key, name, description, hint, is_secret, family, family_order,
              family_display_name, family_display_order, family_is_sequential, family_is_new,
              trigger, trigger_count, check_type, check_value, check_qualifier } = req.body;
      const file = req.file;

      if (!file)        return res.status(400).json({ error: 'Image file is required' });
      if (!key)         return res.status(400).json({ error: 'Image key is required' });
      if (!name)        return res.status(400).json({ error: 'Name is required' });
      if (!description) return res.status(400).json({ error: 'Description is required' });
      if (!trigger)     return res.status(400).json({ error: 'Trigger is required' });

      const VALID_TRIGGERS = ['submission', 'approved', 'rejected', 'monthly_active', 'period_end', 'bingo_achievement', 'date_award', 'account_age'];
      if (!VALID_TRIGGERS.includes(trigger)) {
        return res.status(400).json({ error: `Invalid trigger. Must be one of: ${VALID_TRIGGERS.join(', ')}` });
      }

      // Upload to R2 under assets/badges/
      const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
      const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
      const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
      const R2_BUCKET_NAME       = process.env.R2_BUCKET_NAME || 'shiny-sprites';
      const R2_BUCKET_URL        = process.env.R2_BUCKET_URL;

      if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_URL) {
        return res.status(500).json({ error: 'R2 credentials not configured' });
      }

      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      });

      const r2Key = `assets/badges/${key}.png`;
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key:    r2Key,
        Body:   file.buffer,
        ContentType: 'image/png',
        CacheControl: 'no-cache', // revalidate via ETag so replacements are picked up immediately
      }));

      const image_url = `${R2_BUCKET_URL}/${r2Key}`;

      // Upsert family record if this is a new family
      if (family && family_is_new === 'true') {
        const { error: famErr } = await supabase
          .from('badge_families')
          .upsert({
            id:            family,
            display_name:  family_display_name || family,
            display_order: parseInt(family_display_order, 10) || 0,
            is_sequential: family_is_sequential === 'true',
          }, { onConflict: 'id', ignoreDuplicates: true });
        if (famErr) throw famErr;
      }

      // Insert badge record
      const { data: badge, error } = await supabase
        .from('badges')
        .insert({
          key,
          name,
          description,
          hint:          hint         || null,
          image_url,
          is_secret:     is_secret === 'true' || is_secret === true,
          family:        family       || null,
          family_order:  await (async () => {
            const parsed = family_order !== '' && family_order != null ? parseInt(family_order, 10) : null;
            if (parsed === 0 && family) {
              const { data: last } = await supabase
                .from('badges').select('family_order').eq('family', family)
                .order('family_order', { ascending: false }).limit(1);
              return last?.[0]?.family_order != null ? last[0].family_order + 1 : 1;
            }
            return parsed;
          })(),
          trigger,
          trigger_count:   parseInt(trigger_count, 10) || 1,
          check_type:      check_type      || 'approved_count',
          check_value:     check_value != null ? parseFloat(check_value) : 1,
          check_qualifier: check_qualifier || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Badge insert error:', error);
        return res.status(500).json({ error: error.message });
      }

      res.status(201).json(badge);
    } catch (error) {
      console.error('Error creating badge:', error);
      res.status(500).json({ error: 'Failed to create badge', details: error.message });
    }
  });

};
