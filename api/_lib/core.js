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

const { buildCheckFromDB } = require('../_badgeRegistry');

const badgeEval = require('./badgeEval');
const { contextBuilders } = badgeEval;

const { createClient } = require('@supabase/supabase-js');

const multer = require('multer');

// Image types accepted for upload, mapped to the extension we will actually
// store. Every uploader on this API takes images only (proof screenshots and
// badge art), so this is enforced globally rather than per-route.
//
// SVG IS DELIBERATELY EXCLUDED. Uploads land in a PUBLIC R2 bucket, and an SVG
// is an executable document: served inline from pub-<id>.r2.dev it runs script
// in that origin. The same reasoning rules out text/html.
const ALLOWED_UPLOAD_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Multer config with file size limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB per file (Vercel limit is 4.5MB total)
    files: 10 // file + file2 + evolutionFile + evolutionSummaryFile + up to 6 extraFiles
  },
  // Without this, any file type was accepted and the client-supplied mimetype
  // was echoed straight back to R2 as the stored Content-Type -- so a signed-in
  // user could host arbitrary HTML under the site's public storage domain.
  fileFilter: (req, file, cb) => {
    if (ALLOWED_UPLOAD_TYPES[file.mimetype]) return cb(null, true);
    cb(Object.assign(
      new Error('Only PNG, JPEG, GIF, and WebP images can be uploaded.'),
      { status: 400, code: 'UNSUPPORTED_FILE_TYPE' },
    ));
  },
});

// Content-Type to store, derived from our allowlist rather than trusted from
// the client. Falls back to a type browsers will never execute.
const safeContentType = (file) =>
  ALLOWED_UPLOAD_TYPES[file?.mimetype] ? file.mimetype : 'application/octet-stream';

// Verify a buffer really is the image type it claims, by magic bytes.
//
// multer's fileFilter only sees the client-declared mimetype, which is just a
// string in the multipart body -- an attacker sets it to whatever passes. This
// is the check that actually looks at the bytes, so it has to run AFTER multer
// has buffered the file, not in the filter.
//
// Storing a forged file is not immediately exploitable (we also force the
// stored Content-Type from our allowlist, so an HTML payload saved as
// image/png is served as an image and never executed), but accepting it at all
// means the public bucket holds attacker-chosen content under an image name.
// Rejecting on content closes that.
const IMAGE_MAGIC = [
  { ext: 'png',  test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg',  test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'gif',  test: (b) => b.length > 6 && b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { ext: 'webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

function isRealImage(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  return IMAGE_MAGIC.some(m => m.test(buffer));
}

// Throws a 400-shaped error if any supplied file is not genuinely an image.
// Call at the top of an upload handler, before anything is written to R2.
function assertRealImages(files) {
  for (const file of files) {
    if (!file) continue;
    if (!isRealImage(file.buffer)) {
      throw Object.assign(
        new Error('One of the uploaded files is not a valid image. Please upload a real PNG, JPEG, GIF, or WebP.'),
        { status: 400, code: 'UNSUPPORTED_FILE_TYPE' },
      );
    }
  }
}

// Build the R2 object key for a proof image.
//
// The old shape was `approval/<userId>-<pokemonId>-<ts>-<slot>-<originalname>`,
// which put two things into a PUBLIC, unauthenticated URL that do not belong
// there: the uploader's user id, and their own filename. People name screenshots
// after themselves, so that leaked real names into public URLs, and the user id
// tied any leaked URL straight back to a profile.
//
// The key is now opaque. Nothing parses these keys -- deletion strips the bucket
// prefix off the stored URL -- so the shape is free to change, and old URLs keep
// working untouched.
function proofObjectKey(file, slot) {
  const ext = ALLOWED_UPLOAD_TYPES[file?.mimetype] || 'bin';
  return `approval/${crypto.randomUUID()}-${slot}.${ext}`;
}

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
const { GAME_LABELS, resolveGame } = require('./games');

// Valid tier_list_submissions.tiers values. Per gan-harness/spec.md (and its
// source plan .claude/plans/tidy-wandering-pascal.md) these are difficulty
// tiers, not letter grades.
//
// `sleeper` IS one of the five tiers. Converting it to an orthogonal flag was
// proposed (docs/TIER_LIST_PLAN.md Q4) and then reversed by the owner on
// 2026-08-02 — it stays a tier. Do not remove it from this list.
// `cant_get` ("Can't Get") is an OFF-SCALE tier — a valid stored code, but
// intentionally excluded from any difficulty ordering (see the note in
// client/src/constants/tierColors.js and OVERACHIEVER_TIERS/TRAP_TIERS in
// api/_routes/stats.js, which never reference it). Keep it LAST.
const VALID_TIER_CODES = ['easy', 'medium', 'hard', 'super_hard', 'sleeper', 'cant_get'];

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
// Active month: only changes once a month, at the rollover date line. Cache the
// result and use end_date to know exactly when it's stale — no arbitrary TTL
// needed; it only refetches in the hours around rollover. Shared by every viewer
// (the old per-mod time_offset_days bypass was removed), so mods hit the cache
// too instead of querying the DB on every request.
let activeMonthCache = null; // { id, month_year_display, start_date, end_date }

let activeMonthPromise = null; // in-flight fetch shared by concurrent callers (prevents cold-start race)

// Twitch OAuth token: client-credentials token valid for ~60 days.
// Cache it with its own expiry so we never fetch a new one unnecessarily.
let twitchTokenCache = { token: null, expiresAt: 0 };

// API key → user_id: keys change only on explicit regeneration/deletion.
// Short TTL (60s) keeps the window small if a key is revoked.
const apiKeyCache = new Map(); // hash → { userId, expiresAt }

const API_KEY_CACHE_TTL = 60_000;

// Moderator status per user_id: the moderators table has no admin endpoint
// that writes to it (managed manually), so a short TTL is purely a safety
// net for that manual case, not a real invalidation need. Was previously a
// bare `select from moderators where id = userId` repeated inline at ~100
// call sites — moderators_pkey alone saw 159K+ index scans against a
// 1-row table over 94 days.
const moderatorCache = new Map(); // userId → { isMod, expiresAt }

const MODERATOR_CACHE_TTL = 60_000;

// Leaderboard results per mode — expensive aggregation queries that only change
// on approval. Manually cleared when leaderboard-changed is broadcast.
// Also has a 60s TTL as a safety net (e.g. for Twitch live status freshness).
const leaderboardCache = new Map(); // mode → { data, expiresAt }

const LEADERBOARD_CACHE_TTL = 60_000;

// Supabase Realtime Broadcast helper — fire-and-forget, no WebSocket needed
const postBroadcast = async (messages, label) => {
  try {
    const res = await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) console.error(`Broadcast ${label} failed: ${res.status}`);
  } catch (err) {
    console.error('Broadcast failed (non-fatal):', err.message);
  }
};

const broadcastUpdate = (channel, event, payload = {}) =>
  postBroadcast([{ topic: channel, event, payload }], event);

// The approvals queue changed (submission in, approval/rejection out).
// - 'mod-approvals' is PRIVATE: only moderators can join it (RLS policy on
//   realtime.messages, migration 20261004120000). The header badge and Approvals
//   page listen here.
// - 'approvals-updates' is PUBLIC and exists only for the OBS approvals overlay,
//   which has an API key, not a Supabase session. Keep its payload empty.
const broadcastQueueChanged = () => postBroadcast([
  { topic: 'mod-approvals', event: 'queue-changed', payload: {}, private: true },
  { topic: 'approvals-updates', event: 'queue-changed', payload: {} },
], 'queue-changed');

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
//   3. Build the user's context with badgeEval's loader, scoped to this user —
//      the same function the simulator and backfill run over everyone.
//   4. Evaluate unearned badges via buildCheckFromDB(badge)(ctx).
//   5. Insert + broadcast newly earned badges.
// first_approval_month is decided per month by settleFirstOfMonth, never here.
const awardBadgesForTrigger = async (userId, trigger) => {
  try {
    const { data: triggerBadges } = await supabase
      .from('badges')
      .select('id, name, description, image_url, is_secret, check_type, check_value, check_qualifier')
      .eq('trigger', trigger)
      .neq('check_type', 'first_approval_month');

    if (!triggerBadges?.length || !contextBuilders[trigger]) return;

    const { data: earned } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', triggerBadges.map(b => b.id));
    const earnedIdSet = new Set((earned || []).map(r => r.badge_id));

    const unearned = triggerBadges.filter(b => !earnedIdSet.has(b.id));
    if (!unearned.length) return;

    // Build context once — shared across all check evaluations
    const ctx = await contextBuilders[trigger](userId, supabase);

    // buildCheckFromDB is only called for unearned candidates
    const newlyEarned = unearned.filter(b => buildCheckFromDB(b)(ctx));
    if (!newlyEarned.length) return;

    const { data: inserted, error: insertError } = await supabase
      .from('user_badges')
      .insert(newlyEarned.map(b => ({ user_id: userId, badge_id: b.id })))
      .select('badge_id');

    if (insertError) {
      console.error('Failed to award badges (non-fatal):', insertError.message);
      return;
    }

    if (inserted?.length) {
      const insertedIds = new Set(inserted.map(i => i.badge_id));
      await announceBadges(userId, newlyEarned.filter(b => insertedIds.has(b.id)));
      console.log(`Awarded ${inserted.length} badge(s) to user ${userId} for trigger '${trigger}'`);
    }
  } catch (err) {
    console.error('awardBadgesForTrigger failed (non-fatal):', err.message);
  }
};

// Notification row (notified:true — the toast fires via the badge-awards
// channel) + realtime broadcast for each badge a user just received.
async function announceBadges(userId, badges) {
  if (!badges.length) return;
  await supabase.from('notifications').insert(
    badges.map(b => ({
      user_id:  userId,
      status:   'badge_earned',
      message:  b.id,   // badge UUID stored in message for enrichment
      notified: true,
    }))
  );
  for (const badge of badges) {
    await broadcastUpdate(`badge-awards-${userId}`, 'badge-earned', {
      id:          badge.id,
      name:        badge.name,
      description: badge.description,
      image_url:   badge.image_url,
      is_secret:   badge.is_secret,
    });
  }
}

// ── First catch of the month ──────────────────────────────────────────────────
// Awards every first_approval_month badge for monthId once the month's winner
// is SETTLED (badgeEval.firstOfMonthWinner): on the submission clock that is
// the earliest-submitted approved catch, and only once no earlier submission is
// still pending. Called after every non-historical approve and reject. A badge
// that already has a holder for this month is never touched. Never throws.
async function settleFirstOfMonth(monthId) {
  try {
    if (monthId == null) return null;
    const { data: badges } = await supabase
      .from('badges')
      .select('id, name, description, image_url, is_secret')
      .eq('check_type', 'first_approval_month');
    if (!badges?.length) return null;

    const data = await badgeEval.loadFirstOfMonthData(supabase, [monthId]);
    const [result] = badgeEval.firstOfMonthResults(data);
    if (result?.status !== 'settled') return result ?? null;

    const { data: held } = await supabase
      .from('user_badges').select('badge_id')
      .eq('month_id', monthId).in('badge_id', badges.map(b => b.id));
    const heldIds = new Set((held || []).map(r => r.badge_id));
    const toAward = badges.filter(b => !heldIds.has(b.id));
    if (!toAward.length) return result;

    // (badge_id, month_id) is unique, so a concurrent settle loses cleanly.
    const awarded = [];
    for (const b of toAward) {
      const { error } = await supabase.from('user_badges')
        .insert({ user_id: result.user_id, badge_id: b.id, month_id: monthId });
      if (!error) awarded.push(b);
      else if (error.code !== '23505') console.error('settleFirstOfMonth insert failed:', error.message);
    }
    await announceBadges(result.user_id, awarded);
    if (awarded.length) console.log(`First of month ${monthId}: ${awarded.length} badge(s) to ${result.user_id}`);
    return result;
  } catch (err) {
    console.error('settleFirstOfMonth failed (non-fatal):', err.message);
    return null;
  }
}

// ── First of species in a month ───────────────────────────────────────────────
// first_of_species_count badges are ordinary approved-trigger badges (the
// approver is evaluated by awardBadgesForTrigger, whose context already counts
// settled firsts site-wide). The one event that can hand someone ELSE a first is
// a reject: removing an earlier pending upload settles a later approved catch of
// that mon that month. So after a non-historical reject, re-evaluate whoever now
// holds it. Never throws.
async function settleFirstOfSpecies(monthId, pokemonId) {
  try {
    if (monthId == null || pokemonId == null) return;
    const { count } = await supabase.from('badges')
      .select('id', { count: 'exact', head: true }).eq('check_type', 'first_of_species_count');
    if (!count) return;
    const holders = await badgeEval.firstOfSpeciesHolders(supabase, monthId, pokemonId);
    for (const uid of holders) await awardBadgesForTrigger(uid, 'approved');
  } catch (err) {
    console.error('settleFirstOfSpecies failed (non-fatal):', err.message);
  }
}

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
// Qualifiers come from badgeEval.periodQualifiers — the same counts and ranks
// the Backlog simulator and the backfill use (checked against the SQL RPCs by
// api/scripts/verifyBadgeSim.js). A blank qualifier means "every period".
async function processPeriodEnd(period, periodId) {
  const awarded = {};
  const { data: badges } = await supabase.from('badges').select('id, name, check_type, check_value, check_qualifier')
    .eq('trigger', 'period_end').in('check_type', [`approved_count_in_${period}`, `top_placement_${period}`]);
  if (!badges?.length) return awarded;

  const { period: periodData } = await badgeEval.loadData(supabase, 'period_end', { fresh: true });
  for (const { id, name, check_type, check_value, check_qualifier } of badges) {
    if (check_qualifier && Number(check_qualifier) !== periodId) continue;
    const userIds = badgeEval.periodQualifiers(periodData, check_type, periodId, check_value);
    const count = await bulkAwardBadge(id, userIds);
    if (count > 0) awarded[name] = count;
  }
  return awarded;
}

const processMonthEnd  = (monthId)  => processPeriodEnd('month', monthId);
const processSeasonEnd = (seasonId) => processPeriodEnd('season', seasonId);
const processYearEnd   = (yearId)   => processPeriodEnd('year', yearId);

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

// The one switch for every dev-only behaviour: the dev_token auth bypass, the
// "view as" personas, /api/debug/data and the upload rate-limit skip. Fails
// closed — `VERCEL=1` is set by the platform on every deployment (preview
// included) and can't be unset from the dashboard, so a stray DEBUG_USER_ID or
// NODE_ENV override in Vercel can never turn the bypass on.
const DEV_BYPASS = process.env.NODE_ENV !== 'production'
  && !process.env.VERCEL
  && Boolean(DEV_USER_ID);
if (DEV_BYPASS) {
  console.warn(`⚠ DEV_BYPASS is ON — dev_token auth bypass active (DEBUG_USER_ID=${DEV_USER_ID}). Never run this way outside localhost.`);
}

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

// Self-repair for dead Discord avatars. A Discord avatar URL embeds a content hash, so it
// 404s the moment the user changes their picture — and Supabase's identity_data only
// refreshes on that user's next OAuth login, which for most hunters is months away.
// refreshAvatarFromProvider can't help there; only Discord's API knows the current hash,
// and reading another user's profile needs a bot token (DISCORD_BOT_TOKEN — any bot from
// the OAuth app's developer-portal page works; it doesn't need to join a server).
//
// Order: stored URL still loads → keep it; Discord API → current avatar; Twitch → their
// stream pfp; otherwise Discord's own default avatar, returned but NOT stored, so a
// later bot-token or login sync still writes the real picture.
const DISCORD_AVATAR_RE = /^https:\/\/cdn\.discordapp\.com\/avatars\/(\d{15,21})\//;
const AVATAR_REPAIR_TTL_MS = 10 * 60 * 1000;
const avatarRepairMemo = new Map(); // discordId -> { at, promise }

async function urlLoads(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

function discordDefaultAvatar(discordId, discriminator) {
  const idx = discriminator && discriminator !== '0'
    ? Number(discriminator) % 5
    : Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

async function fetchDiscordUser(discordId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const r = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!r.ok) { console.error(`[avatar-repair] Discord ${r.status} for ${discordId}`); return null; }
  return r.json();
}

async function fetchTwitchPfp(twitchUrl) {
  const login = twitchUrl?.split('/').pop()?.toLowerCase();
  if (!login) return null;
  const token = await getTwitchToken();
  if (!token) return null;
  const raw = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: { Authorization: `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID },
  }).then(r => r.json());
  return raw.data?.[0]?.profile_image_url || null;
}

// Returns { avatar_url, source } for the user whose stored avatar is this Discord id's,
// or null when no user has one. source: 'stored' | 'discord' | 'twitch' | 'default'.
async function repairDiscordAvatar(discordId, { write = true } = {}) {
  const { data: rows, error } = await supabase
    .from('users')
    .select('id, avatar_url, twitch_url')
    .like('avatar_url', `https://cdn.discordapp.com/avatars/${discordId}/%`)
    .limit(1);
  if (error) throw error;
  const row = rows?.[0];
  if (!row) return null;

  if (await urlLoads(row.avatar_url)) return { avatar_url: row.avatar_url, source: 'stored' };

  let next = null, source = null, discriminator = null;
  const du = await fetchDiscordUser(discordId);
  if (du) {
    discriminator = du.discriminator;
    if (du.avatar) {
      next = `https://cdn.discordapp.com/avatars/${discordId}/${du.avatar}.png`;
      source = 'discord';
    }
  }
  if (!next && row.twitch_url) {
    try { next = await fetchTwitchPfp(row.twitch_url); if (next) source = 'twitch'; }
    catch (err) { console.error('[avatar-repair] Twitch lookup failed:', err.message); }
  }
  if (!next) return { avatar_url: discordDefaultAvatar(discordId, discriminator), source: 'default' };

  if (!write) return { avatar_url: next, source, user_id: row.id };
  const { error: upErr } = await supabase.from('users').update({ avatar_url: next }).eq('id', row.id);
  if (upErr) throw upErr;
  console.log(`[avatar-repair] ${row.id}: ${source}`);
  return { avatar_url: next, source };
}

// Memoised per Discord id so a page full of one dead avatar (or a client retry loop)
// costs one HEAD + one API call, not one per image element.
function repairDiscordAvatarMemo(discordId) {
  const hit = avatarRepairMemo.get(discordId);
  if (hit && Date.now() - hit.at < AVATAR_REPAIR_TTL_MS) return hit.promise;
  const promise = repairDiscordAvatar(discordId).catch(err => {
    avatarRepairMemo.delete(discordId);
    throw err;
  });
  avatarRepairMemo.set(discordId, { at: Date.now(), promise });
  return promise;
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
  // `userId` is accepted for signature compatibility but is intentionally unused.
  // The per-mod "view next month 4h early" offset (users.time_offset_days) was
  // removed on the owner's request: the active month is now GLOBAL for every
  // viewer. This is also what makes the leaderboard safely edge-cacheable — the
  // month no longer varies by who's asking. (The param can be dropped from
  // callers, and the users.time_offset_days column retired, as a later cleanup.)
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

// Whether a user is a moderator, cached for MODERATOR_CACHE_TTL. Replaces the
// inline `select from moderators where id = userId` check duplicated across
// route modules — see moderatorCache above for why.
async function isModerator(userId) {
  if (!userId) return false;
  const cached = moderatorCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.isMod;
  const { data } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
  const isMod = Boolean(data);
  moderatorCache.set(userId, { isMod, expiresAt: Date.now() + MODERATOR_CACHE_TTL });
  return isMod;
}

// Whether a user is a site owner (site_owners table) — the one who wires Backlog
// proposals to the API and publishes them. Cached like isModerator.
const ownerCache = new Map(); // userId → { isOwner, expiresAt }
async function isOwner(userId) {
  if (!userId) return false;
  const cached = ownerCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.isOwner;
  const { data } = await supabase.from('site_owners').select('user_id').eq('user_id', userId).maybeSingle();
  const owner = Boolean(data);
  ownerCache.set(userId, { isOwner: owner, expiresAt: Date.now() + MODERATOR_CACHE_TTL });
  return owner;
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
// ── user_stats cache readers ─────────────────────────────────────────────────
// `user_stats` is maintained by AFTER triggers (see
// supabase/migrations/20260903120000_user_stats_cache.sql), so a read is always
// current as of the last committed write. These helpers exist so callers stop
// re-deriving the same aggregates from `entries` + `pokemon_master` on every
// request.
//
// DELIBERATELY NOT used by awardBadgesForTrigger. That path decides whether a
// badge is granted, runs at most once per approval, and is the one place where
// paying for a live query is worth it -- a cache miss there would silently grant
// or withhold a badge. Read paths use the cache; the write path does not.
async function getUserStats(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('user_stats').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    console.error('getUserStats failed:', error.message);
    return null;
  }
  return data || null;
}

// Global dex denominators: how many shiny-available pokemon exist per type and
// per generation, plus the overall total. These are the SAME for every user, so
// re-fetching all ~1080 pokemon_master rows per request was the largest single
// cost in both the profile and badge-progress paths. Memoized per process; on
// Vercel that means one fetch per warm instance instead of one per request.
//
// Invalidation is deliberate: the pool only changes when pokemon_master is
// edited, which is an admin action, not a user one. A cold start picks it up.
let dexTotalsCache = null; // { typeTotal, genTotal, totalPokemon, expiresAt }
const DEX_TOTALS_TTL = 10 * 60_000;

async function getDexTotals() {
  if (dexTotalsCache && dexTotalsCache.expiresAt > Date.now()) return dexTotalsCache;

  const { data } = await supabase
    .from('pokemon_master')
    .select('id, type1, type2, generation, collection_ids')
    .eq('shiny_available', true);

  const typeTotal = {};
  const genTotal = {};
  const collectionTotal = {};
  for (const p of (data || [])) {
    for (const slug of (p.collection_ids || [])) {
      collectionTotal[slug] = (collectionTotal[slug] || 0) + 1;
    }
    // Lower-cased keys, matching user_stats.type_approved. Callers that display
    // these (the profile) capitalize at render time.
    for (const t of [p.type1, p.type2]) {
      if (t) typeTotal[t.toLowerCase()] = (typeTotal[t.toLowerCase()] || 0) + 1;
    }
    if (p.generation != null) genTotal[p.generation] = (genTotal[p.generation] || 0) + 1;
  }

  dexTotalsCache = {
    typeTotal,
    genTotal,
    collectionTotal,
    totalPokemon: (data || []).length,
    expiresAt: Date.now() + DEX_TOTALS_TTL,
  };
  return dexTotalsCache;
}

// ── Shiny pokemon roster ────────────────────────────────────────────────────
// The board builder and jeopardy both need "every shiny-available pokemon",
// and between them they were re-reading pokemon_master eight times: four full
// row scans (1024 rows, ~600 KB) plus a count-per-game fan-out that fired 22
// head queries per slug column -- 45 round trips on a single board-builder
// load, for data that changes a few times a year.
//
// One memo of the full roster replaces all of it. Every one of those reads is a
// filter or a count over this same row set, so they become JS operations with
// no query at all.
//
// INVALIDATION: unlike dexTotalsCache above, this does not rely on TTL alone.
// There is exactly one writer -- PATCH /api/admin/pokemon/:id/game-slugs, the
// Game Manager -- and it owns all three fields anything here filters on
// (game_slugs, restricted_game_slugs, shiny_available). It calls
// bustShinyPokemon() on success, so a mod's edit shows up on the next request
// rather than whenever a timer happens to lapse.
//
// The TTL is therefore NOT the invalidation strategy; it is the bound on how
// long OTHER warm Vercel instances can keep serving a pre-edit copy, since the
// bust only clears the instance that handled the PATCH. Ten minutes is well
// inside "nobody notices" for data edited a few times a year.
const SHINY_POKEMON_TTL = 10 * 60_000;
const SHINY_POKEMON_COLUMNS = [
  'id', 'name', 'national_dex_id', 'display_name', 'family_id',
  'genderless', 'custom_gender_code', 'has_gender_difference',
  'has_major_gender_difference', 'form_id', 'forms_count',
  'game_slugs', 'restricted_game_slugs',
  'legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil',
  'regional_alt', 'pseudo_legendary', 'pla',
  'evolves_from_id', 'rule_exemptions',
].join(', ');

let shinyPokemonCache = null;   // { rows, expiresAt }
let shinyPokemonInFlight = null;

// Returns every shiny_available row, FROZEN. Callers filter and map freely
// (both are non-mutating), but must never write to a row -- these objects are
// shared by every request this instance serves until the memo expires, so a
// mutation would corrupt them for everyone. Freezing makes that a loud failure
// in strict mode instead of a silent one.
async function getShinyPokemon() {
  if (shinyPokemonCache && shinyPokemonCache.expiresAt > Date.now()) {
    return shinyPokemonCache.rows;
  }
  // Share one in-flight fetch, so a cold start under concurrent load does not
  // pull 600 KB once per request. Same pattern as getActiveMonth.
  if (shinyPokemonInFlight) return shinyPokemonInFlight;

  shinyPokemonInFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('pokemon_master')
        .select(SHINY_POKEMON_COLUMNS)
        .eq('shiny_available', true);
      if (error) throw error;
      const rows = (data || []).map(Object.freeze);
      shinyPokemonCache = { rows, expiresAt: Date.now() + SHINY_POKEMON_TTL };
      return rows;
    } finally {
      shinyPokemonInFlight = null;
    }
  })();
  return shinyPokemonInFlight;
}

// Called by the Game Manager's PATCH handler after a successful write.
function bustShinyPokemon() {
  shinyPokemonCache = null;
}

// Count rows whose `column` (game_slugs or restricted_game_slugs) contains
// `slug`. Replaces a per-game `count: 'exact', head: true` query -- there are
// 22 slugs and two columns, so this removed 44 round trips from one endpoint.
function countShinyByGameSlug(rows, column, slug) {
  let n = 0;
  for (const p of rows) if ((p[column] || []).includes(slug)) n++;
  return n;
}

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

// `tiers` is stored as buckets — { tier_code: [pokemon_id, ...] } — so
// within-tier order survives (arrays preserve position; a { id: tier } map
// can't, since JS/JSON always serialize integer-like object keys in ascending
// numeric order regardless of insertion order). Every consensus/stats/
// completeness check in this codebase queries the classic { pokemon_id:
// tier_code } shape by id, so that's what this recovers. Also accepts a
// pre-migration flat row unmodified, so a row nobody has re-saved since the
// bucket-format switch doesn't crash — it simply has no explicit order until
// the one-time backfill runs.
const flattenTierBuckets = (tiers) => {
  const raw = tiers || {};
  const isBucketFormat = VALID_TIER_CODES.some(t => Array.isArray(raw[t]));
  if (!isBucketFormat) return raw;
  const out = {};
  VALID_TIER_CODES.forEach(t => { (raw[t] || []).forEach(id => { out[String(id)] = t; }); });
  return out;
};

// Single read path for tier list rows. Always returns rows normalised to the
// post-migration shape (`mode` defaulted to 'standard') so callers never
// branch on the schema themselves. `row.tiers` is the flattened { id: tier }
// map every existing consumer expects; `row.tier_buckets` is the raw,
// order-preserving stored value, for the one caller that renders position.
async function fetchTierSubmissions(monthId, { mode = null, userId = null, columns = 'user_id, tiers, submitted_at, updated_at' } = {}) {
  const schema = await getTierListSchema();
  const select = [columns, schema.mode ? 'mode' : null].filter(Boolean).join(', ');

  let query = supabase.from('tier_list_submissions').select(select).eq('month_id', monthId);
  if (userId) query = query.eq('user_id', userId);
  if (mode && schema.mode) query = query.eq('mode', mode);

  const { data, error } = await query;
  if (error) throw error;

  let rows = (data || []).map(r => {
    const rawTiers = r.tiers || {};
    return { ...r, mode: r.mode || DEFAULT_TIER_LIST_MODE, tier_buckets: rawTiers, tiers: flattenTierBuckets(rawTiers) };
  });
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
  skip: () => DEV_BYPASS,
  // Vercel also sends the RFC 7239 `Forwarded` header; X-Forwarded-For (via trust proxy) is what we key on.
  validate: { forwardedHeader: false },
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

const VALID_BADGE_TRIGGERS = ['submission', 'approved', 'rejected', 'monthly_active', 'period_end', 'bingo_achievement', 'date_award', 'account_age'];

// The one way a badges row is created: POST /api/badges and the Backlog's
// publish both call this. Uploads the art to assets/badges/<key>.png (the path
// the Replace tab overwrites), upserts a new family if asked, inserts the row.
// Validation failures throw with .status = 400.
async function createBadge({ key, name, description, hint, is_secret, family, family_order, family_new,
  trigger, trigger_count, check_type, check_value, check_qualifier, imageBuffer }) {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!imageBuffer) throw bad('Image file is required');
  if (!key)         throw bad('Image key is required');
  if (!name)        throw bad('Name is required');
  if (!description) throw bad('Description is required');
  if (!trigger)     throw bad('Trigger is required');
  if (!VALID_BADGE_TRIGGERS.includes(trigger)) throw bad(`Invalid trigger. Must be one of: ${VALID_BADGE_TRIGGERS.join(', ')}`);
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_URL) {
    throw new Error('R2 credentials not configured');
  }

  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  const r2Key = `assets/badges/${key}.png`;
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME || 'shiny-sprites',
    Key:    r2Key,
    Body:   imageBuffer,
    ContentType: 'image/png',
    CacheControl: 'no-cache', // revalidate via ETag so replacements are picked up immediately
  }));
  const image_url = `${process.env.R2_BUCKET_URL}/${r2Key}`;

  if (family && family_new) {
    const { error: famErr } = await supabase
      .from('badge_families')
      .upsert({
        id:            family,
        display_name:  family_new.display_name || family,
        display_order: parseInt(family_new.display_order, 10) || 0,
        is_sequential: !!family_new.is_sequential,
      }, { onConflict: 'id', ignoreDuplicates: true });
    if (famErr) throw famErr;
  }

  let order = family_order !== '' && family_order != null ? parseInt(family_order, 10) : null;
  if (order === 0 && family) {
    const { data: last } = await supabase
      .from('badges').select('family_order').eq('family', family)
      .order('family_order', { ascending: false }).limit(1);
    order = last?.[0]?.family_order != null ? last[0].family_order + 1 : 1;
  }

  const { data: badge, error } = await supabase
    .from('badges')
    .insert({
      key,
      name,
      description,
      hint:            hint || null,
      image_url,
      is_secret:       !!is_secret,
      family:          family || null,
      family_order:    order,
      trigger,
      trigger_count:   parseInt(trigger_count, 10) || 1,
      check_type:      check_type || 'approved_count',
      check_value:     check_value != null && check_value !== '' ? parseFloat(check_value) : 1,
      check_qualifier: check_qualifier || null,
    })
    .select()
    .single();
  if (error) throw error;
  return badge;
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
//
// v3 (2026-09-04): Terms now choose Texas law and ask users to consent to
// personal jurisdiction there, and add copyright/takedown terms. The Privacy
// Policy corrects what is actually collected and discloses that proof images
// sit on public storage. Consenting to a court's jurisdiction is exactly the
// kind of term a user has to actually be shown, which is what this bump forces.
const TOS_VERSION = 3;

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

async function generateJeopardyPool(boardId, game, columns = 5) {
  const tileCount = columns * 5;
  const positions = Array.from({ length: tileCount }, (_, i) => i + 1);

  // Every lobby rolls independently — no cross-board family exclusion. That
  // rule made sense when only one board could ever exist at a time (avoid
  // repeating the last event); it stops being coherent once lobbies run
  // concurrently, since "the most recent board" could be an unrelated
  // stranger's game happening at the same moment.
  let query = supabase
    .from('pokemon_master')
    .select('id, name, national_dex_id, display_name, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
    .eq('shiny_available', true);
  if (game) query = query.contains('game_slugs', [game]);
  const { data: allPokemon } = await query;
  if (!allPokemon || allPokemon.length === 0) throw new Error(`No pokemon available for game: ${game}`);
  if (allPokemon.length < tileCount) throw new Error('Not enough pokemon available for this game');

  const selected = shuffleArray([...allPokemon]).slice(0, tileCount);
  const shuffledPositions = shuffleArray([...positions]);

  const rows = selected.map((pok, i) => ({
    board_id: boardId,
    position: shuffledPositions[i],
    pokemon_id: pok.id,
    locked: false,
  }));

  const { error } = await supabase.from('jeopardy_pool').insert(rows);
  if (error) throw new Error(`Failed to insert pool: ${error.message}`);
}

async function hydrateJeopardyTiles(boardId) {
  const { data: pool } = await supabase
    .from('jeopardy_pool')
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

async function hydrateJeopardyClaims(boardId) {
  const { data: claims } = await supabase
    .from('jeopardy_claims')
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

// ── Bingo shapes and the race for an unclaimed bounty ────────────────────────
// Shared by /api/stats/month (the Watch Out! panel) and /api/bingo/board (the
// home page's bounty contenders). Board positions are 1..25 with a free space
// at 13; the X shape needs BOTH diagonals, so it is one shape, their union.
const WATCH_SHAPES = {
  row: [
    [1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20], [21, 22, 23, 24, 25],
  ],
  column: [
    [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24], [5, 10, 15, 20, 25],
  ],
  x: [[1, 7, 13, 19, 25, 5, 9, 17, 21]],
  blackout: [Array.from({ length: 25 }, (_, i) => i + 1)],
};
// Order is "easiest first" and doubles as the tie-break when two achievement
// types are the same number of catches away (Kellen's call): a row that is 2
// away leads over an X that is 2 away, because it is the likelier next claim.
const WATCH_TYPES = ['row', 'column', 'x', 'blackout'];
// Types are claimed once per month by the first player to complete them, so a
// claimed type is out of reach for everyone else and drops off the panel.
const buildWatchOut = (subset, positionByPokemon, claimed) => {
  const filledByUser = new Map();
  subset.forEach(e => {
    let filled = filledByUser.get(e.user_id);
    if (!filled) { filled = new Set([13]); filledByUser.set(e.user_id, filled); }
    const pos = positionByPokemon[e.pokemon_id];
    if (pos) filled.add(pos);
  });

  const out = [];
  WATCH_TYPES.forEach(type => {
    if (claimed.has(type)) return;
    const shapes = WATCH_SHAPES[type];
    let best = Infinity;
    let contenders = [];
    filledByUser.forEach((filled, userId) => {
      let userBest = Infinity;
      let positions = [];
      shapes.forEach((cells, idx) => {
        const remaining = cells.reduce((n, p) => n + (filled.has(p) ? 0 : 1), 0);
        if (remaining < userBest) { userBest = remaining; positions = [idx + 1]; }
        else if (remaining === userBest) positions.push(idx + 1);
      });
      if (userBest < 1 || userBest === Infinity) return; // already complete / unclaimable
      if (userBest < best) { best = userBest; contenders = []; }
      if (userBest === best) contenders.push({ user_id: userId, positions });
    });
    if (!contenders.length) return;
    out.push({
      type,
      remaining: best,
      // row/column carry a 1-based index; x and blackout have no position.
      positioned: type === 'row' || type === 'column',
      contenders,
    });
  });
  // The page renders only out[0]. Array.sort is stable, so equal `remaining`
  // preserves the easiest-first WATCH_TYPES order established above.
  return out.sort((a, b) => a.remaining - b.remaining);
};


// Flabébé's flower color is stored as a form index on the shared "Flabébé" row.
const FLABEBE_FORM_INDEX = { Red: 0, Yellow: 1, Orange: 2, Blue: 3, White: 4 };

module.exports = {
  assertRealImages,
  isRealImage,
  ALLOWED_UPLOAD_TYPES,
  safeContentType,
  proofObjectKey,
  getShinyPokemon,
  bustShinyPokemon,
  countShinyByGameSlug,
  getUserStats,
  getDexTotals,
  API_KEY_CACHE_TTL,
  WATCH_SHAPES,
  WATCH_TYPES,
  buildWatchOut,
  DEV_BYPASS,
  DEV_USER_ID,
  FLABEBE_FORM_INDEX,
  GAME_LABELS,
  resolveGame,
  LEADERBOARD_CACHE_TTL,
  MODERATOR_CACHE_TTL,
  isModerator,
  isOwner,
  createBadge,
  moderatorCache,
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
  flattenTierBuckets,
  isCompleteTiers,
  rankedIdsIn,
  _SW,
  _sandwichIngredients,
  activeMonthCache,
  activeMonthPromise,
  apiKeyCache,
  approvalsInProgress,
  awardBadgesForTrigger,
  announceBadges,
  settleFirstOfMonth,
  settleFirstOfSpecies,
  broadcastNotificationToasts,
  broadcastSSE,
  broadcastQueueChanged,
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
  generateJeopardyPool,
  generateNewPoolForMonth,
  getActiveMonth,
  getActiveMonthId,
  getAuthenticatedUserId,
  getTwitchToken,
  hydrateJeopardyClaims,
  hydrateJeopardyTiles,
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
  repairDiscordAvatar,
  repairDiscordAvatarMemo,
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
