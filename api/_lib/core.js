/**
 * Shared API infrastructure: supabase client, constants, caches, and every
 * helper used by more than one route module.
 *
 * Extracted verbatim from the original monolithic api/index.js — handler
 * bodies were relocated, not rewritten.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');

const cors = require('cors');

const rateLimit = require('express-rate-limit');

const { contextBuilders, buildCheckFromDB } = require('../badgeRegistry');

const { createClient } = require('@supabase/supabase-js');

const multer = require('multer');

// Multer config with file size limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 4 * 1024 * 1024, // 4MB per file (Vercel limit is 4.5MB total)
    files: 10 // file + file2 + evolutionFile + evolutionSummaryFile + up to 6 extraFiles
  }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Build a default R2 pokemon image URL from national_dex_id.
// Uses form 000 and gender 'mf' as safe defaults — sufficient for thumbnails in
// notifications, approvals, and history where full form/gender data isn't fetched.
const R2_BASE = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev';

const pokeR2Url = (national_dex_id) => {
  if (!national_dex_id) return null;
  const dex = String(national_dex_id).padStart(4, '0');
  return `${R2_BASE}/poke_capture_${dex}_000_mf_n_00000000_f_r.png`;
};

// Required pokemon_master fields for PokemonImage to render correctly (gender + form resolution).
// Always use this when querying pokemon_master for display via the PokemonImage component.
// Without genderless/gender_difference fields, resolveGenderCodes() defaults to 'mf' and
// genderless pokemon get broken image URLs.
const POKEMON_IMAGE_FIELDS = 'id, name, display_name, national_dex_id, genderless, has_gender_difference, has_major_gender_difference, custom_gender_code, forms_count, form_id';

// Game label lookup for /api/stats/month's catches_by_game breakdown.
// Mirrors client/src/constants/games.js — duplicated here because that file is
// an ES module and this file is CommonJS. Keep labels in sync if games.js changes.
const GAME_LABELS = {
  firered_leafgreen: 'Pokémon FireRed / LeafGreen',
  legends_za: 'Pokémon Legends: Z-A',
  scarlet_violet: 'Pokémon Scarlet / Violet',
  legends_arceus: 'Pokémon Legends: Arceus',
  brilliant_diamond_shining_pearl: 'Pokémon Brilliant Diamond / Shining Pearl',
  sword_shield: 'Pokémon Sword / Shield',
  lets_go_pikachu_eevee: 'Pokémon Lets Go Pikachu / Eevee',
  ultra_sun_ultra_moon: 'Pokémon Ultra Sun / Ultra Moon',
  sun_moon: 'Pokémon Sun / Moon',
  omega_ruby_alpha_sapphire: 'Pokémon Omega Ruby / Alpha Sapphire',
  x_y: 'Pokémon X / Y',
  black2_white2: 'Pokémon Black 2 / White 2',
  black_white: 'Pokémon Black / White',
  heartgold_soulsilver: 'Pokémon HeartGold / SoulSilver',
  platinum: 'Pokémon Platinum',
  diamond_pearl: 'Pokémon Diamond / Pearl',
  emerald: 'Pokémon Emerald',
  ruby_sapphire: 'Pokémon Ruby / Sapphire',
  crystal: 'Pokémon Crystal',
  gold_silver: 'Pokémon Gold / Silver',
  yellow: 'Pokémon Yellow',
  red_blue: 'Pokémon Red / Blue',
};

// Valid tier_list_submissions.tiers values. Per gan-harness/spec.md (and its
// source plan .claude/plans/tidy-wandering-pascal.md) these are difficulty
// tiers, not letter grades.
//
// `sleeper` IS one of the five tiers. Converting it to an orthogonal flag was
// proposed (docs/TIER_LIST_PLAN.md Q4) and then reversed by the owner on
// 2026-08-02 — it stays a tier. Do not remove it from this list.
const VALID_TIER_CODES = ['easy', 'medium', 'hard', 'super_hard', 'sleeper'];

// Tier lists are ranked twice: once for Standard hunting, once for Restricted.
// Both rank the SAME 24 board mons (owner decision Q1) — the restricted pool is
// deliberately not subset by pokemon_master.restricted_game_slugs.
const TIER_LIST_MODES = ['standard', 'restricted'];
const DEFAULT_TIER_LIST_MODE = 'standard';

// ── Month rollover offset ─────────────────────────────────────────────────────
// Month rollover is shifted 4 hours past midnight UTC (i.e. new month becomes
// active at 04:00 UTC on day 1). start_date is a bare DATE (implicit midnight
// UTC), so we shift "now" by -4h wherever we compare current time against a
// month's window. Cron in vercel.json is scheduled 4 hours later to match.
const MONTH_ROLLOVER_OFFSET_MS = 4 * 60 * 60 * 1000;

const nowForMonth = () => new Date(Date.now() - MONTH_ROLLOVER_OFFSET_MS);

// ── Module-level caches ───────────────────────────────────────────────────────
// Active month: only changes once a month. Cache the result and use end_date to
// know exactly when it's stale — no arbitrary TTL needed. Mod users with a
// time_offset_days bypass the cache since their effective date differs.
let activeMonthCache = null; // { id, month_year_display, start_date, end_date }

let activeMonthPromise = null; // in-flight fetch shared by concurrent callers (prevents cold-start race)

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
        .from('pokemon_master').select('id, national_dex_id, name, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference').in('id', pokemonIds);
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

// Looks up the user's linked OAuth identities, finds the best available avatar_url
// (prefers Discord, then Twitch, then Google), updates the users table, and returns it.
async function refreshAvatarFromProvider(userId) {
  try {
    const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !user) return null;

    const PROVIDER_PRIORITY = ['discord', 'twitch', 'google'];
    let avatarUrl = null;
    for (const provider of PROVIDER_PRIORITY) {
      const identity = user.identities?.find(i => i.provider === provider);
      if (identity?.identity_data?.avatar_url) {
        avatarUrl = identity.identity_data.avatar_url;
        break;
      }
    }
    if (!avatarUrl) return null;

    await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
    console.log(`[avatar-sync] Refreshed avatar for user ${userId}`);
    return avatarUrl;
  } catch (err) {
    console.error('[avatar-sync] Avatar refresh failed (non-fatal):', err.message);
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
  const now = nowForMonth();

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
      // Order by start_date desc + limit(1) so overlapping windows (end_date of
      // month N intentionally extends past start_date of month N+1) pick the
      // NEWEST month rather than PGRST erroring on >1 row.
      const { data, error } = await supabase
        .from('bingo_months')
        .select('id, month_year_display, start_date, end_date')
        .lte('start_date', effectiveDateISO)
        .gte('end_date', effectiveDateISO)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // Transient DB / edge-function failure — bubble up so the caller can 503.
        const e = new Error('Failed to look up active month');
        e.transient = true; e.cause = error;
        throw e;
      }
      if (!data) { console.error('No active month found (mod)'); return null; }
      return data;
    }
  }

  const nowISO = now.toISOString();

  // end_date is TIMESTAMPTZ (the exact moment the month expires) — direct compare.
  // During the overlap window near end_date, a newer month may already have
  // become active; force a refetch so we don't serve the stale outgoing month.
  const CACHE_OVERLAP_REFETCH_MS = MONTH_ROLLOVER_OFFSET_MS + 60 * 60 * 1000; // 5h
  if (activeMonthCache
      && now < new Date(activeMonthCache.end_date)
      && (new Date(activeMonthCache.end_date) - now) > CACHE_OVERLAP_REFETCH_MS) {
    return activeMonthCache;
  }

  // Cache miss or expired. Share a single in-flight fetch so concurrent callers
  // don't each hit the DB (fixes the cold-start double-query race).
  if (activeMonthPromise) return activeMonthPromise;

  console.log('Fetching active month from DB - date:', nowISO);
  activeMonthPromise = (async () => {
    // Order by start_date desc + limit(1) so overlapping windows (end_date of
    // month N intentionally extends past start_date of month N+1) pick the
    // NEWEST month rather than PGRST erroring on >1 row.
    const { data: activeMonthData, error: monthError } = await supabase
      .from('bingo_months')
      .select('id, month_year_display, start_date, end_date')
      .lte('start_date', nowISO)
      .gte('end_date', nowISO)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (monthError) {
      // Transient DB / edge-function failure — bubble up so the caller can 503.
      const e = new Error('Failed to look up active month');
      e.transient = true; e.cause = monthError;
      throw e;
    }
    if (!activeMonthData) {
      console.error('No active month found for date:', nowISO);
      return null;
    }

    activeMonthCache = activeMonthData;
    console.log('Active month cached:', activeMonthData.id);
    return activeMonthData;
  })();

  try {
    return await activeMonthPromise;
  } finally {
    activeMonthPromise = null;
  }
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

// Resolve the month for these features: an explicit ?month_id, or the active month.
async function resolveStatsMonth(req, userId, fields = 'id, month_year_display, start_date, end_date') {
  if (req.query.month_id) {
    const monthId = parseInt(req.query.month_id, 10);
    if (Number.isNaN(monthId)) return null;
    const { data, error } = await supabase
      .from('bingo_months')
      .select(fields)
      .eq('id', monthId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  return getActiveMonth(userId);
}

// ── tier_list_submissions access ─────────────────────────────────────────────
// `mode` is added by migration 20260802180000, which the deployer applies by
// hand, so the API has to run correctly on either side of it: a hard
// `.eq('mode', …)` against an unmigrated database
// returns PostgREST 42703 and would take /tier-list *and* /stats/month down.
//
// The probe result is cached for the life of the process — a column cannot
// disappear, and after the migration the first request re-probes on cold start.
// The cache is a module-local `let` and is deliberately NOT exported (a
// destructured require would capture a stale snapshot — see CLAUDE.md).
let tierListSchemaCache = null; // { mode: boolean }

async function getTierListSchema() {
  if (tierListSchemaCache) return tierListSchemaCache;
  const hasColumn = async (column) => {
    const { error } = await supabase.from('tier_list_submissions').select(column).limit(1);
    // 42703 = undefined_column. Any other error is a real fault; assume present
    // so it surfaces on the actual query rather than being masked as "legacy".
    return !(error && error.code === '42703');
  };
  tierListSchemaCache = { mode: await hasColumn('mode') };
  return tierListSchemaCache;
}

// Single read path for tier list rows. Always returns rows normalised to the
// post-migration shape (`mode` defaulted to 'standard') so callers never branch
// on the schema themselves.
async function fetchTierSubmissions(monthId, { mode = null, userId = null, columns = 'user_id, tiers, submitted_at, updated_at' } = {}) {
  const schema = await getTierListSchema();
  const select = [columns, schema.mode ? 'mode' : null].filter(Boolean).join(', ');

  let query = supabase.from('tier_list_submissions').select(select).eq('month_id', monthId);
  if (userId) query = query.eq('user_id', userId);
  if (mode && schema.mode) query = query.eq('mode', mode);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data || []).map(r => ({ ...r, mode: r.mode || DEFAULT_TIER_LIST_MODE }));
  // Pre-migration the table physically cannot hold a restricted row, so a
  // restricted read is empty rather than "every legacy row".
  if (mode && !schema.mode && mode !== DEFAULT_TIER_LIST_MODE) rows = [];
  return { rows, schema };
}

// A tier list counts only once every mon on the board carries a tier.
const rankedIdsIn = (tiers) => Object.keys(tiers || {}).filter(k => tiers[k]);
const isCompleteTiers = (tiers, poolIds) => {
  const ids = poolIds instanceof Set ? poolIds : new Set(poolIds);
  if (!ids.size) return false;
  return [...ids].every(id => Boolean((tiers || {})[String(id)]));
};

// Submit catch
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
  message: { error: 'Too many submissions. Please wait a few minutes before trying again.' },
});

// Upload a single multer file buffer to R2 and return its public URL.
async function uploadBufferToR2(file, key) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'shiny-sprites',
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));
  return `${process.env.R2_BUCKET_URL}/${key}`;
}

// Uploads the optional evolution + extra proof files shared by both submission
// endpoints. Returns { proofUrl3, proofUrl4, extraImageUrls }. Throws on R2 error.
async function uploadSupplementalProof(req, userId, pokemon_id, tag) {
  const MAX_FILE_SIZE = 4 * 1024 * 1024;
  const evoFile        = req.files?.evolutionFile?.[0];
  const evoSummaryFile = req.files?.evolutionSummaryFile?.[0];
  const extraFiles     = req.files?.extraFile || [];

  for (const f of [evoFile, evoSummaryFile, ...extraFiles]) {
    if (f && f.size > MAX_FILE_SIZE) {
      const err = new Error(`"${f.originalname}" is too large (${(f.size / 1048576).toFixed(1)}MB). Compress to under 4MB.`);
      err.fileTooBig = true;
      throw err;
    }
  }

  const ts = Date.now();
  let proofUrl3 = null, proofUrl4 = null;
  const extraImageUrls = [];
  if (evoFile)        proofUrl3 = await uploadBufferToR2(evoFile, `approval/${userId}-${pokemon_id}-${ts}-${tag}evo-${evoFile.originalname}`);
  if (evoSummaryFile) proofUrl4 = await uploadBufferToR2(evoSummaryFile, `approval/${userId}-${pokemon_id}-${ts}-${tag}evosum-${evoSummaryFile.originalname}`);
  for (let i = 0; i < extraFiles.length; i++) {
    extraImageUrls.push(await uploadBufferToR2(extraFiles[i], `approval/${userId}-${pokemon_id}-${ts}-${tag}extra${i}-${extraFiles[i].originalname}`));
  }
  return { proofUrl3, proofUrl4, extraImageUrls: extraImageUrls.length > 0 ? extraImageUrls : null };
}

// Current Terms of Service / Privacy Policy version. Bump when either changes
// materially — every user whose stored tos_version_accepted is lower will be
// re-prompted by ConsentGate on their next visit.
const TOS_VERSION = 2;

function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Helper: Pick a random eligible pokemon for a given position during reroll
async function pickRandomPokemonForPosition(monthId, position) {
  // Current pool for this month (with position so we can exclude the rerolled slot's family)
  const { data: pool } = await supabase
    .from('monthly_pokemon_pool')
    .select('pokemon_id, position')
    .eq('month_id', monthId);

  const usedIds = new Set((pool || []).map(r => r.pokemon_id));

  // All eligible pokemon (including family_id and category flags for exclusion logic)
  const { data: allPokemon } = await supabase
    .from('pokemon_master')
    .select('id, name, national_dex_id, family_id, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt, pseudo_legendary, pla, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
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

  // Calculate current board category distribution
  const categories = ['legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil', 'regional_alt', 'pseudo_legendary', 'pla'];
  const boardCategoryCounts = {};
  categories.forEach(cat => { boardCategoryCounts[cat] = 0; });

  (pool || []).forEach(r => {
    if (r.position !== position) {
      const p = allPokemon.find(pk => pk.id === r.pokemon_id);
      if (p) {
        categories.forEach(cat => {
          if (p[cat] === true) boardCategoryCounts[cat]++;
        });
      }
    }
  });

  const { thresholds } = await calculateCategoryThresholds();

  // Exclude: already on board, family on current board, family on last month's board
  const isEligibleFamily = p =>
    p.family_id == null || (!boardFamilyIds.has(p.family_id) && !lastMonthFamilyIds.has(p.family_id));

  const isWithinCategoryBounds = p => {
    // Check upper bounds (ceiling)
    for (const cat of categories) {
      if (p[cat] === true && boardCategoryCounts[cat] >= thresholds[cat].ceiling) {
        return false;
      }
    }
    // Check lower bounds (floor) - only 1 slot being replaced, so just check we're not below floor
    for (const cat of categories) {
      if (p[cat] !== true) {
        const currentCount = boardCategoryCounts[cat];
        if (currentCount < thresholds[cat].floor) {
          // Can't afford to not pick from this category
          return false;
        }
      }
    }
    return true;
  };

  // Pick from never-used first, then once-used
  const neverUsed = (allPokemon || []).filter(p => !usageCount[p.id] && !usedIds.has(p.id) && isEligibleFamily(p));
  const usedOnce  = (allPokemon || []).filter(p => usageCount[p.id] === 1 && !usedIds.has(p.id) && isEligibleFamily(p));

  // Prefer candidates within bounds
  const neverUsedBounded = neverUsed.filter(isWithinCategoryBounds);
  const usedOnceBounded = usedOnce.filter(isWithinCategoryBounds);

  const candidates = neverUsedBounded.length > 0 ? neverUsedBounded : usedOnceBounded.length > 0 ? usedOnceBounded : (neverUsed.length > 0 ? neverUsed : usedOnce);
  if (!candidates.length) return null; // No eligible pokemon available

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const is_second_round = (usageCount[pick.id] || 0) > 0;

  return {
    pokemon_id: pick.id,
    name: pick.name,
    national_dex_id: pick.national_dex_id,
    is_second_round,
    display_name: pick.display_name,
    form_id: pick.form_id,
    forms_count: pick.forms_count,
    custom_gender_code: pick.custom_gender_code,
    genderless: pick.genderless,
    has_gender_difference: pick.has_gender_difference,
    has_major_gender_difference: pick.has_major_gender_difference,
  };
}

// Helper: Calculate category balance thresholds for board generation
// Returns { categoryName: { count, avg, floor, ceiling }, boardCapacity, totalPokemon }
// Board capacity = total shiny-available pokemon / 24 slots (one complete rotation)
let categoryThresholdsCache = null;

async function calculateCategoryThresholds() {
  if (categoryThresholdsCache) return categoryThresholdsCache;

  const { data: allPokemon } = await supabase
    .from('pokemon_master')
    .select('id, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt, pseudo_legendary, pla')
    .eq('shiny_available', true);

  if (!allPokemon || allPokemon.length === 0) {
    throw new Error('No pokemon available');
  }

  const totalPokemon = allPokemon.length;
  const boardCapacity = Math.floor(totalPokemon / 24);

  const categories = ['legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil', 'regional_alt', 'pseudo_legendary', 'pla'];
  const thresholds = {};

  categories.forEach(cat => {
    const count = allPokemon.filter(p => p[cat] === true).length;
    const avg = count / boardCapacity;
    const cleanAvg = Math.round(avg * 100) / 100; // Round to 2 decimals, remove trailing zeros
    thresholds[cat] = {
      count,
      avg: cleanAvg,
      floor: Math.floor(avg),
      ceiling: Math.ceil(avg),
    };
  });

  categoryThresholdsCache = { thresholds, boardCapacity, totalPokemon };
  return categoryThresholdsCache;
}

// Helper: Generate a completely new pool for a month (deletes old, generates new)
async function generateNewPoolForMonth(monthId, lockedPokemonIds = [], countToGenerate = 24, preAppliedCategoryCounts = null) {
  // Define board positions (all except free space at 13)
  const positions = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25];

  // Only delete/regenerate full pool if generating all 24
  if (countToGenerate === 24) {
    await supabase.from('monthly_pokemon_pool').delete().eq('month_id', monthId);
  }

  // Pull every shiny-available pokemon with category flags
  const { data: allPokemon } = await supabase
    .from('pokemon_master')
    .select('id, name, national_dex_id, display_name, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt, pseudo_legendary, pla')
    .eq('shiny_available', true);

  if (!allPokemon || allPokemon.length === 0) throw new Error('No pokemon available');

  // Count how many months each pokemon has appeared in
  const { data: history } = await supabase
    .from('monthly_pokemon_pool')
    .select('pokemon_id')
    .neq('month_id', monthId);

  const usageCount = {};
  (history || []).forEach(r => { usageCount[r.pokemon_id] = (usageCount[r.pokemon_id] || 0) + 1; });

  // Account for locked Pokemon in usage count so they're considered "already used" this month
  const lockedPokemonSet = new Set(lockedPokemonIds);
  lockedPokemonIds.forEach(id => {
    usageCount[id] = (usageCount[id] || 0) + 1;
  });

  // Build family exclusion set from the previous month's board
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

  const categories = ['legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil', 'regional_alt', 'pseudo_legendary', 'pla'];
  const { thresholds } = await calculateCategoryThresholds();

  // Pre-build maps for O(1) lookups
  const familyMap = Object.fromEntries(allPokemon.map(p => [p.id, p.family_id]));
  const categoryMaps = {};
  categories.forEach(cat => {
    categoryMaps[cat] = new Set(allPokemon.filter(p => p[cat] === true).map(p => p.id));
  });

  // Track category counts - use provided pre-applied counts OR count from locked Pokemon
  const selectedCounts = {};

  if (preAppliedCategoryCounts) {
    // Use the pre-calculated counts (locked Pokemon already accounted for)
    categories.forEach(cat => {
      selectedCounts[cat] = preAppliedCategoryCounts[cat] || 0;
    });
  } else {
    // Count locked Pokemon categories
    const lockedPokemonData = (allPokemon || []).filter(p => lockedPokemonSet.has(p.id));

    categories.forEach(cat => { selectedCounts[cat] = 0; });

    lockedPokemonData.forEach(p => {
      categories.forEach(cat => {
        if (p[cat] === true) {
          selectedCounts[cat]++;
        }
      });
    });
  }

  // Calculate initial floor debt: total categories needed to reach all floors
  let floorDebt = 0;
  categories.forEach(cat => {
    const needed = Math.max(0, thresholds[cat].floor - selectedCounts[cat]);
    floorDebt += needed;
  });

  function isWithinCategoryBounds(pokemon, remainingSlots) {
    const slotsAfterThisPick = remainingSlots - 1;

    // Check ceilings: if pokemon has a category at ceiling, reject
    for (const cat of categories) {
      if (categoryMaps[cat].has(pokemon.id) && selectedCounts[cat] >= thresholds[cat].ceiling) {
        return false;
      }
    }

    // Check floors: if we need a category and this pokemon doesn't have it, verify we have slots
    for (const cat of categories) {
      if (!categoryMaps[cat].has(pokemon.id)) {
        const needed = thresholds[cat].floor - selectedCounts[cat];
        if (needed > 0 && needed > slotsAfterThisPick) {
          return false;
        }
      }
    }

    // CRITICAL: Check if we have enough slots left for remaining floor debt
    if (slotsAfterThisPick < floorDebt) {
      // Running low on slots — this pokemon MUST help reduce debt
      let helpfulCategories = 0;
      for (const cat of categories) {
        if (categoryMaps[cat].has(pokemon.id) && selectedCounts[cat] < thresholds[cat].floor) {
          helpfulCategories++;
        }
      }

      if (helpfulCategories === 0) {
        return false;
      }
    }

    return true;
  }

  function updateCategoryCounts(pokemon) {
    for (const cat of categories) {
      if (categoryMaps[cat].has(pokemon.id)) {
        if (selectedCounts[cat] < thresholds[cat].floor) {
          floorDebt--;
        }
        selectedCounts[cat]++;
      }
    }
  }

  function pickWithFamilyAndCategoryExclusion(pool, count, excludedFamilies) {
    const picked = [];
    const shuffled = shuffleArray([...pool]);
    const picked_ids = new Set();

    for (const p of shuffled) {
      if (picked.length >= count) break;
      const family_ok = p.family_id == null || !excludedFamilies.has(p.family_id);
      const not_picked = !picked_ids.has(p.id);
      const remaining = count - picked.length;

      if (family_ok && not_picked && isWithinCategoryBounds(p, remaining)) {
        picked.push(p);
        picked_ids.add(p.id);
        updateCategoryCounts(p);
        if (p.family_id != null) excludedFamilies.add(p.family_id);
      }
    }

    // Fallback: if we couldn't fill all slots while respecting bounds, try again with bounds
    // This should rarely trigger, but if it does, we still need to respect ceiling constraints
    for (const p of shuffled) {
      if (picked.length >= count) break;
      const family_ok = p.family_id == null || !excludedFamilies.has(p.family_id);
      const not_picked = !picked_ids.has(p.id);
      const remaining = count - picked.length;

      if (family_ok && not_picked && isWithinCategoryBounds(p, remaining)) {
        picked.push(p);
        picked_ids.add(p.id);
        updateCategoryCounts(p);
        if (p.family_id != null) excludedFamilies.add(p.family_id);
      }
    }

    return picked;
  }

  // Exclude locked Pokemon from being regenerated
  const neverUsed = (allPokemon || []).filter(p => !usageCount[p.id] && !lockedPokemonSet.has(p.id));
  const usedOnce  = (allPokemon || []).filter(p => usageCount[p.id] === 1 && !lockedPokemonSet.has(p.id));

  let selected;
  const familyExclusionSet = new Set(lastMonthFamilyIds);
  const neverPicked = pickWithFamilyAndCategoryExclusion(neverUsed, countToGenerate, familyExclusionSet);
  if (neverPicked.length >= countToGenerate) {
    selected = neverPicked.map(p => ({ ...p, is_second_round: false }));
  } else {
    const need = countToGenerate - neverPicked.length;
    const oncePicked = pickWithFamilyAndCategoryExclusion(usedOnce, need, familyExclusionSet);
    selected = [
      ...neverPicked.map(p => ({ ...p, is_second_round: false })),
      ...oncePicked.map(p => ({ ...p, is_second_round: true })),
    ];
  }

  // For return value, just return Pokemon without position assignment (caller will assign)
  // Note: we don't insert into DB here anymore when called with countToGenerate < 24

  // Only insert to DB if generating full pool
  if (countToGenerate === 24) {
    const poolRows = selected.map((p, i) => ({
      month_id:   monthId,
      pokemon_id: p.id,
      position:   positions[i],
    }));

    const { error: poolInsertErr } = await supabase.from('monthly_pokemon_pool').insert(poolRows);
    if (poolInsertErr) throw new Error(`Failed to insert pokemon pool: ${poolInsertErr.message}`);
  }

  // Build category distribution stats
  const categoryStats = {};
  categories.forEach(cat => {
    const boardCount = selectedCounts[cat];
    const avg = thresholds[cat].avg;
    categoryStats[cat] = {
      boardCount,
      avg,
      floor: thresholds[cat].floor,
      ceiling: thresholds[cat].ceiling,
    };
  });

  const boardData = selected.map((p, i) => ({
    position:       countToGenerate === 24 ? positions[i] : null,
    pokemon_id:     p.id,
    name:           p.name,
    national_dex_id: p.national_dex_id,
    display_name:   p.display_name,
    form_id:        p.form_id,
    forms_count:    p.forms_count,
    custom_gender_code: p.custom_gender_code,
    genderless:     p.genderless,
    has_gender_difference: p.has_gender_difference,
    has_major_gender_difference: p.has_major_gender_difference,
    is_second_round: p.is_second_round,
    pokemon: {
      id: p.id,
      name: p.name,
      national_dex_id: p.national_dex_id,
      display_name: p.display_name,
      genderless: p.genderless,
      custom_gender_code: p.custom_gender_code,
      has_gender_difference: p.has_gender_difference,
      has_major_gender_difference: p.has_major_gender_difference,
      form_id: p.form_id,
      forms_count: p.forms_count,
    },
  }));

  return {
    board: boardData,
    categoryStats,
  };
}

const SHALPHA_GAMES = new Set(['legends_arceus', 'legends_za']);

async function generateGameBoardPool(boardId, game) {
  const positions = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
  const tileCount = 25;

  let query = supabase
    .from('pokemon_master')
    .select('id, name, national_dex_id, display_name, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
    .eq('shiny_available', true);
  if (game) query = query.contains('game_slugs', [game]);
  const { data: allPokemon } = await query;
  if (!allPokemon || allPokemon.length === 0) throw new Error(`No pokemon available for game: ${game}`);

  // Exclude families from the most recent game board
  const { data: lastBoard } = await supabase
    .from('game_boards')
    .select('id')
    .neq('id', boardId)
    .order('created_at', { ascending: false })
    .limit(1);

  const excludedFamilyIds = new Set();
  if (lastBoard && lastBoard.length > 0) {
    const { data: lastPool } = await supabase
      .from('game_board_pool')
      .select('pokemon_id')
      .eq('board_id', lastBoard[0].id);
    const lastIds = (lastPool || []).map(r => r.pokemon_id);
    if (lastIds.length > 0) {
      const { data: lastPk } = await supabase
        .from('pokemon_master').select('id, family_id').in('id', lastIds);
      (lastPk || []).forEach(p => { if (p.family_id != null) excludedFamilyIds.add(p.family_id); });
    }
  }

  const available = allPokemon.filter(p => !excludedFamilyIds.has(p.family_id));
  if (available.length < tileCount) throw new Error('Not enough pokemon available after exclusion');

  const selected = shuffleArray([...available]).slice(0, tileCount);
  const shuffledPositions = shuffleArray([...positions]);

  const rows = selected.map((pok, i) => ({
    board_id: boardId,
    position: shuffledPositions[i],
    pokemon_id: pok.id,
    locked: false,
  }));

  const { error } = await supabase.from('game_board_pool').insert(rows);
  if (error) throw new Error(`Failed to insert pool: ${error.message}`);
}

async function hydrateGameBoardTiles(boardId) {
  const { data: pool } = await supabase
    .from('game_board_pool')
    .select('id, position, pokemon_id, locked')
    .eq('board_id', boardId);
  if (!pool || pool.length === 0) return [];

  const { data: pokemonData } = await supabase
    .from('pokemon_master')
    .select('id, name, national_dex_id, display_name, form_id, forms_count, genderless, has_gender_difference, has_major_gender_difference, custom_gender_code')
    .in('id', pool.map(r => r.pokemon_id));

  const pokemonMap = Object.fromEntries((pokemonData || []).map(p => [p.id, p]));
  return pool.map(tile => ({ ...tile, pokemon: pokemonMap[tile.pokemon_id] || null }));
}

async function enrichUsersWithTwitchPfp(users) {
  const all = users || [];
  const needTwitch = all.filter(u => u.twitch_url);
  if (needTwitch.length === 0) return all;
  const twitchPfpMap = {};
  try {
    const token = await getTwitchToken();
    if (token) {
      const logins = needTwitch.map(u => u.twitch_url.split('/').pop().toLowerCase()).filter(Boolean);
      const raw = await fetch(
        `https://api.twitch.tv/helix/users?${logins.map(l => `login=${l}`).join('&')}`,
        { headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID } }
      ).then(r => r.json());
      (raw.data || []).forEach(tu => { twitchPfpMap[tu.login.toLowerCase()] = tu.profile_image_url; });
    }
  } catch (err) { console.error('[twitch-pfp] error:', err.message); }
  return all.map(u => {
    const login = u.twitch_url?.split('/').pop().toLowerCase();
    const twitch_avatar_url = (login && twitchPfpMap[login]) || null;
    return { ...u, twitch_avatar_url };
  });
}

async function hydrateGameBoardClaims(boardId) {
  const { data: claims } = await supabase
    .from('game_board_claims')
    .select('position, claimed_by, claim_type, original_claimed_by, claimed_at')
    .eq('board_id', boardId);
  if (!claims || claims.length === 0) return [];

  const userIds = new Set();
  claims.forEach(c => { userIds.add(c.claimed_by); if (c.original_claimed_by) userIds.add(c.original_claimed_by); });
  const { data: users } = await supabase
    .from('users').select('id, display_name, avatar_url, twitch_url').in('id', Array.from(userIds));

  const enriched = await enrichUsersWithTwitchPfp(users);
  const userMap = Object.fromEntries(enriched.map(u => [u.id, u]));

  return claims.map(c => ({
    ...c,
    claimer: userMap[c.claimed_by] || null,
    original_claimer: c.original_claimed_by ? userMap[c.original_claimed_by] || null : null,
  }));
}

const _sandwichIngredients = (() => {
  const path = require('path');
  const fs   = require('fs');
  const fillings   = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/fillings.json'),   'utf8'));
  const condiments = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data/condiments.json'), 'utf8'));
  return { fillings, condiments };
})();

// ── Core mechanics (mirrors sandwichSearch.worker.js) ──────────────────────
const _SW = (() => {
  const MP_NAMES  = ["Egg","Catch","Exp","Item","Raid","Sparkling","Title","Humungo","Teensy","Encounter"];
  const TYPE_NAMES= ["Normal","Fighting","Flying","Poison","Ground","Rock","Bug","Ghost","Steel","Fire","Water","Grass","Electric","Psychic","Ice","Dragon","Dark","Fairy"];
  const FLAVOR    = {Sweet:0,Salty:1,Sour:2,Bitter:3,Hot:4};
  const MP        = Object.fromEntries(MP_NAMES.map((n,i)=>[n,i]));
  const TYPE      = Object.fromEntries(TYPE_NAMES.map((n,i)=>[n,i]));
  const N_FLAVOR=5, N_MP=10, N_TYPE=18;
  const POWER_TO_MP = {Encounter:'Encounter',Egg:'Egg',Raid:'Raid',Catching:'Catch',Catch:'Catch',Exp:'Exp','Item Drop':'Item',Item:'Item',Humungo:'Humungo',Teensy:'Teensy',Title:'Title',Sparkling:'Sparkling'};
  const TASTE_MAP = [[0,0,1,0,4],[9,9,9,2,9],[1,8,8,8,8],[3,2,3,3,3],[4,7,7,7,7]];
  const FLAVOR_PROFILES = {Egg:[[0,1],[0,3]],Humungo:[[4,1],[4,3],[4,2]],Teensy:[[2,1],[2,3],[2,4]],Item:[[3,4],[3,2],[3,0]],Encounter:[[1,0],[1,4],[1,2]],Exp:[[3,1],[1,3]],Catch:[[0,2],[2,0]],Raid:[[0,4],[4,0]],Title:[[null,null]],Sparkling:[[null,null]]};
  const LVL_GTE={1:0,2:180,3:380}, LVL_LT={1:180,2:380,3:Infinity};
  const POWER_FULL = {Egg:"Egg Power",Catch:"Catching Power",Exp:"Exp. Point Power",Item:"Item Drop Power",Raid:"Raid Power",Sparkling:"Sparkling Power",Title:"Title Power",Humungo:"Humungo Power",Teensy:"Teensy Power",Encounter:"Encounter Power"};

  function buildIndex(rawFillings, rawCondiments) {
    function vectors(ing, isFilling) {
      const scale=isFilling?(ing.pieces??1):1;
      const fv=Array(N_FLAVOR).fill(0),tv=Array(N_TYPE).fill(0),mv=Array(N_MP).fill(0);
      for(const{flavor,amount}of ing.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount*scale;}
      for(const{type,amount}of ing.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount*scale;}
      for(const{type:n,amount}of ing.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount*scale;}
      const isHerba=!isFilling&&(ing.name?.toLowerCase().includes('herba')??false);
      if(isHerba){mv[MP.Title]+=10000;mv[MP.Sparkling]+=20000;}
      return{fv,tv,mv,isHerba};
    }
    return{
      fills: rawFillings.map((f,i)=>({...f,varIdx:i,isFilling:true,isHerba:false,...vectors(f,true)})),
      conds: rawCondiments.map((c,i)=>({...c,varIdx:i,isFilling:false,...vectors(c,false)})),
    };
  }

  function buildVec(fillings,condiments){
    const fv=Array(N_FLAVOR).fill(0),tv=Array(N_TYPE).fill(0),mv=Array(N_MP).fill(0);
    for(const f of fillings){const pcs=f.selectedPieces??((f.pieces??1)*(f._count??1));for(const{flavor,amount}of f.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount*pcs;}for(const{type,amount}of f.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount*pcs;}for(const{type:n,amount}of f.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount*pcs;}}
    for(const c of condiments){for(const{flavor,amount}of c.tastes??[]){const i=FLAVOR[flavor];if(i!=null)fv[i]+=amount;}for(const{type,amount}of c.types??[]){const i=TYPE[type];if(i!=null)tv[i]+=amount;}for(const{type:n,amount}of c.powers??[]){const i=MP[POWER_TO_MP[n]??n];if(i!=null)mv[i]+=amount;}}
    const herba=condiments.filter(c=>c.isHerba).length;
    if(herba>=1)mv[MP.Title]+=10000;if(herba>=2)mv[MP.Sparkling]+=20000;
    for(let i=0;i<N_TYPE;i++)tv[i]+=20;
    return{fv,tv,mv};
  }

  function evaluate(fv,tv,mv){
    const rf=fv.map((a,i)=>({f:i,a})).sort((a,b)=>b.a-a.a||a.f-b.f);
    let boosted=null;
    if(rf[0]&&rf[0].a>0){const f1=rf[0].f,f2=(rf[1]&&rf[1].a>0)?rf[1].f:f1;boosted=TASTE_MAP[f1][f2];}
    const adjMv=mv.map((v,i)=>i===boosted?v+100:v);
    const rMP=adjMv.map((a,i)=>({mp:i,a})).sort((a,b)=>b.a-a.a||a.mp-b.mp);
    const rT=tv.map((a,i)=>({t:i,a})).sort((a,b)=>b.a-a.a||a.t-b.t);
    function cT(rt){const[A={t:0,a:0},,C={t:2,a:0}]=rt;const fa=A.a,sa=(rt[1]??{a:0}).a;if(fa>480)return[A,A,A];if(fa>280||(fa>105&&fa-sa>105))return[A,A,C];if(fa<=105&&fa-1.5*sa>=70)return[A,C,A];return[A,C,rt[1]??A];}
    function cL(rt){const fa=(rt[0]??{a:0}).a,ta=(rt[2]??{a:0}).a;if(fa>=460)return[3,3,3];if(fa>=380)return ta>=380?[3,3,3]:[3,3,2];if(fa>280)return ta>=180?[2,2,2]:[2,2,1];if(fa>=180)return ta>=180?[2,2,1]:[2,1,1];return[1,1,1];}
    const aT=cT(rT),aL=cL(rT);
    return rMP.filter(mp=>mp.mp!==MP.Sparkling||mp.a>1000).slice(0,3).filter((mp,i)=>mp.a>0&&aT[i]).map((mp,i)=>({power:MP_NAMES[mp.mp],fullName:POWER_FULL[MP_NAMES[mp.mp]]||MP_NAMES[mp.mp],type:mp.mp===MP.Egg?null:TYPE_NAMES[aT[i].t],level:aL[i],score:mp.a}));
  }

  function powersMatch(powers,targets){return targets.every(tgt=>{const mp=POWER_TO_MP[tgt.power]||tgt.power;return powers.some(r=>r.power===mp&&(mp==='Egg'||!tgt.type||r.type===tgt.type)&&r.level>=(tgt.level||1));});}

  function* combinations(arr,k){if(k===0){yield[];return;}for(let i=0;i<=arr.length-k;i++)for(const r of combinations(arr.slice(i+1),k-1))yield[arr[i],...r];}
  function* combinationsWithRep(arr,k){const n=arr.length;if(n===0||k===0){if(k===0)yield[];return;}const idx=new Array(k).fill(0);while(true){yield idx.map(i=>arr[i]);let i=k-1;while(i>=0&&idx[i]===n-1)i--;if(i<0)return;const v=idx[i]+1;for(let j=i;j<k;j++)idx[j]=v;}}

  function scoreFilling(f,f1,f2,tIdx,needLevel){let s=0;if(f1!==null){s+=(f.fv[f1]??0)*2;if(f2!==null)s+=(f.fv[f2]??0);for(let fl=0;fl<N_FLAVOR;fl++){if(fl!==f1&&fl!==f2)s-=(f.fv[fl]??0)*0.5;}}if(tIdx!==null){s+=(f.tv[tIdx]??0)*3;if(needLevel>1)s+=(f.tv[tIdx]??0)*2;}return s;}
  function scoreCond(c,f1,f2,tIdx){let s=0;if(f1!==null){s+=(c.fv[f1]??0)*2;if(f2!==null)s+=(c.fv[f2]??0);for(let fl=0;fl<N_FLAVOR;fl++){if(fl!==f1&&fl!==f2)s-=(c.fv[fl]??0)*0.5;}}if(tIdx!==null)s+=(c.tv[tIdx]??0)*3;return s;}

  function extractCooccurrences(results, primaryKey) {
    const cooc = {};
    for(const r of results){for(const p of r.powers){const k=`${p.power}:${p.type??'none'}:${p.level}`;if(k!==primaryKey)cooc[k]=(cooc[k]??0)+1;}}
    return cooc;
  }

  function runConfig(fills,nonHerbaConds,herbaPool,config,targets,seen,results,MAX_TOTAL){
    const{numHerba,f1,f2,targetTypeIdx,levelGte,levelLt}=config;
    const maxFill=6,maxCond=4;
    const needLevel=levelGte>=380?3:levelGte>=180?2:1;
    const scoredFills=fills.map(f=>({...f,_score:scoreFilling(f,f1,f2,targetTypeIdx,needLevel)})).filter(f=>f._score>0).sort((a,b)=>b._score-a._score).slice(0,15);
    const scoredConds=nonHerbaConds.map(c=>({...c,_score:scoreCond(c,f1,f2,targetTypeIdx)})).filter(c=>c._score>0).sort((a,b)=>b._score-a._score).slice(0,12);
    const herbaCombos=numHerba===0?[[]]:numHerba===1?herbaPool.map(h=>[h]):[...combinations(herbaPool,2)];
    for(const herbaCombo of herbaCombos){
      if(herbaCombo.length<numHerba||results.length>=MAX_TOTAL)continue;
      const usedCondSlots=maxCond-numHerba;
      for(let total=1;total<=maxFill+usedCondSlots&&results.length<MAX_TOTAL;total++){
        for(let nF=Math.min(maxFill,total);nF>=Math.max(1,total-usedCondSlots)&&results.length<MAX_TOTAL;nF--){
          const nC=total-nF;
          if(nC<(numHerba>=1?0:1)||nC>usedCondSlots)continue;
          for(const fillCombo of combinationsWithRep(scoredFills,nF)){
            if(results.length>=MAX_TOTAL)break;
            const fillings=fillCombo.map(f=>({...f,selectedPieces:f.pieces??1,_count:1}));
            const condSets=nC===0?[[]]:[...combinations(scoredConds,nC)];
            for(const condCombo of condSets){
              if(results.length>=MAX_TOTAL)break;
              const allConds=[...herbaCombo,...condCombo];
              const{fv,tv,mv}=buildVec(fillings,allConds);
              if(targetTypeIdx!==null){const tv1=tv[targetTypeIdx];if(levelGte>0&&tv1<levelGte)continue;if(levelLt<Infinity&&tv1>=levelLt)continue;}
              const powers=evaluate(fv,tv,mv);
              if(!powersMatch(powers,targets))continue;
              const key=[...fillings.map(f=>`${f.name}×${f.selectedPieces}`),...allConds.map(c=>c.name)].sort().join('|');
              if(!seen.has(key)){seen.add(key);const totalPieces=fillings.reduce((s,f)=>s+(f.selectedPieces??f.pieces??1),0)+allConds.length;results.push({fillings:fillings.map(f=>({name:f.name,pieces:f.selectedPieces??f.pieces??1})),condiments:allConds.map(c=>c.name),powers,numHerba,totalPieces});}
            }
          }
        }
      }
    }
  }

  function findSandwiches(targets) {
    const normTargets=targets.map(t=>({...t,power:POWER_TO_MP[t.power]||t.power}));
    const{fills,conds}=buildIndex(_sandwichIngredients.fillings, _sandwichIngredients.condiments);
    const herbaPool=conds.filter(c=>c.isHerba),nonHerba=conds.filter(c=>!c.isHerba);
    const hasSparkling=normTargets.some(t=>t.power==='Sparkling');
    const hasTitle=normTargets.some(t=>t.power==='Title');
    const hasLv3=normTargets.some(t=>t.level>=3);
    const hasLv2=normTargets.some(t=>t.level>=2);
    const herbaOptions=hasSparkling?[2]:hasLv3?[2,1]:hasTitle?[1]:hasLv2?[0,1]:[0];
    const primary=normTargets.find(t=>t.power!=='Sparkling'&&t.power!=='Title')??normTargets[0];
    const mpName=primary?.power??null;
    const typeIdx=(primary?.type&&primary.power!=='Egg')?(TYPE[primary.type]??null):null;
    const lv=primary?.level??1;
    const seen=new Set(),results=[];
    const MAX_TOTAL=200;
    for(const numHerba of herbaOptions){
      for(const[f1,f2]of(FLAVOR_PROFILES[mpName]??[[null,null]])){
        if(results.length>=MAX_TOTAL)break;
        runConfig(fills,nonHerba,herbaPool,{numHerba,f1,f2,targetTypeIdx:typeIdx,levelGte:LVL_GTE[lv]??0,levelLt:LVL_LT[lv]??Infinity},normTargets,seen,results,MAX_TOTAL);
      }
    }
    results.sort((a,b)=>(a.totalPieces-b.totalPieces)||((a.fillings.length+a.condiments.length)-(b.fillings.length+b.condiments.length)));
    return results;
  }

  return { findSandwiches, extractCooccurrences };
})();

// Compute what percent of users have earned each badge.
// Returns { percentByBadge: { [badge_id]: number|null }, totalUsers }.
// percent is rounded (0 decimals >= 1%, otherwise 1 decimal); null if no users.
async function computeBadgeRarity() {
  const [{ count: totalUsers }, { data: rows }] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('user_badges').select('user_id, badge_id'),
  ]);

  // distinct users per badge (monthly winner badges can repeat per user)
  const usersByBadge = {};
  for (const r of (rows || [])) {
    (usersByBadge[r.badge_id] || (usersByBadge[r.badge_id] = new Set())).add(r.user_id);
  }

  const percentByBadge = {};
  for (const badgeId in usersByBadge) {
    if (!totalUsers) { percentByBadge[badgeId] = null; continue; }
    const pct = (usersByBadge[badgeId].size / totalUsers) * 100;
    percentByBadge[badgeId] = pct >= 1 ? Math.round(pct) : Math.round(pct * 10) / 10;
  }
  return { percentByBadge, totalUsers: totalUsers || 0 };
}

// Flabébé's flower color is stored as a form index on the shared "Flabébé" row.
const FLABEBE_FORM_INDEX = { Red: 0, Yellow: 1, Orange: 2, Blue: 3, White: 4 };

module.exports = {
  API_KEY_CACHE_TTL,
  DEV_USER_ID,
  FLABEBE_FORM_INDEX,
  GAME_LABELS,
  LEADERBOARD_CACHE_TTL,
  MONTH_ROLLOVER_OFFSET_MS,
  POKEMON_IMAGE_FIELDS,
  R2_BASE,
  SHALPHA_GAMES,
  TOS_VERSION,
  VALID_TIER_CODES,
  TIER_LIST_MODES,
  DEFAULT_TIER_LIST_MODE,
  getTierListSchema,
  fetchTierSubmissions,
  isCompleteTiers,
  rankedIdsIn,
  _SW,
  _sandwichIngredients,
  activeMonthCache,
  activeMonthPromise,
  apiKeyCache,
  approvalsInProgress,
  awardBadgesForTrigger,
  broadcastNotificationToasts,
  broadcastSSE,
  broadcastUpdate,
  buildCheckFromDB,
  bulkAwardBadge,
  calculateCategoryThresholds,
  categoryThresholdsCache,
  computeBadgeRarity,
  contextBuilders,
  cors,
  createClient,
  crypto,
  deleteR2Images,
  enrichUsersWithTwitchPfp,
  enrichWithBadgeSlots,
  generateGameBoardPool,
  generateNewPoolForMonth,
  getActiveMonth,
  getActiveMonthId,
  getAuthenticatedUserId,
  getTwitchToken,
  hydrateGameBoardClaims,
  hydrateGameBoardTiles,
  leaderboardCache,
  multer,
  nowForMonth,
  pickRandomPokemonForPosition,
  pokeR2Url,
  processMonthEnd,
  processSeasonEnd,
  processYearEnd,
  rateLimit,
  refreshAvatarFromProvider,
  resolveStatsMonth,
  sendSSEToUser,
  shuffleArray,
  sseAnonymousClients,
  sseClients,
  supabase,
  twitchTokenCache,
  upload,
  uploadBufferToR2,
  uploadRateLimit,
  uploadSupplementalProof,
  validateApiKey,
};
