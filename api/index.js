require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { contextBuilders, buildCheckFromDB } = require('./badgeRegistry');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

// Multer config with file size limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 4 * 1024 * 1024, // 4MB per file (Vercel limit is 4.5MB total)
    files: 2 // Max 2 files
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase JSON body limit
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Increase URL-encoded body limit

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'Image file is too large. Please compress to under 4MB.',
        fileTooBig: true
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files uploaded. Maximum 2 images allowed.',
      });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Module-level caches ───────────────────────────────────────────────────────
// Active month: only changes once a month. Cache the result and use end_date to
// know exactly when it's stale — no arbitrary TTL needed. Mod users with a
// time_offset_days bypass the cache since their effective date differs.
let activeMonthCache = null; // { id, month_year_display, start_date, end_date }

// Pokemon pool: the 24 pokemon assigned to a month never change mid-month.
// Keyed on month ID — auto-invalidates when a new month becomes active.
let pokemonPoolCache = { monthId: null, poolByPosition: null, pokemonMap: null };

// Twitch OAuth token: client-credentials token valid for ~60 days.
// Cache it with its own expiry so we never fetch a new one unnecessarily.
let twitchTokenCache = { token: null, expiresAt: 0 };

// API key → user_id: keys change only on explicit regeneration/deletion.
// Short TTL (60s) keeps the window small if a key is revoked.
const apiKeyCache = new Map(); // hash → { userId, expiresAt }
const API_KEY_CACHE_TTL = 60_000;

// Leaderboard results per mode — expensive aggregation queries that only change
// on approval. Manually cleared when leaderboard-changed is broadcast.
// Also has a 60s TTL as a safety net (e.g. for Twitch live status freshness).
const leaderboardCache = new Map(); // mode → { data, expiresAt }
const LEADERBOARD_CACHE_TTL = 60_000;
// ─────────────────────────────────────────────────────────────────────────────

// Supabase Realtime Broadcast helper — fire-and-forget, no WebSocket needed
const broadcastUpdate = async (channel, event, payload = {}) => {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        messages: [{ topic: channel, event, payload }]
      })
    });
    if (!res.ok) console.error(`Broadcast ${event} failed: ${res.status}`);
  } catch (err) {
    console.error('Broadcast failed (non-fatal):', err.message);
  }
};

// Fetch, enrich, and broadcast fresh unnotified notifications to a user's toast feed.
// Also fires to 'award-announcements' if any notification is an award (for other users' toasts).
const broadcastNotificationToasts = async (userId) => {
  try {
    const { data: freshNotifs } = await supabase
      .from('notifications')
      .select('id, status, pokemon_id, award, message, created_at')
      .eq('user_id', userId)
      .eq('notified', false)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!freshNotifs?.length) return;

    const pokemonIds = [...new Set(freshNotifs.filter(n => n.pokemon_id).map(n => n.pokemon_id))];
    let pokemonMap = {};
    if (pokemonIds.length > 0) {
      const { data: pokemon } = await supabase
        .from('pokemon_master').select('id, national_dex_id, name, img_url').in('id', pokemonIds);
      if (pokemon) pokemonMap = Object.fromEntries(pokemon.map(p => [p.id, p]));
    }

    const awardIds = [...new Set(freshNotifs.filter(n => n.award).map(n => n.award))];
    let awardMap = {};
    if (awardIds.length > 0) {
      const { data: awards } = await supabase
        .from('bingo_achievements')
        .select('id, bingo_type, bingo_months(month_year_display)')
        .in('id', awardIds);
      if (awards) awardMap = Object.fromEntries(awards.map(a => [a.id, a]));
    }

    for (const n of freshNotifs) {
      const ach = n.award ? awardMap[n.award] : null;
      const enriched = {
        ...n,
        pokemon: n.pokemon_id ? (pokemonMap[n.pokemon_id] || null) : null,
        achievement: ach ? {
          ...ach,
          month_name: ach.bingo_months?.month_year_display?.split(' ')[0] || null,
        } : null,
      };

      await broadcastUpdate(`notifications-${userId}`, 'new-notification', enriched);

      if (n.status === 'award' && n.award) {
        const { data: winner } = await supabase
          .from('users').select('id, display_name').eq('id', userId).single();
        await broadcastUpdate('award-announcements', 'new-award', {
          ...enriched,
          is_broadcast: true,
          status: 'award_broadcast',
          winner,
        });
        // (cache removed — no-op)
      }
    }
  } catch (err) {
    console.error('broadcastNotificationToasts failed (non-fatal):', err.message);
  }
};

// Cache removed — Vercel serverless instances don't share memory,
// so per-instance caching caused stale data after broadcasts.

// Award any badges the user is newly eligible for given a trigger event.
// Fire-and-forget safe — never throws to the caller.
//
// How it works:
//   1. Fetch ALL badges for this trigger from DB (registry-seeded + form-created).
//   2. Filter out already-earned ones — buildCheckFromDB is never called for earned badges.
//   3. Build context ONCE (1-2 DB queries regardless of badge count).
//   4. Evaluate unearned badges via buildCheckFromDB(badge)(ctx).
//   5. Insert + broadcast newly earned badges.
const awardBadgesForTrigger = async (userId, trigger, { monthId } = {}) => {
  try {
    const { data: triggerBadges } = await supabase
      .from('badges')
      .select('id, name, description, image_url, is_secret, check_type, check_value, check_qualifier')
      .eq('trigger', trigger);

    if (!triggerBadges?.length) return;

    // Monthly badges (e.g. first_approval_month) can be earned once per month,
    // so their "already earned" check is scoped to (user, badge, month) rather than (user, badge).
    const monthlyBadgeIds = new Set(
      triggerBadges.filter(b => b.check_type === 'first_approval_month').map(b => b.id)
    );
    const regularBadgeIds = triggerBadges.filter(b => !monthlyBadgeIds.has(b.id)).map(b => b.id);

    const earnedIdSet = new Set();
    const earnedChecks = [];

    if (regularBadgeIds.length) {
      earnedChecks.push(
        supabase
          .from('user_badges')
          .select('badge_id')
          .eq('user_id', userId)
          .in('badge_id', regularBadgeIds)
          .then(({ data }) => { for (const r of data || []) earnedIdSet.add(r.badge_id); })
      );
    }
    if (monthlyBadgeIds.size) {
      if (monthId) {
        earnedChecks.push(
          supabase
            .from('user_badges')
            .select('badge_id')
            .eq('user_id', userId)
            .in('badge_id', [...monthlyBadgeIds])
            .eq('month_id', monthId)
            .then(({ data }) => { for (const r of data || []) earnedIdSet.add(r.badge_id); })
        );
      } else {
        // No monthId provided — skip monthly badges entirely this invocation
        for (const id of monthlyBadgeIds) earnedIdSet.add(id);
      }
    }

    await Promise.all(earnedChecks);

    const unearned = triggerBadges.filter(b => !earnedIdSet.has(b.id));
    if (!unearned.length) return;

    // Build context once — shared across all check evaluations
    const ctx = await contextBuilders[trigger](userId, supabase, { monthId });

    // buildCheckFromDB is only called for unearned candidates
    const newlyEarned = unearned.filter(b => buildCheckFromDB(b)(ctx));
    if (!newlyEarned.length) return;

    const { data: inserted, error: insertError } = await supabase
      .from('user_badges')
      .insert(newlyEarned.map(b => ({
        user_id:  userId,
        badge_id: b.id,
        ...(monthlyBadgeIds.has(b.id) && monthId ? { month_id: monthId } : {}),
      })))
      .select('badge_id');

    if (insertError) {
      console.error('Failed to award badges (non-fatal):', insertError.message);
      return;
    }

    if (inserted?.length) {
      const insertedIds = new Set(inserted.map(i => i.badge_id));
      const awardedBadges = newlyEarned.filter(b => insertedIds.has(b.id));

      // Insert a notification row for each earned badge (notified:true — toast fires via badge-awards channel)
      if (awardedBadges.length) {
        await supabase.from('notifications').insert(
          awardedBadges.map(b => ({
            user_id:  userId,
            status:   'badge_earned',
            message:  b.id,   // badge UUID stored in message for enrichment
            notified: true,
          }))
        );
      }

      for (const badge of awardedBadges) {
        await broadcastUpdate(`badge-awards-${userId}`, 'badge-earned', {
          id:          badge.id,
          name:        badge.name,
          description: badge.description,
          image_url:   badge.image_url,
          is_secret:   badge.is_secret,
        });
      }
      console.log(`Awarded ${inserted.length} badge(s) to user ${userId} for trigger '${trigger}'`);
    }
  } catch (err) {
    console.error('awardBadgesForTrigger failed (non-fatal):', err.message);
  }
};

// ── Supabase webhook — fires on INSERT into user_monthly_points ───────────────
// Configure in Supabase Dashboard → Database → Webhooks:
//   Table: user_monthly_points | Event: INSERT
//   HTTP POST → <your api url>/api/internal/monthly-active
//   Add header:  x-webhook-secret: <value of WEBHOOK_SECRET in api/.env>
app.post('/api/internal/monthly-active', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end();
  }
  const userId = req.body?.record?.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id in record' });

  await awardBadgesForTrigger(userId, 'monthly_active');
  await awardBadgesForTrigger(userId, 'account_age');
  res.status(200).end();
});

// ── Supabase webhook — fires on INSERT into bingo_achievements ────────────────
// Configure in Supabase Dashboard → Database → Webhooks:
//   Table: bingo_achievements | Event: INSERT
//   HTTP POST → <your api url>/api/internal/bingo-achievement
//   Add header:  x-webhook-secret: <value of WEBHOOK_SECRET in api/.env>
app.post('/api/internal/bingo-achievement', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
    return res.status(401).end();
  }
  const userId = req.body?.record?.user_id;
  if (!userId) return res.status(400).json({ error: 'Missing user_id in record' });

  await awardBadgesForTrigger(userId, 'bingo_achievement');
  res.status(200).end();
});

// ── Vercel Cron — fires daily at 1am UTC ─────────────────────────────────────
// vercel.json: { "crons": [{ "path": "/api/internal/period-end", "schedule": "0 1 * * *" }] }
// Vercel sets x-vercel-cron-signature; we verify WEBHOOK_SECRET as a fallback
// for manual triggers and local testing.
app.post('/api/internal/period-end', async (req, res) => {
  if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET &&
      req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  try {
    const todayUTC     = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);
    const todayStr     = todayUTC.toISOString().split('T')[0];
    const yesterdayStr = new Date(todayUTC - 864e5).toISOString().split('T')[0];

    const results = { dateAwards: [], months: [], seasons: [], years: [] };

    // ── Date-award badges — award ALL users on a specific calendar date ───────
    const { data: dateAwardBadges } = await supabase
      .from('badges')
      .select('id, name')
      .eq('trigger', 'date_award')
      .eq('check_qualifier', yesterdayStr);

    if (dateAwardBadges?.length) {
      const { data: allUsers } = await supabase.from('users').select('id');
      const userIds = (allUsers || []).map(u => u.id);
      for (const badge of dateAwardBadges) {
        const count = await bulkAwardBadge(badge.id, userIds);
        results.dateAwards.push({ id: badge.id, name: badge.name, awarded: count });
      }
    }

    // ── Period-end badges — tied to bingo_months.end_date ────────────────────
    const { data: endedMonths, error } = await supabase
      .from('bingo_months')
      .select('id, season_id, year_id')
      .eq('end_date', yesterdayStr);
    if (error) throw error;

    // ── Purge expired approval_history images ─────────────────────────────────
    try {
      const { data: expiredHistory } = await supabase
        .from('approval_history')
        .select('id, proof_url, proof_url2')
        .lt('purge_after', new Date().toISOString())
        .or('proof_url.not.is.null,proof_url2.not.is.null');

      if (expiredHistory?.length) {
        const urlsToPurge = expiredHistory.flatMap(h => [h.proof_url, h.proof_url2].filter(Boolean));
        await deleteR2Images(urlsToPurge);
        const ids = expiredHistory.map(h => h.id);
        await supabase.from('approval_history').update({ proof_url: null, proof_url2: null }).in('id', ids);
        results.purgedHistory = expiredHistory.length;
        console.log(`period-end: purged images for ${expiredHistory.length} approval_history records`);
      }
    } catch (purgeErr) {
      console.error('Failed to purge approval_history images (non-fatal):', purgeErr.message);
    }

    if (!endedMonths?.length && !dateAwardBadges?.length) {
      console.log(`period-end: nothing to process on ${todayStr}`);
      return res.status(200).json({ message: 'Nothing to process', purgedHistory: results.purgedHistory });
    }

    const doneSeasons = new Set();
    const doneYears   = new Set();

    for (const month of endedMonths) {
      results.months.push({ id: month.id, awarded: await processMonthEnd(month.id) });

      if (month.season_id && !doneSeasons.has(month.season_id)) {
        const { count } = await supabase
          .from('bingo_months').select('*', { count: 'exact', head: true })
          .eq('season_id', month.season_id).gt('end_date', yesterdayStr);
        if (count === 0) {
          doneSeasons.add(month.season_id);
          results.seasons.push({ id: month.season_id, awarded: await processSeasonEnd(month.season_id) });
        }
      }

      if (month.year_id && !doneYears.has(month.year_id)) {
        const { count } = await supabase
          .from('bingo_months').select('*', { count: 'exact', head: true })
          .eq('year_id', month.year_id).gt('end_date', yesterdayStr);
        if (count === 0) {
          doneYears.add(month.year_id);
          results.years.push({ id: month.year_id, awarded: await processYearEnd(month.year_id) });
        }
      }
    }

    console.log('period-end results:', JSON.stringify(results));
    res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('period-end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Bulk badge award helper ───────────────────────────────────────────────────
// Awards a single badge to multiple users at once, skipping already-earned ones.
// Returns the count of newly awarded badges.
async function bulkAwardBadge(badgeId, userIds) {
  if (!userIds?.length) return 0;

  const { data: alreadyEarned } = await supabase
    .from('user_badges').select('user_id')
    .eq('badge_id', badgeId).in('user_id', userIds);

  const earnedSet = new Set((alreadyEarned || []).map(e => e.user_id));
  const newUsers  = userIds.filter(id => !earnedSet.has(id));
  if (!newUsers.length) return 0;

  const { data: inserted, error } = await supabase
    .from('user_badges')
    .insert(newUsers.map(user_id => ({ user_id, badge_id: badgeId })))
    .select('user_id');
  if (error) { console.error(`bulkAwardBadge error (badge ${badgeId}):`, error.message); return 0; }

  if (inserted?.length) {
    const { data: badgeDetails } = await supabase
      .from('badges').select('id, name, description, image_url, is_secret')
      .eq('id', badgeId).single();
    if (badgeDetails) {
      await Promise.all(
        inserted.map(({ user_id }) =>
          broadcastUpdate(`badge-awards-${user_id}`, 'badge-earned', badgeDetails)
            .catch(e => console.error(`Badge broadcast failed for ${user_id}:`, e.message))
        )
      );
    }
  }
  return inserted?.length ?? 0;
}

// ── R2 image deletion helper (fire-and-forget safe) ──────────────────────────
// Deletes one or more R2-hosted proof images. Never throws to the caller.
async function deleteR2Images(imageUrls) {
  if (!imageUrls?.length) return;
  try {
    const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID;
    const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID;
    const R2_BUCKET_NAME       = process.env.R2_BUCKET_NAME || 'shiny-sprites';
    const R2_BUCKET_URL        = process.env.R2_BUCKET_URL;

    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
      console.warn('R2 credentials not configured, skipping image deletion');
      return;
    }
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
    for (const imageUrl of imageUrls) {
      const key = imageUrl.replace(`${R2_BUCKET_URL}/`, '');
      console.log('Deleting R2 object:', key);
      await s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
      console.log('Successfully deleted:', key);
    }
  } catch (r2Error) {
    console.error('Error deleting images from R2 (non-fatal):', r2Error);
  }
}

// ── Period-end processors ─────────────────────────────────────────────────────
async function processMonthEnd(monthId) {
  const awarded = {};
  const { data: badges } = await supabase.from('badges').select('id, name, check_type, check_value, check_qualifier')
    .eq('trigger', 'period_end').in('check_type', ['approved_count_in_month', 'top_placement_month']);
  if (!badges?.length) return awarded;

  for (const { id, name, check_type, check_value, check_qualifier } of badges) {
    // For top_placement types a blank qualifier means "any period" — skip period filter.
    // For approved_count types the qualifier is always required.
    const anyPeriod = !check_qualifier;
    if (!anyPeriod && Number(check_qualifier) !== monthId) continue;
    let userIds = [];
    if (check_type === 'approved_count_in_month') {
      const { data } = await supabase.rpc('users_with_min_entries_in_month', { p_month_id: monthId, p_min_count: check_value });
      userIds = (data || []).map(r => r.user_id);
    } else {
      const { data } = await supabase.rpc('rank_users_by_month_points', { p_month_id: monthId, p_max_rank: check_value });
      userIds = (data || []).map(r => r.user_id);
    }
    const count = await bulkAwardBadge(id, userIds);
    if (count > 0) awarded[name] = count;
  }
  return awarded;
}

async function processSeasonEnd(seasonId) {
  const awarded = {};
  const { data: badges } = await supabase.from('badges').select('id, name, check_type, check_value, check_qualifier')
    .eq('trigger', 'period_end').in('check_type', ['approved_count_in_season', 'top_placement_season']);
  if (!badges?.length) return awarded;

  for (const { id, name, check_type, check_value, check_qualifier } of badges) {
    const anyPeriod = !check_qualifier;
    if (!anyPeriod && Number(check_qualifier) !== seasonId) continue;
    let userIds = [];
    if (check_type === 'approved_count_in_season') {
      const { data } = await supabase.rpc('users_with_min_entries_in_season', { p_season_id: seasonId, p_min_count: check_value });
      userIds = (data || []).map(r => r.user_id);
    } else {
      const { data } = await supabase.rpc('rank_users_by_season_points', { p_season_id: seasonId, p_max_rank: check_value });
      userIds = (data || []).map(r => r.user_id);
    }
    const count = await bulkAwardBadge(id, userIds);
    if (count > 0) awarded[name] = count;
  }
  return awarded;
}

async function processYearEnd(yearId) {
  const awarded = {};
  const { data: badges } = await supabase.from('badges').select('id, name, check_type, check_value, check_qualifier')
    .eq('trigger', 'period_end').in('check_type', ['approved_count_in_year', 'top_placement_year']);
  if (!badges?.length) return awarded;

  for (const { id, name, check_type, check_value, check_qualifier } of badges) {
    const anyPeriod = !check_qualifier;
    if (!anyPeriod && Number(check_qualifier) !== yearId) continue;
    let userIds = [];
    if (check_type === 'approved_count_in_year') {
      const { data } = await supabase.rpc('users_with_min_entries_in_year', { p_year_id: yearId, p_min_count: check_value });
      userIds = (data || []).map(r => r.user_id);
    } else {
      const { data } = await supabase.rpc('rank_users_by_year_points', { p_year_id: yearId, p_max_rank: check_value });
      userIds = (data || []).map(r => r.user_id);
    }
    const count = await bulkAwardBadge(id, userIds);
    if (count > 0) awarded[name] = count;
  }
  return awarded;
}

// SSE connections manager
const sseClients = new Map(); // userId -> Set of response objects
const sseAnonymousClients = new Set(); // Set of anonymous response objects
const approvalsInProgress = new Set(); // approval IDs currently being processed (spam-click guard)

function sendSSEToUser(userId, event, data) {
  const clients = sseClients.get(userId);
  if (clients) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => {
      try {
        client.write(message);
      } catch (err) {
        console.error('Error sending SSE:', err);
      }
    });
  }
}

function broadcastSSE(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  // Send to authenticated users
  sseClients.forEach((clients) => {
    clients.forEach(client => {
      try {
        client.write(message);
      } catch (err) {
        console.error('Error broadcasting SSE:', err);
      }
    });
  });
  
  // Send to anonymous users
  sseAnonymousClients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      console.error('Error broadcasting SSE to anonymous:', err);
    }
  });
}

// DEVELOPMENT ONLY: Auth bypass middleware
const DEV_USER_ID = process.env.DEBUG_USER_ID;
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const isDev = process.env.NODE_ENV !== 'production' && DEV_USER_ID && authHeader === 'Bearer dev_token';
  
  if (isDev) {
    console.log('🔧 Dev token detected - bypassing auth for user:', DEV_USER_ID);
    req.devUserId = DEV_USER_ID;
  }
  
  next();
});

// When avatar_url is null on a profile fetch, look up the user's Discord identity via the
// Supabase admin API and reconstruct the Discord CDN URL from their stored identity data.
// Updates the users table and returns the fresh URL (or null if unavailable).
async function refreshAvatarFromDiscord(userId) {
  try {
    const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !user) return null;

    const discordIdentity = user.identities?.find(i => i.provider === 'discord');
    if (!discordIdentity) return null;

    // identity_data.avatar_url is set by Supabase from the last Discord OAuth exchange
    const avatarUrl = discordIdentity.identity_data?.avatar_url;
    if (!avatarUrl) return null;

    await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
    console.log(`[avatar-sync] Refreshed Discord avatar for user ${userId}`);
    return avatarUrl;
  } catch (err) {
    console.error('[avatar-sync] Discord refresh failed (non-fatal):', err.message);
    return null;
  }
}

// Helper function to get authenticated user ID
async function getAuthenticatedUserId(req) {
  // Check for dev bypass first
  if (req.devUserId) {
    return req.devUserId;
  }

  // Normal Supabase auth
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (user && !authError) {
      return user.id;
    }
  } catch (err) {
    console.log('Auth check failed');
  }

  return null;
}

// Helper function to get active month ID based on current date (with optional time offset for moderators)
// Returns the full active month record { id, month_year_display, start_date, end_date }, or null
async function getActiveMonth(userId = null) {
  const now = new Date();

  // Mod users with a time offset always bypass the cache (their effective date differs)
  if (userId) {
    const { data: userData } = await supabase
      .from('users')
      .select('time_offset_days')
      .eq('id', userId)
      .single();

    const timeOffsetDays = userData?.time_offset_days || 0;
    if (timeOffsetDays !== 0) {
      const effectiveDate = new Date(now.getTime() + timeOffsetDays * 86400000);
      const effectiveDateISO = effectiveDate.toISOString();
      console.log('Getting active month (mod offset) - User:', userId, 'Offset days:', timeOffsetDays, 'Effective date:', effectiveDateISO);
      const { data, error } = await supabase
        .from('bingo_months')
        .select('id, month_year_display, start_date, end_date')
        .lte('start_date', effectiveDateISO)
        .gte('end_date', effectiveDateISO)
        .single();
      if (error || !data) { console.error('No active month found (mod):', error); return null; }
      return data;
    }
  }

  // Offset now by -2 hours so bare end_dates (stored as midnight UTC) effectively expire 2 hours later
  const offsetNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const nowISO = offsetNow.toISOString();

  // Cache hit: valid as long as we haven't passed the month's end_date (+2h offset)
  if (activeMonthCache && offsetNow < new Date(activeMonthCache.end_date)) {
    return activeMonthCache;
  }

  // Cache miss or expired — fetch from DB and cache the result
  console.log('Fetching active month from DB - date:', nowISO);
  const { data: activeMonthData, error: monthError } = await supabase
    .from('bingo_months')
    .select('id, month_year_display, start_date, end_date')
    .lte('start_date', nowISO)
    .gte('end_date', nowISO)
    .single();

  if (monthError || !activeMonthData) {
    console.error('No active month found for date:', nowISO, monthError);
    return null;
  }

  activeMonthCache = activeMonthData;
  console.log('Active month cached:', activeMonthData.id);
  return activeMonthData;
}

// Convenience wrapper for callers that only need the month ID
async function getActiveMonthId(userId = null) {
  const month = await getActiveMonth(userId);
  return month?.id ?? null;
}

// Fetch (or return cached) Twitch client-credentials access token.
// The token is valid ~60 days; we cache it until 1 hour before expiry.
async function getTwitchToken() {
  if (twitchTokenCache.token && Date.now() < twitchTokenCache.expiresAt) {
    return twitchTokenCache.token;
  }
  const clientId     = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res  = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
  });
  const data = await res.json();
  if (!data.access_token) return null;
  // Cache until 1 hour before the token actually expires
  twitchTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 3600) * 1000 };
  return data.access_token;
}

// Validate an API key (pb_xxx) and return its owner's user_id, or null if invalid.
// Updates last_used_at fire-and-forget. Result cached for 60s.
async function validateApiKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('pb_')) return null;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const cached = apiKeyCache.get(hash);
  if (cached && Date.now() < cached.expiresAt) return cached.userId;
  const { data } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!data) return null;
  apiKeyCache.set(hash, { userId: data.user_id, expiresAt: Date.now() + API_KEY_CACHE_TTL });
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
  return data.user_id;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Streaming Bingo API is running' });
});

// SSE endpoint for real-time notifications
app.get('/api/events', async (req, res) => {
  const userId = await getAuthenticatedUserId(req);

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  
  // Add this client to the connections map
  if (userId) {
    // Authenticated user
    if (!sseClients.has(userId)) {
      sseClients.set(userId, new Set());
    }
    sseClients.get(userId).add(res);
  } else {
    // Anonymous user
    sseAnonymousClients.add(res);
  }
  
  const totalClients = Array.from(sseClients.values()).reduce((sum, set) => sum + set.size, 0) + sseAnonymousClients.size;
  console.log(`SSE client connected: ${userId || 'anonymous'}. Total clients: ${totalClients}`);
  
  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to notification stream', authenticated: !!userId })}\n\n`);
  
  // Send keepalive every 30 seconds to prevent timeout
  const keepaliveInterval = setInterval(() => {
    try {
      res.write(`:keepalive ${Date.now()}\n\n`);
    } catch (err) {
      clearInterval(keepaliveInterval);
    }
  }, 30000);
  
  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(keepaliveInterval);
    
    if (userId) {
      const userClients = sseClients.get(userId);
      if (userClients) {
        userClients.delete(res);
        if (userClients.size === 0) {
          sseClients.delete(userId);
        }
      }
    } else {
      sseAnonymousClients.delete(res);
    }
    
    const totalClients = Array.from(sseClients.values()).reduce((sum, set) => sum + set.size, 0) + sseAnonymousClients.size;
    console.log(`SSE client disconnected: ${userId || 'anonymous'}. Total clients: ${totalClients}`);
  });
});

// Debug endpoint to check database state (dev only)
app.get('/api/debug/data', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { data: points, error: pointsError } = await supabase
      .from('user_monthly_points')
      .select('*')
      .limit(10);
    
    const { data: achievements, error: achievementsError } = await supabase
      .from('bingo_achievements')
      .select('*')
      .limit(10);
    
    res.json({
      user_monthly_points: {
        count: points?.length || 0,
        data: points || [],
        error: pointsError
      },
      bingo_achievements: {
        count: achievements?.length || 0,
        data: achievements || [],
        error: achievementsError
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bingo board (public or user-specific)
app.get('/api/bingo/board', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);

    const monthData = await getActiveMonth(userId);
    if (!monthData) {
      return res.status(404).json({ error: 'No active bingo month found' });
    }
    const ACTIVE_MONTH_ID = monthData.id;

    // Fetch user-specific and achievement data in parallel (changes every request)
    const [
      { data: entries },
      { data: approvals },
      { data: bingoAchievements }
    ] = await Promise.all([
      userId
        ? supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
        : Promise.resolve({ data: [] }),
      userId
        ? supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      supabase.from('bingo_achievements').select('bingo_type, users!bingo_achievements_user_id_fkey(display_name)').eq('month_id', ACTIVE_MONTH_ID),
    ]);

    const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
    const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
    const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
    const pendingPokemonIds = new Set((approvals || []).map(a => a.pokemon_id));
    const pendingRestrictedIds = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));

    // Use cached pool + pokemon data if still on the same month; otherwise re-fetch
    if (pokemonPoolCache.monthId !== ACTIVE_MONTH_ID) {
      const { data: poolData, error: poolError } = await supabase
        .from('monthly_pokemon_pool')
        .select('position, pokemon_id')
        .eq('month_id', ACTIVE_MONTH_ID)
        .order('position', { ascending: true });

      if (poolError) throw poolError;

      const pokemonIds = (poolData || []).map(p => p.pokemon_id).filter(Boolean);
      const { data: pokemonData, error: pokemonError } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, img_url')
        .in('id', pokemonIds)
        .eq('shiny_available', true);

      if (pokemonError) throw pokemonError;

      const newPokemonMap = {};
      (pokemonData || []).forEach(p => { newPokemonMap[p.id] = p; });
      const newPoolByPosition = {};
      (poolData || []).forEach(pool => { newPoolByPosition[pool.position] = pool; });

      pokemonPoolCache = { monthId: ACTIVE_MONTH_ID, poolByPosition: newPoolByPosition, pokemonMap: newPokemonMap };
    }

    const { poolByPosition, pokemonMap } = pokemonPoolCache;

    // Build the 25-square board (24 Pokemon + 1 free space at position 13)
    const board = [];

    for (let position = 1; position <= 25; position++) {
      if (position === 13) {
        // Free space at position 13
        board.push({
          id: `free-space-${ACTIVE_MONTH_ID}`,
          position: 13,
          national_dex_id: null,
          is_checked: true, // Free space is always checked
          is_pending: false,
          pokemon_name: 'FREE SPACE',
          pokemon_gif: null,
        });
      } else {
        const pool = poolByPosition[position];
        const poke = pool ? pokemonMap[pool.pokemon_id] : null;
        if (poke) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pool.pokemon_id,
            national_dex_id: poke.national_dex_id,
            is_checked: completedPokemonIds.has(pool.pokemon_id),
            is_restricted: restrictedPokemonIds.has(pool.pokemon_id),
            is_historical: historicalPokemonIds.has(pool.pokemon_id),
            is_pending: !completedPokemonIds.has(pool.pokemon_id) && pendingPokemonIds.has(pool.pokemon_id),
            is_pending_restricted: completedPokemonIds.has(pool.pokemon_id) && !restrictedPokemonIds.has(pool.pokemon_id) && pendingRestrictedIds.has(pool.pokemon_id),
            pokemon_name: poke.name || 'Unknown',
            pokemon_gif: poke.img_url,
          });
        } else {
          board.push({
            id: `empty-${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pool?.pokemon_id ?? null,
            national_dex_id: null,
            is_checked: false,
            is_restricted: false,
            is_historical: false,
            is_pending: false,
            is_pending_restricted: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }

    // Build achievements map from the already-fetched bingoAchievements
    let achievements = { row: null, column: null, x: null, blackout: null };
    if (bingoAchievements) {
      const find = type => bingoAchievements.find(a => a.bingo_type === type);
      const name = a => a?.users?.display_name ?? null;
      achievements = {
        row:                name(find('row')),
        column:             name(find('column')),
        x:                  name(find('x')),
        blackout:           name(find('blackout')),
        row_restricted:     name(find('row_restricted')),
        column_restricted:  name(find('column_restricted')),
        x_restricted:       name(find('x_restricted')),
        blackout_restricted: name(find('blackout_restricted')),
      };
    }
    
    const responseData = {
      month: monthData.month_year_display,
      start_date: monthData.start_date,
      end_date: monthData.end_date,
      board: board,
      user_authenticated: !!userId,
      achievements
    };
    
    res.set('Cache-Control', 'no-store');
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching bingo board:', error);
    res.status(500).json({ error: 'Failed to fetch bingo board', details: error.message });
  }
});

// Batch-fetches badge slots 1–3 for a list of users and attaches them as badge_slots[]
async function enrichWithBadgeSlots(users) {
  const userIds = users.map(u => u.user_id).filter(Boolean);
  if (userIds.length === 0) return users;
  const { data: slots } = await supabase
    .from('user_badges')
    .select('user_id, slot, badges(id, name, image_url, family)')
    .in('user_id', userIds)
    .not('slot', 'is', null)
    .lte('slot', 3)
    .order('slot', { ascending: true });
  const slotsByUser = {};
  (slots || []).forEach(row => {
    if (!slotsByUser[row.user_id]) slotsByUser[row.user_id] = [];
    slotsByUser[row.user_id].push({ slot: row.slot, badge: row.badges });
  });
  return users.map(u => ({
    ...u,
    badge_slots: (slotsByUser[u.user_id] || [])
      .sort((a, b) => a.slot - b.slot)
      .map(s => s.badge)
      .filter(Boolean),
  }));
}

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const VALID_MODES = ['monthly', 'alltime', 'season', 'year'];
    const mode = VALID_MODES.includes(req.query.mode) ? req.query.mode : 'monthly';

    // Pre-fetch the active month for non-alltime modes — getActiveMonth is module-level
    // cached so this is cheap, and we need it for both the cache key and branch logic.
    const preloadedMonth = (mode !== 'alltime') ? await getActiveMonth(userId) : null;
    if (mode !== 'alltime' && !preloadedMonth) {
      return res.status(404).json({ error: 'No active month found' });
    }
    const cacheKey = preloadedMonth ? `${mode}:${preloadedMonth.id}` : 'alltime';

    // Return cached leaderboard if still fresh
    const cached = leaderboardCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json(cached.data);
    }

    // ── ALL-TIME BRANCH ──────────────────────────────────────────────────────
    if (mode === 'alltime') {

      // Sum points across all months per user
      const { data: allPoints, error: allPointsError } = await supabase
        .from('user_monthly_points')
        .select('user_id, points, last_updated');

      if (allPointsError) throw allPointsError;

      // Aggregate in JS — track earliest last_updated per user as tiebreaker
      const pointsByUser = {};
      const firstUpdatedByUser = {};
      allPoints.forEach(row => {
        pointsByUser[row.user_id] = (pointsByUser[row.user_id] || 0) + row.points;
        if (!firstUpdatedByUser[row.user_id] || row.last_updated < firstUpdatedByUser[row.user_id]) {
          firstUpdatedByUser[row.user_id] = row.last_updated;
        }
      });

      // Sort: higher points first; ties broken by who reached that score first
      const top10 = Object.entries(pointsByUser)
        .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1))
        .map(([user_id, points]) => ({ user_id, points }));

      if (top10.length === 0) {
        return res.json([]);
      }

      const userIds = top10.map(u => u.user_id);

      // Fetch user info, achievements, and hex codes in parallel
      const [
        { data: usersData, error: usersError },
        { data: allAchievements },
        { data: ambassadors },
      ] = await Promise.all([
        supabase.from('users').select('id, username, display_name, created_at, twitch_url').in('id', userIds),
        supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds),
        supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds),
      ]);

      if (usersError) throw usersError;

      const usersMap = {};
      usersData.forEach(u => { usersMap[u.id] = u; });

      const achievementCounts = {};
      if (allAchievements) {
        allAchievements.forEach(ach => {
          if (!achievementCounts[ach.user_id]) {
            achievementCounts[ach.user_id] = { row: 0, column: 0, x: 0, blackout: 0 };
          }
          achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
        });
      }

      const hexCodeMap = {};
      if (ambassadors) ambassadors.forEach(a => { hexCodeMap[a.id] = a.hex_code || '#9147ff'; });

      // Twitch live status
      const liveStatusMap = {};
      try {
        const twitchUsers = top10.filter(u => usersMap[u.user_id]?.twitch_url);
        const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
        if (access_token) {
          const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
          const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
          const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          }).then(r => r.json());
          const twitchIds = twitchApiUsers?.map(u => u.id) || [];
          if (twitchIds.length > 0) {
            const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            }).then(r => r.json());
            streams?.forEach(stream => {
              const u = twitchApiUsers.find(u => u.id === stream.user_id);
              if (u) liveStatusMap[u.login.toLowerCase()] = true;
            });
          }
        }
      } catch (err) {
        console.error('Twitch live check error (alltime):', err);
      }

      const transformedAllTime = top10.map((entry, index) => {
        const u = usersMap[entry.user_id] || {};
        const username = u.twitch_url ? u.twitch_url.split('/').pop().toLowerCase() : null;
        return {
          id: entry.user_id,
          user_id: entry.user_id,
          username: u.username,
          display_name: u.display_name,
          points: entry.points,
          rank: index + 1,
          created_at: u.created_at,
          twitch_url: index < 10 ? u.twitch_url : null,
          is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
          achievement_counts: achievementCounts[entry.user_id] || { row: 0, column: 0, x: 0, blackout: 0 },
          hex_code: hexCodeMap[entry.user_id] || '#9147ff'
        };
      });

      const enrichedAllTime = await enrichWithBadgeSlots(transformedAllTime);
      leaderboardCache.set(cacheKey, { data: enrichedAllTime, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
      res.set('Cache-Control', 'no-store');
      return res.json(enrichedAllTime);
    }

    // ── SEASON / YEAR BRANCH ─────────────────────────────────────────────────
    if (mode === 'season' || mode === 'year') {

      // preloadedMonth was fetched before the cache check — reuse it here
      const activeMonth = preloadedMonth;
      const ACTIVE_MONTH_ID = activeMonth.id;

      // Compute game year (March → February) and seasonal quarter from start_date
      const ad        = new Date(activeMonth.start_date + 'T00:00:00Z');
      const aMon      = ad.getUTCMonth() + 1; // 1-12
      const aYear     = ad.getUTCFullYear();
      const gameYear  = aMon >= 3 ? aYear : aYear - 1;
      // 0=Winter(Dec/Jan/Feb) 1=Spring(Mar-May) 2=Summer(Jun-Aug) 3=Fall(Sep-Nov)
      const activeQ   = aMon >= 3 && aMon <= 5  ? 1
                      : aMon >= 6 && aMon <= 8  ? 2
                      : aMon >= 9 && aMon <= 11 ? 3
                      : 0;

      // Fetch all months in this game year (Mar {gameYear} – Feb {gameYear+1})
      const { data: yearMonthRows, error: yearMonthsError } = await supabase
        .from('bingo_months')
        .select('id, start_date')
        .gte('start_date', `${gameYear}-03-01`)
        .lt('start_date', `${gameYear + 1}-03-01`);

      if (yearMonthsError) throw yearMonthsError;

      // For 'season' further filter to the same quarter
      const monthIds = (yearMonthRows || []).filter(m => {
        if (mode === 'year') return true;
        const d  = new Date(m.start_date + 'T00:00:00Z');
        const mn = d.getUTCMonth() + 1;
        const q  = mn >= 3 && mn <= 5  ? 1
                 : mn >= 6 && mn <= 8  ? 2
                 : mn >= 9 && mn <= 11 ? 3
                 : 0;
        return q === activeQ;
      }).map(m => m.id);

      // Sum points across those months
      const { data: groupPoints, error: groupPointsError } = await supabase
        .from('user_monthly_points')
        .select('user_id, points, last_updated')
        .in('month_id', monthIds);

      if (groupPointsError) throw groupPointsError;

      // Aggregate — track earliest last_updated per user as tiebreaker (consistent with monthly branch)
      const pointsByUser = {};
      const firstUpdatedByUser = {};
      groupPoints.forEach(row => {
        pointsByUser[row.user_id] = (pointsByUser[row.user_id] || 0) + row.points;
        if (!firstUpdatedByUser[row.user_id] || row.last_updated < firstUpdatedByUser[row.user_id]) {
          firstUpdatedByUser[row.user_id] = row.last_updated;
        }
      });

      // Sort: higher points first; ties broken by who reached that score first
      const sorted = Object.entries(pointsByUser)
        .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1))
        .map(([user_id, points]) => ({ user_id, points }));

      if (sorted.length === 0) {
        return res.json([]);
      }

      const userIds = sorted.map(u => u.user_id);

      // Fetch user info, achievements, and hex codes in parallel
      const [
        { data: usersData, error: usersError },
        { data: groupAchievements },
        { data: ambassadors },
      ] = await Promise.all([
        supabase.from('users').select('id, username, display_name, created_at, twitch_url').in('id', userIds),
        supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds).in('month_id', monthIds),
        supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds),
      ]);

      if (usersError) throw usersError;

      const usersMap = {};
      usersData.forEach(u => { usersMap[u.id] = u; });

      const achievementCounts = {};
      if (groupAchievements) {
        groupAchievements.forEach(ach => {
          if (!achievementCounts[ach.user_id]) achievementCounts[ach.user_id] = {};
          achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
        });
      }

      const hexCodeMap = {};
      if (ambassadors) ambassadors.forEach(a => { hexCodeMap[a.id] = a.hex_code || '#9147ff'; });

      // Twitch live status
      const liveStatusMap = {};
      try {
        const twitchUsers = sorted.filter(u => usersMap[u.user_id]?.twitch_url);
        const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
        if (access_token) {
          const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
          const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
          const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          }).then(r => r.json());
          const twitchIds = twitchApiUsers?.map(u => u.id) || [];
          if (twitchIds.length > 0) {
            const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            }).then(r => r.json());
            streams?.forEach(stream => {
              const u = twitchApiUsers.find(u => u.id === stream.user_id);
              if (u) liveStatusMap[u.login.toLowerCase()] = true;
            });
          }
        }
      } catch (err) {
        console.error(`Twitch live check error (${mode}):`, err);
      }

      const result = sorted.map((entry, index) => {
        const u = usersMap[entry.user_id] || {};
        const username = u.twitch_url ? u.twitch_url.split('/').pop().toLowerCase() : null;
        return {
          id: entry.user_id,
          user_id: entry.user_id,
          username: u.username,
          display_name: u.display_name,
          points: entry.points,
          rank: index + 1,
          created_at: u.created_at,
          twitch_url: index < 10 ? u.twitch_url : null,
          is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
          achievement_counts: achievementCounts[entry.user_id] || {},
          hex_code: hexCodeMap[entry.user_id] || '#9147ff'
        };
      });

      const enrichedResult = await enrichWithBadgeSlots(result);
      leaderboardCache.set(cacheKey, { data: enrichedResult, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
      res.set('Cache-Control', 'no-store');
      return res.json(enrichedResult);
    }

    // ── MONTHLY BRANCH ───────────────────────────────────────────────────────
    // preloadedMonth was fetched before the cache check — reuse it here
    const ACTIVE_MONTH_ID = preloadedMonth.id;


    // Get monthly leaderboard
    const { data: monthlyData, error: monthlyError } = await supabase
      .from('user_monthly_points')
      .select(`
        id,
        user_id,
        points,
        users!user_monthly_points_user_id_fkey (
          username,
          display_name,
          created_at,
          twitch_url
        )
      `)
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('points', { ascending: false })
      .order('last_updated', { ascending: true }); // tiebreaker: reached score first
    
    if (monthlyError) throw monthlyError;
    const data = monthlyData;

    const userIds = data.map(entry => entry.user_id);

    // Fetch achievements and hex codes in parallel
    const [
      { data: achievements },
      { data: ambassadors },
    ] = await Promise.all([
      userIds.length > 0
        ? supabase.from('bingo_achievements').select('user_id, bingo_type').in('user_id', userIds).eq('month_id', ACTIVE_MONTH_ID)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('twitch_ambassadors').select('id, hex_code').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const achievementCounts = {};
    if (achievements) {
      achievements.forEach(ach => {
        if (!achievementCounts[ach.user_id]) {
          achievementCounts[ach.user_id] = { row: 0, column: 0, x: 0, blackout: 0 };
        }
        achievementCounts[ach.user_id][ach.bingo_type] = (achievementCounts[ach.user_id][ach.bingo_type] || 0) + 1;
      });
    }

    const dataWithAchievements = data.map(entry => ({
      ...entry,
      achievement_counts: achievementCounts[entry.user_id] || { row: 0, column: 0, x: 0, blackout: 0 }
    }));

    const hexCodeMap = {};
    if (ambassadors) {
      ambassadors.forEach(amb => { hexCodeMap[amb.id] = amb.hex_code || '#9147ff'; });
    }
    
    // Check Twitch live status
    const twitchUsers = dataWithAchievements.filter(entry => entry.users.twitch_url);
    const liveStatusMap = {};
    try {
      const access_token = twitchUsers.length > 0 ? await getTwitchToken() : null;
      if (access_token) {
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const usernames = twitchUsers.map(u => u.users.twitch_url.split('/').pop().toLowerCase());
        const { data: twitchApiUsers } = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
          headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
        }).then(r => r.json());
        const twitchIds = twitchApiUsers?.map(u => u.id) || [];
        if (twitchIds.length > 0) {
          const { data: streams } = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          }).then(r => r.json());
          streams?.forEach(stream => {
            const user = twitchApiUsers.find(u => u.id === stream.user_id);
            if (user) liveStatusMap[user.login.toLowerCase()] = true;
          });
        }
      }
    } catch (err) {
      console.error('Twitch live check error (monthly):', err);
    }
    
    const transformedData = dataWithAchievements.map((entry, index) => {
      const username = entry.users.twitch_url ? entry.users.twitch_url.split('/').pop().toLowerCase() : null;
      return {
        id: entry.id,
        user_id: entry.user_id,
        username: entry.users.username,
        display_name: entry.users.display_name,
        points: entry.points,
        rank: index + 1,
        created_at: entry.users.created_at,
        twitch_url: index < 10 ? entry.users.twitch_url : null,
        is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
        achievement_counts: entry.achievement_counts || { row: 0, column: 0, x: 0, blackout: 0 },
        hex_code: hexCodeMap[entry.user_id] || '#9147ff'
      };
    });

    const enrichedData = await enrichWithBadgeSlots(transformedData);
    leaderboardCache.set(cacheKey, { data: enrichedData, expiresAt: Date.now() + LEADERBOARD_CACHE_TTL });
    res.set('Cache-Control', 'no-store');
    res.json(enrichedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard', details: error.message });
  }
});

// Get user profile stats
app.get('/api/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Fetching profile for user:', userId);
    
    // Fetch all independent data in parallel
    const [
      { data: userData, error: userError },
      { count: totalShinies, error: shiniesError },
      { data: monthlyPoints, error: monthlyError },
      { data: allMonthlyPoints, error: rankError },
      { data: allBingos },
      { data: allEntries },
      { data: allPokemonData },
    ] = await Promise.all([
      supabase.from('users').select('username, display_name, avatar_url, created_at').eq('id', userId).single(),
      supabase.from('entries').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('user_monthly_points').select('points, month_id, bingo_months!inner(month_year_display)').eq('user_id', userId).order('month_id', { ascending: true }),
      supabase.from('user_monthly_points').select('user_id, month_id, points, last_updated, bingo_months!inner(month_year_display)'),
      supabase.from('bingo_achievements').select('bingo_type').eq('user_id', userId),
      supabase.from('entries').select('pokemon_id').eq('user_id', userId),
      supabase.from('pokemon_master').select('id, type1, type2, generation').eq('shiny_available', true),
    ]);

    if (userError) throw userError;
    if (shiniesError) throw shiniesError;
    if (monthlyError) throw monthlyError;
    if (rankError) throw rankError;

    // If avatar_url is missing, try to recover it from the user's Discord identity
    if (userData && !userData.avatar_url) {
      const refreshed = await refreshAvatarFromDiscord(userId);
      if (refreshed) userData.avatar_url = refreshed;
    }

    // Calculate total points and find best month
    const totalPoints = (monthlyPoints || []).reduce((sum, month) => sum + month.points, 0);
    const bestPointsMonth = (monthlyPoints || []).reduce((best, month) =>
      month.points > (best?.points || 0) ? month : best, null);

    // Compute overall rank and best monthly rank from the single allMonthlyPoints query
    const userTotals = {};
    const firstUpdatedByUser = {};
    const monthlyRankings = {};
    (allMonthlyPoints || []).forEach(entry => {
      userTotals[entry.user_id] = (userTotals[entry.user_id] || 0) + entry.points;
      if (!firstUpdatedByUser[entry.user_id] || entry.last_updated < firstUpdatedByUser[entry.user_id]) {
        firstUpdatedByUser[entry.user_id] = entry.last_updated;
      }
      if (!monthlyRankings[entry.month_id]) monthlyRankings[entry.month_id] = [];
      monthlyRankings[entry.month_id].push(entry);
    });

    const sortedUsers = Object.entries(userTotals)
      .sort(([uidA, a], [uidB, b]) => b - a || (firstUpdatedByUser[uidA] < firstUpdatedByUser[uidB] ? -1 : 1));
    const overallRank = sortedUsers.findIndex(([id]) => id === userId) + 1;

    let bestRank = null;
    let bestRankMonth = null;
    Object.values(monthlyRankings).forEach(entries => {
      const sorted = entries.slice().sort((a, b) => b.points - a.points || (a.last_updated < b.last_updated ? -1 : 1));
      const userRank = sorted.findIndex(u => u.user_id === userId) + 1;
      if (userRank > 0 && (!bestRank || userRank < bestRank)) {
        bestRank = userRank;
        bestRankMonth = sorted.find(u => u.user_id === userId)?.bingo_months?.month_year_display;
      }
    });

    // Count bingo achievements from the single query
    const bingos = allBingos || [];
    const totalBingos = bingos.filter(b => b.bingo_type === 'row' || b.bingo_type === 'column').length;
    const totalXs = bingos.filter(b => b.bingo_type === 'x').length;
    const totalBlackouts = bingos.filter(b => b.bingo_type === 'blackout').length;
    const restrictedBingos = bingos.filter(b => b.bingo_type === 'row_restricted' || b.bingo_type === 'column_restricted').length;
    const restrictedXs = bingos.filter(b => b.bingo_type === 'x_restricted').length;
    const restrictedBlackouts = bingos.filter(b => b.bingo_type === 'blackout_restricted').length;

    const totalPokemon = allPokemonData ? allPokemonData.length : 0;
    const totalCaught = allEntries ? new Set(allEntries.map(e => e.pokemon_id)).size : 0;

    // Dex breakdown by type and generation
    const caughtIdSet = new Set(allEntries ? allEntries.map(e => e.pokemon_id) : []);
    const typeTotal = {}, typeCaughtMap = {};
    const genTotal = {}, genCaughtMap = {};
    (allPokemonData || []).forEach(p => {
      const isCaught = caughtIdSet.has(p.id);
      [p.type1, p.type2].filter(Boolean).forEach(t => {
        const type = t.charAt(0).toUpperCase() + t.slice(1);
        typeTotal[type] = (typeTotal[type] || 0) + 1;
        if (isCaught) typeCaughtMap[type] = (typeCaughtMap[type] || 0) + 1;
      });
      if (p.generation != null) {
        genTotal[p.generation] = (genTotal[p.generation] || 0) + 1;
        if (isCaught) genCaughtMap[p.generation] = (genCaughtMap[p.generation] || 0) + 1;
      }
    });
    const dexByType = Object.keys(typeTotal).sort().map(type => ({
      type, total: typeTotal[type], caught: typeCaughtMap[type] || 0
    }));
    const dexByGen = Object.keys(genTotal).map(Number).sort((a, b) => a - b).map(gen => ({
      gen, total: genTotal[gen], caught: genCaughtMap[gen] || 0
    }));

    // Format monthly data for graphs
    const monthlyData = monthlyPoints.map(month => ({
      month: month.bingo_months.month_year_display,
      points: month.points
    }));

    const monthsParticipated = monthlyPoints.length;
    const avgPointsPerMonth = monthsParticipated > 0 ? Math.round(totalPoints / monthsParticipated) : 0;

    const response = {
      user: userData,
      stats: {
        totalShinies: totalShinies || 0,
        overallRank,
        totalPoints,
        totalCaught: totalCaught || 0,
        totalPokemon: totalPokemon || 0,
        highestPointMonth: bestPointsMonth ? {
          month: bestPointsMonth.bingo_months.month_year_display,
          points: bestPointsMonth.points
        } : null,
        bestRankedMonth: bestRankMonth ? {
          month: bestRankMonth,
          rank: bestRank
        } : null,
        totalBingos,
        totalXs,
        totalBlackouts,
        restrictedBingos,
        restrictedXs,
        restrictedBlackouts,
        monthsParticipated,
        avgPointsPerMonth,
        dexByType,
        dexByGen,
      },
      monthlyData
    };
    
    console.log('Sending response with stats:', JSON.stringify(response.stats));
    res.json(response);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile', details: error.message });
  }
});

// Get user's current month board
app.get('/api/profile/:userId/board', async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = await getAuthenticatedUserId(req);

    // getActiveMonth returns the full record — no second bingo_months query needed
    const monthData = await getActiveMonth(viewerId);
    if (!monthData) {
      return res.status(404).json({ error: 'No active month found' });
    }
    const ACTIVE_MONTH_ID = monthData.id;

    // Fetch entries, approvals, and pool in parallel
    const [
      { data: entries, error: entriesError },
      { data: approvals, error: approvalsError },
      { data: poolData, error: poolError },
    ] = await Promise.all([
      supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId),
      supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
    ]);

    if (entriesError) throw entriesError;
    if (poolError) throw poolError;

    const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
    const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
    const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
    const pendingPokemonIds = new Set(
      (!approvalsError && approvals) ? approvals.map(a => a.pokemon_id) : []
    );
    const pendingRestrictedIds = new Set(
      (!approvalsError && approvals) ? approvals.filter(a => a.restricted_submission).map(a => a.pokemon_id) : []
    );

    // Get all pokemon details
    const pokemonIds = poolData.map(p => p.pokemon_id).filter(Boolean);

    const { data: pokemonData, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    // Build lookup maps
    const pokemonMap = {};
    (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

    const poolByPosition = {};
    (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

    // Build the 25-square board
    const board = [];
    for (let position = 1; position <= 25; position++) {
      if (position === 13) {
        board.push({
          id: `free-space-${ACTIVE_MONTH_ID}`,
          position: 13,
          national_dex_id: null,
          is_checked: true,
          is_pending: false,
          pokemon_name: 'FREE SPACE',
          pokemon_gif: null,
        });
      } else {
        const pool = poolByPosition[position];
        const poke = pool ? pokemonMap[pool.pokemon_id] : null;
        if (poke) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position,
            pokemon_id: pool.pokemon_id,
            national_dex_id: poke.national_dex_id,
            is_checked: completedPokemonIds.has(pool.pokemon_id),
            is_restricted: restrictedPokemonIds.has(pool.pokemon_id),
            is_historical: historicalPokemonIds.has(pool.pokemon_id),
            is_pending: !completedPokemonIds.has(pool.pokemon_id) && pendingPokemonIds.has(pool.pokemon_id),
            is_pending_restricted: completedPokemonIds.has(pool.pokemon_id) && !restrictedPokemonIds.has(pool.pokemon_id) && pendingRestrictedIds.has(pool.pokemon_id),
            pokemon_name: poke.name || 'Unknown',
            pokemon_gif: poke.img_url,
          });
        } else {
          board.push({
            id: `empty-${ACTIVE_MONTH_ID}-${position}`,
            position,
            pokemon_id: pool?.pokemon_id ?? null,
            national_dex_id: null,
            is_checked: false,
            is_restricted: false,
            is_historical: false,
            is_pending: false,
            is_pending_restricted: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }

    res.json({
      month: monthData.month_year_display,
      board,
    });
  } catch (error) {
    console.error('Error fetching profile board:', error);
    res.status(500).json({ error: 'Failed to fetch profile board', details: error.message });
  }
});

// Get list of past months a user participated in (has entries)
app.get('/api/profile/:userId/past-months', async (req, res) => {
  try {
    const { userId } = req.params;
    const activeMonth = await getActiveMonth(null);
    const activeMonthId = activeMonth?.id;

    const { data: entryRows, error: entriesError } = await supabase
      .from('entries')
      .select('month_id')
      .eq('user_id', userId);

    if (entriesError) throw entriesError;

    const monthIds = [...new Set((entryRows || []).map(e => e.month_id))]
      .filter(id => id !== activeMonthId);

    if (monthIds.length === 0) return res.json([]);

    const { data: months, error: monthsError } = await supabase
      .from('bingo_months')
      .select('id, month_year_display')
      .in('id', monthIds)
      .order('id', { ascending: false });

    if (monthsError) throw monthsError;

    res.json(months || []);
  } catch (err) {
    console.error('Error fetching past months:', err);
    res.status(500).json({ error: 'Failed to fetch past months' });
  }
});

// Get board state for a specific past month
app.get('/api/profile/:userId/board/:monthId', async (req, res) => {
  try {
    const { userId, monthId } = req.params;

    const [
      { data: monthData, error: monthError },
      { data: entries, error: entriesError },
      { data: poolData, error: poolError },
    ] = await Promise.all([
      supabase.from('bingo_months').select('id, month_year_display').eq('id', monthId).single(),
      supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', monthId),
      supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', monthId).order('position', { ascending: true }),
    ]);

    if (monthError || !monthData) return res.status(404).json({ error: 'Month not found' });
    if (entriesError) throw entriesError;
    if (poolError) throw poolError;

    const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
    const restrictedPokemonIds = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
    const historicalPokemonIds = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
    const pokemonIds = (poolData || []).map(p => p.pokemon_id).filter(Boolean);

    const { data: pokemonData, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    const pokemonMap = {};
    (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

    const poolByPosition = {};
    (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

    const board = [];
    for (let position = 1; position <= 25; position++) {
      if (position === 13) {
        board.push({
          id: `free-space-${monthId}`,
          position: 13,
          national_dex_id: null,
          is_checked: true,
          is_pending: false,
          pokemon_name: 'FREE SPACE',
          pokemon_gif: null,
        });
      } else {
        const pool = poolByPosition[position];
        const poke = pool ? pokemonMap[pool.pokemon_id] : null;
        if (poke) {
          board.push({
            id: `${monthId}-${position}`,
            position,
            pokemon_id: pool.pokemon_id,
            national_dex_id: poke.national_dex_id,
            is_checked: completedPokemonIds.has(pool.pokemon_id),
            is_restricted: restrictedPokemonIds.has(pool.pokemon_id),
            is_historical: historicalPokemonIds.has(pool.pokemon_id),
            is_pending: false,
            is_pending_restricted: false,
            pokemon_name: poke.name || 'Unknown',
            pokemon_gif: poke.img_url,
          });
        } else {
          board.push({
            id: `empty-${monthId}-${position}`,
            position,
            pokemon_id: pool?.pokemon_id ?? null,
            national_dex_id: null,
            is_checked: false,
            is_restricted: false,
            is_historical: false,
            is_pending: false,
            is_pending_restricted: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }

    res.json({ month: monthData.month_year_display, board });
  } catch (err) {
    console.error('Error fetching historical board:', err);
    res.status(500).json({ error: 'Failed to fetch board', details: err.message });
  }
});

// Get user's Pokedex (all pokemon with caught status)
app.get('/api/pokedex', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get all pokemon
    const { data: allPokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, display_name, img_url')
      .eq('shiny_available', true)
      .order('national_dex_id', { ascending: true })
      .order('id', { ascending: true });
    
    if (pokemonError) throw pokemonError;
    
    // Get user's caught pokemon (all entries, not just current month)
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id')
      .eq('user_id', userId);
    
    if (entriesError) throw entriesError;
    
    // Get months that have already started (exclude future months to avoid spoilers)
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    const { data: pastMonths, error: monthsError } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', today);

    if (monthsError) throw monthsError;

    const pastMonthIds = (pastMonths || []).map(m => m.id);

    // Get all Pokemon that have ever been in a past or current monthly pool
    const { data: poolPokemon, error: poolError } = pastMonthIds.length > 0
      ? await supabase
          .from('monthly_pokemon_pool')
          .select('pokemon_id')
          .in('month_id', pastMonthIds)
      : { data: [], error: null };

    if (poolError) throw poolError;
    
    // Create set of caught pokemon_ids
    const caughtIds = new Set(entries.map(e => e.pokemon_id));
    
    // Create set of pokemon_ids that have been in pools
    const poolIds = new Set(poolPokemon.map(p => p.pokemon_id));
    
    // Mark pokemon as caught or not, and if they've been in a pool
    const pokemon = allPokemon.map(p => ({
      id: p.id,
      national_dex_id: p.national_dex_id,
      name: p.name,
      display_name: p.display_name,
      img_url: p.img_url,
      caught: caughtIds.has(p.id),  // Check by pokemon_master.id
      in_pool: poolIds.has(p.id)     // Check if ever in monthly pool
    }));
    
    const caughtCount = pokemon.filter(p => p.caught).length;
    
    res.json({
      pokemon,
      caughtCount,
      totalCount: pokemon.length
    });
  } catch (error) {
    console.error('Error fetching pokedex:', error);
    res.status(500).json({ error: 'Failed to fetch pokedex', details: error.message });
  }
});

// Get Twitch ambassadors with live status
app.get('/api/ambassadors', async (req, res) => {
  try {
    // Get ambassadors from database
    const { data: ambassadors, error } = await supabase
      .from('twitch_ambassadors')
      .select(`
        id,
        twitch_url,
        hex_code,
        users!twitch_ambassadors_id_fkey (
          display_name
        )
      `);
    
    if (error) throw error;
    
    if (!ambassadors || ambassadors.length === 0) {
      return res.json([]);
    }
    
    // Extract Twitch usernames from URLs
    const twitchData = ambassadors.map(amb => {
      const username = amb.twitch_url.split('/').pop().toLowerCase();
      return {
        id: amb.id,
        username,
        display_name: amb.users?.display_name || username,
        twitch_url: amb.twitch_url,
        hex_code: amb.hex_code || '#9147ff' // Default to Twitch purple
      };
    });
    
    try {
      const access_token = await getTwitchToken();
      if (!access_token) {
        console.warn('Twitch API credentials not configured');
        return res.json(twitchData.map(amb => ({
          ...amb,
          profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
          is_live: false,
          brand_color: amb.hex_code
        })));
      }

      const headers = {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${access_token}`
      };
      
      // Get user info for all ambassadors
      const usernames = twitchData.map(amb => amb.username);
      const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, { headers });
      const usersData = await usersResponse.json();
      
      // Get streams for all users
      const userIds = usersData.data.map(u => u.id);
      const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${userIds.map(id => `user_id=${id}`).join('&')}`, { headers });
      const streamsData = await streamsResponse.json();
      
      // Create live status map
      const liveStreams = {};
      streamsData.data?.forEach(stream => {
        liveStreams[stream.user_id] = {
          is_live: true,
          viewer_count: stream.viewer_count
        };
      });
      
      // Create user info map
      const userInfo = {};
      usersData.data?.forEach(user => {
        userInfo[user.login.toLowerCase()] = {
          profile_image_url: user.profile_image_url,
          brand_color: user.broadcaster_type === 'partner' ? '#9147ff' : user.broadcaster_type === 'affiliate' ? '#9147ff' : '#808080'
        };
      });
      
      // Combine all data
      const result = twitchData.map(amb => ({
        ...amb,
        profile_image_url: userInfo[amb.username]?.profile_image_url || `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
          liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.is_live || false : false,
        viewer_count: usersData.data?.find(u => u.login.toLowerCase() === amb.username) ? 
          liveStreams[usersData.data.find(u => u.login.toLowerCase() === amb.username).id]?.viewer_count : undefined,
        brand_color: amb.hex_code // Use custom hex code from database
      }));
      
      result.sort((a, b) => {
        if (b.is_live !== a.is_live) return b.is_live ? 1 : -1;
        return (b.viewer_count || 0) - (a.viewer_count || 0);
      });

      res.json(result);
    } catch (twitchError) {
      console.error('Twitch API error:', twitchError);
      // Return basic data on Twitch API error
      return res.json(twitchData.map(amb => ({
        ...amb,
        profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: false,
        brand_color: amb.hex_code
      })));
    }
  } catch (error) {
    console.error('Error fetching ambassadors:', error);
    res.status(500).json({ error: 'Failed to fetch ambassadors' });
  }
});

// Get available Pokemon for upload (active months, not yet caught)
app.get('/api/upload/available-pokemon', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    if (!ACTIVE_MONTH_ID) {
      return res.json([]);
    }

    // Fetch pool, entries (all), and pending approvals in parallel
    const [
      { data: poolPokemon, error: poolError },
      { data: userEntries, error: entriesError },
      { data: pendingApprovals, error: approvalsError },
    ] = await Promise.all([
      supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('entries').select('pokemon_id, restricted_submission').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('approvals').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
    ]);

    if (poolError) throw poolError;
    if (entriesError) throw entriesError;
    if (approvalsError) throw approvalsError;

    const pokemonIds = [...new Set((poolPokemon || []).map(p => p.pokemon_id))];

    // Standard entries: user submitted standard but not yet restricted — show as locked
    const standardOnlyIds = new Set(
      (userEntries || []).filter(e => !e.restricted_submission).map(e => e.pokemon_id)
    );
    // Fully done: has a restricted entry — remove entirely
    const restrictedIds = new Set(
      (userEntries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id)
    );
    const pendingIds = new Set((pendingApprovals || []).map(a => a.pokemon_id));

    // Exclude pokemon that are fully done (restricted entry) or pending approval
    const availablePokemonIds = pokemonIds.filter(id => !restrictedIds.has(id) && !pendingIds.has(id));

    if (availablePokemonIds.length === 0) {
      return res.json([]);
    }

    // Get Pokemon details
    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url, game_slugs, restricted_game_slugs')
      .in('id', availablePokemonIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    const result = (pokemon || []).map(p => ({
      ...p,
      has_standard_entry: standardOnlyIds.has(p.id),
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching available Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch available Pokemon' });
  }
});

// Get available Pokemon for restricted upload (active month pool, excluding already restricted-submitted)
app.get('/api/upload/available-pokemon-restricted', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    if (!ACTIVE_MONTH_ID) return res.json([]);

    // Fetch pool, entries (all + restricted), and pending approvals in parallel
    const [
      { data: poolPokemon, error: poolError },
      { data: allEntries, error: entriesError },
      { data: restrictedApprovals, error: approvalsError },
    ] = await Promise.all([
      supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('entries').select('pokemon_id, restricted_submission').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('approvals').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID).eq('restricted_submission', true),
    ]);

    if (poolError) throw poolError;
    if (entriesError) throw entriesError;
    if (approvalsError) throw approvalsError;

    const pokemonIds = [...new Set((poolPokemon || []).map(p => p.pokemon_id))];

    const restrictedIds = new Set([
      ...(allEntries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id),
      ...(restrictedApprovals || []).map(a => a.pokemon_id),
    ]);
    // Pokemon with a standard (non-restricted) entry — show in restricted list but flag them
    const standardIds = new Set(
      (allEntries || []).filter(e => !e.restricted_submission).map(e => e.pokemon_id)
    );

    // Exclude pokemon already submitted as restricted
    const availableIds = pokemonIds.filter(id => !restrictedIds.has(id));

    if (availableIds.length === 0) {
      return res.json([]);
    }

    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url, game_slugs, restricted_game_slugs')
      .in('id', availableIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    const result = (pokemon || []).map(p => ({
      ...p,
      has_standard_entry: standardIds.has(p.id),
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching restricted available Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch available Pokemon for restricted' });
  }
});

// Get available Pokemon for historical upload (past months only)
// Excludes: pokemon in the current month's pool, pokemon where user has a restricted entry,
// and pokemon currently in the approval queue for that user+month.
app.get('/api/upload/available-pokemon-historical', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    if (!ACTIVE_MONTH_ID) return res.json([]);

    // Parallel: past months, current pool, all entries, pending approvals
    const [
      { data: pastMonths,      error: monthsError },
      { data: currentPool,     error: currentPoolError },
      { data: allEntries,      error: entriesError },
      { data: pendingApprovals,  error: approvalsError },
    ] = await Promise.all([
      supabase.from('bingo_months').select('id, start_date').lt('id', ACTIVE_MONTH_ID).order('id', { ascending: false }),
      supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('entries').select('pokemon_id, month_id, restricted_submission').eq('user_id', userId),
      supabase.from('approvals').select('pokemon_id, month_id').eq('user_id', userId),
    ]);

    if (monthsError) throw monthsError;
    if (currentPoolError) throw currentPoolError;
    if (entriesError) throw entriesError;
    if (approvalsError) throw approvalsError;

    if (!pastMonths || pastMonths.length === 0) return res.json([]);

    const currentPoolSet = new Set((currentPool || []).map(p => p.pokemon_id));
    // Keys: "pokemon_id:month_id"
    const restrictedKeys  = new Set((allEntries || []).filter(e =>  e.restricted_submission).map(e => `${e.pokemon_id}:${e.month_id}`));
    const standardKeys    = new Set((allEntries || []).filter(e => !e.restricted_submission).map(e => `${e.pokemon_id}:${e.month_id}`));
    const pendingKeys     = new Set((pendingApprovals || []).map(a => `${a.pokemon_id}:${a.month_id}`));

    // All past pool entries, newest month first
    const { data: allPastPool, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id, month_id')
      .in('month_id', pastMonths.map(m => m.id))
      .order('month_id', { ascending: false });

    if (poolError) throw poolError;

    // Build pokemon → most-recent past month, skipping current-pool pokemon
    const pokemonMostRecentMonth = {};
    for (const entry of (allPastPool || [])) {
      if (currentPoolSet.has(entry.pokemon_id)) continue;
      if (!pokemonMostRecentMonth[entry.pokemon_id]) {
        pokemonMostRecentMonth[entry.pokemon_id] = entry.month_id;
      }
    }

    // Filter: exclude if restricted entry or pending approval exists for that pokemon+month
    const available = Object.entries(pokemonMostRecentMonth).filter(([pokemonId, monthId]) => {
      const key = `${pokemonId}:${monthId}`;
      return !restrictedKeys.has(key) && !pendingKeys.has(key);
    });
    // Track which pokemon+month combos have a standard-only entry (no restricted yet)
    const standardOnlyKeys = new Set(
      [...standardKeys].filter(k => !restrictedKeys.has(k))
    );

    if (available.length === 0) return res.json([]);

    const pokemonIds = available.map(([id]) => parseInt(id));
    const monthById = Object.fromEntries((pastMonths).map(m => [m.id, m.start_date]));

    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url, game_slugs, restricted_game_slugs')
      .in('id', pokemonIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    const monthLookup = Object.fromEntries(available.map(([id, monthId]) => [parseInt(id), monthId]));

    const result = (pokemon || []).map(p => {
      const monthId = monthLookup[p.id];
      const startDate = monthById[monthId];
      const key = `${p.id}:${monthId}`;
      return {
        ...p,
        month_id: monthId,
        month_label: startDate
          ? new Date(startDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : `Month ${monthId}`,
        has_standard_entry: standardOnlyKeys.has(key),
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching historical Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch historical Pokemon' });
  }
});

// Submit catch
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
  message: { error: 'Too many submissions. Please wait a few minutes before trying again.' },
});

app.post('/api/upload/submission', uploadRateLimit, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const pokemon_id = req.body.pokemon_id;
    const game = req.body.game?.trim();
    const url = req.body.url;   // required for restricted (video link)
    const link = req.body.link; // optional supplemental link for normal submissions
    const restricted_submission = req.body.restricted_submission === 'true';
    const file = req.files?.file?.[0];
    const file2 = req.files?.file2?.[0];

    console.log('Parsed values:', { pokemon_id, game, url, link, file: !!file, file2: !!file2 });

    if (!pokemon_id) {
      return res.status(400).json({ error: 'Pokemon ID required' });
    }

    if (!game) {
      return res.status(400).json({ error: 'Game is required' });
    }

    // Restricted: requires video link, no images
    // Normal: requires both image files; link is supplemental (optional)
    if (restricted_submission && !url) {
      return res.status(400).json({ error: 'Restricted submissions require a video link' });
    }
    if (!restricted_submission && (!file || !file2) && !link) {
      return res.status(400).json({ error: 'Either both proof images or a video link is required' });
    }
    
    // Check file sizes (Vercel has a 4.5MB request body limit)
    const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB to leave room for overhead
    
    if (file && file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return res.status(413).json({ 
        error: `Proof of Shiny image is too large (${sizeMB}MB). Please compress to under 4MB.`,
        fileTooBig: true
      });
    }
    
    if (file2 && file2.size > MAX_FILE_SIZE) {
      const sizeMB = (file2.size / (1024 * 1024)).toFixed(1);
      return res.status(413).json({ 
        error: `Proof of Date image is too large (${sizeMB}MB). Please compress to under 4MB.`,
        fileTooBig: true
      });
    }
    
    // Check combined size
    if (file && file2 && (file.size + file2.size) > MAX_FILE_SIZE) {
      const totalMB = ((file.size + file2.size) / (1024 * 1024)).toFixed(1);
      return res.status(413).json({ 
        error: `Combined images are too large (${totalMB}MB). Please compress both images to under 4MB total.`,
        fileTooBig: true
      });
    }
    
    // Get active month
    const { data: activeMonth, error: monthError } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .single();
    
    if (monthError || !activeMonth) {
      return res.status(400).json({ error: 'No active bingo month' });
    }
    
    let proofUrl = null;
    let proofUrl2 = null;
    // proof_link: the video link for restricted, or the optional supplemental link for normal
    const proofLink = restricted_submission ? url : (link || null);

    // Upload both image files to R2 (normal submissions only)
    if (file && file2) {
      try {
        const R2_BUCKET_URL = process.env.R2_BUCKET_URL;
        const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
        const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
        const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
        const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'shiny-sprites';
        
        console.log('R2 Config check:', {
          hasUrl: !!R2_BUCKET_URL,
          hasAccessKey: !!R2_ACCESS_KEY_ID,
          hasSecretKey: !!R2_SECRET_ACCESS_KEY,
          hasAccountId: !!R2_ACCOUNT_ID
        });
        
        if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
          throw new Error('R2 credentials not configured. Please add R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ACCOUNT_ID to Vercel environment variables.');
        }
        
        if (!R2_BUCKET_URL) {
          throw new Error('R2_BUCKET_URL not configured');
        }
        
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
          },
        });
        
        // Upload first file (Proof of Shiny)
        const fileName1 = `approval/${userId}-${pokemon_id}-${Date.now()}-shiny-${file.originalname}`;
        
        console.log('Uploading file 1 to R2:', fileName1);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName1,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));
        
        proofUrl = `${R2_BUCKET_URL}/${fileName1}`;
        console.log('Upload 1 successful:', proofUrl);
        
        // Upload second file (Proof of Date)
        const fileName2 = `approval/${userId}-${pokemon_id}-${Date.now()}-date-${file2.originalname}`;
        
        console.log('Uploading file 2 to R2:', fileName2);
        
        await s3Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: fileName2,
          Body: file2.buffer,
          ContentType: file2.mimetype,
        }));
        
        proofUrl2 = `${R2_BUCKET_URL}/${fileName2}`;
        console.log('Upload 2 successful:', proofUrl2);
      } catch (r2Error) {
        console.error('R2 upload error:', r2Error);
        return res.status(500).json({ 
          error: 'File upload failed', 
          details: r2Error.message 
        });
      }
    }
    
    // Create approval entry
    const { data: approval, error: approvalError } = await supabase
      .from('approvals')
      .insert({
        user_id: userId,
        pokemon_id: parseInt(pokemon_id),
        month_id: activeMonth.id,
        proof_url: proofUrl,
        proof_url2: proofUrl2,
        proof_link: proofLink,
        game,
        restricted_submission,
      })
      .select()
      .single();
    
    if (approvalError) throw approvalError;

    // Note: pending notification is created automatically via DB trigger on approvals insert

    // Respond immediately, then broadcast (same pattern as approve/reject)
    res.json({ success: true, approval });

    // Notify board (user's pending tile), mod queue, and check badge eligibility
    Promise.all([
      broadcastUpdate('board-updates', 'board-changed', { userId }),
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
      awardBadgesForTrigger(userId, 'submission'),
    ]).catch(err => console.error('Post-submission broadcast failed (non-fatal):', err.message));
  } catch (error) {
    console.error('Error submitting catch:', error);
    res.status(500).json({ error: 'Failed to submit catch', details: error.message });
  }
});

// Historical submission — queues a past-month catch for mod review.
// No points are awarded on approval; board state is not affected.
app.post('/api/upload/historical-submission', uploadRateLimit, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const pokemon_id = req.body.pokemon_id;
    const game       = req.body.game?.trim();
    const month_id   = parseInt(req.body.month_id);
    const link       = req.body.link;
    const file       = req.files?.file?.[0];
    const file2      = req.files?.file2?.[0];

    if (!pokemon_id)        return res.status(400).json({ error: 'Pokemon ID required' });
    if (!game)              return res.status(400).json({ error: 'Game is required' });
    if (!month_id)          return res.status(400).json({ error: 'Month ID required' });
    if ((!file || !file2) && !link) return res.status(400).json({ error: 'Either both proof images or a video link is required' });

    // Validate month is in the past (not the current active month)
    const { data: activeMonth } = await supabase
      .from('bingo_months')
      .select('id')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .single();

    if (activeMonth && month_id >= activeMonth.id) {
      return res.status(400).json({ error: 'Historical submissions must be for a past month' });
    }

    // Validate the Pokemon was in that month's pool
    const { data: poolEntry } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id')
      .eq('month_id', month_id)
      .eq('pokemon_id', parseInt(pokemon_id))
      .single();

    if (!poolEntry) {
      return res.status(400).json({ error: 'That Pokemon was not in the pool for the selected month' });
    }

    // Prevent duplicate: check existing entries and pending approvals for this user/pokemon/month
    const [{ data: existingEntry }, { data: existingApproval }] = await Promise.all([
      supabase.from('entries').select('id').eq('user_id', userId).eq('pokemon_id', parseInt(pokemon_id)).eq('month_id', month_id).single(),
      supabase.from('approvals').select('id').eq('user_id', userId).eq('pokemon_id', parseInt(pokemon_id)).eq('month_id', month_id).single(),
    ]);

    if (existingEntry)   return res.status(409).json({ error: 'You already have an approved entry for this Pokemon in that month' });
    if (existingApproval) return res.status(409).json({ error: 'You already have a pending submission for this Pokemon in that month' });

    // File size checks
    const MAX_FILE_SIZE = 4 * 1024 * 1024;
    if (file  && file.size  > MAX_FILE_SIZE) return res.status(413).json({ error: `Proof of Shiny is too large (${(file.size  / 1048576).toFixed(1)}MB). Compress to under 4MB.`, fileTooBig: true });
    if (file2 && file2.size > MAX_FILE_SIZE) return res.status(413).json({ error: `Proof of Date is too large (${(file2.size / 1048576).toFixed(1)}MB). Compress to under 4MB.`, fileTooBig: true });
    if (file && file2 && (file.size + file2.size) > MAX_FILE_SIZE) return res.status(413).json({ error: `Combined images too large. Compress both to under 4MB total.`, fileTooBig: true });

    // Upload images to R2 (same as regular submission)
    let proofUrl = null;
    let proofUrl2 = null;
    if (file && file2) {
      try {
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
        });
        const ts = Date.now();
        const key1 = `approval/${userId}-${pokemon_id}-${ts}-hist-shiny-${file.originalname}`;
        const key2 = `approval/${userId}-${pokemon_id}-${ts}-hist-date-${file2.originalname}`;
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'shiny-sprites', Key: key1, Body: file.buffer, ContentType: file.mimetype }));
        proofUrl = `${process.env.R2_BUCKET_URL}/${key1}`;
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'shiny-sprites', Key: key2, Body: file2.buffer, ContentType: file2.mimetype }));
        proofUrl2 = `${process.env.R2_BUCKET_URL}/${key2}`;
      } catch (r2Error) {
        return res.status(500).json({ error: 'File upload failed', details: r2Error.message });
      }
    }

    const { data: approval, error: approvalError } = await supabase
      .from('approvals')
      .insert({
        user_id: userId,
        pokemon_id: parseInt(pokemon_id),
        month_id,
        proof_url: proofUrl,
        proof_url2: proofUrl2,
        proof_link: link || null,
        game,
        restricted_submission: false,
        historical: true,
      })
      .select()
      .single();

    if (approvalError) throw approvalError;

    res.json({ success: true, approval });

    Promise.all([
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
      awardBadgesForTrigger(userId, 'submission'),
    ]).catch(err => console.error('Post-historical-submission broadcast failed:', err.message));
  } catch (error) {
    console.error('Error submitting historical catch:', error);
    res.status(500).json({ error: 'Failed to submit historical catch', details: error.message });
  }
});

// Get recent catches for a specific Pokemon
app.get('/api/pokemon/:pokemonId/recent-catches', async (req, res) => {
  try {
    const { pokemonId } = req.params;
    const userId = await getAuthenticatedUserId(req);
    
    console.log('Fetching recent catches for Pokemon ID:', pokemonId);
    
    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    if (!ACTIVE_MONTH_ID) {
      console.log('No active month found');
      return res.json([]);
    }
    
    // Get recent APPROVED entries for this Pokemon (limit 10, most recent first)
    const { data: entries, error } = await supabase
      .from('entries')
      .select(`
        id,
        created_at,
        user_id,
        users!entries_user_id_fkey (
          display_name,
          avatar_url
        )
      `)
      .eq('pokemon_id', pokemonId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    if (!entries || entries.length === 0) {
      console.log('No entries found, returning empty array');
      return res.json([]);
    }
    
    const userIds = entries.map(e => e.user_id);
    
    // Get user points for this month
    const { data: userPoints, error: pointsError } = await supabase
      .from('user_monthly_points')
      .select('user_id, points')
      .in('user_id', userIds)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    const pointsMap = {};
    if (!pointsError && userPoints) {
      userPoints.forEach(up => {
        pointsMap[up.user_id] = up.points;
      });
    }
    
    // Get user achievements for this month
    const { data: achievements, error: achievementsError } = await supabase
      .from('bingo_achievements')
      .select('user_id, bingo_type')
      .in('user_id', userIds)
      .eq('month_id', ACTIVE_MONTH_ID);
    
    const achievementsMap = {};
    if (!achievementsError && achievements) {
      achievements.forEach(a => {
        if (!achievementsMap[a.user_id]) {
          achievementsMap[a.user_id] = { row: false, column: false, x: false, blackout: false };
        }
        achievementsMap[a.user_id][a.bingo_type] = true;
      });
    }
    
    // Get hex codes for ambassadors
    const { data: ambassadors, error: ambassadorsError } = await supabase
      .from('twitch_ambassadors')
      .select('id, hex_code')
      .in('id', userIds);
    
    const hexCodeMap = {};
    if (!ambassadorsError && ambassadors) {
      ambassadors.forEach(amb => {
        hexCodeMap[amb.id] = amb.hex_code || '#9147ff';
      });
    }
    
    const formattedEntries = entries.map(entry => ({
      id: entry.id,
      caught_at: entry.created_at,
      user_id: entry.user_id,
      display_name: entry.users?.display_name || 'Unknown',
      avatar_url: entry.users?.avatar_url,
      points: pointsMap[entry.user_id] || 0,
      achievements: achievementsMap[entry.user_id] || { row: false, column: false, x: false, blackout: false },
      hex_code: hexCodeMap[entry.user_id] || '#9147ff'
    }));
    
    console.log('Returning', formattedEntries.length, 'entries');
    res.json(formattedEntries);
  } catch (error) {
    console.error('Error fetching recent catches:', error);
    res.status(500).json({ error: 'Failed to fetch recent catches', details: error.message });
  }
});

// Approve a submission
app.post('/api/approvals/:id/approve', async (req, res) => {
  const { id } = req.params;
  if (approvalsInProgress.has(id)) {
    return res.status(409).json({ error: 'This submission is already being processed' });
  }
  approvalsInProgress.add(id);
  try {
    console.log('Approving submission:', id);

    const moderatorId = await getAuthenticatedUserId(req);
    if (!moderatorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    console.log('Moderator ID:', moderatorId);

    // Check if user is moderator
    const { data: isMod, error: modError } = await supabase
      .from('moderators')
      .select('id, moderator_name')
      .eq('id', moderatorId)
      .single();

    if (modError || !isMod) {
      console.log('Moderator check failed:', modError);
      return res.status(403).json({ error: 'Moderator access required' });
    }

    const moderatorName = isMod.moderator_name || 'Unknown Moderator';

    // Get approval details including image URLs BEFORE deleting the record
    const { data: approval, error: approvalFetchError } = await supabase
      .from('approvals')
      .select('user_id, pokemon_id, proof_url, proof_url2, proof_link, game, historical, month_id, restricted_submission, created_at')
      .eq('id', id)
      .single();

    if (approvalFetchError) {
      console.error('Error fetching approval:', approvalFetchError);
      throw approvalFetchError;
    }

    const { status: approvalStatus } = req.body;

    if (approval.historical) {
      // Historical approvals: bypass RPC — handle entirely in Express (no points, no board)
      const validHistoricalStatuses = ['accepted_historical', 'accepted_downgraded_historical'];
      const historicalStatus = validHistoricalStatuses.includes(approvalStatus) ? approvalStatus : 'accepted_historical';
      const isDowngradedHistorical = historicalStatus === 'accepted_downgraded_historical';

      let historicalNote = `Approved by ${moderatorName}`;
      if (isDowngradedHistorical) historicalNote += ' (downgraded)';
      if (approval.proof_link) {
        historicalNote += `. Link was ${approval.proof_link}`;
      }

      const { error: entryError } = await supabase.from('entries').insert({
        user_id: approval.user_id,
        pokemon_id: approval.pokemon_id,
        month_id: approval.month_id,
        game: approval.game,
        historical: true,
        restricted_submission: !isDowngradedHistorical && !!approval.restricted_submission,
        moderator_note: historicalNote,
      });
      if (entryError) throw entryError;

      const { error: deleteError } = await supabase.from('approvals').delete().eq('id', id);
      if (deleteError) throw deleteError;

      await supabase.from('notifications').insert({
        user_id: approval.user_id,
        pokemon_id: approval.pokemon_id,
        status: historicalStatus,
        notified: false,
      });

      res.json({ success: true });

      Promise.all([
        broadcastUpdate('approvals-updates', 'queue-changed', {}),
        broadcastNotificationToasts(approval.user_id),
        awardBadgesForTrigger(approval.user_id, 'approved'),
        supabase.from('approval_history').insert({
          user_id: approval.user_id,
          pokemon_id: approval.pokemon_id,
          month_id: approval.month_id,
          game: approval.game,
          historical: true,
          restricted_submission: !isDowngradedHistorical && !!approval.restricted_submission,
          proof_url: approval.proof_url,
          proof_url2: approval.proof_url2,
          proof_link: approval.proof_link,
          status: historicalStatus,
          moderator_id: moderatorId,
          created_at: approval.created_at,
        }),
      ]).catch(err => console.error('Post-historical-approval broadcast failed (non-fatal):', err.message));
      return;
    }

    console.log('Calling approve_submission RPC...');

    // Call stored procedure
    const { data, error } = await supabase.rpc('approve_submission', {
      p_approval_id: parseInt(id),
      p_moderator_id: moderatorId,
      p_status: approvalStatus || 'accepted',
      p_game: approval.game || null
    });

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    console.log('Approval successful:', data);

    // Respond immediately — broadcasts and cleanup are non-critical side effects
    res.json(data);

    // Invalidate leaderboard cache immediately so the next request gets fresh data
    leaderboardCache.clear();

    // Append proof_link to entry moderator_note (fire-and-forget)
    if (approval.proof_link) {
      (async () => {
        try {
          const { data: entry } = await supabase.from('entries')
            .select('id, moderator_note')
            .eq('user_id', approval.user_id)
            .eq('pokemon_id', approval.pokemon_id)
            .eq('month_id', approval.month_id)
            .eq('historical', false)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (entry) {
            const newNote = entry.moderator_note
              ? `${entry.moderator_note}. Link was ${approval.proof_link}`
              : `Link was ${approval.proof_link}`;
            await supabase.from('entries').update({ moderator_note: newNote }).eq('id', entry.id);
          }
        } catch (err) {
          console.error('Failed to update entry moderator_note (non-fatal):', err.message);
        }
      })();
    }

    // Notify connected clients (fire-and-forget; a broadcast failure must never
    // make the client think the approval failed when the DB already committed it)
    Promise.all([
      broadcastUpdate('board-updates', 'board-changed', { userId: approval.user_id }),
      broadcastUpdate('leaderboard-updates', 'leaderboard-changed', {}),
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
      broadcastNotificationToasts(approval.user_id),
      awardBadgesForTrigger(approval.user_id, 'approved', { monthId: approval.month_id }),
      supabase.from('approval_history').insert({
        user_id: approval.user_id,
        pokemon_id: approval.pokemon_id,
        month_id: approval.month_id,
        game: approval.game,
        historical: false,
        restricted_submission: !!approval.restricted_submission,
        proof_url: approval.proof_url,
        proof_url2: approval.proof_url2,
        proof_link: approval.proof_link,
        status: approvalStatus || 'accepted',
        moderator_id: moderatorId,
        created_at: approval.created_at,
      }),
    ]).catch(err => console.error('Post-approval broadcast failed (non-fatal):', err.message));
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({ 
      error: 'Failed to approve submission', 
      details: error.message,
      hint: error.hint,
      code: error.code 
    });
  }
});

// Reject a submission
app.post('/api/approvals/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, status: rejectAction } = req.body;
    // rejectAction: 'rejected' (plain) | 'warn' (reject + increment strikes) | 'ban' (rejected_restricted_ban)

    console.log('Rejecting submission:', id, 'Action:', rejectAction, 'Message:', message);

    const moderatorId = await getAuthenticatedUserId(req);
    if (!moderatorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    console.log('Moderator ID:', moderatorId);

    // Check if user is moderator
    const { data: isMod, error: modError } = await supabase
      .from('moderators')
      .select('id')
      .eq('id', moderatorId)
      .single();
    
    if (modError || !isMod) {
      console.log('Moderator check failed:', modError);
      return res.status(403).json({ error: 'Moderator access required' });
    }
    
    // Get approval details including image URLs BEFORE deleting the record
    const { data: approval, error: approvalFetchError } = await supabase
      .from('approvals')
      .select('user_id, pokemon_id, proof_url, proof_url2, proof_link, game, historical, month_id, restricted_submission, created_at')
      .eq('id', id)
      .single();

    if (approvalFetchError) {
      console.error('Error fetching approval:', approvalFetchError);
      throw approvalFetchError;
    }

    if (approval.historical) {
      // Historical rejections: bypass RPC — delete approval, notify user
      const historicalNotifStatus = rejectAction === 'ban' ? 'rejected_restricted_ban' : 'rejected';

      const { error: deleteError } = await supabase.from('approvals').delete().eq('id', id);
      if (deleteError) throw deleteError;

      await supabase.from('notifications').insert({
        user_id: approval.user_id,
        pokemon_id: approval.pokemon_id,
        status: historicalNotifStatus,
        message: message || 'No reason provided',
        notified: false,
      });

      res.json({ success: true });

      if (rejectAction === 'warn') {
        (async () => {
          try {
            const { data: userData } = await supabase
              .from('users')
              .select('restricted_strikes')
              .eq('id', approval.user_id)
              .single();
            await supabase
              .from('users')
              .update({ restricted_strikes: (userData?.restricted_strikes || 0) + 1 })
              .eq('id', approval.user_id);
          } catch (err) {
            console.error('Failed to increment restricted_strikes (non-fatal):', err.message);
          }
        })();
      }

      Promise.all([
        broadcastUpdate('approvals-updates', 'queue-changed', {}),
        broadcastNotificationToasts(approval.user_id),
        awardBadgesForTrigger(approval.user_id, 'rejected'),
        supabase.from('approval_history').insert({
          user_id: approval.user_id,
          pokemon_id: approval.pokemon_id,
          month_id: approval.month_id,
          game: approval.game,
          historical: true,
          restricted_submission: !!approval.restricted_submission,
          proof_url: approval.proof_url,
          proof_url2: approval.proof_url2,
          proof_link: approval.proof_link,
          status: historicalNotifStatus,
          moderator_id: moderatorId,
          created_at: approval.created_at,
        }),
      ]).catch(err => console.error('Post-historical-rejection broadcast failed (non-fatal):', err.message));
      return;
    }

    console.log('Calling reject_submission RPC...');

    const rpcStatus = rejectAction === 'ban' ? 'rejected_restricted_ban' : 'rejected';

    // Call stored procedure
    const { data, error } = await supabase.rpc('reject_submission', {
      p_approval_id: parseInt(id),
      p_moderator_id: moderatorId,
      p_rejection_message: message || 'No reason provided',
      p_status: rpcStatus
    });

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    console.log('Rejection successful:', data);

    // Respond immediately — side effects below must never roll back a committed rejection
    res.json(data);

    // For warn: increment restricted_strikes on the user (fire-and-forget)
    if (rejectAction === 'warn') {
      (async () => {
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('restricted_strikes')
            .eq('id', approval.user_id)
            .single();
          await supabase
            .from('users')
            .update({ restricted_strikes: (userData?.restricted_strikes || 0) + 1 })
            .eq('id', approval.user_id);
          console.log('Incremented restricted_strikes for user:', approval.user_id);
        } catch (err) {
          console.error('Failed to increment restricted_strikes (non-fatal):', err.message);
        }
      })();
    }

    // Notify connected clients (fire-and-forget)
    Promise.all([
      broadcastUpdate('board-updates', 'board-changed', { userId: approval.user_id }),
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
      broadcastNotificationToasts(approval.user_id),
      awardBadgesForTrigger(approval.user_id, 'rejected'),
      supabase.from('approval_history').insert({
        user_id: approval.user_id,
        pokemon_id: approval.pokemon_id,
        month_id: approval.month_id,
        game: approval.game,
        historical: false,
        restricted_submission: !!approval.restricted_submission,
        proof_url: approval.proof_url,
        proof_url2: approval.proof_url2,
        proof_link: approval.proof_link,
        status: rpcStatus,
        moderator_id: moderatorId,
        created_at: approval.created_at,
      }),
    ]).catch(err => console.error('Post-rejection broadcast failed (non-fatal):', err.message));
  } catch (error) {
    console.error('Error rejecting submission:', error);
    res.status(500).json({ 
      error: 'Failed to reject submission', 
      details: error.message,
      hint: error.hint,
      code: error.code
    });
  }
});

// Admin-only: Clear cache manually
app.post('/api/admin/clear-cache', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is moderator
    const { data: isMod, error: modError } = await supabase
      .from('moderators')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (modError || !isMod) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // In-memory cache has been removed (Vercel instances don't share memory).
    // This endpoint is now a no-op kept for backwards compatibility.
    res.json({
      success: true,
      message: 'Cache is disabled — no-op',
      itemsCleared: 0
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache', details: error.message });
  }
});

// Check if user is a moderator
// Sync avatar from Discord identity — call after OAuth login to keep avatar_url fresh
app.post('/api/user/sync-avatar', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const avatarUrl = await refreshAvatarFromDiscord(userId);
    res.json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    console.error('sync-avatar error:', err.message);
    res.status(500).json({ error: 'Failed to sync avatar' });
  }
});

app.get('/api/user/is-moderator', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.json({ isModerator: false });
    }

    const { data: mod, error } = await supabase
      .from('moderators')
      .select('id')
      .eq('id', userId)
      .single();

    res.json({ isModerator: !error && !!mod });
  } catch (error) {
    console.error('Error checking moderator status:', error);
    res.json({ isModerator: false });
  }
});

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
        .select('id, national_dex_id, name, img_url')
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

// Get pending approvals (moderators only)
app.get('/api/approvals/pending', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify moderator status
    const { data: ambassador, error: modError } = await supabase
      .from('moderators')
      .select('id')
      .eq('id', userId)
      .single();

    if (modError || !ambassador) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const historical = req.query.historical === 'true';
    console.log(`Fetching ${historical ? 'historical' : 'pending'} approvals...`);

    // Get approvals with user and pokemon info, filtered by historical flag
    const { data: approvals, error } = await supabase
      .from('approvals')
      .select(`
        id,
        created_at,
        proof_url,
        proof_url2,
        proof_link,
        game,
        user_id,
        pokemon_id,
        month_id,
        restricted_submission,
        historical,
        users!apptovals_user_id_fkey (
          display_name,
          restricted_strikes
        ),
        pokemon_master!apptovals_pokemon_id_fkey (
          name,
          national_dex_id,
          img_url
        )
      `)
      .eq('historical', historical)
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log(`Found ${approvals?.length || 0} approvals`);
    
    if (!approvals || approvals.length === 0) {
      return res.json([]);
    }
    
    const formattedApprovals = approvals.map(approval => ({
      id: approval.id,
      created_at: approval.created_at,
      proof_url: approval.proof_url,
      proof_url2: approval.proof_url2,
      proof_link: approval.proof_link || null,
      game: approval.game || null,
      user_id: approval.user_id,
      display_name: approval.users?.display_name || 'Unknown',
      pokemon_name: approval.pokemon_master?.name || 'Unknown',
      national_dex_id: approval.pokemon_master?.national_dex_id || 0,
      pokemon_img: approval.pokemon_master?.img_url || '',
      restricted_submission: approval.restricted_submission || false,
      restricted_strikes: approval.users?.restricted_strikes || 0,
      historical: approval.historical || false,
      month_id: approval.month_id || null,
    }));
    
    res.json(formattedApprovals);
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BOARD BUILDER  (moderator-only)
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


// GET /api/mod/board-builder
app.get('/api/mod/board-builder', async (req, res) => {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: modRow, error: modErr } = await supabase
      .from('moderators').select('id').eq('id', userId).maybeSingle();
    if (modErr) return res.status(500).json({ error: 'Mod check failed', details: modErr.message });
    if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

    // ── Compute next calendar month from today (UTC) ─────────────────────────
    // No dependency on finding the "active" month — just use the real calendar.
    const now = new Date();
    const curYear  = now.getUTCFullYear();
    const curMonth = now.getUTCMonth() + 1; // 1-12
    const nYear    = curMonth === 12 ? curYear + 1 : curYear;
    const nMonth   = curMonth === 12 ? 1 : curMonth + 1;
    const pad      = n => String(n).padStart(2, '0');
    const monthKey  = `${nYear}-${pad(nMonth)}`;
    const startDate = `${nYear}-${pad(nMonth)}-01`;
    const lastDay   = new Date(Date.UTC(nYear, nMonth, 0)).getUTCDate();
    const endDate   = `${nYear}-${pad(nMonth)}-${pad(lastDay)}`;
    const names     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const display   = `${names[nMonth - 1]} ${nYear}`;

    console.log(`[BoardBuilder] userId=${userId} month=${monthKey} start=${startDate} end=${endDate}`);
    console.log(`[BoardBuilder] SUPABASE_URL set=${!!process.env.SUPABASE_URL} SERVICE_KEY set=${!!process.env.SUPABASE_SERVICE_ROLE_KEY} keyLen=${process.env.SUPABASE_SERVICE_ROLE_KEY?.length}`);

    // ── Compute season_id and year_id ────────────────────────────────────────
    // Game year runs March → February. e.g. Mar 2025–Feb 2026 = game year 2025.
    const gameYear = nMonth >= 3 ? nYear : nYear - 1;

    // Which seasonal quarter does this month fall in?
    // 0 = Winter (Dec/Jan/Feb), 1 = Spring (Mar/Apr/May),
    // 2 = Summer (Jun/Jul/Aug),  3 = Fall  (Sep/Oct/Nov)
    const seasonQuarter = nMonth >= 3 && nMonth <= 5  ? 1
                        : nMonth >= 6 && nMonth <= 8  ? 2
                        : nMonth >= 9 && nMonth <= 11 ? 3
                        : 0; // Dec, Jan, Feb → Winter

    // Helper: does a bingo_month row fall in the same seasonal quarter?
    const isInSameQuarter = (startDateStr) => {
      const d    = new Date(startDateStr + 'T00:00:00Z');
      const m    = d.getUTCMonth() + 1;
      const y    = d.getUTCFullYear();
      const q    = m >= 3 && m <= 5  ? 1
                 : m >= 6 && m <= 8  ? 2
                 : m >= 9 && m <= 11 ? 3
                 : 0;
      if (q !== seasonQuarter) return false;
      // Winter crosses the calendar year boundary
      const rowGameYear = m >= 3 ? y : y - 1;
      return rowGameYear === gameYear;
    };

    // Fetch all months in the same game year (Mar {gameYear} – Feb {gameYear+1})
    const { data: yearMonths } = await supabase
      .from('bingo_months')
      .select('id, season_id, year_id, start_date')
      .gte('start_date', `${gameYear}-03-01`)
      .lt('start_date', `${gameYear + 1}-03-01`);

    // Reuse existing year_id for this game year, or assign max + 1
    const existingYearId = yearMonths?.find(m => m.year_id != null)?.year_id ?? null;
    let year_id;
    if (existingYearId != null) {
      year_id = existingYearId;
    } else {
      const { data: maxYearRow } = await supabase
        .from('bingo_months').select('year_id').not('year_id', 'is', null)
        .order('year_id', { ascending: false }).limit(1);
      year_id = (maxYearRow?.[0]?.year_id ?? 0) + 1;
    }

    // Reuse existing season_id for this quarter, or assign max + 1
    const seasonMonths   = (yearMonths || []).filter(m => isInSameQuarter(m.start_date));
    const existingSeasonId = seasonMonths.find(m => m.season_id != null)?.season_id ?? null;
    let season_id;
    if (existingSeasonId != null) {
      season_id = existingSeasonId;
    } else {
      const { data: maxSeasonRow } = await supabase
        .from('bingo_months').select('season_id').not('season_id', 'is', null)
        .order('season_id', { ascending: false }).limit(1);
      season_id = (maxSeasonRow?.[0]?.season_id ?? 0) + 1;
    }

    console.log(`[BoardBuilder] gameYear=${gameYear} quarter=${seasonQuarter} season_id=${season_id} year_id=${year_id}`);

    // ── Find or insert next month (never overwrite existing rows) ────────────
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const restHeaders = {
      'Content-Type': 'application/json',
      'apikey':        sbKey,
      'Authorization': `Bearer ${sbKey}`,
    };

    // Step 1: look for an existing row
    const selectRes = await fetch(
      `${sbUrl}/rest/v1/bingo_months?month_year=eq.${encodeURIComponent(monthKey)}&select=id,month_year_display,start_date,end_date,season_id,year_id`,
      { headers: restHeaders }
    );
    const selectText = await selectRes.text();
    console.log(`[BoardBuilder] SELECT HTTP ${selectRes.status}: ${selectText}`);

    if (!selectRes.ok) {
      return res.status(500).json({ error: 'Failed to query bingo_months', http_status: selectRes.status, response: selectText });
    }

    const existing = JSON.parse(selectText);
    let nextMonth = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

    // Step 2: insert only if the row does not exist yet
    if (!nextMonth) {
      console.log(`[BoardBuilder] Row not found — inserting month_year="${monthKey}"`);
      const insertRes = await fetch(`${sbUrl}/rest/v1/bingo_months`, {
        method: 'POST',
        headers: { ...restHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          month_year: monthKey,
          month_year_display: display,
          start_date: startDate,
          end_date: endDate,
          season_id,
          year_id,
        }),
      });
      const insertText = await insertRes.text();
      console.log(`[BoardBuilder] INSERT HTTP ${insertRes.status}: ${insertText}`);

      if (!insertRes.ok) {
        return res.status(500).json({ error: 'Failed to insert bingo_month', http_status: insertRes.status, response: insertText });
      }

      const inserted = JSON.parse(insertText);
      nextMonth = Array.isArray(inserted) ? inserted[0] : inserted;
    } else {
      console.log(`[BoardBuilder] Found existing bingo_month id=${nextMonth.id}`);

      // Backfill season_id / year_id if the existing row is missing them
      const needsPatch = nextMonth.season_id == null || nextMonth.year_id == null;
      if (needsPatch) {
        console.log(`[BoardBuilder] Patching missing season_id/year_id on id=${nextMonth.id}`);
        await fetch(
          `${sbUrl}/rest/v1/bingo_months?id=eq.${nextMonth.id}`,
          {
            method: 'PATCH',
            headers: { ...restHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              ...(nextMonth.season_id == null ? { season_id } : {}),
              ...(nextMonth.year_id   == null ? { year_id }   : {}),
            }),
          }
        );
        nextMonth = { ...nextMonth, season_id, year_id };
      }
    }

    if (!nextMonth) {
      return res.status(500).json({ error: 'bingo_month row missing after insert' });
    }

    console.log(`[BoardBuilder] bingo_month id=${nextMonth.id} ready`);

    // ── Find or generate pool ────────────────────────────────────────────────
    const { data: existingPool } = await supabase
      .from('monthly_pokemon_pool')
      .select('position, pokemon_id')
      .eq('month_id', nextMonth.id)
      .order('position');

    let tiles;

    if (!existingPool || existingPool.length === 0) {
      // Pull every shiny-available pokemon (including family_id for exclusion logic)
      const { data: allPokemon, error: pkErr } = await supabase
        .from('pokemon_master')
        .select('id, name, img_url, national_dex_id, family_id')
        .eq('shiny_available', true);

      if (pkErr) return res.status(500).json({ error: 'Failed to fetch pokemon', details: pkErr.message });

      // Count how many months each pokemon has appeared in (excluding this one)
      const { data: history } = await supabase
        .from('monthly_pokemon_pool')
        .select('pokemon_id')
        .neq('month_id', nextMonth.id);

      const usageCount = {};
      (history || []).forEach(r => { usageCount[r.pokemon_id] = (usageCount[r.pokemon_id] || 0) + 1; });

      // Build family exclusion set from the previous month's board
      const lastMonthFamilyIds = new Set();
      const { data: prevMonthData } = await supabase
        .from('bingo_months')
        .select('id')
        .neq('id', nextMonth.id)
        .order('start_date', { ascending: false })
        .limit(1);
      if (prevMonthData && prevMonthData.length > 0) {
        const { data: prevPool } = await supabase
          .from('monthly_pokemon_pool')
          .select('pokemon_id')
          .eq('month_id', prevMonthData[0].id);
        const prevIds = (prevPool || []).map(r => r.pokemon_id);
        if (prevIds.length > 0) {
          const { data: prevPk } = await supabase
            .from('pokemon_master')
            .select('id, family_id')
            .in('id', prevIds);
          (prevPk || []).forEach(p => { if (p.family_id != null) lastMonthFamilyIds.add(p.family_id); });
        }
      }

      // Pick up to `count` from `pool`, skipping any family already in `excludedFamilies`.
      // Mutates excludedFamilies as it picks so within-board families are also deduplicated.
      function pickWithFamilyExclusion(pool, count, excludedFamilies) {
        const picked = [];
        for (const p of shuffleArray([...pool])) {
          if (picked.length >= count) break;
          if (p.family_id == null || !excludedFamilies.has(p.family_id)) {
            picked.push(p);
            if (p.family_id != null) excludedFamilies.add(p.family_id);
          }
        }
        return picked;
      }

      const neverUsed = (allPokemon || []).filter(p => !usageCount[p.id]);
      const usedOnce  = (allPokemon || []).filter(p => usageCount[p.id] === 1);

      let selected;
      const familyExclusionSet = new Set(lastMonthFamilyIds);
      const neverPicked = pickWithFamilyExclusion(neverUsed, 24, familyExclusionSet);
      if (neverPicked.length >= 24) {
        selected = neverPicked.map(p => ({ ...p, is_second_round: false }));
      } else {
        const need = 24 - neverPicked.length;
        // familyExclusionSet already contains last month + whatever neverPicked added
        const oncePicked = pickWithFamilyExclusion(usedOnce, need, familyExclusionSet);
        selected = [
          ...neverPicked.map(p => ({ ...p, is_second_round: false })),
          ...oncePicked.map(p => ({ ...p, is_second_round: true })),
        ];
      }

      // Positions 1-25 excluding 13 (FREE SPACE), shuffled
      const positions = shuffleArray([1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25]);

      const poolRows = selected.map((p, i) => ({
        month_id:   nextMonth.id,
        pokemon_id: p.id,
        position:   positions[i],
      }));

      const { error: poolInsertErr } = await supabase.from('monthly_pokemon_pool').insert(poolRows);
      if (poolInsertErr) {
        return res.status(500).json({ error: 'Failed to insert pokemon pool', details: poolInsertErr.message });
      }

      tiles = selected.map((p, i) => ({
        position:       positions[i],
        pokemon_id:     p.id,
        name:           p.name,
        img_url:        p.img_url,
        national_dex_id: p.national_dex_id,
        is_second_round: p.is_second_round,
      }));

    } else {
      // Pool exists — hydrate from pokemon_master
      const pokemonIds = existingPool.map(r => r.pokemon_id);

      const { data: pkDetails } = await supabase
        .from('pokemon_master')
        .select('id, name, img_url, national_dex_id')
        .in('id', pokemonIds);

      const pkMap = {};
      (pkDetails || []).forEach(p => { pkMap[p.id] = p; });

      // Determine second-round: appeared in any OTHER month
      const { data: histRows } = await supabase
        .from('monthly_pokemon_pool')
        .select('pokemon_id')
        .neq('month_id', nextMonth.id)
        .in('pokemon_id', pokemonIds);

      const seenElsewhere = new Set((histRows || []).map(r => r.pokemon_id));

      tiles = existingPool.map(r => ({
        position:        r.position,
        pokemon_id:      r.pokemon_id,
        name:            pkMap[r.pokemon_id]?.name || 'Unknown',
        img_url:         pkMap[r.pokemon_id]?.img_url || null,
        national_dex_id: pkMap[r.pokemon_id]?.national_dex_id || null,
        is_second_round: seenElsewhere.has(r.pokemon_id),
      }));
    }

    res.json({ nextMonth, tiles });

  } catch (err) {
    console.error('[BoardBuilder] Unexpected error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mod/board-builder/swap
app.put('/api/mod/board-builder/swap', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: modRow } = await supabase
      .from('moderators').select('id').eq('id', userId).maybeSingle();
    if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

    const { pos1, pos2, monthId, operationId } = req.body;
    if (!pos1 || !pos2 || !monthId) return res.status(400).json({ error: 'pos1, pos2, monthId required' });
    if (pos1 === 13 || pos2 === 13) return res.status(400).json({ error: 'Cannot move FREE SPACE' });

    // Fetch both rows
    const { data: rows, error: fetchErr } = await supabase
      .from('monthly_pokemon_pool')
      .select('id, position, pokemon_id')
      .eq('month_id', monthId)
      .in('position', [pos1, pos2]);

    if (fetchErr) return res.status(500).json({ error: 'Fetch failed', details: fetchErr.message });
    if (!rows || rows.length !== 2) return res.status(404).json({ error: 'Could not find both positions' });

    const rowA = rows.find(r => r.position === pos1);
    const rowB = rows.find(r => r.position === pos2);

    // Swap pokemon_ids
    const { error: upA } = await supabase.from('monthly_pokemon_pool')
      .update({ pokemon_id: rowB.pokemon_id }).eq('id', rowA.id);
    const { error: upB } = await supabase.from('monthly_pokemon_pool')
      .update({ pokemon_id: rowA.pokemon_id }).eq('id', rowB.id);

    if (upA || upB) return res.status(500).json({ error: 'Swap update failed' });

    await broadcastUpdate('board-builder-updates', 'tile-update', {
      type: 'swap', pos1, pos2, operationId,
    });

    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mod/board-builder/reroll
app.post('/api/mod/board-builder/reroll', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: modRow } = await supabase
      .from('moderators').select('id').eq('id', userId).maybeSingle();
    if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

    const { position, monthId, operationId } = req.body;
    if (!position || !monthId) return res.status(400).json({ error: 'position, monthId required' });
    if (position === 13) return res.status(400).json({ error: 'Cannot reroll FREE SPACE' });

    // Current pool for this month (with position so we can exclude the rerolled slot's family)
    const { data: pool } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id, position')
      .eq('month_id', monthId);

    const usedIds = new Set((pool || []).map(r => r.pokemon_id));

    // All eligible pokemon (including family_id for exclusion logic)
    const { data: allPokemon } = await supabase
      .from('pokemon_master')
      .select('id, name, img_url, national_dex_id, family_id')
      .eq('shiny_available', true);

    const pkFamilyMap = Object.fromEntries((allPokemon || []).map(p => [p.id, p.family_id]));

    // Family IDs on the current board, excluding the slot being rerolled (its family is freed up)
    const boardFamilyIds = new Set();
    (pool || []).forEach(r => {
      if (r.position !== position) {
        const fam = pkFamilyMap[r.pokemon_id];
        if (fam != null) boardFamilyIds.add(fam);
      }
    });

    // Family IDs from the previous month's board
    const lastMonthFamilyIds = new Set();
    const { data: prevMonthData } = await supabase
      .from('bingo_months')
      .select('id')
      .neq('id', monthId)
      .order('start_date', { ascending: false })
      .limit(1);
    if (prevMonthData && prevMonthData.length > 0) {
      const { data: prevPool } = await supabase
        .from('monthly_pokemon_pool')
        .select('pokemon_id')
        .eq('month_id', prevMonthData[0].id);
      const prevIds = (prevPool || []).map(r => r.pokemon_id);
      if (prevIds.length > 0) {
        const { data: prevPk } = await supabase
          .from('pokemon_master')
          .select('id, family_id')
          .in('id', prevIds);
        (prevPk || []).forEach(p => { if (p.family_id != null) lastMonthFamilyIds.add(p.family_id); });
      }
    }

    // Usage history excluding this month
    const { data: history } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id')
      .neq('month_id', monthId);

    const usageCount = {};
    (history || []).forEach(r => { usageCount[r.pokemon_id] = (usageCount[r.pokemon_id] || 0) + 1; });

    // Exclude: already on board, family on current board, family on last month's board
    const isEligibleFamily = p =>
      p.family_id == null || (!boardFamilyIds.has(p.family_id) && !lastMonthFamilyIds.has(p.family_id));

    // Pick from never-used first, then once-used
    const neverUsed = (allPokemon || []).filter(p => !usageCount[p.id] && !usedIds.has(p.id) && isEligibleFamily(p));
    const usedOnce  = (allPokemon || []).filter(p => usageCount[p.id] === 1 && !usedIds.has(p.id) && isEligibleFamily(p));

    const candidates = neverUsed.length > 0 ? neverUsed : usedOnce;
    if (!candidates.length) return res.status(409).json({ error: 'No eligible pokemon available for reroll' });

    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    // Is it second-round?
    const is_second_round = (usageCount[pick.id] || 0) > 0;

    // Update the row
    const { error: upErr } = await supabase
      .from('monthly_pokemon_pool')
      .update({ pokemon_id: pick.id })
      .eq('month_id', monthId)
      .eq('position', position);

    if (upErr) return res.status(500).json({ error: 'Reroll update failed', details: upErr.message });

    const tile = {
      position,
      pokemon_id:      pick.id,
      name:            pick.name,
      img_url:         pick.img_url,
      national_dex_id: pick.national_dex_id,
      is_second_round,
    };

    await broadcastUpdate('board-builder-updates', 'tile-update', {
      type: 'reroll', tile, operationId,
    });

    res.json({ tile });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Site Pro & API Key management ────────────────────────────────────────────

// GET /api/user/is-pro
app.get('/api/user/is-pro', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.json({ isPro: false });
    const { data } = await supabase.from('site_pro').select('user_id').eq('user_id', userId).maybeSingle();
    res.json({ isPro: !!data });
  } catch { res.json({ isPro: false }); }
});

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

// ── Overlay data endpoints (API key auth, no Discord auth required) ──────────

// GET /api/overlay/board?key=pb_xxx&mode=live|template
app.get('/api/overlay/board', async (req, res) => {
  try {
    const userId = await validateApiKey(req.query.key);
    if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

    const mode = req.query.mode === 'template' ? 'template' : 'live';
    const slim = req.query.slim === '1'; // slim=1: only return per-cell state, no pokemon data
    const monthData = await getActiveMonth();
    if (!monthData) return res.status(404).json({ error: 'No active bingo month' });
    const ACTIVE_MONTH_ID = monthData.id;

    // In slim mode we only need entries + approvals — skip pool and pokemon_master entirely
    if (slim && mode === 'live') {
      const [{ data: entries }, { data: approvals }] = await Promise.all([
        supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
        supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId),
      ]);

      const completedSet        = new Set((entries || []).map(e => e.pokemon_id));
      const restrictedSet       = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
      const historicalSet       = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
      const pendingSet          = new Set((approvals || []).map(a => a.pokemon_id));
      const pendingRestrictedSet = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));

      const { data: poolData, error: poolError } = await supabase
        .from('monthly_pokemon_pool')
        .select('position, pokemon_id')
        .eq('month_id', ACTIVE_MONTH_ID);

      if (poolError) throw poolError;

      const states = (poolData || []).map(({ position, pokemon_id }) => ({
        position,
        is_checked:           completedSet.has(pokemon_id),
        is_restricted:        restrictedSet.has(pokemon_id),
        is_historical:        historicalSet.has(pokemon_id),
        is_pending:           !completedSet.has(pokemon_id) && pendingSet.has(pokemon_id),
        is_pending_restricted: completedSet.has(pokemon_id) && !restrictedSet.has(pokemon_id) && pendingRestrictedSet.has(pokemon_id),
      }));

      res.set('Cache-Control', 'no-store');
      return res.json({ states });
    }

    const [
      { data: entries },
      { data: approvals },
      { data: poolData, error: poolError },
    ] = await Promise.all([
      mode === 'live'
        ? supabase.from('entries').select('pokemon_id, restricted_submission, historical').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
        : Promise.resolve({ data: [] }),
      mode === 'live'
        ? supabase.from('approvals').select('pokemon_id, restricted_submission').eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
    ]);

    if (poolError) throw poolError;

    const completedSet        = new Set((entries || []).map(e => e.pokemon_id));
    const restrictedSet       = new Set((entries || []).filter(e => e.restricted_submission).map(e => e.pokemon_id));
    const historicalSet       = new Set((entries || []).filter(e => e.historical).map(e => e.pokemon_id));
    const pendingSet          = new Set((approvals || []).map(a => a.pokemon_id));
    const pendingRestrictedSet = new Set((approvals || []).filter(a => a.restricted_submission).map(a => a.pokemon_id));
    const pokemonIds          = (poolData || []).map(p => p.pokemon_id).filter(Boolean);

    const { data: pokemonData } = await supabase
      .from('pokemon_master')
      .select('id, name, img_url')
      .in('id', pokemonIds);

    const pokemonMap = {};
    (pokemonData || []).forEach(p => { pokemonMap[p.id] = p; });

    const poolByPosition = {};
    (poolData || []).forEach(pool => { poolByPosition[pool.position] = pool; });

    const board = [];
    for (let pos = 1; pos <= 25; pos++) {
      if (pos === 13) {
        board.push({ position: 13, is_checked: true, is_pending: false, pokemon_name: 'FREE', pokemon_gif: null });
        continue;
      }
      const pool = poolByPosition[pos];
      const poke = pool ? pokemonMap[pool.pokemon_id] : null;
      board.push(poke ? {
        position: pos,
        is_checked:           mode === 'live' && completedSet.has(pool.pokemon_id),
        is_restricted:        mode === 'live' && restrictedSet.has(pool.pokemon_id),
        is_historical:        mode === 'live' && historicalSet.has(pool.pokemon_id),
        is_pending:           mode === 'live' && !completedSet.has(pool.pokemon_id) && pendingSet.has(pool.pokemon_id),
        is_pending_restricted: mode === 'live' && completedSet.has(pool.pokemon_id) && !restrictedSet.has(pool.pokemon_id) && pendingRestrictedSet.has(pool.pokemon_id),
        pokemon_name: poke.name || 'Unknown',
        pokemon_gif: poke.img_url,
      } : {
        position: pos,
        is_checked: false,
        is_restricted: false,
        is_historical: false,
        is_pending: false,
        is_pending_restricted: false,
        pokemon_name: 'EMPTY',
        pokemon_gif: null,
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ month: monthData.month_year_display, board });
  } catch (err) {
    console.error('Overlay board error:', err);
    res.status(500).json({ error: 'Failed to fetch overlay board' });
  }
});

// GET /api/overlay/leaderboard?key=pb_xxx&period=monthly|season|year|alltime&limit=5|10|20|25&pin=1
app.get('/api/overlay/leaderboard', async (req, res) => {
  try {
    const userId = await validateApiKey(req.query.key);
    if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

    const VALID_PERIODS = ['monthly', 'season', 'year', 'alltime'];
    const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'monthly';
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = [5, 10, 20, 25].includes(rawLimit) ? rawLimit : 10;
    const pin = req.query.pin !== '0'; // append streamer's row if outside top N (opt-out with &pin=0)

    const PERIOD_LABELS = { monthly: 'This Month', season: 'This Season', year: 'This Year', alltime: 'All Time' };

    // Build the full sorted list (no slice yet — needed to find streamer's true rank)
    let fullRanked = []; // [{ user_id, points }], sorted desc

    if (period === 'alltime') {
      const { data: allPoints } = await supabase.from('user_monthly_points').select('user_id, points, last_updated');
      const byUser = {}, firstBy = {};
      (allPoints || []).forEach(row => {
        byUser[row.user_id] = (byUser[row.user_id] || 0) + row.points;
        if (!firstBy[row.user_id] || row.last_updated < firstBy[row.user_id]) firstBy[row.user_id] = row.last_updated;
      });
      fullRanked = Object.entries(byUser)
        .sort(([a, va], [b, vb]) => vb - va || (firstBy[a] < firstBy[b] ? -1 : 1))
        .map(([user_id, points]) => ({ user_id, points }));
    } else {
      const activeMonth = await getActiveMonth();
      if (!activeMonth) return res.json({ label: PERIOD_LABELS[period], rows: [] });

      let fromDate;
      if (period === 'monthly') {
        fromDate = activeMonth.start_date;
      } else if (period === 'season') {
        const m = new Date(activeMonth.start_date);
        fromDate = new Date(m.getFullYear(), Math.floor(m.getMonth() / 3) * 3, 1).toISOString();
      } else {
        fromDate = new Date(new Date(activeMonth.start_date).getFullYear(), 0, 1).toISOString();
      }

      const { data: months } = await supabase
        .from('bingo_months')
        .select('id')
        .gte('start_date', fromDate)
        .lte('start_date', activeMonth.start_date);

      const monthIds = (months || []).map(m => m.id);
      if (monthIds.length === 0) return res.json({ label: PERIOD_LABELS[period], rows: [] });

      const { data: groupPoints } = await supabase
        .from('user_monthly_points')
        .select('user_id, points, last_updated')
        .in('month_id', monthIds);

      const byUser = {}, firstBy = {};
      (groupPoints || []).forEach(row => {
        byUser[row.user_id] = (byUser[row.user_id] || 0) + row.points;
        if (!firstBy[row.user_id] || row.last_updated < firstBy[row.user_id]) firstBy[row.user_id] = row.last_updated;
      });
      fullRanked = Object.entries(byUser)
        .sort(([a, va], [b, vb]) => vb - va || (firstBy[a] < firstBy[b] ? -1 : 1))
        .map(([user_id, points]) => ({ user_id, points }));
    }

    if (fullRanked.length === 0) return res.json({ label: PERIOD_LABELS[period], rows: [] });

    // Find streamer's true rank before slicing
    const streamerIndex = fullRanked.findIndex(u => u.user_id === userId);
    const streamerOutside = pin && streamerIndex >= limit; // true rank is outside top N

    // Slice to limit for the main list
    const topN = fullRanked.slice(0, limit);

    // Collect user IDs to look up — include streamer if pinning them
    const userIds = topN.map(u => u.user_id);
    if (streamerOutside && !userIds.includes(userId)) userIds.push(userId);

    const { data: usersData } = await supabase
      .from('users')
      .select('id, display_name, username')
      .in('id', userIds);

    const usersMap = {};
    (usersData || []).forEach(u => { usersMap[u.id] = u; });

    // Fetch bingo achievements for current month to display in overlay
    const achievementsMap = {};
    try {
      const achMonth = await getActiveMonth();
      if (achMonth && userIds.length > 0) {
        const { data: achData } = await supabase
          .from('bingo_achievements')
          .select('user_id, bingo_type')
          .in('user_id', userIds)
          .eq('month_id', achMonth.id);
        (achData || []).forEach(a => {
          if (!achievementsMap[a.user_id]) achievementsMap[a.user_id] = {};
          achievementsMap[a.user_id][a.bingo_type] = true;
        });
      }
    } catch {}

    const rows = topN.map((u, i) => ({
      rank: i + 1,
      user_id: u.user_id,
      display_name: usersMap[u.user_id]?.display_name || 'Unknown',
      username: usersMap[u.user_id]?.username || '',
      points: u.points,
      pinned: false,
      achievements: achievementsMap[u.user_id] || {},
    }));

    // Append streamer row if they're outside the top N
    if (streamerOutside) {
      const su = fullRanked[streamerIndex];
      rows.push({
        rank: streamerIndex + 1,
        user_id: su.user_id,
        display_name: usersMap[su.user_id]?.display_name || 'Unknown',
        username: usersMap[su.user_id]?.username || '',
        points: su.points,
        pinned: true,
        achievements: achievementsMap[su.user_id] || {},
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ label: PERIOD_LABELS[period], rows });
  } catch (err) {
    console.error('Overlay leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch overlay leaderboard' });
  }
});

// ── BADGE ENDPOINTS ──────────────────────────────────────────────────────────

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

    // Fetch this user's earned badges
    let earnedBadgeIds = new Set();
    if (userId) {
      const { data: earned } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', userId);
      earnedBadgeIds = new Set((earned || []).map(e => e.badge_id));
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

      if (isEarned) {
        return { ...badge, is_earned: true, hint_visible: true };
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
      .select('badge_id, earned_at, badges(*)')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    if (error) throw error;

    res.set('Cache-Control', 'no-store');
    res.json(data || []);
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
    res.set('Cache-Control', 'no-store');
    res.json(data || []);
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

// ── Pokémon search (mod use — collection tagger) ──────────────────────────────
// GET /api/pokemon/search?q=rayquaza
app.get('/api/pokemon/search', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const { data, error } = await supabase
      .from('pokemon_master')
      .select('id, name, national_dex_id, img_url, collection_ids, game_slugs')
      .ilike('name', `%${q}%`)
      .order('national_dex_id')
      .limit(20);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Badge families (mod only) ─────────────────────────────────────────────────

// GET /api/admin/badge-families — all families ordered by display_order
app.get('/api/admin/badge-families', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const { data, error } = await supabase
      .from('badges')
      .select('*')
      .order('family_order');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/badge-families/reorder — must be before /:id to avoid param conflict
app.patch('/api/admin/badge-families/reorder', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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

// ── Collection management (mod only) ─────────────────────────────────────────

// GET /api/admin/collections — all distinct collection slugs with their required_game
app.get('/api/admin/collections', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const { data, error } = await supabase
      .from('pokemon_master')
      .select('collection_ids')
      .not('collection_ids', 'eq', '{}');
    if (error) throw error;

    const slugs = [...new Set((data || []).flatMap(p => p.collection_ids || []))].sort();

    // Fetch game filters for all slugs
    const { data: gameFilters } = await supabase
      .from('collection_game_filter')
      .select('slug, required_game')
      .in('slug', slugs);
    const gameFilterMap = Object.fromEntries((gameFilters || []).map(g => [g.slug, g.required_game]));

    res.json(slugs.map(slug => ({ slug, required_game: gameFilterMap[slug] ?? null })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/collections/:slug/game — set or clear the required game for a collection
app.put('/api/admin/collections/:slug/game', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const { slug } = req.params;
    const { required_game } = req.body; // null or a game key string

    if (required_game === null || required_game === undefined || required_game === '') {
      // Clear the filter
      await supabase.from('collection_game_filter').delete().eq('slug', slug);
    } else {
      await supabase
        .from('collection_game_filter')
        .upsert({ slug, required_game }, { onConflict: 'slug' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/collections/:slug — all Pokémon tagged with this slug
app.get('/api/admin/collections/:slug', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const { slug } = req.params;
    const [{ data, error }, { data: gameFilter }] = await Promise.all([
      supabase
        .from('pokemon_master')
        .select('id, name, national_dex_id, img_url, collection_ids')
        .contains('collection_ids', [slug])
        .order('national_dex_id'),
      supabase
        .from('collection_game_filter')
        .select('required_game')
        .eq('slug', slug)
        .maybeSingle(),
    ]);

    if (error) throw error;
    res.json({ members: data || [], required_game: gameFilter?.required_game ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/collections/:slug/pokemon/:pokemonId — add Pokémon to collection
app.post('/api/admin/collections/:slug/pokemon/:pokemonId', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const { slug, pokemonId } = req.params;

    const { data: pokemon, error: fetchErr } = await supabase
      .from('pokemon_master')
      .select('id, collection_ids')
      .eq('id', pokemonId)
      .single();

    if (fetchErr || !pokemon) return res.status(404).json({ error: 'Pokémon not found' });

    const { error: updateErr } = await supabase
      .from('pokemon_master')
      .update({ collection_ids: (pokemon.collection_ids || []).filter(c => c !== slug) })
      .eq('id', pokemonId);

    if (updateErr) throw updateErr;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pokemon Game Slug Management ──────────────────────────────────────────────

app.get('/api/admin/pokemon-game-slugs', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: isMod, error: modError } = await supabase
      .from('moderators').select('id').eq('id', userId).single();
    if (modError || !isMod) return res.status(403).json({ error: 'Moderator access required' });

    const { data, error } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url, game_slugs, restricted_game_slugs, shiny_available')
      .order('national_dex_id', { ascending: true });

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
    const { game_slugs, restricted_game_slugs, shiny_available } = req.body;

    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const { data: isMod, error: modError } = await supabase
      .from('moderators').select('id').eq('id', userId).single();
    if (modError || !isMod) return res.status(403).json({ error: 'Moderator access required' });

    const updates = {};
    if (Array.isArray(game_slugs)) updates.game_slugs = game_slugs;
    if (Array.isArray(restricted_game_slugs)) updates.restricted_game_slugs = restricted_game_slugs;
    if (typeof shiny_available === 'boolean') updates.shiny_available = shiny_available;

    const { error } = await supabase
      .from('pokemon_master')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating pokemon game slugs:', err);
    res.status(500).json({ error: 'Failed to update pokemon' });
  }
});

// --- Feedback / Bug Reports ---

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

    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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

    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
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

// ── Banners ───────────────────────────────────────────────────────────────────

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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

app.post('/api/banners', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });
    const { message, link_url, link_label, image_url, starts_at, expires_at } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
    if (!starts_at) return res.status(400).json({ error: 'starts_at is required' });
    if (!expires_at) return res.status(400).json({ error: 'expires_at is required' });
    const { data, error } = await supabase.from('banners').insert({
      message: message.trim(),
      link_url: link_url?.trim() || null,
      link_label: link_label?.trim() || null,
      image_url: image_url?.trim() || null,
      starts_at,
      expires_at,
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
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });
    const { error } = await supabase.from('banners').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// GET /api/overlay/approvals?key=pb_xxx — mod API key required
// Returns pending approval count and item list for stream overlays.
app.get('/api/overlay/approvals', async (req, res) => {
  try {
    const userId = await validateApiKey(req.query.key);
    if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

    // Only moderators may use this overlay
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderator API key required' });

    const { data: approvals } = await supabase
      .from('approvals')
      .select('id, created_at, pokemon_id, restricted_submission, historical, game, users!approvals_user_id_fkey(display_name), pokemon_master!approvals_pokemon_id_fkey(name, img_url)')
      .eq('historical', false)
      .order('created_at', { ascending: true });

    const items = (approvals || []).map(a => ({
      id: a.id,
      pokemon_name: a.pokemon_master?.name || 'Unknown',
      pokemon_img: a.pokemon_master?.img_url || null,
      display_name: a.users?.display_name || 'Unknown',
      restricted: !!a.restricted_submission,
      game: a.game || null,
      created_at: a.created_at,
    }));

    res.json({ count: items.length, items });
  } catch (err) {
    console.error('Error fetching overlay approvals:', err);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// POST /api/overlay/test-event?key=pb_xxx — mod API key required
// Fires a queue-changed broadcast so the approvals overlay can be tested on stream.
app.post('/api/overlay/test-event', async (req, res) => {
  try {
    const userId = await validateApiKey(req.query.key);
    if (!userId) return res.status(401).json({ error: 'Invalid or missing API key' });

    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderator API key required' });

    await broadcastUpdate('approvals-updates', 'queue-changed', {
      test: true,
      item: {
        id: 0,
        pokemon_name: 'Charizard',
        pokemon_img: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png',
        display_name: 'TestUser',
        restricted: false,
        game: 'Scarlet/Violet',
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending test overlay event:', err);
    res.status(500).json({ error: 'Failed to send test event' });
  }
});

// GET /api/approvals/history?page=1&limit=20 — moderator auth required
// Returns processed approval records (from approval_history table).
app.get('/api/approvals/history', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data: mod } = await supabase.from('moderators').select('id').eq('id', userId).single();
    if (!mod) return res.status(403).json({ error: 'Moderators only' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { data: history, error } = await supabase
      .from('approval_history')
      .select('id, user_id, pokemon_id, month_id, game, historical, restricted_submission, proof_url, proof_url2, proof_link, status, moderator_id, created_at, processed_at')
      .order('processed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Batch-enrich with user and pokemon display info
    const userIds = [...new Set((history || []).map(h => h.user_id).filter(Boolean))];
    const pokemonIds = [...new Set((history || []).map(h => h.pokemon_id).filter(Boolean))];

    const [usersRes, pokemonRes] = await Promise.all([
      userIds.length ? supabase.from('users').select('id, display_name').in('id', userIds) : { data: [] },
      pokemonIds.length ? supabase.from('pokemon_master').select('id, name, national_dex_id, img_url').in('id', pokemonIds) : { data: [] },
    ]);

    const userMap = Object.fromEntries((usersRes.data || []).map(u => [u.id, u]));
    const pokemonMap = Object.fromEntries((pokemonRes.data || []).map(p => [p.id, p]));

    const enriched = (history || []).map(h => ({
      ...h,
      display_name: userMap[h.user_id]?.display_name || 'Unknown',
      pokemon_name: pokemonMap[h.pokemon_id]?.name || 'Unknown',
      national_dex_id: pokemonMap[h.pokemon_id]?.national_dex_id || null,
      pokemon_img: pokemonMap[h.pokemon_id]?.img_url || null,
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching approval history:', err);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
});

// Start server locally (not needed in Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;