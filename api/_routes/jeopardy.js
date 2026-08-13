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

module.exports = function register(app) {

  // GET /api/jeopardy — list every open (non-completed) lobby. Auth required,
  // NOT mod-gated. Public lobbies are visible to everyone; private lobbies
  // (visibility='private') only show up for moderators — regular viewers can
  // still join a private lobby directly if they have its code.
  app.get('/api/jeopardy', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const modRow = await isModerator(userId);

      let query = supabase
        .from('jeopardy_boards').select('id, code, game, status, visibility, columns, created_at, started_at, created_by')
        .neq('status', 'completed').order('created_at', { ascending: false });
      if (!modRow) query = query.eq('visibility', 'public');
      if (req.query.game) query = query.eq('game', req.query.game);
      const { data: boards } = await query;

      const lobbies = await Promise.all((boards || []).map(async board => {
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
        return { ...board, memberCount: memberCount ?? 0, claimCount: claimCount ?? 0, host, viewerIsMember: !!viewerMemberRow };
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

      const { data: board } = await supabase
        .from('jeopardy_boards').select('*').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });

      const modRow = await isModerator(userId);
      const { data: memberRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();

      const [tiles, claims, members] = await Promise.all([
        hydrateJeopardyTiles(board.id),
        hydrateJeopardyClaims(board.id),
        enrichMembers(board.id),
      ]);

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

  // DELETE /api/jeopardy/:code/members/:userId — host kicks a member out of the lobby.
  app.delete('/api/jeopardy/:code/members/:userId', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const targetUserId = req.params.userId;

      const { data: board } = await supabase
        .from('jeopardy_boards').select('id').ilike('code', req.params.code).maybeSingle();
      if (!board) return res.status(404).json({ error: 'No lobby found for that code' });

      const { data: requesterRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', userId).maybeSingle();
      if (requesterRow?.role !== 'host') return res.status(403).json({ error: 'Only the host can remove members' });
      if (targetUserId === userId) return res.status(400).json({ error: "Can't kick yourself" });

      const { data: targetRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', board.id).eq('user_id', targetUserId).maybeSingle();
      if (!targetRow) return res.status(404).json({ error: 'That user is not in this lobby' });

      await supabase.from('jeopardy_members').delete().eq('board_id', board.id).eq('user_id', targetUserId);

      const members = await enrichMembers(board.id);
      await broadcastUpdate(`jeopardy-updates-${board.id}`, 'tile-update', { type: 'member-kicked', kickedUserId: targetUserId, members });
      res.json({ ok: true, members });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/mod/jeopardy/visibility — host toggles whether the lobby shows
  // up on the public Shiny Games lobby list.
  app.put('/api/mod/jeopardy/visibility', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { boardId, visibility } = req.body;
      if (!boardId || !['public', 'private'].includes(visibility)) return res.status(400).json({ error: 'boardId and a valid visibility required' });

      const { data: requesterRow } = await supabase
        .from('jeopardy_members').select('role').eq('board_id', boardId).eq('user_id', userId).maybeSingle();
      if (requesterRow?.role !== 'host') return res.status(403).json({ error: 'Only the host can change lobby visibility' });

      const { data: board, error } = await supabase
        .from('jeopardy_boards').update({ visibility }).eq('id', boardId).select().single();
      if (error || !board) return res.status(500).json({ error: error?.message || 'Could not update visibility' });

      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'visibility-updated', visibility });
      res.json({ board });
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

      const { game, row_points, shalpha_double_points, visibility, columns } = req.body;
      if (!game) return res.status(400).json({ error: 'game required' });

      const rowPoints = Array.isArray(row_points) && row_points.length === 5
        ? row_points.map(v => Math.max(0, Math.min(99, parseInt(v) || 0)))
        : [1, 2, 3, 4, 5];
      const boardColumns = Math.max(3, Math.min(8, parseInt(columns) || 5));

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

      const { data: board, error: updateErr } = await supabase
        .from('jeopardy_boards')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', boardId).eq('status', 'building')
        .select().single();
      if (updateErr || !board) return res.status(400).json({ error: 'Lobby not found or not in building state' });

      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'started' });
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

  // DELETE /api/mod/jeopardy — end/reset a lobby
  app.delete('/api/mod/jeopardy', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      await supabase.from('jeopardy_boards').update({ status: 'completed' }).eq('id', boardId);
      await broadcastUpdate(`jeopardy-updates-${boardId}`, 'tile-update', { type: 'ended' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

};
