/**
 * admin routes (19).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  GAME_LABELS,
  broadcastUpdate,
  bustShinyPokemon,
  loadBoardTags,
  getAuthenticatedUserId,
  isModerator,
  supabase,
  upload,
} = require('../_lib/core');
const { bonusRowsFrom } = require('../_lib/collectionBonus');
// The evaluator memoises pokemon_master (collection_ids, collection_bonus,
// shiny_available) for 10 min; every write here that changes those clears it,
// or the Backlog sims a just-built collection as empty ("unknown qualifier").
const { forgetData } = require('../_lib/badgeEval');

module.exports = function register(app) {

  // Admin-only: Clear cache manually
  app.post('/api/admin/clear-cache', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if user is moderator
      const isMod = await isModerator(userId);

      if (!isMod) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      // In-memory cache has been removed (Vercel instances don't share memory).
      // This endpoint is now a no-op kept for backwards compatibility.
      res.json({
        success: true,
        message: 'Cache is disabled: no-op',
        itemsCleared: 0
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      res.status(500).json({ error: 'Failed to clear cache', details: error.message });
    }
  });

  // GET /api/admin/badge-families — all families ordered by display_order
  app.get('/api/admin/badge-families', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { data, error } = await supabase
        .from('badge_families')
        .select('id, display_name, display_order, is_sequential')
        .order('display_order');
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/badges — all badges, full data (no hint hiding)
  app.get('/api/admin/badges', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { data, error } = await supabase
        .from('badges')
        .select('*, badge_families(display_name, display_order)')
        .order('family_order');
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/users/search?q= — search users by display name / username
  app.get('/api/admin/users/search', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const q = (req.query.q || '').trim();
      if (!q) return res.json([]);

      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, username, avatar_url')
        .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(20);
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/users/:userId/badges — every badge + whether this user has earned it
  app.get('/api/admin/users/:userId/badges', async (req, res) => {
    try {
      const modId = await getAuthenticatedUserId(req);
      if (!modId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(modId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { userId } = req.params;

      const [{ data: badges, error: bErr }, { data: earned, error: eErr }] = await Promise.all([
        supabase.from('badges')
          .select('id, key, name, image_url, is_secret, family, family_order, check_type, badge_families(display_order)'),
        // No month_id filter — a badge earned in any month still counts as earned for display.
        supabase.from('user_badges').select('badge_id, earned_at, month_id').eq('user_id', userId),
      ]);
      if (bErr) throw bErr;
      if (eErr) throw eErr;

      // Order by family display_order, then family_order within the family; uncategorized last.
      const famOrder = b => (b.badge_families?.display_order ?? Number.MAX_SAFE_INTEGER);
      const sorted = (badges || []).slice().sort((a, b) =>
        (famOrder(a) - famOrder(b)) ||
        ((a.family_order ?? 0) - (b.family_order ?? 0)) ||
        (a.name || '').localeCompare(b.name || '')
      );

      // A badge may have multiple rows (monthly winners span months) — keep the earliest earned_at,
      // and collect every month_id this user holds for the badge.
      const earnedMap = new Map();
      const monthsMap = new Map();
      for (const e of (earned || [])) {
        const prev = earnedMap.get(e.badge_id);
        if (!prev || e.earned_at < prev.earned_at) earnedMap.set(e.badge_id, e);
        if (e.month_id != null) {
          if (!monthsMap.has(e.badge_id)) monthsMap.set(e.badge_id, []);
          monthsMap.get(e.badge_id).push(e.month_id);
        }
      }
      res.json(sorted.map(({ badge_families, ...b }) => ({
        ...b,
        is_monthly: b.check_type === 'first_approval_month',
        is_earned: earnedMap.has(b.id),
        earned_at: earnedMap.get(b.id)?.earned_at || null,
        earned_month_ids: (monthsMap.get(b.id) || []).sort((a, c) => a - c),
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/badges/:badgeId/monthly-holders — month list + current winner per month
  // (used by the Grant tab's month picker for first_approval_month badges)
  app.get('/api/admin/badges/:badgeId/monthly-holders', async (req, res) => {
    try {
      const modId = await getAuthenticatedUserId(req);
      if (!modId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(modId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { badgeId } = req.params;

      const [{ data: months }, { data: rows }] = await Promise.all([
        supabase.from('bingo_months').select('id, month_year_display').order('id'),
        supabase.from('user_badges').select('month_id, user_id').eq('badge_id', badgeId).not('month_id', 'is', null),
      ]);

      const holderIds = [...new Set((rows || []).map(r => r.user_id))];
      let nameMap = {};
      if (holderIds.length) {
        const { data: users } = await supabase.from('users').select('id, display_name, username').in('id', holderIds);
        nameMap = Object.fromEntries((users || []).map(u => [u.id, u.display_name || u.username]));
      }

      const holders = {};
      for (const r of (rows || [])) holders[r.month_id] = { user_id: r.user_id, name: nameMap[r.user_id] || 'Unknown' };

      res.json({
        months: (months || []).map(m => ({ id: m.id, label: m.month_year_display })),
        holders,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/users/:userId/badges/:badgeId — manually grant a badge
  // Body (monthly badges only): { month_id, reassign } — reassign takes the month from its current holder.
  app.post('/api/admin/users/:userId/badges/:badgeId', async (req, res) => {
    try {
      const modId = await getAuthenticatedUserId(req);
      if (!modId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(modId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { userId, badgeId } = req.params;
      const { month_id = null, reassign = false } = req.body || {};

      const { data: badge, error: badgeErr } = await supabase
        .from('badges').select('id, name, description, image_url, is_secret, check_type').eq('id', badgeId).single();
      if (badgeErr || !badge) return res.status(404).json({ error: 'Badge not found' });

      const isMonthly = badge.check_type === 'first_approval_month';
      if (isMonthly && month_id == null) return res.status(400).json({ error: 'month_id is required for monthly winner badges' });

      if (isMonthly) {
        // Is this month already held? (unique winner per badge per month)
        const { data: current } = await supabase
          .from('user_badges').select('user_id')
          .eq('badge_id', badgeId).eq('month_id', month_id).maybeSingle();
        if (current) {
          if (current.user_id === userId) return res.status(409).json({ error: 'User already holds this month' });
          if (!reassign) {
            const { data: holder } = await supabase.from('users').select('display_name, username').eq('id', current.user_id).single();
            return res.status(409).json({ error: 'month_taken', holder_user_id: current.user_id, holder_name: holder?.display_name || holder?.username || 'Unknown' });
          }
          // Reassign: strip the month from its current holder first.
          await supabase.from('user_badges').delete().eq('badge_id', badgeId).eq('month_id', month_id);
        }
      } else {
        // Regular badge — one row, no month.
        const { data: existing } = await supabase
          .from('user_badges').select('badge_id')
          .eq('user_id', userId).eq('badge_id', badgeId).is('month_id', null).maybeSingle();
        if (existing) return res.status(409).json({ error: 'User already has this badge' });
      }

      const { error: insErr } = await supabase
        .from('user_badges').insert({ user_id: userId, badge_id: badgeId, ...(isMonthly ? { month_id } : {}) });
      if (insErr) throw insErr;

      // Notification (notified:true — toast fires via badge-awards channel) + realtime broadcast
      await supabase.from('notifications').insert({
        user_id: userId, status: 'badge_earned', message: badge.id, notified: true,
      });
      await broadcastUpdate(`badge-awards-${userId}`, 'badge-earned', {
        id: badge.id, name: badge.name, description: badge.description,
        image_url: badge.image_url, is_secret: badge.is_secret,
      });

      console.log(`Mod ${modId} manually granted badge ${badge.name} to user ${userId}${isMonthly ? ` (month ${month_id})` : ''}`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/users/:userId/badges/:badgeId — manually revoke a badge
  // Monthly badges: pass ?month_id= to revoke that specific month's win.
  app.delete('/api/admin/users/:userId/badges/:badgeId', async (req, res) => {
    try {
      const modId = await getAuthenticatedUserId(req);
      if (!modId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(modId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { userId, badgeId } = req.params;
      const monthId = req.query.month_id != null && req.query.month_id !== '' ? Number(req.query.month_id) : null;

      const { data: badge } = await supabase
        .from('badges').select('check_type').eq('id', badgeId).single();
      const isMonthly = badge?.check_type === 'first_approval_month';
      if (isMonthly && monthId == null) return res.status(400).json({ error: 'month_id is required for monthly winner badges' });

      let del = supabase.from('user_badges').delete().eq('user_id', userId).eq('badge_id', badgeId);
      del = isMonthly ? del.eq('month_id', monthId) : del.is('month_id', null);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

      // Clear any lingering "badge_earned" notification (only when the user no longer holds the badge at all)
      const { data: remaining } = await supabase
        .from('user_badges').select('badge_id').eq('user_id', userId).eq('badge_id', badgeId).limit(1);
      if (!remaining?.length) {
        await supabase.from('notifications')
          .delete().eq('user_id', userId).eq('status', 'badge_earned').eq('message', badgeId);
      }

      console.log(`Mod ${modId} manually revoked badge ${badgeId} from user ${userId}${isMonthly ? ` (month ${monthId})` : ''}`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/badge-families/reorder — must be before /:id to avoid param conflict
  app.patch('/api/admin/badge-families/reorder', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { order } = req.body;
      if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

      await Promise.all(
        order.map(({ id, display_order }) =>
          supabase.from('badge_families').update({ display_order }).eq('id', id)
        )
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/badge-families/:id — inline edit display_name / is_sequential
  app.patch('/api/admin/badge-families/:id', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { display_name, is_sequential } = req.body;
      const { error } = await supabase
        .from('badge_families')
        .update({ display_name, is_sequential })
        .eq('id', req.params.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/badges/:id/image — replace a badge's image in R2 (mod only)
  app.patch('/api/admin/badges/:id/image', upload.single('image'), async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Image file is required' });

      const { data: badge, error: fetchErr } = await supabase
        .from('badges').select('key').eq('id', req.params.id).single();
      if (fetchErr || !badge) return res.status(404).json({ error: 'Badge not found' });

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

      const r2Key = `assets/badges/${badge.key}.png`;
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: file.buffer,
        ContentType: 'image/png',
        // Revalidate on every use: browsers cache but check R2's ETag before serving,
        // so a replaced image (same URL) is picked up immediately without cache-busting.
        CacheControl: 'no-cache',
      }));

      // Store a version query param so the stored URL itself changes on every
      // replace. Cloudflare's edge and the browser cache per full URL, so a new
      // ?v= guarantees the fresh image is fetched even though the object key is stable.
      const image_url = `${R2_BUCKET_URL}/${r2Key}?v=${Date.now()}`;
      await supabase.from('badges').update({ image_url }).eq('id', req.params.id);

      res.json({ success: true, image_url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/badges/:id/refresh-cache — bump the image_url version query
  // param without re-uploading. Use this after replacing a badge image directly
  // in the R2 bucket (outside the app) so clients stop serving the cached copy.
  // If :id is 'all', bumps every badge in one call.
  app.post('/api/admin/badges/:id/refresh-cache', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const bump = (url) => {
        if (!url) return url;
        const base = url.split('?')[0];
        return `${base}?v=${Date.now()}`;
      };

      if (req.params.id === 'all') {
        const { data: badges, error } = await supabase.from('badges').select('id, image_url');
        if (error) throw error;
        await Promise.all(
          (badges || [])
            .filter(b => b.image_url)
            .map(b => supabase.from('badges').update({ image_url: bump(b.image_url) }).eq('id', b.id))
        );
        return res.json({ success: true, count: (badges || []).filter(b => b.image_url).length });
      }

      const { data: badge, error: fetchErr } = await supabase
        .from('badges').select('image_url').eq('id', req.params.id).single();
      if (fetchErr || !badge) return res.status(404).json({ error: 'Badge not found' });
      const image_url = bump(badge.image_url);
      await supabase.from('badges').update({ image_url }).eq('id', req.params.id);
      res.json({ success: true, image_url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/collections — all distinct collection slugs, with how many
  // members carry a bonus game (0 = no bonus tier possible for that collection)
  app.get('/api/admin/collections', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { data, error } = await supabase.from('pokemon_master')
        .select('id, collection_ids, collection_bonus').not('collection_ids', 'eq', '{}');
      if (error) throw error;

      const slugs = [...new Set((data || []).flatMap(p => p.collection_ids || []))].sort();
      const bonusCount = {};
      for (const r of bonusRowsFrom(data)) bonusCount[r.slug] = (bonusCount[r.slug] || 0) + 1;

      res.json(slugs.map(slug => ({ slug, bonus_count: bonusCount[slug] || 0 })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/collections/:slug — all Pokémon tagged with this slug, each
  // with its game_slugs and bonus_games (game keys, [] = none)
  app.get('/api/admin/collections/:slug', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { slug } = req.params;
      const { data, error } = await supabase
        .from('pokemon_master')
        .select('id, name, national_dex_id, collection_ids, collection_bonus, game_slugs, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference')
        .contains('collection_ids', [slug])
        .order('national_dex_id');

      if (error) throw error;
      res.json({ members: (data || []).map(({ collection_bonus, ...m }) => ({
        ...m, bonus_games: Array.isArray(collection_bonus?.[slug]) ? collection_bonus[slug] : [],
      })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/admin/collections/:slug/pokemon/:pokemonId/bonus — replace a
  // member's bonus games. Body: { games: [<game key>, ...] } ([] clears)
  app.put('/api/admin/collections/:slug/pokemon/:pokemonId/bonus', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { slug } = req.params;
      const pokemonId = Number(req.params.pokemonId);
      if (!Number.isInteger(pokemonId)) return res.status(400).json({ error: 'Bad Pokémon id' });
      const games = req.body?.games;
      if (!Array.isArray(games) || games.some(g => typeof g !== 'string')) {
        return res.status(400).json({ error: 'games must be an array of game keys' });
      }
      const unique = [...new Set(games)];
      const unknown = unique.find(g => !GAME_LABELS[g]);
      if (unknown) return res.status(400).json({ error: `Unknown game '${unknown}'` });

      const { data: pokemon, error: fetchErr } = await supabase
        .from('pokemon_master')
        .select('id, name, collection_ids, collection_bonus, game_slugs')
        .eq('id', pokemonId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!pokemon) return res.status(404).json({ error: 'Pokémon not found' });
      if (!(pokemon.collection_ids || []).includes(slug)) {
        return res.status(400).json({ error: `${pokemon.name} is not in '${slug}'` });
      }
      const missing = unique.find(g => !(pokemon.game_slugs || []).includes(g));
      if (missing) {
        return res.status(400).json({ error: `${pokemon.name} isn't available in ${GAME_LABELS[missing]}` });
      }

      // Keep games in ALLOWED_GAMES order so the stored list is stable
      const ordered = Object.keys(GAME_LABELS).filter(k => unique.includes(k));
      const { [slug]: _old, ...rest } = pokemon.collection_bonus || {};
      const { error } = await supabase.from('pokemon_master')
        .update({ collection_bonus: ordered.length ? { ...rest, [slug]: ordered } : rest })
        .eq('id', pokemonId);
      if (error) throw error;
      forgetData();
      res.json({ success: true, bonus_games: ordered });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/collections/:slug/pokemon/:pokemonId — add Pokémon to collection
  app.post('/api/admin/collections/:slug/pokemon/:pokemonId', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { slug, pokemonId } = req.params;

      // Fetch current collection_ids to avoid duplicates
      const { data: pokemon, error: fetchErr } = await supabase
        .from('pokemon_master')
        .select('id, name, collection_ids')
        .eq('id', pokemonId)
        .single();

      if (fetchErr || !pokemon) return res.status(404).json({ error: 'Pokémon not found' });
      if ((pokemon.collection_ids || []).includes(slug)) {
        return res.status(409).json({ error: `${pokemon.name} is already in '${slug}'` });
      }

      const { error: updateErr } = await supabase
        .from('pokemon_master')
        .update({ collection_ids: [...(pokemon.collection_ids || []), slug] })
        .eq('id', pokemonId);

      if (updateErr) throw updateErr;
      forgetData();
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/collections/:slug/pokemon/:pokemonId — remove Pokémon from collection
  app.delete('/api/admin/collections/:slug/pokemon/:pokemonId', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const mod = await isModerator(userId);
      if (!mod) return res.status(403).json({ error: 'Moderators only' });

      const { slug, pokemonId } = req.params;

      const { data: pokemon, error: fetchErr } = await supabase
        .from('pokemon_master')
        .select('id, collection_ids, collection_bonus')
        .eq('id', pokemonId)
        .single();

      if (fetchErr || !pokemon) return res.status(404).json({ error: 'Pokémon not found' });

      // A non-member can't carry bonus games, so they go in the same write
      const { [slug]: _gone, ...bonus } = pokemon.collection_bonus || {};
      const { error: updateErr } = await supabase
        .from('pokemon_master')
        .update({ collection_ids: (pokemon.collection_ids || []).filter(c => c !== slug), collection_bonus: bonus })
        .eq('id', pokemonId);

      if (updateErr) throw updateErr;
      forgetData();
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Board tags (the one list of board-balancing tags) ────────────────────
  // GET /api/admin/board-tags — every tag with how many mons carry it
  app.get('/api/admin/board-tags', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!(await isModerator(userId))) return res.status(403).json({ error: 'Moderators only' });

      const [tags, { data: rows, error }] = await Promise.all([
        loadBoardTags(),
        supabase.from('pokemon_master').select('board_tags').not('board_tags', 'eq', '{}'),
      ]);
      if (error) throw error;
      const count = {};
      for (const r of rows || []) for (const t of r.board_tags || []) count[t] = (count[t] || 0) + 1;
      res.json(tags.map(t => ({ ...t, count: count[t.slug] || 0 })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/board-tags { label } — add a tag (slug derived from label)
  app.post('/api/admin/board-tags', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!(await isModerator(userId))) return res.status(403).json({ error: 'Moderators only' });

      const label = String(req.body?.label || '').trim().slice(0, 40);
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      if (!slug) return res.status(400).json({ error: 'Tag needs a name' });

      const tags = await loadBoardTags();
      if (tags.some(t => t.slug === slug)) return res.status(409).json({ error: `'${label}' already exists` });
      const display_order = tags.reduce((m, t) => Math.max(m, t.display_order), 0) + 1;
      const { data, error } = await supabase.from('board_tags')
        .insert({ slug, label, display_order }).select('slug, label, display_order').single();
      if (error) throw error;
      bustShinyPokemon();
      res.json({ ...data, count: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/admin/board-tags/:slug — remove a tag from the list and from every mon
  app.delete('/api/admin/board-tags/:slug', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      if (!(await isModerator(userId))) return res.status(403).json({ error: 'Moderators only' });

      const { data: removedFrom, error } = await supabase.rpc('delete_board_tag', { p_slug: req.params.slug });
      if (error) throw error;
      bustShinyPokemon();
      res.json({ success: true, removed_from: removedFrom });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/pokemon-game-slugs', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const isMod = await isModerator(userId);
      if (!isMod) return res.status(403).json({ error: 'Moderator access required' });

      const { data, error } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, game_slugs, restricted_game_slugs, shiny_available, forms_count, form_id, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference, board_tags, family_id, evolves_from_id, rule_exemptions')
        .order('national_dex_id', { ascending: true })
        .order('form_id', { ascending: true });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('Error fetching pokemon game slugs:', err);
      res.status(500).json({ error: 'Failed to fetch pokemon' });
    }
  });

  app.patch('/api/admin/pokemon/:id/game-slugs', async (req, res) => {
    try {
      const { id } = req.params;
      const { game_slugs, restricted_game_slugs, shiny_available, forms_count, board_tags, family_id, evolves_from_id, rule_exemptions, editor_id } = req.body;

      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const isMod = await isModerator(userId);
      if (!isMod) return res.status(403).json({ error: 'Moderator access required' });

      const updates = {};
      if (Array.isArray(game_slugs)) updates.game_slugs = game_slugs;
      if (Array.isArray(restricted_game_slugs)) updates.restricted_game_slugs = restricted_game_slugs;
      if (typeof shiny_available === 'boolean') updates.shiny_available = shiny_available;
      if (Number.isInteger(forms_count) && forms_count >= 1) updates.forms_count = forms_count;
      if (Array.isArray(board_tags)) {
        const known = new Set((await loadBoardTags()).map(t => t.slug));
        const bad = board_tags.find(t => typeof t !== 'string' || !known.has(t));
        if (bad !== undefined) return res.status(400).json({ error: `Unknown board tag '${bad}'` });
        updates.board_tags = [...new Set(board_tags)];
      }
      // Properties panel: family, evolution parent row (NULL = first stage) and
      // Restricted rule exceptions. All feed Hunt Prep / board builder through
      // the roster memo, busted below.
      if (family_id === null) updates.family_id = null;
      else if (Number.isInteger(family_id) && family_id >= 0) updates.family_id = family_id;
      if (evolves_from_id === null) updates.evolves_from_id = null;
      else if (Number.isInteger(evolves_from_id) && evolves_from_id !== Number(id)) updates.evolves_from_id = evolves_from_id;
      if (Array.isArray(rule_exemptions)) updates.rule_exemptions = rule_exemptions.filter(r => typeof r === 'string' && r.length <= 64);

      const { error } = await supabase
        .from('pokemon_master')
        .update(updates)
        .eq('id', id);

      if (error) {
        throw error;
      }

      // This is the ONLY writer of game_slugs / restricted_game_slugs /
      // shiny_available / family_id / evolves_from_id / rule_exemptions, which core's shiny
      // roster memo filters on or serves — so busting here is what lets that memo be correct on write rather
      // than merely correct eventually. Must stay next to the update: if
      // another endpoint ever starts writing these columns, it needs this too.
      bustShinyPokemon();
      forgetData();

      // Real-time fan-out to other mods on the Game Manager. editor_id lets the
      // sender's own client ignore its own echo so it can't stomp on in-flight typing.
      broadcastUpdate('pokemon-game-manager', 'pokemon-updated', {
        id: Number(id),
        updates,
        editor_id: editor_id || null,
      }).catch(() => {});

      res.json({ success: true });
    } catch (err) {
      console.error('Error updating pokemon game slugs:', err);
      res.status(500).json({ error: 'Failed to update pokemon', details: err.message });
    }
  });

};
