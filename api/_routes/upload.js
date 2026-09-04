/**
 * upload routes (5).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  awardBadgesForTrigger,
  broadcastUpdate,
  getActiveMonthId,
  getAuthenticatedUserId,
  nowForMonth,
  supabase,
  upload,
  uploadRateLimit,
  uploadSupplementalProof,
} = require('../_lib/core');

module.exports = function register(app) {

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
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference, game_slugs, restricted_game_slugs')
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
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference, game_slugs, restricted_game_slugs')
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
        supabase.from('bingo_months').select('id, start_date, month_year_display').lt('id', ACTIVE_MONTH_ID).order('id', { ascending: false }),
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
      const monthDisplayById = Object.fromEntries((pastMonths).map(m => [m.id, m.month_year_display]));

      const { data: pokemon, error: pokemonError } = await supabase
        .from('pokemon_master')
        .select('id, national_dex_id, name, display_name, form_id, forms_count, custom_gender_code, genderless, has_gender_difference, has_major_gender_difference, game_slugs, restricted_game_slugs')
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
          month_label: monthDisplayById[monthId] || (startDate
            ? new Date(startDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
            : `Month ${monthId}`),
          has_standard_entry: standardOnlyKeys.has(key),
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching historical Pokemon:', error);
      res.status(500).json({ error: 'Failed to fetch historical Pokemon' });
    }
  });

  app.post('/api/upload/submission', uploadRateLimit, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }, { name: 'file3', maxCount: 1 }, { name: 'evolutionFile', maxCount: 1 }, { name: 'evolutionSummaryFile', maxCount: 1 }, { name: 'extraFile', maxCount: 6 }]), async (req, res) => {
    try {
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);

      const userId = await getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const pokemon_id = req.body.pokemon_id;
      const game = req.body.game?.trim();
      const restricted_submission = req.body.restricted_submission === 'true';
      const caught_in_game = req.body.caught_in_game?.trim() || null;
      const note = req.body.note?.trim() || null;
      const file = req.files?.file?.[0];
      const file2 = req.files?.file2?.[0];
      // Third main proof shot. Most games ask for Overworld / TID / Date; Let's
      // Go asks for two because TID and date share a screen. See
      // proofFieldsFor() in client/src/constants/games.js — the client enforces
      // the exact per-game count, the server accepts 2 or 3.
      const file3 = req.files?.file3?.[0];
      // link may arrive as a single string or a string[] when multiple are submitted
      const rawLink = req.body.link;
      const proofLinks = Array.isArray(rawLink)
        ? rawLink.map(u => u?.trim()).filter(Boolean)
        : rawLink?.trim() ? [rawLink.trim()] : [];

      console.log('Parsed values:', { pokemon_id, game, proofLinks, file: !!file, file2: !!file2 });

      if (!pokemon_id) {
        return res.status(400).json({ error: 'Pokemon ID required' });
      }

      if (!game) {
        return res.status(400).json({ error: 'Game is required' });
      }

      // Restricted: requires video link, no images
      // Normal: requires both image files; link is supplemental (optional)
      if (restricted_submission && proofLinks.length === 0) {
        return res.status(400).json({ error: 'Restricted submissions require a video link' });
      }
      if (!restricted_submission && (!file || !file2) && proofLinks.length === 0) {
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
      
      // Get active month — order+limit(1) so the 3h overlap window (both months
      // match nowForMonth) picks the newer month instead of PGRST-erroring.
      const { data: activeMonth, error: monthError } = await supabase
        .from('bingo_months')
        .select('id')
        .lte('start_date', nowForMonth().toISOString())
        .gte('end_date', nowForMonth().toISOString())
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (monthError || !activeMonth) {
        return res.status(400).json({ error: 'No active bingo month' });
      }
      
      let proofUrl = null;
      let proofUrl2 = null;
      // Named `Main3` to avoid colliding with proofUrl3, which is evolution proof.
      let proofUrlMain3 = null;
      // proof_link: array of video links (required for restricted, optional for normal)
      const proofLink = proofLinks.length > 0 ? proofLinks : null;

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

          if (file3) {
            const fileName3 = `approval/${userId}-${pokemon_id}-${Date.now()}-p3-${file3.originalname}`;
            await s3Client.send(new PutObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: fileName3,
              Body: file3.buffer,
              ContentType: file3.mimetype,
            }));
            proofUrlMain3 = `${R2_BUCKET_URL}/${fileName3}`;
            console.log('Upload 3 successful:', proofUrlMain3);
          }
        } catch (r2Error) {
          console.error('R2 upload error:', r2Error);
          return res.status(500).json({ 
            error: 'File upload failed', 
            details: r2Error.message 
          });
        }
      }
      
      // Upload evolution + extra proof images (caught-in-different-game & supplemental shots)
      let proofUrl3 = null, proofUrl4 = null, extraImageUrls = null;
      try {
        ({ proofUrl3, proofUrl4, extraImageUrls } = await uploadSupplementalProof(req, userId, pokemon_id, ''));
      } catch (r2Error) {
        console.error('R2 upload error (evolution/extra):', r2Error);
        return res.status(r2Error.fileTooBig ? 413 : 500).json({ error: r2Error.fileTooBig ? r2Error.message : 'File upload failed', details: r2Error.message, fileTooBig: !!r2Error.fileTooBig });
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
          // Ordered main proof shots. proof_url/proof_url2 stay populated for
          // the rollout; readers should prefer proof_urls.
          proof_urls: [proofUrl, proofUrl2, proofUrlMain3].filter(Boolean),
          proof_url3: proofUrl3,
          proof_url4: proofUrl4,
          extra_images: extraImageUrls,
          proof_link: proofLink,
          game,
          restricted_submission,
          caught_in_game,
          note,
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
  app.post('/api/upload/historical-submission', uploadRateLimit, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file2', maxCount: 1 }, { name: 'file3', maxCount: 1 }, { name: 'evolutionFile', maxCount: 1 }, { name: 'evolutionSummaryFile', maxCount: 1 }, { name: 'extraFile', maxCount: 6 }]), async (req, res) => {
    try {
      const userId = await getAuthenticatedUserId(req);
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const pokemon_id    = req.body.pokemon_id;
      const game          = req.body.game?.trim();
      const month_id      = parseInt(req.body.month_id);
      const isRestricted  = req.body.restricted_submission === 'true';
      const caught_in_game = req.body.caught_in_game?.trim() || null;
      const note          = req.body.note?.trim() || null;
      const file       = req.files?.file?.[0];
      const file2      = req.files?.file2?.[0];
      const file3      = req.files?.file3?.[0];
      const rawLink    = req.body.link;
      const proofLinks = Array.isArray(rawLink)
        ? rawLink.map(u => u?.trim()).filter(Boolean)
        : rawLink?.trim() ? [rawLink.trim()] : [];

      if (!pokemon_id)        return res.status(400).json({ error: 'Pokemon ID required' });
      if (!game)              return res.status(400).json({ error: 'Game is required' });
      if (!month_id)          return res.status(400).json({ error: 'Month ID required' });
      if ((!file || !file2) && proofLinks.length === 0) return res.status(400).json({ error: 'Either both proof images or a video link is required' });

      // Validate month is in the past (not the current active month) — same
      // order+limit(1) treatment so the 3h month overlap doesn't PGRST-error.
      const { data: activeMonth } = await supabase
        .from('bingo_months')
        .select('id')
        .lte('start_date', nowForMonth().toISOString())
        .gte('end_date', nowForMonth().toISOString())
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

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

      // Prevent duplicate: check existing entries and pending approvals for this user/pokemon/month/restriction type
      const [{ data: existingEntry }, { data: existingApproval }] = await Promise.all([
        supabase.from('entries').select('id').eq('user_id', userId).eq('pokemon_id', parseInt(pokemon_id)).eq('month_id', month_id).eq('restricted_submission', isRestricted).single(),
        supabase.from('approvals').select('id').eq('user_id', userId).eq('pokemon_id', parseInt(pokemon_id)).eq('month_id', month_id).eq('restricted_submission', isRestricted).single(),
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
      // Named `Main3` to avoid colliding with proofUrl3, which is evolution proof.
      let proofUrlMain3 = null;
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
          if (file3) {
            const key3 = `approval/${userId}-${pokemon_id}-${ts}-hist-p3-${file3.originalname}`;
            await s3Client.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || 'shiny-sprites', Key: key3, Body: file3.buffer, ContentType: file3.mimetype }));
            proofUrlMain3 = `${process.env.R2_BUCKET_URL}/${key3}`;
          }
        } catch (r2Error) {
          return res.status(500).json({ error: 'File upload failed', details: r2Error.message });
        }
      }

      // Upload evolution + extra proof images (caught-in-different-game & supplemental shots)
      let proofUrl3 = null, proofUrl4 = null, extraImageUrls = null;
      try {
        ({ proofUrl3, proofUrl4, extraImageUrls } = await uploadSupplementalProof(req, userId, pokemon_id, 'hist-'));
      } catch (r2Error) {
        console.error('R2 upload error (historical evolution/extra):', r2Error);
        return res.status(r2Error.fileTooBig ? 413 : 500).json({ error: r2Error.fileTooBig ? r2Error.message : 'File upload failed', details: r2Error.message, fileTooBig: !!r2Error.fileTooBig });
      }

      const { data: approval, error: approvalError } = await supabase
        .from('approvals')
        .insert({
          user_id: userId,
          pokemon_id: parseInt(pokemon_id),
          month_id,
          proof_url: proofUrl,
          proof_url2: proofUrl2,
          // Ordered main proof shots. proof_url/proof_url2 stay populated for
          // the rollout; readers should prefer proof_urls.
          proof_urls: [proofUrl, proofUrl2, proofUrlMain3].filter(Boolean),
          proof_url3: proofUrl3,
          proof_url4: proofUrl4,
          extra_images: extraImageUrls,
          proof_link: proofLinks.length > 0 ? proofLinks : null,
          game,
          restricted_submission: isRestricted,
          historical: true,
          caught_in_game,
          note,
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

};
