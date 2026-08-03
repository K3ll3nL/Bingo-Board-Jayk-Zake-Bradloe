/**
 * approvals routes (4).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  approvalsInProgress,
  awardBadgesForTrigger,
  broadcastNotificationToasts,
  broadcastUpdate,
  getAuthenticatedUserId,
  leaderboardCache,
  pokeR2Url,
  supabase,
} = require('../_lib/core');

module.exports = function register(app) {

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

      const { status: approvalStatus, message: approvalMessage } = req.body;
      const modNote = approvalMessage?.trim() || null;

      if (approval.historical) {
        // Historical approvals: bypass RPC — handle entirely in Express (no points, no board)
        const validHistoricalStatuses = ['accepted_historical', 'accepted_downgraded_historical', 'accepted_upgraded_historical'];
        const historicalStatus = validHistoricalStatuses.includes(approvalStatus) ? approvalStatus : 'accepted_historical';
        const isDowngradedHistorical = historicalStatus === 'accepted_downgraded_historical';
        const isUpgradedHistorical = historicalStatus === 'accepted_upgraded_historical';

        let historicalNote = `Approved by ${moderatorName}`;
        if (isDowngradedHistorical) historicalNote += ' (downgraded)';
        if (isUpgradedHistorical) historicalNote += ' (upgraded)';
        if (approval.proof_link?.length) {
          historicalNote += `. Links: ${approval.proof_link.join(', ')}`;
        }

        const { error: entryError } = await supabase.from('entries').insert({
          user_id: approval.user_id,
          pokemon_id: approval.pokemon_id,
          month_id: approval.month_id,
          game: approval.game,
          historical: true,
          restricted_submission: isUpgradedHistorical || (!isDowngradedHistorical && !!approval.restricted_submission),
          moderator_note: historicalNote,
        });
        if (entryError) throw entryError;

        const { error: deleteError } = await supabase.from('approvals').delete().eq('id', id);
        if (deleteError) throw deleteError;

        await supabase.from('notifications').insert({
          user_id: approval.user_id,
          pokemon_id: approval.pokemon_id,
          status: historicalStatus,
          message: modNote,
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
            restricted_submission: isUpgradedHistorical || (!isDowngradedHistorical && !!approval.restricted_submission),
            proof_url: approval.proof_url,
            proof_url2: approval.proof_url2,
            proof_link: approval.proof_link,
            had_images: !!(approval.proof_url || approval.proof_url2),
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

      // The approve_submission RPC creates the notification without a moderator note.
      // Persist the upgrade/downgrade comment onto the freshly-created notification.
      if (modNote) {
        (async () => {
          try {
            const { data: notif } = await supabase.from('notifications')
              .select('id')
              .eq('user_id', approval.user_id)
              .eq('pokemon_id', approval.pokemon_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            if (notif) await supabase.from('notifications').update({ message: modNote }).eq('id', notif.id);
          } catch (err) {
            console.error('Failed to attach moderator note to notification (non-fatal):', err.message);
          }
        })();
      }

      // Append proof_link(s) to entry moderator_note (fire-and-forget)
      if (approval.proof_link?.length) {
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
              const linksText = approval.proof_link.join(', ');
              const newNote = entry.moderator_note
                ? `${entry.moderator_note}. Links: ${linksText}`
                : `Links: ${linksText}`;
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
          had_images: !!(approval.proof_url || approval.proof_url2),
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
            had_images: !!(approval.proof_url || approval.proof_url2),
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
          had_images: !!(approval.proof_url || approval.proof_url2),
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

      // Lightweight count path for the header badge — no joins, one round-trip for both queues.
      if (req.query.count === 'true') {
        const [{ count: pending }, { count: historical }] = await Promise.all([
          supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('historical', false),
          supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('historical', true),
        ]);
        return res.json({ pending: pending || 0, historical: historical || 0 });
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
          proof_url3,
          proof_url4,
          extra_images,
          proof_link,
          game,
          caught_in_game,
          user_id,
          pokemon_id,
          month_id,
          restricted_submission,
          historical,
          note,
          users!approvals_user_id_fkey (
            display_name,
            restricted_strikes
          ),
          pokemon_master!approvals_pokemon_id_fkey (
            id,
            name,
            national_dex_id,
            form_id,
            forms_count,
            genderless,
            custom_gender_code,
            has_gender_difference,
            has_major_gender_difference
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
        proof_url3: approval.proof_url3,
        proof_url4: approval.proof_url4,
        extra_images: approval.extra_images ?? null,
        proof_link: approval.proof_link ?? null,
        game: approval.game || null,
        caught_in_game: approval.caught_in_game || null,
        user_id: approval.user_id,
        display_name: approval.users?.display_name || 'Unknown',
        pokemon_name: approval.pokemon_master?.name || 'Unknown',
        national_dex_id: approval.pokemon_master?.national_dex_id || 0,
        pokemon: approval.pokemon_master || null,
        pokemon_img: pokeR2Url(approval.pokemon_master?.national_dex_id),
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
        .select('id, user_id, pokemon_id, month_id, game, historical, restricted_submission, proof_url, proof_url2, proof_link, had_images, status, moderator_id, created_at, processed_at')
        .order('processed_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Batch-enrich with user and pokemon display info
      const userIds = [...new Set([
        ...(history || []).map(h => h.user_id),
        ...(history || []).map(h => h.moderator_id),
      ].filter(Boolean))];
      const pokemonIds = [...new Set((history || []).map(h => h.pokemon_id).filter(Boolean))];

      const [usersRes, pokemonRes] = await Promise.all([
        userIds.length ? supabase.from('users').select('id, display_name').in('id', userIds) : { data: [] },
        pokemonIds.length ? supabase.from('pokemon_master').select('id, name, national_dex_id, form_id, forms_count, genderless, custom_gender_code, has_gender_difference, has_major_gender_difference').in('id', pokemonIds) : { data: [] },
      ]);

      const userMap = Object.fromEntries((usersRes.data || []).map(u => [u.id, u]));
      const pokemonMap = Object.fromEntries((pokemonRes.data || []).map(p => [p.id, p]));

      const enriched = (history || []).map(h => ({
        ...h,
        display_name: userMap[h.user_id]?.display_name || 'Unknown',
        moderator_name: userMap[h.moderator_id]?.display_name || null,
        pokemon_name: pokemonMap[h.pokemon_id]?.name || 'Unknown',
        national_dex_id: pokemonMap[h.pokemon_id]?.national_dex_id || null,
        pokemon: pokemonMap[h.pokemon_id] || null,
        pokemon_img: pokeR2Url(pokemonMap[h.pokemon_id]?.national_dex_id),
      }));

      res.json(enriched);
    } catch (err) {
      console.error('Error fetching approval history:', err);
      res.status(500).json({ error: 'Failed to fetch approval history' });
    }
  });

};
