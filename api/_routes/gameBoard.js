/**
 * gameBoard routes (10).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  SHALPHA_GAMES,
  broadcastUpdate,
  enrichUsersWithTwitchPfp,
  generateGameBoardPool,
  getAuthenticatedUserId,
  hydrateGameBoardClaims,
  hydrateGameBoardTiles,
  shuffleArray,
  supabase,
} = require('../lib/core');

module.exports = function register(app) {

  // GET /api/mod/game-board
  app.get('/api/mod/game-board', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { data: board } = await supabase
        .from('game_boards').select('*').neq('status', 'completed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (!board) return res.json({ board: null, tiles: [], claims: [], mods: [] });

      const [tiles, claims] = await Promise.all([
        hydrateGameBoardTiles(board.id),
        hydrateGameBoardClaims(board.id),
      ]);

      // Pre-load all mod profiles with Twitch pfps so the client can look them up by ID
      const { data: modRows } = await supabase.from('moderators').select('id');
      const modIds = (modRows || []).map(m => m.id);
      let mods = [];
      if (modIds.length > 0) {
        const { data: userRows } = await supabase
          .from('users').select('id, display_name, avatar_url, twitch_url').in('id', modIds);
        mods = await enrichUsersWithTwitchPfp(userRows);
      }

      res.json({ board, tiles, claims, mods });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board — create new board
  app.post('/api/mod/game-board', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { game, row_points, shalpha_double_points } = req.body;
      if (!game) return res.status(400).json({ error: 'game required' });

      const rowPoints = Array.isArray(row_points) && row_points.length === 5
        ? row_points.map(v => Math.max(0, Math.min(99, parseInt(v) || 0)))
        : [1, 2, 3, 4, 5];

      // Complete any existing board
      await supabase.from('game_boards').update({ status: 'completed' }).neq('status', 'completed');

      const { data: board, error: boardErr } = await supabase
        .from('game_boards')
        .insert({
          game, status: 'building', created_by: userId,
          row_points: rowPoints,
          shalpha_double_points: !!shalpha_double_points,
        })
        .select().single();
      if (boardErr) return res.status(500).json({ error: boardErr.message });

      await generateGameBoardPool(board.id, game);
      const tiles = await hydrateGameBoardTiles(board.id);
      res.json({ board, tiles, claims: [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board/reroll
  app.post('/api/mod/game-board/reroll', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, position, operationId } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });

      const { data: board } = await supabase.from('game_boards').select('id, status, game').eq('id', boardId).maybeSingle();
      if (!board || board.status !== 'building') return res.status(400).json({ error: 'Board not in building state' });

      const { data: pool } = await supabase.from('game_board_pool').select('id, position, pokemon_id').eq('board_id', boardId);
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
      await supabase.from('game_board_pool').update({ pokemon_id: newPokemon.id }).eq('board_id', boardId).eq('position', position);

      const tile = { id: currentTile?.id, position, pokemon_id: newPokemon.id, pokemon: newPokemon, locked: false };
      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'reroll', tile, operationId });
      res.json({ tile });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // PUT /api/mod/game-board/swap
  app.put('/api/mod/game-board/swap', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, pos1, pos2, operationId } = req.body;
      if (!boardId || pos1 == null || pos2 == null) return res.status(400).json({ error: 'boardId, pos1, pos2 required' });

      const { data: pool } = await supabase.from('game_board_pool').select('id, position, pokemon_id, locked').eq('board_id', boardId).in('position', [pos1, pos2]);
      const t1 = (pool || []).find(p => p.position === pos1);
      const t2 = (pool || []).find(p => p.position === pos2);
      if (!t1 || !t2) return res.status(404).json({ error: 'Tiles not found' });

      // Swap pokemon_ids
      const upA = await supabase.from('game_board_pool').update({ pokemon_id: t2.pokemon_id }).eq('id', t1.id);
      const upB = await supabase.from('game_board_pool').update({ pokemon_id: t1.pokemon_id }).eq('id', t2.id);
      if (upA.error || upB.error) return res.status(500).json({ error: 'Swap failed' });

      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'swap', pos1, pos2, operationId });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board/lock
  app.post('/api/mod/game-board/lock', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, position, locked, operationId } = req.body;
      if (!boardId || position == null || typeof locked !== 'boolean') return res.status(400).json({ error: 'boardId, position, locked required' });

      await supabase.from('game_board_pool').update({ locked }).eq('board_id', boardId).eq('position', position);
      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'lock-toggled', position, locked, operationId });
      res.json({ position, locked });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board/shuffle
  app.post('/api/mod/game-board/shuffle', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, operationId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      const { data: pool } = await supabase.from('game_board_pool').select('id, position, pokemon_id, locked').eq('board_id', boardId);
      if (!pool || pool.length === 0) return res.status(400).json({ error: 'No pool found' });

      const unlocked = pool.filter(p => !p.locked);
      const shuffledPositions = shuffleArray(unlocked.map(p => p.position));

      // Delete unlocked rows and re-insert with shuffled positions
      const unlockedIds = unlocked.map(p => p.id);
      await supabase.from('game_board_pool').delete().in('id', unlockedIds);
      await supabase.from('game_board_pool').insert(
        unlocked.map((item, i) => ({ board_id: boardId, pokemon_id: item.pokemon_id, position: shuffledPositions[i], locked: false }))
      );

      const tiles = await hydrateGameBoardTiles(boardId);
      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'shuffle', tiles, operationId });
      res.json({ tiles });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board/start
  app.post('/api/mod/game-board/start', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      const { data: board, error: updateErr } = await supabase
        .from('game_boards')
        .update({ status: 'active', started_at: new Date().toISOString() })
        .eq('id', boardId).eq('status', 'building')
        .select().single();
      if (updateErr || !board) return res.status(400).json({ error: 'Board not found or not in building state' });

      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'started' });
      res.json({ board });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/mod/game-board/claim
  app.post('/api/mod/game-board/claim', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, position, claimType = 'standard' } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });
      if (!['standard', 'shalpha'].includes(claimType)) return res.status(400).json({ error: 'Invalid claimType' });

      const { data: board } = await supabase.from('game_boards').select('id, status, game').eq('id', boardId).maybeSingle();
      if (!board || board.status !== 'active') return res.status(400).json({ error: 'Board not active' });
      if (claimType === 'shalpha' && !SHALPHA_GAMES.has(board.game)) {
        return res.status(400).json({ error: 'Shalpha only available for PLA/PLZA boards' });
      }

      const { data: existing } = await supabase
        .from('game_board_claims').select('claimed_by, claim_type')
        .eq('board_id', boardId).eq('position', position).maybeSingle();

      if (existing && claimType === 'standard') return res.status(409).json({ error: 'Position already claimed' });

      const originalClaimedBy = existing ? existing.claimed_by : null;

      const claimData = {
        board_id: boardId, position,
        claimed_by: userId,
        claim_type: claimType,
        original_claimed_by: originalClaimedBy,
        claimed_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('game_board_claims').upsert(claimData, { onConflict: 'board_id,position' });
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

      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'claim', claim: enrichedClaim });
      res.json({ claim: enrichedClaim });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/mod/game-board/claim — unclaim a square
  app.delete('/api/mod/game-board/claim', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId, position } = req.body;
      if (!boardId || position == null) return res.status(400).json({ error: 'boardId and position required' });

      await supabase.from('game_board_claims').delete().eq('board_id', boardId).eq('position', position);
      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'unclaim', position });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // DELETE /api/mod/game-board — end/reset board
  app.delete('/api/mod/game-board', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });
      const { data: modRow } = await supabase.from('moderators').select('id').eq('id', userId).maybeSingle();
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { boardId } = req.body;
      if (!boardId) return res.status(400).json({ error: 'boardId required' });

      await supabase.from('game_boards').update({ status: 'completed' }).eq('id', boardId);
      await broadcastUpdate(`game-board-updates-${boardId}`, 'tile-update', { type: 'ended' });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

};
