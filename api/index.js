require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
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

// SSE connections manager
const sseClients = new Map(); // userId -> Set of response objects
const sseAnonymousClients = new Set(); // Set of anonymous response objects

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
  let timeOffsetDays = 0;

  if (userId) {
    const { data: userData } = await supabase
      .from('users')
      .select('time_offset_days')
      .eq('id', userId)
      .single();

    if (userData?.time_offset_days) {
      timeOffsetDays = userData.time_offset_days;
    }
  }

  const now = new Date();
  const effectiveDate = new Date(now.getTime() + (timeOffsetDays * 24 * 60 * 60 * 1000));
  const effectiveDateISO = effectiveDate.toISOString();

  console.log('Getting active month - User:', userId, 'Offset days:', timeOffsetDays, 'Effective date:', effectiveDateISO);

  const { data: activeMonthData, error: monthError } = await supabase
    .from('bingo_months')
    .select('id, month_year_display, start_date, end_date')
    .lte('start_date', effectiveDateISO)
    .gte('end_date', effectiveDateISO)
    .single();

  if (monthError || !activeMonthData) {
    console.error('No active month found for date:', effectiveDateISO, monthError);
    return null;
  }

  console.log('Active month ID:', activeMonthData.id);
  return activeMonthData;
}

// Convenience wrapper for callers that only need the month ID
async function getActiveMonthId(userId = null) {
  const month = await getActiveMonth(userId);
  return month?.id ?? null;
}

// Validate an API key (pb_xxx) and return its owner's user_id, or null if invalid.
// Updates last_used_at fire-and-forget.
async function validateApiKey(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('pb_')) return null;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const { data } = await supabase
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!data) return null;
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

    // Fetch all independent queries in parallel
    const [
      { data: entries },
      { data: approvals },
      { data: poolData, error: poolError },
      { data: bingoAchievements }
    ] = await Promise.all([
      userId
        ? supabase.from('entries').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
        : Promise.resolve({ data: [] }),
      userId
        ? supabase.from('approvals').select('pokemon_id').eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
      supabase.from('bingo_achievements').select('bingo_type, users!bingo_achievements_user_id_fkey(display_name)').eq('month_id', ACTIVE_MONTH_ID),
    ]);

    if (poolError) throw poolError;

    const completedPokemonIds = new Set((entries || []).map(e => e.pokemon_id));
    const pendingPokemonIds = new Set((approvals || []).map(a => a.pokemon_id));

    // Get all pokemon details (needs pool IDs first)
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
            is_pending: !completedPokemonIds.has(pool.pokemon_id) && pendingPokemonIds.has(pool.pokemon_id),
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
            is_pending: false,
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

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    const VALID_MODES = ['monthly', 'alltime', 'season', 'year'];
    const mode = VALID_MODES.includes(req.query.mode) ? req.query.mode : 'monthly';

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

      // Twitch live status (reuse same logic as monthly)
      const liveStatusMap = {};
      try {
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        const twitchUsers = top10.filter(u => usersMap[u.user_id]?.twitch_url);

        if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET && twitchUsers.length > 0) {
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
          });
          const { access_token } = await tokenResponse.json();
          const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          });
          const { data: twitchApiUsers } = await usersResponse.json();
          const twitchIds = twitchApiUsers?.map(u => u.id) || [];
          if (twitchIds.length > 0) {
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            });
            const { data: streams } = await streamsResponse.json();
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
          created_at: u.created_at,
          twitch_url: index < 10 ? u.twitch_url : null,
          is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
          achievement_counts: achievementCounts[entry.user_id] || { row: 0, column: 0, x: 0, blackout: 0 },
          hex_code: hexCodeMap[entry.user_id] || '#9147ff'
        };
      });

      res.set('Cache-Control', 'no-store');
      return res.json(transformedAllTime);
    }

    // ── SEASON / YEAR BRANCH ─────────────────────────────────────────────────
    if (mode === 'season' || mode === 'year') {

      // Get the active month's start_date and derive grouping from it via date
      // arithmetic — so this works even if season_id/year_id are not yet set.
      const activeMonth = await getActiveMonth(userId);
      if (!activeMonth) return res.status(404).json({ error: 'No active month found' });
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
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        const twitchUsers = sorted.filter(u => usersMap[u.user_id]?.twitch_url);

        if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET && twitchUsers.length > 0) {
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
          });
          const { access_token } = await tokenResponse.json();
          const usernames = twitchUsers.map(u => usersMap[u.user_id].twitch_url.split('/').pop().toLowerCase());
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
          });
          const { data: twitchApiUsers } = await usersResponse.json();
          const twitchIds = twitchApiUsers?.map(u => u.id) || [];
          if (twitchIds.length > 0) {
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: { 'Authorization': `Bearer ${access_token}`, 'Client-Id': TWITCH_CLIENT_ID }
            });
            const { data: streams } = await streamsResponse.json();
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
          created_at: u.created_at,
          twitch_url: index < 10 ? u.twitch_url : null,
          is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
          achievement_counts: achievementCounts[entry.user_id] || {},
          hex_code: hexCodeMap[entry.user_id] || '#9147ff'
        };
      });

      res.set('Cache-Control', 'no-store');
      return res.json(result);
    }

    // ── MONTHLY BRANCH ───────────────────────────────────────────────────────
    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    if (!ACTIVE_MONTH_ID) {
      return res.status(404).json({ error: 'No active month found' });
    }


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
    
    if (twitchUsers.length > 0) {
      try {
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        
        if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
          // Get Twitch access token
          const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
          });
          
          const tokenData = await tokenResponse.json();
          const { access_token } = tokenData;
          console.log('Got Twitch token:', !!access_token);
          
          // Extract usernames from URLs
          const usernames = twitchUsers.map(u => u.users.twitch_url.split('/').pop().toLowerCase());
          console.log('Checking usernames:', usernames);
          
          // Get user IDs
          const usersResponse = await fetch(`https://api.twitch.tv/helix/users?${usernames.map(u => `login=${u}`).join('&')}`, {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Client-Id': TWITCH_CLIENT_ID
            }
          });
          
          const usersData = await usersResponse.json();
          console.log('Twitch users response:', usersData);
          
          // Check streams
          const twitchIds = usersData.data?.map(u => u.id) || [];
          console.log('Twitch IDs to check:', twitchIds);
          
          if (twitchIds.length > 0) {
            const streamsResponse = await fetch(`https://api.twitch.tv/helix/streams?${twitchIds.map(id => `user_id=${id}`).join('&')}`, {
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Client-Id': TWITCH_CLIENT_ID
              }
            });
            
            const streamsData = await streamsResponse.json();
            console.log('Streams data:', streamsData);
            
            // Map live status by username
            streamsData.data?.forEach(stream => {
              const user = usersData.data.find(u => u.id === stream.user_id);
              if (user) {
                console.log('User is live:', user.login);
                liveStatusMap[user.login.toLowerCase()] = true;
              }
            });
          }
          
          console.log('Final live status map:', liveStatusMap);
        }
      } catch (err) {
        console.error('Twitch live check error:', err);
      }
    }
    
    const transformedData = dataWithAchievements.map((entry, index) => {
      const username = entry.users.twitch_url ? entry.users.twitch_url.split('/').pop().toLowerCase() : null;
      return {
        id: entry.id,
        user_id: entry.user_id,
        username: entry.users.username,
        display_name: entry.users.display_name,
        points: entry.points,
        created_at: entry.users.created_at,
        twitch_url: index < 10 ? entry.users.twitch_url : null,
        is_live: index < 10 && username ? (liveStatusMap[username] || false) : false,
        achievement_counts: entry.achievement_counts || { row: 0, column: 0, x: 0, blackout: 0 },
        hex_code: hexCodeMap[entry.user_id] || '#9147ff'
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json(transformedData);
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
      { count: totalPokemon },
    ] = await Promise.all([
      supabase.from('users').select('username, display_name, avatar_url, created_at').eq('id', userId).single(),
      supabase.from('entries').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('user_monthly_points').select('points, month_id, bingo_months!inner(month_year_display)').eq('user_id', userId).order('month_id', { ascending: true }),
      supabase.from('user_monthly_points').select('user_id, month_id, points, bingo_months!inner(month_year_display)'),
      supabase.from('bingo_achievements').select('bingo_type').eq('user_id', userId),
      supabase.from('entries').select('pokemon_id').eq('user_id', userId),
      supabase.from('pokemon_master').select('*', { count: 'exact', head: true }).eq('shiny_available', true),
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
    const monthlyRankings = {};
    (allMonthlyPoints || []).forEach(entry => {
      userTotals[entry.user_id] = (userTotals[entry.user_id] || 0) + entry.points;
      if (!monthlyRankings[entry.month_id]) monthlyRankings[entry.month_id] = [];
      monthlyRankings[entry.month_id].push(entry);
    });

    const sortedUsers = Object.entries(userTotals).sort(([, a], [, b]) => b - a);
    const overallRank = sortedUsers.findIndex(([id]) => id === userId) + 1;

    let bestRank = null;
    let bestRankMonth = null;
    Object.values(monthlyRankings).forEach(entries => {
      const sorted = entries.slice().sort((a, b) => b.points - a.points);
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

    const totalCaught = allEntries ? new Set(allEntries.map(e => e.pokemon_id)).size : 0;
    
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
        avgPointsPerMonth
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
    
    const ACTIVE_MONTH_ID = await getActiveMonthId(viewerId);
    if (!ACTIVE_MONTH_ID) {
      return res.status(404).json({ error: 'No active month found' });
    }
    
    // Get month information
    const { data: monthData, error: monthError } = await supabase
      .from('bingo_months')
      .select('month_year, month_year_display')
      .eq('id', ACTIVE_MONTH_ID)
      .single();
    
    if (monthError) throw monthError;
    
    // Get user's entries for this month
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id')
      .eq('user_id', userId)
      .eq('month_id', ACTIVE_MONTH_ID);

    if (entriesError) throw entriesError;

    const completedPokemonIds = new Set(entries.map(entry => entry.pokemon_id));

    // Get user's pending approvals
    const { data: approvals, error: approvalsError } = await supabase
      .from('approvals')
      .select('pokemon_id')
      .eq('user_id', userId);

    const pendingPokemonIds = new Set(
      (!approvalsError && approvals) ? approvals.map(a => a.pokemon_id) : []
    );
    
    // Get the month's Pokemon pool
    // Using manual join due to Supabase schema cache delay
    const { data: poolData, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('position, pokemon_id')
      .eq('month_id', ACTIVE_MONTH_ID)
      .order('position', { ascending: true });
    
    if (poolError) throw poolError;
    
    // Get all pokemon details
    const pokemonIds = poolData.map(p => p.pokemon_id).filter(Boolean);
    
    const { data: pokemonData, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);
    
    if (pokemonError) throw pokemonError;
    
    // Create lookup map
    const pokemonMap = {};
    pokemonData.forEach(p => {
      pokemonMap[p.id] = p;
    });
    
    // Combine data
    const data = poolData.map(pool => ({
      position: pool.position,
      pokemon_id: pool.pokemon_id,
      pokemon_master: pokemonMap[pool.pokemon_id]
    }));
    
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
        // Find Pokemon for this position
        const pokemon = data.find(p => p.position === position);
        if (pokemon && pokemon.pokemon_master) {
          board.push({
            id: `${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon.pokemon_id,
            national_dex_id: pokemon.pokemon_master.national_dex_id,
            is_checked: completedPokemonIds.has(pokemon.pokemon_id),
            is_pending: !completedPokemonIds.has(pokemon.pokemon_id) && pendingPokemonIds.has(pokemon.pokemon_id),
            pokemon_name: pokemon.pokemon_master.name || 'Unknown',
            pokemon_gif: pokemon.pokemon_master.img_url,
          });
        } else {
          // Empty slot - no Pokemon assigned to this position
          board.push({
            id: `empty-${ACTIVE_MONTH_ID}-${position}`,
            position: position,
            pokemon_id: pokemon?.pokemon_id ?? null,
            national_dex_id: null,
            is_checked: false,
            is_pending: false,
            pokemon_name: 'EMPTY',
            pokemon_gif: null,
          });
        }
      }
    }

    res.json({
      month: monthData.month_year_display,
      board: board
    });
  } catch (error) {
    console.error('Error fetching profile board:', error);
    res.status(500).json({ error: 'Failed to fetch profile board', details: error.message });
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
    
    // Get Twitch OAuth token (you'll need to set these env vars)
    const twitchClientId = process.env.TWITCH_CLIENT_ID;
    const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    
    if (!twitchClientId || !twitchClientSecret) {
      console.warn('Twitch API credentials not configured');
      // Return basic data without live status
      return res.json(twitchData.map(amb => ({
        ...amb,
        profile_image_url: `https://static-cdn.jtvnw.net/user-default-pictures-uv/de130ab0-def7-11e9-b668-784f43822e80-profile_image-300x300.png`,
        is_live: false,
        brand_color: amb.hex_code
      })));
    }
    
    try {
      // Get Twitch OAuth token
      const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`
      });
      
      const { access_token } = await tokenResponse.json();
      
      const headers = {
        'Client-ID': twitchClientId,
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

    // Fetch pool, entries, and pending approvals in parallel
    const [
      { data: poolPokemon, error: poolError },
      { data: userEntries, error: entriesError },
      { data: pendingApprovals, error: approvalsError },
    ] = await Promise.all([
      supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('entries').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('approvals').select('pokemon_id').eq('user_id', userId),
    ]);

    if (poolError) throw poolError;
    if (entriesError) throw entriesError;
    if (approvalsError) throw approvalsError;

    const pokemonIds = [...new Set((poolPokemon || []).map(p => p.pokemon_id))];

    const caughtPokemonIds = new Set([
      ...userEntries.map(e => e.pokemon_id),
      ...pendingApprovals.map(a => a.pokemon_id),
    ]);

    // Filter out already caught or pending Pokemon
    const availablePokemonIds = pokemonIds.filter(id => !caughtPokemonIds.has(id));

    if (availablePokemonIds.length === 0) {
      return res.json([]);
    }

    // Get Pokemon details
    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', availablePokemonIds)
      .eq('shiny_available', true);
    
    if (pokemonError) throw pokemonError;
    
    res.json(pokemon || []);
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

    // Fetch pool, entries, and pending approvals in parallel
    const [
      { data: poolPokemon, error: poolError },
      { data: restrictedEntries, error: entriesError },
      { data: restrictedApprovals, error: approvalsError },
    ] = await Promise.all([
      supabase.from('monthly_pokemon_pool').select('pokemon_id').eq('month_id', ACTIVE_MONTH_ID),
      supabase.from('entries').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID).eq('restricted_submission', true),
      supabase.from('approvals').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID).eq('restricted_submission', true),
    ]);

    if (poolError) throw poolError;
    if (entriesError) throw entriesError;
    if (approvalsError) throw approvalsError;

    const pokemonIds = [...new Set((poolPokemon || []).map(p => p.pokemon_id))];

    const restrictedIds = new Set([
      ...restrictedEntries.map(e => e.pokemon_id),
      ...restrictedApprovals.map(a => a.pokemon_id),
    ]);

    // Exclude pokemon already submitted as restricted
    const availableIds = pokemonIds.filter(id => !restrictedIds.has(id));

    if (availableIds.length === 0) {
      return res.json([]);
    }

    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', availableIds)
      .eq('shiny_available', true);

    if (pokemonError) throw pokemonError;

    res.json(pokemon || []);
  } catch (error) {
    console.error('Error fetching restricted available Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch available Pokemon for restricted' });
  }
});

// Get available Pokemon for historical upload (past months, most recent appearance only)
app.get('/api/upload/available-pokemon-historical', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ACTIVE_MONTH_ID = await getActiveMonthId(userId);
    console.log('Active month ID:', ACTIVE_MONTH_ID);
    if (!ACTIVE_MONTH_ID) {
      console.log('No active month found, returning empty array');
      return res.json([]);
    }
    
    // Get all past months (before current month)
    const { data: pastMonths, error: monthsError } = await supabase
      .from('bingo_months')
      .select('id')
      .lt('id', ACTIVE_MONTH_ID)
      .order('id', { ascending: false });
    
    console.log('Past months found:', pastMonths?.length, pastMonths?.map(m => m.id));
    if (monthsError) throw monthsError;
    
    if (!pastMonths || pastMonths.length === 0) {
      console.log('No past months found, returning empty array');
      return res.json([]);
    }
    
    // Get Pokemon from all past month pools with their most recent month
    const { data: allPastPokemon, error: poolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id, month_id')
      .in('month_id', pastMonths.map(m => m.id))
      .order('month_id', { ascending: false });
    
    console.log('All past Pokemon entries:', allPastPokemon?.length);
    if (poolError) throw poolError;
    
    // Get current month's pool to exclude them
    const { data: currentMonthPool, error: currentPoolError } = await supabase
      .from('monthly_pokemon_pool')
      .select('pokemon_id')
      .eq('month_id', ACTIVE_MONTH_ID);
    
    console.log('Current month pool size:', currentMonthPool?.length);
    if (currentPoolError) throw currentPoolError;
    
    const currentMonthPokemonIds = new Set(currentMonthPool.map(p => p.pokemon_id));
    console.log('Current month Pokemon IDs (first 5):', Array.from(currentMonthPokemonIds).slice(0, 5));
    
    // Build map: pokemon_id => most_recent_month_id
    // Only include the MOST RECENT occurrence of each Pokemon (excluding current month)
    const pokemonMostRecentMonth = {};
    let skippedCurrentMonth = 0;
    for (const entry of allPastPokemon) {
      // Skip if Pokemon is in current month (use current upload instead)
      if (currentMonthPokemonIds.has(entry.pokemon_id)) {
        skippedCurrentMonth++;
        continue;
      }
      
      // Only keep if we haven't seen this Pokemon yet (first = most recent due to ordering)
      if (!pokemonMostRecentMonth[entry.pokemon_id]) {
        pokemonMostRecentMonth[entry.pokemon_id] = entry.month_id;
      }
    }
    
    console.log('Skipped (in current month):', skippedCurrentMonth);
    console.log('Unique historical Pokemon:', Object.keys(pokemonMostRecentMonth).length);
    console.log('First 5 historical Pokemon:', Object.entries(pokemonMostRecentMonth).slice(0, 5));
    
    // Get user's already caught Pokemon (from ALL months, not just historical)
    const { data: userEntries, error: entriesError } = await supabase
      .from('entries')
      .select('pokemon_id, month_id')
      .eq('user_id', userId);
    
    console.log('User total entries:', userEntries?.length);
    if (entriesError) throw entriesError;
    
    // Build map: pokemon_id => Set of month_ids where user caught it
    const userCaughtByMonth = {};
    for (const entry of userEntries) {
      if (!userCaughtByMonth[entry.pokemon_id]) {
        userCaughtByMonth[entry.pokemon_id] = new Set();
      }
      userCaughtByMonth[entry.pokemon_id].add(entry.month_id);
    }
    
    console.log('User caught Pokemon (unique):', Object.keys(userCaughtByMonth).length);
    
    // Filter: Keep Pokemon where user hasn't caught it in its most recent month
    const availableHistoricalPokemon = [];
    for (const [pokemonId, monthId] of Object.entries(pokemonMostRecentMonth)) {
      const caughtInMonths = userCaughtByMonth[parseInt(pokemonId)] || new Set();
      
      // Only available if user hasn't caught it in this specific month
      if (!caughtInMonths.has(monthId)) {
        availableHistoricalPokemon.push({
          pokemon_id: parseInt(pokemonId),
          month_id: monthId
        });
      }
    }
    
    console.log('Available historical Pokemon (after filtering):', availableHistoricalPokemon.length);
    console.log('First 5 available:', availableHistoricalPokemon.slice(0, 5));
    
    if (availableHistoricalPokemon.length === 0) {
      console.log('No historical Pokemon available for user, returning empty array');
      return res.json([]);
    }
    
    // Get Pokemon details
    const pokemonIds = availableHistoricalPokemon.map(p => p.pokemon_id);
    const { data: pokemon, error: pokemonError } = await supabase
      .from('pokemon_master')
      .select('id, national_dex_id, name, img_url')
      .in('id', pokemonIds)
      .eq('shiny_available', true);
    
    if (pokemonError) throw pokemonError;
    
    console.log('Pokemon details fetched:', pokemon?.length);
    
    // Attach month_id to each Pokemon for submission
    const pokemonWithMonth = pokemon.map(p => {
      const entry = availableHistoricalPokemon.find(h => h.pokemon_id === p.id);
      return {
        ...p,
        month_id: entry.month_id
      };
    });
    
    console.log('Returning Pokemon with month info (first 3):', pokemonWithMonth.slice(0, 3));
    console.log('=== END TESTING MODE ===');
    
    res.json(pokemonWithMonth || []);
  } catch (error) {
    console.error('Error fetching historical Pokemon:', error);
    res.status(500).json({ error: 'Failed to fetch historical Pokemon' });
  }
});

// Submit catch
app.post('/api/upload/submission', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const userId = await getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const pokemon_id = req.body.pokemon_id;
    const url = req.body.url;
    const restricted_submission = req.body.restricted_submission === 'true';
    const file = req.files?.file?.[0];
    const file2 = req.files?.file2?.[0];
    
    console.log('Parsed values:', { pokemon_id, url, file: !!file, file2: !!file2 });
    
    if (!pokemon_id) {
      return res.status(400).json({ error: 'Pokemon ID required' });
    }
    
    // Validation: Either URL OR both files
    if (!url && (!file || !file2)) {
      return res.status(400).json({ error: 'Either Twitch link OR both proof images required' });
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
    
    let proofUrl = url;
    let proofUrl2 = null;
    
    // If files uploaded, upload both to R2
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
        restricted_submission,
      })
      .select()
      .single();
    
    if (approvalError) throw approvalError;

    // Note: pending notification is created automatically via DB trigger on approvals insert

    // Respond immediately, then broadcast (same pattern as approve/reject)
    res.json({ success: true, approval });

    // Notify board (user's pending tile) and mod queue
    Promise.all([
      broadcastUpdate('board-updates', 'board-changed', { userId }),
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
    ]).catch(err => console.error('Post-submission broadcast failed (non-fatal):', err.message));
  } catch (error) {
    console.error('Error submitting catch:', error);
    res.status(500).json({ error: 'Failed to submit catch', details: error.message });
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
  try {
    const { id } = req.params;

    console.log('Approving submission:', id);

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
      .select('user_id, pokemon_id, proof_url, proof_url2')
      .eq('id', id)
      .single();
    
    if (approvalFetchError) {
      console.error('Error fetching approval:', approvalFetchError);
      throw approvalFetchError;
    }
    
    console.log('Calling approve_submission RPC...');

    const { status: approvalStatus } = req.body;

    // Call stored procedure
    const { data, error } = await supabase.rpc('approve_submission', {
      p_approval_id: parseInt(id),
      p_moderator_id: moderatorId,
      p_status: approvalStatus || 'accepted'
    });
    
    if (error) {
      console.error('RPC error:', error);
      throw error;
    }
    
    console.log('Approval successful:', data);

    // Respond immediately — broadcasts and cleanup are non-critical side effects
    res.json(data);

    // Notify connected clients (fire-and-forget; a broadcast failure must never
    // make the client think the approval failed when the DB already committed it)
    Promise.all([
      broadcastUpdate('board-updates', 'board-changed', { userId: approval.user_id }),
      broadcastUpdate('leaderboard-updates', 'leaderboard-changed', {}),
      broadcastUpdate('approvals-updates', 'queue-changed', {}),
      broadcastNotificationToasts(approval.user_id),
    ]).catch(err => console.error('Post-approval broadcast failed (non-fatal):', err.message));

    // Delete images from R2 (fire-and-forget; same reasoning)
    const R2_BUCKET_URL = process.env.R2_BUCKET_URL;
    const imagesToDelete = [];

    if (approval.proof_url && approval.proof_url.startsWith(R2_BUCKET_URL)) {
      imagesToDelete.push(approval.proof_url);
    }
    if (approval.proof_url2 && approval.proof_url2.startsWith(R2_BUCKET_URL)) {
      imagesToDelete.push(approval.proof_url2);
    }

    if (imagesToDelete.length > 0) {
      (async () => {
        try {
          const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
          const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
          const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
          const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'shiny-sprites';

          if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID) {
            const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
            const s3Client = new S3Client({
              region: 'auto',
              endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
            });

            for (const imageUrl of imagesToDelete) {
              const key = imageUrl.replace(`${R2_BUCKET_URL}/`, '');
              console.log('Deleting R2 object:', key);
              await s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
              console.log('Successfully deleted:', key);
            }
          } else {
            console.warn('R2 credentials not configured, skipping image deletion');
          }
        } catch (r2Error) {
          console.error('Error deleting images from R2 (non-fatal):', r2Error);
        }
      })();
    }
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
      .select('user_id, pokemon_id, proof_url, proof_url2')
      .eq('id', id)
      .single();
    
    if (approvalFetchError) {
      console.error('Error fetching approval:', approvalFetchError);
      throw approvalFetchError;
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
    ]).catch(err => console.error('Post-rejection broadcast failed (non-fatal):', err.message));

    // Delete images from R2 (fire-and-forget)
    const R2_BUCKET_URL = process.env.R2_BUCKET_URL;
    const imagesToDelete = [];

    if (approval.proof_url && approval.proof_url.startsWith(R2_BUCKET_URL)) {
      imagesToDelete.push(approval.proof_url);
    }
    if (approval.proof_url2 && approval.proof_url2.startsWith(R2_BUCKET_URL)) {
      imagesToDelete.push(approval.proof_url2);
    }

    if (imagesToDelete.length > 0) {
      (async () => {
        try {
          const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
          const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
          const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
          const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'shiny-sprites';

          if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID) {
            const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
            const s3Client = new S3Client({
              region: 'auto',
              endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
            });

            for (const imageUrl of imagesToDelete) {
              const key = imageUrl.replace(`${R2_BUCKET_URL}/`, '');
              console.log('Deleting R2 object:', key);
              await s3Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
              console.log('Successfully deleted:', key);
            }
          } else {
            console.warn('R2 credentials not configured, skipping image deletion');
          }
        } catch (r2Error) {
          console.error('Error deleting images from R2 (non-fatal):', r2Error);
        }
      })();
    }
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
      console.log('Looking up award IDs:', awardIds);
      const { data: awards, error: awardsError } = await supabase
        .from('bingo_achievements')
        .select('id, bingo_type')
        .in('id', awardIds);
      console.log('Award lookup result:', { awards, awardsError });
      if (!awardsError && awards) awardMap = Object.fromEntries(awards.map(a => [a.id, a]));
    }

    const enriched = notifications.map(n => ({
      ...n,
      pokemon: n.pokemon_id ? (pokemonMap[n.pokemon_id] || null) : null,
      achievement: n.award ? (awardMap[n.award] || null) : null,
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

    console.log('Fetching pending approvals...');
    
    // Get all approvals with user and pokemon info
    const { data: approvals, error } = await supabase
      .from('approvals')
      .select(`
        id,
        created_at,
        proof_url,
        proof_url2,
        user_id,
        pokemon_id,
        restricted_submission,
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
      user_id: approval.user_id,
      display_name: approval.users?.display_name || 'Unknown',
      pokemon_name: approval.pokemon_master?.name || 'Unknown',
      national_dex_id: approval.pokemon_master?.national_dex_id || 0,
      pokemon_img: approval.pokemon_master?.img_url || '',
      restricted_submission: approval.restricted_submission || false,
      restricted_strikes: approval.users?.restricted_strikes || 0
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

    // Remove any existing key first (one key per user)
    await supabase.from('api_keys').delete().eq('user_id', userId);

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
    const monthData = await getActiveMonth();
    if (!monthData) return res.status(404).json({ error: 'No active bingo month' });
    const ACTIVE_MONTH_ID = monthData.id;

    const [
      { data: entries },
      { data: approvals },
      { data: poolData, error: poolError },
    ] = await Promise.all([
      mode === 'live'
        ? supabase.from('entries').select('pokemon_id').eq('user_id', userId).eq('month_id', ACTIVE_MONTH_ID)
        : Promise.resolve({ data: [] }),
      mode === 'live'
        ? supabase.from('approvals').select('pokemon_id').eq('user_id', userId)
        : Promise.resolve({ data: [] }),
      supabase.from('monthly_pokemon_pool').select('position, pokemon_id').eq('month_id', ACTIVE_MONTH_ID).order('position', { ascending: true }),
    ]);

    if (poolError) throw poolError;

    const completedSet = new Set((entries || []).map(e => e.pokemon_id));
    const pendingSet   = new Set((approvals || []).map(a => a.pokemon_id));
    const pokemonIds   = (poolData || []).map(p => p.pokemon_id).filter(Boolean);

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
        pokemon_id: pool.pokemon_id,
        is_checked: mode === 'live' && completedSet.has(pool.pokemon_id),
        is_pending: mode === 'live' && !completedSet.has(pool.pokemon_id) && pendingSet.has(pool.pokemon_id),
        pokemon_name: poke.name || 'Unknown',
        pokemon_gif: poke.img_url,
      } : {
        position: pos,
        is_checked: false,
        is_pending: false,
        pokemon_name: 'EMPTY',
        pokemon_gif: null,
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ month: monthData.month_year_display, board, mode });
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

    const rows = topN.map((u, i) => ({
      rank: i + 1,
      user_id: u.user_id,
      display_name: usersMap[u.user_id]?.display_name || 'Unknown',
      username: usersMap[u.user_id]?.username || '',
      points: u.points,
      pinned: false,
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
        pinned: true, // frontend uses this to draw the separator + highlight
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({ label: PERIOD_LABELS[period], rows });
  } catch (err) {
    console.error('Overlay leaderboard error:', err);
    res.status(500).json({ error: 'Failed to fetch overlay leaderboard' });
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