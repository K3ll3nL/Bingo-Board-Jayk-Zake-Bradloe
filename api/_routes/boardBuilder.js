/**
 * boardBuilder routes (7).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  broadcastUpdate,
  calculateCategoryThresholds,
  generateNewPoolForMonth,
  getAuthenticatedUserId,
  isModerator,
  nowForMonth,
  pickRandomPokemonForPosition,
  shuffleArray,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

  // GET /api/mod/board-builder
  app.get('/api/mod/board-builder', async (req, res) => {
    try {
      // ── Auth ────────────────────────────────────────────────────────────────
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      // ── Compute next calendar month from today (UTC, rollover-shifted) ───────
      // Uses nowForMonth() so the 00:00–04:00 UTC window before rollover still
      // treats "current" as the outgoing month.
      const now = nowForMonth();
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

      if (!selectRes.ok) {
        return res.status(500).json({ error: 'Failed to query bingo_months', http_status: selectRes.status, response: selectText });
      }

      const existing = JSON.parse(selectText);
      let nextMonth = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

      // Step 2: insert only if the row does not exist yet
      if (!nextMonth) {
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

        if (!insertRes.ok) {
          return res.status(500).json({ error: 'Failed to insert bingo_month', http_status: insertRes.status, response: insertText });
        }

        const inserted = JSON.parse(insertText);
        nextMonth = Array.isArray(inserted) ? inserted[0] : inserted;
      } else {

        // Backfill season_id / year_id if the existing row is missing them
        const needsPatch = nextMonth.season_id == null || nextMonth.year_id == null;
        if (needsPatch) {
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
          .select('id, name, national_dex_id, family_id, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
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
          is_second_round: p.is_second_round,
          pokemon:        p,
        }));

      } else {
        // Pool exists — hydrate from pokemon_master
        const pokemonIds = existingPool.map(r => r.pokemon_id);

        const { data: pkDetails } = await supabase
          .from('pokemon_master')
          .select('id, name, national_dex_id, display_name, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference, form_id, forms_count')
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
          is_second_round: seenElsewhere.has(r.pokemon_id),
          pokemon:         pkMap[r.pokemon_id],
        }));
      }

      // Calculate category stats: actual board distribution + expected distribution
      const { thresholds } = await calculateCategoryThresholds();

      // Count categories on current board
      const boardCategoryCounts = {};
      const categories = ['legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil', 'regional_alt', 'pseudo_legendary', 'pla'];
      categories.forEach(cat => { boardCategoryCounts[cat] = 0; });

      // Fetch pokemon data for all pokemon on the board to count categories
      const boardPokemonIds = tiles.map(t => t.pokemon?.id || t.pokemon_id).filter(Boolean);
      const gameSlugsMap = {};       // pokemon_id -> game_slugs[]
      const restrictedSlugsMap = {}; // pokemon_id -> restricted_game_slugs[]
      if (boardPokemonIds.length > 0) {
        const { data: boardPokemon } = await supabase
          .from('pokemon_master')
          .select('id, game_slugs, restricted_game_slugs, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt, pseudo_legendary, pla')
          .in('id', boardPokemonIds);

        (boardPokemon || []).forEach(p => {
          gameSlugsMap[p.id] = p.game_slugs || [];
          restrictedSlugsMap[p.id] = p.restricted_game_slugs || [];
          categories.forEach(cat => {
            if (p[cat] === true) boardCategoryCounts[cat]++;
          });
        });
      }

      // ── Per-game utilization stats ───────────────────────────────────────────
      // Compares each game's share of the board against its share of the full
      // dex, so mods can spot games that are over/under-represented (e.g. a small
      // dex like Legends: Arceus filling half the board). Computed for both the
      // standard pool (game_slugs) and the restricted pool (restricted_game_slugs).
      let boardMonTotal = 0;
      tiles.forEach(t => { if (t.pokemon?.id || t.pokemon_id) boardMonTotal++; });

      // Only count shiny-available pokemon in the dex denominator — non-shiny mons
      // can never appear on a board, so including them inflates the "expected" dex share.
      const { count: dexTotal } = await supabase
        .from('pokemon_master')
        .select('*', { count: 'exact', head: true })
        .eq('shiny_available', true);

      // Build { gameKey: { boardCount, dexCount } } for a given slug map + column.
      const buildGameStats = async (slugMap, slugColumn) => {
        const boardCounts = {};
        tiles.forEach(t => {
          const pid = t.pokemon?.id || t.pokemon_id;
          if (!pid) return;
          (slugMap[pid] || []).forEach(g => { boardCounts[g] = (boardCounts[g] || 0) + 1; });
        });
        const keys = Object.keys(boardCounts);
        const dexCounts = await Promise.all(
          keys.map(g =>
            supabase
              .from('pokemon_master')
              .select('*', { count: 'exact', head: true })
              .eq('shiny_available', true)
              .contains(slugColumn, [g])
          )
        );
        const stats = {};
        keys.forEach((g, i) => {
          stats[g] = { boardCount: boardCounts[g], dexCount: dexCounts[i].count || 0 };
        });
        return stats;
      };

      const [gameStats, restrictedGameStats] = await Promise.all([
        buildGameStats(gameSlugsMap, 'game_slugs'),
        buildGameStats(restrictedSlugsMap, 'restricted_game_slugs'),
      ]);

      // Build category stats with actual board counts + expected distribution
      const categoryStats = {};
      categories.forEach(cat => {
        categoryStats[cat] = {
          boardCount: boardCategoryCounts[cat],
          avg: thresholds[cat].avg,
          floor: thresholds[cat].floor,
          ceiling: thresholds[cat].ceiling,
        };
      });

      // Fetch lock state for this month
      let lockedPositions = Array(26).fill(false);
      const { data: lockState } = await supabase
        .from('board_builder_state')
        .select('locked_positions')
        .eq('month_id', nextMonth.id)
        .maybeSingle();

      if (lockState?.locked_positions) {
        lockedPositions = lockState.locked_positions;
      } else {
        // Initialize lock state for new month if it doesn't exist
        const { error: insertErr } = await supabase.from('board_builder_state').insert({
          month_id: nextMonth.id,
          locked_positions: lockedPositions,
        });
        // Ignore error if row already exists (race condition)
        if (insertErr?.code !== '23505') {
          console.error('Failed to initialize lock state:', insertErr);
        }
      }

      res.json({ nextMonth, tiles, categoryStats, lockedPositions, gameStats, restrictedGameStats, boardMonTotal, dexTotal });

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

      const modRow = await isModerator(userId);
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

      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', {
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

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { position, monthId, operationId } = req.body;
      if (!position || !monthId) return res.status(400).json({ error: 'position, monthId required' });
      if (position === 13) return res.status(400).json({ error: 'Cannot reroll FREE SPACE' });

      const pick = await pickRandomPokemonForPosition(monthId, position);
      if (!pick) return res.status(409).json({ error: 'No eligible pokemon available for reroll' });

      // Update the row
      const { error: upErr } = await supabase
        .from('monthly_pokemon_pool')
        .update({ pokemon_id: pick.pokemon_id })
        .eq('month_id', monthId)
        .eq('position', position);

      if (upErr) return res.status(500).json({ error: 'Reroll update failed', details: upErr.message });

      const tile = {
        position,
        pokemon_id:      pick.pokemon_id,
        name:            pick.name,
        national_dex_id: pick.national_dex_id,
        is_second_round: pick.is_second_round,
        display_name:    pick.display_name,
        form_id:         pick.form_id,
        forms_count:     pick.forms_count,
        custom_gender_code: pick.custom_gender_code,
        genderless:      pick.genderless,
        has_gender_difference: pick.has_gender_difference,
        has_major_gender_difference: pick.has_major_gender_difference,
      };

      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', {
        type: 'reroll', tile, operationId,
      });

      res.json({ tile });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mod/board-builder/refresh-all
  app.post('/api/mod/board-builder/refresh-all', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { monthId, operationId } = req.body;
      if (!monthId) return res.status(400).json({ error: 'monthId required' });

      // Fetch lock state and current pool BEFORE regenerating
      const { data: lockState } = await supabase
        .from('board_builder_state')
        .select('locked_positions')
        .eq('month_id', monthId)
        .maybeSingle();

      const lockedPositions = lockState?.locked_positions || Array(26).fill(false);

      // Get current pool to identify locked Pokemon
      const { data: currentPool } = await supabase
        .from('monthly_pokemon_pool')
        .select('position, pokemon_id')
        .eq('month_id', monthId)
        .order('position');

      const currentMap = {};
      const lockedPokemonIds = [];
      (currentPool || []).forEach(r => {
        currentMap[r.position] = r.pokemon_id;
        if (lockedPositions[r.position]) {
          lockedPokemonIds.push(r.pokemon_id);
        }
      });

      // Count unlocked positions (only generate Pokemon for these)
      const unlockedPositions = [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25].filter(pos => !lockedPositions[pos]);
      const numUnlocked = unlockedPositions.length;

      // Pre-calculate category counts for locked Pokemon to pass to generation
      const { data: allPokemonForLocked } = await supabase
        .from('pokemon_master')
        .select('id, legendary, baby, ultra_beast, paradox, starter, fossil, regional_alt, pseudo_legendary, pla')
        .eq('shiny_available', true);

      const categories = ['legendary', 'baby', 'ultra_beast', 'paradox', 'starter', 'fossil', 'regional_alt', 'pseudo_legendary', 'pla'];
      const lockedCategoryCounts = {};
      categories.forEach(cat => { lockedCategoryCounts[cat] = 0; });

      const lockedPokemonSet = new Set(lockedPokemonIds);
      const lockedPokemonData = (allPokemonForLocked || []).filter(p => lockedPokemonSet.has(p.id));
      lockedPokemonData.forEach(p => {
        categories.forEach(cat => {
          if (p[cat] === true) {
            lockedCategoryCounts[cat]++;
          }
        });
      });

      // Fetch Pokemon data for locked Pokemon (need name and national_dex_id for rendering)
      const uniqueLockedIds = [...new Set(lockedPokemonIds)];
      const { data: lockedPokemonDetails } = uniqueLockedIds.length > 0
        ? await supabase
            .from('pokemon_master')
            .select('id, name, national_dex_id, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference')
            .in('id', uniqueLockedIds)
        : { data: [] };

      const lockedPokemonMap = {};
      (lockedPokemonDetails || []).forEach(p => {
        lockedPokemonMap[p.id] = {
          name: p.name,
          national_dex_id: p.national_dex_id,
          display_name: p.display_name,
          form_id: p.form_id,
          forms_count: p.forms_count,
          custom_gender_code: p.custom_gender_code,
          genderless: p.genderless,
          has_gender_difference: p.has_gender_difference,
          has_major_gender_difference: p.has_major_gender_difference,
        };
      });

      // Generate only for unlocked positions, passing locked category counts
      const { board: newPokemon, categoryStats } = await generateNewPoolForMonth(monthId, lockedPokemonIds, numUnlocked, lockedCategoryCounts);

      // Merge: locked Pokemon stay in place, new Pokemon fill unlocked positions
      const board = [];
      let newPokemonIndex = 0;
      for (let pos = 1; pos <= 25; pos++) {
        if (pos === 13) continue; // Skip free space

        if (lockedPositions[pos]) {
          // Keep locked Pokemon with full data
          const currentPokemonId = currentMap[pos];
          if (currentPokemonId) {
            const pokemonData = lockedPokemonMap[currentPokemonId] || {
              name: '',
              national_dex_id: 0,
              display_name: '',
              form_id: 0,
              forms_count: 1,
              custom_gender_code: null,
              genderless: false,
              has_gender_difference: false,
              has_major_gender_difference: false,
            };
            board.push({
              position: pos,
              pokemon_id: currentPokemonId,
              name: pokemonData.name,
              national_dex_id: pokemonData.national_dex_id,
              display_name: pokemonData.display_name,
              form_id: pokemonData.form_id,
              forms_count: pokemonData.forms_count,
              custom_gender_code: pokemonData.custom_gender_code,
              genderless: pokemonData.genderless,
              has_gender_difference: pokemonData.has_gender_difference,
              has_major_gender_difference: pokemonData.has_major_gender_difference,
              is_second_round: false,
              pokemon: {
                id: currentPokemonId,
                name: pokemonData.name,
                national_dex_id: pokemonData.national_dex_id,
                display_name: pokemonData.display_name,
                form_id: pokemonData.form_id,
                forms_count: pokemonData.forms_count,
                custom_gender_code: pokemonData.custom_gender_code,
                genderless: pokemonData.genderless,
                has_gender_difference: pokemonData.has_gender_difference,
                has_major_gender_difference: pokemonData.has_major_gender_difference,
              }
            });
          }
        } else {
          // Add new Pokemon for unlocked position
          if (newPokemonIndex < newPokemon.length) {
            const newTile = newPokemon[newPokemonIndex];
            board.push({
              position: pos,
              pokemon_id: newTile.pokemon_id,
              name: newTile.name,
              national_dex_id: newTile.national_dex_id,
              display_name: newTile.display_name,
              form_id: newTile.form_id,
              forms_count: newTile.forms_count,
              custom_gender_code: newTile.custom_gender_code,
              genderless: newTile.genderless,
              has_gender_difference: newTile.has_gender_difference,
              has_major_gender_difference: newTile.has_major_gender_difference,
              is_second_round: newTile.is_second_round,
              pokemon: newTile.pokemon
            });
            newPokemonIndex++;
          }
        }
      }

      // Batch update all positions in parallel
      const updatePromises = board.map(tile =>
        supabase
          .from('monthly_pokemon_pool')
          .update({ pokemon_id: tile.pokemon_id })
          .eq('month_id', monthId)
          .eq('position', tile.position)
      );
      const updateResults = await Promise.all(updatePromises);
      updateResults.forEach((result, i) => {
        if (result.error) {
          console.error(`Failed to update position ${board[i].position}:`, result.error);
        }
      });

      // Broadcast bulk update (all tiles at once)
      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', {
        type: 'refresh-all',
        tiles: board,
        categoryStats,
        operationId,
      });

      res.json({ tiles: board, categoryStats });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mod/board-builder/shuffle
  app.post('/api/mod/board-builder/shuffle', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { monthId, operationId } = req.body;
      if (!monthId) return res.status(400).json({ error: 'monthId required' });

      // Fetch lock state
      const { data: lockState } = await supabase
        .from('board_builder_state')
        .select('locked_positions')
        .eq('month_id', monthId)
        .maybeSingle();

      const lockedPositions = lockState?.locked_positions || Array(26).fill(false);

      // Fetch current pool
      const { data: pool } = await supabase
        .from('monthly_pokemon_pool')
        .select('id, position, pokemon_id')
        .eq('month_id', monthId)
        .neq('position', 13); // Exclude FREE SPACE

      if (!pool || pool.length < 24) {
        return res.status(400).json({ error: 'Pool not fully initialized' });
      }

      // Separate locked and unlocked positions
      const unlockedItems = pool.filter(item => !lockedPositions[item.position]);
      const lockedItems = pool.filter(item => lockedPositions[item.position]);

      // Shuffle unlocked positions among unlocked items
      const unlockedPositions = unlockedItems.map(p => p.position);
      const shuffledUnlockedPositions = shuffleArray([...unlockedPositions]);

      // Create update operations: assign shuffled positions to unlocked items
      const updates = [];

      // Update unlocked items with shuffled positions
      for (let i = 0; i < unlockedItems.length; i++) {
        updates.push({
          id: unlockedItems[i].id,
          newPosition: shuffledUnlockedPositions[i],
          oldPosition: unlockedItems[i].position,
          pokemon_id: unlockedItems[i].pokemon_id,
        });
      }

      // Keep locked items in place
      for (const item of lockedItems) {
        updates.push({
          id: item.id,
          newPosition: item.position,
          oldPosition: item.position,
          pokemon_id: item.pokemon_id,
          isLocked: true,
        });
      }

      // Delete and re-insert unlocked items with new positions
      const unlockedUpdates = updates.filter(u => !u.isLocked);
      const unlockedIds = unlockedUpdates.map(u => u.id);

      // Delete unlocked items
      if (unlockedIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from('monthly_pokemon_pool')
          .delete()
          .in('id', unlockedIds);
        if (deleteErr) {
          return res.status(500).json({ error: 'Shuffle delete failed', details: deleteErr.message });
        }

        // Re-insert with new positions
        const reinsertData = unlockedUpdates.map(u => ({
          month_id: monthId,
          pokemon_id: u.pokemon_id,
          position: u.newPosition,
        }));

        const { error: insertErr } = await supabase
          .from('monthly_pokemon_pool')
          .insert(reinsertData);
        if (insertErr) {
          return res.status(500).json({ error: 'Shuffle insert failed', details: insertErr.message });
        }
      }

      // Broadcast shuffle event (include all updates, locked positions will have same old/new)
      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', {
        type: 'shuffle',
        updates: updates.map(u => ({
          oldPosition: u.oldPosition,
          newPosition: u.newPosition,
          pokemon_id: u.pokemon_id,
        })),
        operationId,
      });

      res.json({ ok: true, updates: updates.map(u => ({
        oldPosition: u.oldPosition,
        newPosition: u.newPosition,
        pokemon_id: u.pokemon_id,
      })) });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mod/board-builder/:monthId/toggle-lock
  app.post('/api/mod/board-builder/:monthId/toggle-lock', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { monthId } = req.params;
      const { position, locked } = req.body;

      if (monthId == null || position == null || typeof locked !== 'boolean') {
        return res.status(400).json({ error: 'monthId, position, and locked required' });
      }

      if (position === 13) {
        return res.status(400).json({ error: 'Cannot lock free space' });
      }

      // Fetch current lock state
      const { data: lockState } = await supabase
        .from('board_builder_state')
        .select('locked_positions')
        .eq('month_id', monthId)
        .maybeSingle();

      let lockedPositions = Array(26).fill(false);
      if (lockState?.locked_positions) {
        lockedPositions = [...lockState.locked_positions];
      }

      // Update lock state for this position
      lockedPositions[position] = locked;

      // Update in database
      const { error: updateErr } = await supabase
        .from('board_builder_state')
        .update({ locked_positions: lockedPositions })
        .eq('month_id', monthId);

      if (updateErr) {
        return res.status(500).json({ error: 'Failed to update lock state', details: updateErr.message });
      }

      // Broadcast lock change
      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', {
        type: 'lock-toggled',
        position,
        locked,
        lockedPositions,
      });

      res.json({ position, locked, lockedPositions });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mod/board-builder/:monthId/clear-all-locks
  app.post('/api/mod/board-builder/:monthId/clear-all-locks', async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const modRow = await isModerator(userId);
      if (!modRow) return res.status(403).json({ error: 'Moderator access required' });

      const { monthId } = req.params;
      const { operationId } = req.body;

      if (monthId == null) {
        return res.status(400).json({ error: 'monthId required' });
      }

      // Clear all locks
      const lockedPositions = Array(26).fill(false);

      // Update in database
      const { error: updateErr } = await supabase
        .from('board_builder_state')
        .update({ locked_positions: lockedPositions })
        .eq('month_id', monthId);

      if (updateErr) {
        return res.status(500).json({ error: 'Failed to clear locks', details: updateErr.message });
      }

      // Broadcast lock change
      const broadcastPayload = {
        type: 'lock-toggled',
        lockedPositions,
      };
      if (operationId) broadcastPayload.operationId = operationId;

      await broadcastUpdate(`board-builder-updates-${monthId}`, 'tile-update', broadcastPayload);

      res.json({ lockedPositions });

    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

};
