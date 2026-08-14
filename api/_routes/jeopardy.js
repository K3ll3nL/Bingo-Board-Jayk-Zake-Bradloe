/**
 * jeopardy routes — Shiny Jeopardy lobbies (formerly "Game Board").
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  SHALPHA_GAMES,
  broadcastUpdate,
  crypto,
  enrichUsersWithTwitchPfp,
  generateJeopardyPool,
  getAuthenticatedUserId,
  hydrateJeopardyClaims,
  isModerator,
  hydrateJeopardyTiles,
  shuffleArray,
  supabase,
} = require('../_lib/core');

// Shiny Jeopardy is tagged Team + Multiplayer (not Solo) — a lobby needs a
// host plus at least one other player before it can start. See ShinyGames.jsx.
const MIN_PLAYERS_TO_START = 2;

// No 0/O/1/I/L — every remaining character reads unambiguously out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateBoardCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

async function enrichMembers(boardId) {
  const { data: rows } = await supabase
    .from('jeopardy_members').select('user_id, role, can_edit, joined_at').eq('board_id', boardId).order('joined_at');
  const userIds = (rows || []).map(m => m.user_id);
  if (userIds.length === 0) return [];
  const { data: userRows } = await supabase.from('users').select('id, display_name, avatar_url, twitch_url').in('id', userIds);
  const enriched = await enrichUsersWithTwitchPfp(userRows || []);
  const userMap = Object.fromEntries(enriched.map(u => [u.id, u]));
  return rows.map(m => ({ ...m, user: userMap[m.user_id] || null }));
}

// Tile edits (reroll/swap/lock/shuffle) are scoped to the lobby, not global
// moderator status — a moderator who never joined this lobby can't edit it.
// The host always has edit rights; other members need can_edit granted.
async function canEditBoard(userId, boardId) {
  const { data: memberRow } = await supabase
    .from('jeopardy_members').select('role, can_edit').eq('board_id', boardId).eq('user_id', userId).maybeSingle();
  return !!memberRow && (memberRow.role === 'host' || memberRow.can_edit);
}

// Building lobbies nobody ever started are auto-discarded once they're this
// stale, so a dead test lobby doesn't sit on the public list forever.
const STALE_BUILDING_MS = 24 * 60 * 60 * 1000;

// Mirrors client claimPoints()/rowValue() (JeopardyRoom.jsx) so the history
// row's winner/points agree with what players saw on the standings panel.
function rowValue(pos, rowPoints, columns) {
  const cols = columns ?? 5;
  return (rowPoints ?? [1, 2, 3, 4, 5])[Math.floor((pos - 1) / cols)] ?? Math.ceil(pos / cols);
}
function computeWinner(claims, board) {
  const totals = {};
  for (const c of claims || []) {
    const base = rowValue(c.position, board.row_points, board.columns);
    const pts = (c.claim_type === 'shalpha' && board.shalpha_double_points) ? base * 2 : base;
    totals[c.claimed_by] = (totals[c.claimed_by] || 0) + pts;
  }
  let winnerId = null, winnerPoints = 0;
  for (const [uid, pts] of Object.entries(totals)) {
    if (pts > winnerPoints) { winnerId = uid; winnerPoints = pts; }
  }
  return { winnerId, winnerPoints };
}

// Shared teardown for "a lobby is done" — used by manual end/discard, timer
// expiry, and stale-lobby cleanup. Only writes a jeopardy_history row when
// the game actually reached 'active' (something was played); a lobby
// discarded while still 'building' just disappears, same as before.
async function finalizeLobby(board, { timedOut = false } = {}) {
  if (board.status === 'active' || board.status === 'completed') {
    const { data: claims } = await supabase.from('jeopardy_claims').select('claimed_by, claim_type, position').eq('board_id', board.id);
    const { count: memberCount } = await supabase.from('jeopardy_members').select('id', { count: 'exact', head: true }).eq('board_id', board.id);
    const { winnerId, winnerPoints } = computeWinner(claims, board);
    await supabase.from('jeopardy_history').insert({
      game: board.game,
      columns: board.columns,
      hosted_by: board.created_by,
      winner_user_id: winnerId,
      winner_points: winnerPoints,
      member_count: memberCount ?? 0,
      claim_count: (claims || []).length,
      was_timed: !!board.timed_minutes,
      timed_out: timedOut,
      started_at: board.started_at,
    });
  }
  await supabase.from('jeopardy_boards').delete().eq('id', board.id);
  await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'ended' });
}

// A kicked user is permanently shut out of that specific lobby — hidden from
// the list, blocked from direct-code access, blocked from rejoining — even
// if it's public and even if they're a global moderator. Logged directly on
// the board row (kicked_user_ids) rather than a separate audit table.
async function wasKicked(userId, boardId) {
  const { data: board } = await supabase
    .from('jeopardy_boards').select('kicked_user_ids').eq('id', boardId).maybeSingle();
  return !!board?.kicked_user_ids?.includes(userId);
}

module.exports = function register(app) {

  // GET /api/jeopardy — list every open (non-completed) lobby. Auth required,
  // NOT mod-gated. Public lobbies are visible to everyone; private lobbies
  // (visibility='private') only show up for moderators — regular viewers can
  // still join a private lobby directly if they have its code.
  app.get('/api/jeopardy', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      let query = supabase
        .from('jeopardy_boards').select('id, code, game, status, visibility, columns, created_at, started_at, created_by, kicked_user_ids, timed_minutes, ends_at')
        .neq('status', 'completed').order('created_at', { ascending: false });
      if (req.query.game) query = query.eq('game', req.query.game);
      const { data: boards } = await query;

      // Building lobbies nobody ever started are dead weight — sweep them out
      // on every list load instead of running a separate cron for it.
      const now = Date.now();
      const staleBoards = (boards || []).filter(b => b.status === 'building' && (now - new Date(b.created_at).getTime()) > STALE_BUILDING_MS);
      for (const stale of staleBoards) await finalizeLobby(stale);
      const staleIds = new Set(staleBoards.map(b => b.id));

      // A timed lobby whose clock has already run out gets finalized here too,
      // so it doesn't linger just because nobody's client happened to be open
      // right when the timer hit zero.
      const timedOutBoards = (boards || []).filter(b => !staleIds.has(b.id) && b.status === 'active' && b.ends_at && new Date(b.ends_at) <= new Date(now));
      for (const timedOut of timedOutBoards) await finalizeLobby(timedOut, { timedOut: true });
      const timedOutIds = new Set(timedOutBoards.map(b => b.id));

      // Visibility is scoped to lobby membership, not moderator status — the
      // Shiny Games hub is itself moderator-only, so every viewer here already
      // passes an isModerator check; gating private lobbies on that would show
      // every private lobby to every moderator regardless of the flag. A
      // private lobby only shows up for the host/members who are already in it.
      // Kicked users never see that lobby again either, public or private.
      const { data: memberRows } = await supabase.from('jeopardy_members').select('board_id').eq('user_id', userId);
      const memberBoardIds = new Set((memberRows || []).map(m => m.board_id));
      const visibleBoards = (boards || []).filter(b =>
        !staleIds.has(b.id) && !timedOutIds.has(b.id) &&
        !b.kicked_user_ids?.includes(userId) && (b.visibility === 'public' || memberBoardIds.has(b.id))
      );

      const lobbies = await Promise.all(visibleBoards.map(async board => {
        const [{ count: memberCount }, { count: claimCount }, { data: viewerMemberRow }] = await Promise.all([
          supabase.from('jeopardy_members').select('id', { count: 'exact', head: true }).eq('board_id', board.id),
          supabase.from('jeopardy_claims').select('position', { count: 'exact', head: true }).eq('board_id', board.id),
          supabase.from('jeopardy_members').select('id').eq('board_id', board.id).eq('user_id', userId).maybeSingle(),
        ]);
        const { data: hostRow } = await supabase.from('jeopardy_members').select('user_id').eq('board_id', board.id).eq('role', 'host').maybeSingle();
        let host = null;
        if (hostRow) {
          const { data: hostUser } = await supabase.from('users').select('id, display_name, avatar_url, twitch_url').eq('id', hostRow.user_id).maybeSingle();
          host = hostUser ? (await enrichUsersWithTwitchPfp([hostUser]))[0] : null;
        }
        const { kicked_user_ids, ...publicBoard } = board;
        return { ...publicBoard, memberCount: memberCount ?? 0, claimCount: claimCount ?? 0, host, viewerIsMember: !!viewerMemberRow };
      }));

      res.json({ lobbies });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/jeopardy/:code — fetch one lobby's full state by connection code.
  // Auth required, NOT mod-gated: this is how a preview/join screen works
  // before you've joined. Having the code grants access regardless of
  // visibility — that's the point of a private lobby's code.
  app.get('/api/jeopardy/:code', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { data: rawBoard } = await supabase
        .from('jeopardy_boards').select('*').ilike('code', req.params.code).maybeSingle();
      if (!rawBoard) return res.status(404).json({ error: 'No lobby found for that code' });
      if (rawBoard.kicked_user_ids?.includes(userId)) return res.status(403).json({ error: 'You were removed from this lobby by the host.' });
      const { kicked_user_ids, ...board } = rawBoard;

      const modRow = await isModerator(userId);
      const { data: memberRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();

      const [tiles, claims, members] = await Promise.all([
        hydrateJeopardyTiles(board.id),
        hydrateJeopardyClaims(board.id),
        enrichMembers(board.id),
      ]);

      // Nobody's client happened to be open right when a timed lobby's clock
      // ran out — catch it here so the next person to look at it sees the
      // final result instead of a live board stuck past its own deadline.
      if (board.status === 'active' && board.ends_at && new Date(board.ends_at) <= new Date()) {
        await finalizeLobby(board, { timedOut: true });
        board.status = 'completed';
      }

      const viewerRole = memberRow?.role ?? (modRow ? 'spectator' : null);
      const viewerCanEdit = memberRow?.role === 'host' || !!memberRow?.can_edit;
      res.json({ board, tiles, claims, members, viewerRole, viewerCanEdit, isModerator: !!modRow });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/jeopardy/:code/permissions — host grants/revokes another member's
  // edit access. Host-only; the host's own row can't be revoked this way.
  app.put('/api/jeopardy/:code/permissions', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { userId: targetUserId, canEdit } = req.body;
      if (!targetUserId || typeof canEdit !== 'boolean') return res.status(400).json({ error: 'userId and canEdit required' });

      const { data: board } = await supabase
        .from('jeopardy_boards').select('id').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });

      const { data: requesterRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();
      if (requesterRow?.role !== 'host') return res.status(403).json({ error: 'Only the host can manage edit access' });

      const { data: targetRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', targetUserId).maybeSingle();
      if (!targetRow) return res.status(404).json({ error: 'That user is not in this lobby' });
      if (targetRow.role === 'host') return res.status(400).json({ error: "Can't change the host's own access" });

      await supabase.from('jeopardy_members').update({ can_edit: canEdit }).eq('board_id', board.id).eq('user_id', targetUserId);

      const members = await enrichMembers(board.id);
      await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'permissions-updated', members });
      res.json({ ok: true, members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/jeopardy/:code/transfer-host — host hands hosting to another
  // member. Covers a host stepping away mid-lobby without leaving it stuck:
  // the new host gets edit rights automatically; the old host drops to a
  // regular player (keeping whatever can_edit they'd have as host, so they
  // aren't suddenly locked out of a game they were just running).
  app.put('/api/jeopardy/:code/transfer-host', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { userId: targetUserId } = req.body;
      if (!targetUserId) return res.status(400).json({ error: 'userId required' });
      if (targetUserId === userId) return res.status(400).json({ error: "You're already the host" });

      const { data: board } = await supabase
        .from('jeopardy_boards').select('id').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });

      const { data: requesterRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();
      if (requesterRow?.role !== 'host') return res.status(403).json({ error: 'Only the host can transfer hosting' });

      const { data: targetRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', targetUserId).maybeSingle();
      if (!targetRow) return res.status(404).json({ error: 'That user is not in this lobby' });

      await supabase.from('jeopardy_members').update({ role: 'player', can_edit: true }).eq('board_id', board.id).eq('user_id', userId);
      await supabase.from('jeopardy_members').update({ role: 'host', can_edit: true }).eq('board_id', board.id).eq('user_id', targetUserId);

      const members = await enrichMembers(board.id);
      await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'host-transferred', members });
      res.json({ ok: true, members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/jeopardy/:code/finish-timed — any viewer's countdown hitting
  // zero calls this opportunistically. Server re-validates ends_at itself
  // (idempotent — a lobby already finalized by someone else, or one that was
  // never timed, is just a no-op) so a stale/rogue client can't force it.
  app.post('/api/jeopardy/:code/finish-timed', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { data: board } = await supabase
        .from('jeopardy_boards').select('*').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.json({ ok: true, alreadyEnded: true });
      if (board.status !== 'active' || !board.ends_at || new Date(board.ends_at) > new Date()) {
        return res.json({ ok: true, alreadyEnded: false });
      }

      await finalizeLobby(board, { timedOut: true });
      res.json({ ok: true, alreadyEnded: false, finalized: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/jeopardy/:code/members/:userId — host kicks a member out of the lobby.
  app.delete('/api/jeopardy/:code/members/:userId', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const targetUserId = req.params.userId;

      const { data: board } = await supabase
        .from('jeopardy_boards').select('id, kicked_user_ids').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });

      const { data: requesterRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();
      if (requesterRow?.role !== 'host') return res.status(403).json({ error: 'Only the host can remove members' });
      if (targetUserId === userId) return res.status(400).json({ error: "Can't kick yourself" });

      const { data: targetRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', targetUserId).maybeSingle();
      if (!targetRow) return res.status(404).json({ error: 'That user is not in this lobby' });

      await supabase.from('jeopardy_members').delete().eq('board_id', board.id).eq('user_id', targetUserId);
      const nextKicked = Array.from(new Set([...(board.kicked_user_ids || []), targetUserId]));
      await supabase.from('jeopardy_boards').update({ kicked_user_ids: nextKicked }).eq('id', board.id);

      const members = await enrichMembers(board.id);
      await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'member-kicked', kickedUserId: targetUserId, members });
      res.json({ ok: true, members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/jeopardy/:code/join — join this lobby's roster.
  app.post('/api/jeopardy/:code/join', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { data: board } = await supabase
        .from('jeopardy_boards').select('id, status').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });
      if (await wasKicked(userId, board.id)) return res.status(403).json({ error: 'You were removed from this lobby by the host.' });
      if (board.status !== 'building') return res.status(400).json({ error: 'This game has already started' });

      const { error: joinErr } = await supabase
        .from('jeopardy_members')
        .upsert({ board_id: board.id, user_id: userId, role: 'player' }, { onConflict: 'board_id,user_id', ignoreDuplicates: true });
      if (joinErr) return res.status(500).json({ error: joinErr.message });

      const members = await enrichMembers(board.id);
      await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'member-joined', members });
      res.json({ ok: true, boardId: board.id, members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy — host a new lobby
  app.post('/api/mod/jeopardy', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { game, row_points, shalpha_double_points, visibility, columns, timed_minutes } = req.body;
      if (!game) return res.status(400).json({ error: 'game required' });

      const rowPoints = Array.isArray(row_points) && row_points.length === 5
        ? row_points.map(v => Math.max(0, Math.min(99, parseInt(v) || 0)))
        : [1, 2, 3, 4, 5];
      const boardColumns = Math.max(3, Math.min(8, parseInt(columns) || 5));
      const timedMinutes = timed_minutes ? Math.max(1, Math.min(480, parseInt(timed_minutes) || 0)) || null : null;

      let board = null, boardErr = null;
      for (let attempt = 0; attempt < 5 && !board; attempt++) {
        const code = generateBoardCode();
        const result = await supabase
          .from('jeopardy_boards')
          .insert({
            game, status: 'building', created_by: userId,
            row_points: rowPoints,
            shalpha_double_points: !!shalpha_double_points,
            visibility: visibility === 'private' ? 'private' : 'public',
            columns: boardColumns,
            timed_minutes: timedMinutes,
            code,
          })
          .select().single();
        board = result.data;
        boardErr = result.error;
        if (boardErr && boardErr.code !== '23505') break; // not a code collision — stop retrying
      }
      if (!board) return res.status(500).json({ error: boardErr?.message || 'Could not create lobby' });

      await supabase.from('jeopardy_members').insert({ board_id: board.id, user_id: userId, role: 'host', can_edit: true });

      await generateJeopardyPool(board.id, game, boardColumns);
      const tiles = await hydrateJeopardyTiles(board.id);
      const members = await enrichMembers(board.id);
      res.json({ board, tiles, claims: [], members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy/reroll
  app.post('/api/mod/jeopardy/reroll', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, position, operationId } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });
      if (!await canEditBoard(userId, boardId)) return res.status(403).json({ error: 'Edit access required' });

      const { data: board } = await supabase.from('jeopardy_boards').select('id, status, game').eq('id', boardId).maybeSingle();
      if (!board || board.status !== 'building') return res.status(400).json({ error: 'Lobby not in building state' });

      const { data: pool } = await supabase.from('jeopardy_pool').select('id, position, pokemon_id').eq('board_id', boardId);
      const currentTile = (pool || []).find(p => p.position === position);
      const otherIds = new Set((pool || []).filter(p => p.position !== position).map(r => r.pokemon_id));

      let pkQuery = supabase
        .from('pokemon_master')
        .select('id, name, national_dex_id, display_name, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
        .eq('shiny_available', true);
      if (board.game) pkQuery = pkQuery.contains('game_slugs', [board.game]);
      const { data: allPokemon } = await pkQuery;

      const available = (allPokemon || []).filter(p => !otherIds.has(p.id));
      if (available.length === 0) return res.status(400).json({ error: 'No pokemon available for reroll' });

      const newPokemon = available[Math.floor(Math.random() * available.length)];
      await supabase.from('jeopardy_pool').update({ pokemon_id: newPokemon.id }).eq('board_id', boardId).eq('position', position);

      const tile = { id: currentTile?.id, position, pokemon_id: newPokemon.id, pokemon: newPokemon, locked: false };
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'reroll', tile, operationId });
      res.json({ tile });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy/reroll-all — reroll every unlocked tile at once
  app.post('/api/mod/jeopardy/reroll-all', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, operationId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });
      if (!await canEditBoard(userId, boardId)) return res.status(403).json({ error: 'Edit access required' });

      const { data: board } = await supabase.from('jeopardy_boards').select('id, status, game').eq('id', boardId).maybeSingle();
      if (!board || board.status !== 'building') return res.status(400).json({ error: 'Lobby not in building state' });

      const { data: pool } = await supabase.from('jeopardy_pool').select('id, position, pokemon_id, locked').eq('board_id', boardId);
      const locked = (pool || []).filter(p => p.locked);
      const unlocked = (pool || []).filter(p => !p.locked);
      if (unlocked.length === 0) return res.status(400).json({ error: 'Every tile is locked' });

      let pkQuery = supabase
        .from('pokemon_master')
        .select('id, name, national_dex_id, display_name, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
        .eq('shiny_available', true);
      if (board.game) pkQuery = pkQuery.contains('game_slugs', [board.game]);
      const { data: allPokemon } = await pkQuery;

      const lockedIds = new Set(locked.map(p => p.pokemon_id));
      const pool_ = shuffleArray((allPokemon || []).filter(p => !lockedIds.has(p.id)));
      if (pool_.length < unlocked.length) return res.status(400).json({ error: 'Not enough pokemon available to reroll every tile' });

      const newByPosition = {};
      const updates = unlocked.map((slot, i) => {
        const newPokemon = pool_[i];
        newByPosition[slot.position] = newPokemon;
        return supabase.from('jeopardy_pool').update({ pokemon_id: newPokemon.id }).eq('id', slot.id);
      });
      await Promise.all(updates);

      const tiles = unlocked.map(slot => ({ id: slot.id, position: slot.position, pokemon_id: newByPosition[slot.position].id, pokemon: newByPosition[slot.position], locked: false }));
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'reroll-all', tiles, operationId });
      res.json({ tiles });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/mod/jeopardy/swap
  app.put('/api/mod/jeopardy/swap', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, pos1, pos2, operationId } = req.body;
      if (!boardId || pos1 == null || pos2 == null) return res.status(400).json({ error: 'boardId, pos1, pos2 required' });
      if (!await canEditBoard(userId, boardId)) return res.status(403).json({ error: 'Edit access required' });

      const { data: pool } = await supabase.from('jeopardy_pool').select('id, position, pokemon_id, locked').eq('board_id', boardId).in('position', [pos1, pos2]);
      const t1 = (pool || []).find(p => p.position === pos1);
      const t2 = (pool || []).find(p => p.position === pos2);
      if (!t1 || !t2) return res.status(404).json({ error: 'Tiles not found' });

      const upA = await supabase.from('jeopardy_pool').update({ pokemon_id: t2.pokemon_id }).eq('id', t1.id);
      const upB = await supabase.from('jeopardy_pool').update({ pokemon_id: t1.pokemon_id }).eq('id', t2.id);
      if (upA.error || upB.error) return res.status(500).json({ error: 'Swap failed' });

      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'swap', pos1, pos2, operationId });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy/lock
  app.post('/api/mod/jeopardy/lock', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, position, locked, operationId } = req.body;
      if (!boardId || position == null || typeof locked !== 'boolean') return res.status(400).json({ error: 'boardId, position, locked required' });
      if (!await canEditBoard(userId, boardId)) return res.status(403).json({ error: 'Edit access required' });

      await supabase.from('jeopardy_pool').update({ locked }).eq('board_id', boardId).eq('position', position);
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'lock-toggled', position, locked, operationId });
      res.json({ position, locked });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy/shuffle
  app.post('/api/mod/jeopardy/shuffle', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, operationId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });
      if (!await canEditBoard(userId, boardId)) return res.status(403).json({ error: 'Edit access required' });

      const { data: pool } = await supabase.from('jeopardy_pool').select('id, position, pokemon_id, locked').eq('board_id', boardId);
      if (!pool || pool.length === 0) return res.status(400).json({ error: 'No pool found' });

      const unlocked = pool.filter(p => !p.locked);
      const shuffledPositions = shuffleArray(unlocked.map(p => p.position));

      const unlockedIds = unlocked.map(p => p.id);
      await supabase.from('jeopardy_pool').delete().in('id', unlockedIds);
      await supabase.from('jeopardy_pool').insert(
        unlocked.map((item, i) => ({ board_id: boardId, pokemon_id: item.pokemon_id, position: shuffledPositions[i], locked: false }))
      );

      const tiles = await hydrateJeopardyTiles(boardId);
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'shuffle', tiles, operationId });
      res.json({ tiles });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/jeopardy/start
  app.post('/api/mod/jeopardy/start', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      const { count: memberCount } = await supabase
        .from('jeopardy_members').select('id', { count: 'exact', head: true }).eq('board_id', boardId);
      if ((memberCount ?? 0) < MIN_PLAYERS_TO_START) {
        return res.status(400).json({ error: `Need at least ${MIN_PLAYERS_TO_START} players in the lobby to start — share the code first.` });
      }

      const { data: existingBoard } = await supabase.from('jeopardy_boards').select('timed_minutes').eq('id', boardId).maybeSingle();
      const startedAt = new Date();
      const endsAt = existingBoard?.timed_minutes ? new Date(startedAt.getTime() + existingBoard.timed_minutes * 60000) : null;

      const { data: board, error: updateErr } = await supabase
        .from('jeopardy_boards')
        .update({ status: 'active', started_at: startedAt.toISOString(), ends_at: endsAt ? endsAt.toISOString() : null })
        .eq('id', boardId).eq('status', 'building')
        .select().single();
      if (updateErr || !board) return res.status(400).json({ error: 'Lobby not found or not in building state' });

      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'started', endsAt: board.ends_at });
      res.json({ board });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/jeopardy/claim — mods, or anyone who has joined this lobby's roster
  app.post('/api/jeopardy/claim', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { boardId, position, claimType = 'standard' } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });
      if (!['standard', 'shalpha'].includes(claimType)) return res.status(400).json({ error: 'Invalid claimType' });

      const modRow = await isModerator(userId);
      const { data: memberRow } = await supabase
        .from('jeopardy_members').select('id').eq('board_id', boardId).eq('user_id', userId).maybeSingle();
      if (!modRow && !memberRow) return res.status(403).json({ error: 'Join this game to claim a square' });

      const { data: board } = await supabase.from('jeopardy_boards').select('id, status, game').eq('id', boardId).maybeSingle();
      if (!board || board.status !== 'active') return res.status(400).json({ error: 'Lobby not active' });
      if (claimType === 'shalpha' && !SHALPHA_GAMES.has(board.game)) {
        return res.status(400).json({ error: 'Shalpha only available for PLA/PLZA boards' });
      }

      const { data: existing } = await supabase
        .from('jeopardy_claims').select('claimed_by, claim_type')
        .eq('board_id', boardId).eq('position', position).maybeSingle();

      if (existing && claimType === 'standard') {
        const { data: existingUser } = await supabase
          .from('users').select('id, display_name, avatar_url, twitch_url').eq('id', existing.claimed_by).maybeSingle();
        const existingClaimer = existingUser ? (await enrichUsersWithTwitchPfp([existingUser]))[0] : null;
        return res.status(409).json({
          error: 'Position already claimed',
          claim: { position, claimed_by: existing.claimed_by, claim_type: existing.claim_type, claimer: existingClaimer },
        });
      }

      const originalClaimedBy = existing ? existing.claimed_by : null;

      const claimData = {
        board_id: boardId, position,
        claimed_by: userId,
        claim_type: claimType,
        original_claimed_by: originalClaimedBy,
        claimed_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('jeopardy_claims').upsert(claimData, { onConflict: 'board_id,position' });
      if (upsertErr) return res.status(500).json({ error: upsertErr.message });

      const userIds = [userId];
      if (originalClaimedBy) userIds.push(originalClaimedBy);
      const { data: rawUsers } = await supabase.from('users').select('id, display_name, avatar_url, twitch_url').in('id', userIds);
      const enriched = await enrichUsersWithTwitchPfp(rawUsers);
      const userMap = Object.fromEntries(enriched.map(u => [u.id, u]));

      const enrichedClaim = {
        ...claimData,
        claimer: userMap[userId] || null,
        original_claimer: originalClaimedBy ? userMap[originalClaimedBy] || null : null,
      };

      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'claim', claim: enrichedClaim });
      res.json({ claim: enrichedClaim });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/jeopardy/claim — unclaim a square (mods, or anyone in the roster)
  app.delete('/api/jeopardy/claim', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { boardId, position } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });

      const modRow = await isModerator(userId);
      const { data: memberRow } = await supabase
        .from('jeopardy_members').select('id').eq('board_id', boardId).eq('user_id', userId).maybeSingle();
      if (!modRow && !memberRow) return res.status(403).json({ error: 'Join this game to manage claims' });

      await supabase.from('jeopardy_claims').delete().eq('board_id', boardId).eq('position', position);
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'unclaim', position });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/mod/jeopardy — end/discard a lobby. Global-moderator-gated
  // (not host-only) on purpose: it's the escape hatch for a lobby whose host
  // walked away and never transferred hosting to anyone else. Deletes the
  // board outright (pool/claims/members cascade via FK) and, if the game had
  // actually started, leaves a jeopardy_history row behind first.
  app.delete('/api/mod/jeopardy', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      const { data: board } = await supabase.from('jeopardy_boards').select('*').eq('id', boardId).maybeSingle();
      if (!board) return res.status(404).json({ error: 'Lobby not found' });

      await finalizeLobby(board);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

};
