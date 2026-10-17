/**
 * badgeBacklog routes — the Backlog and Timing tabs of /badge-upload.
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 *
 * Mods pitch badge families (proposals), rank them by dragging, write tier copy,
 * upload tier art, discuss in a comment thread, and vote on tier-count /
 * threshold changes. The site owner (site_owners) wires each proposal to a
 * check_type, watching the simulator's real earn counts, and publishes it.
 *
 *   Consensus order   api/_lib/backlogOrder.js
 *   Earn counts       api/_lib/badgeEval.js simulate() — the same evaluator as
 *                     live awards, the cron and the backfill
 *   Publish           createBadge() (same insert as POST /api/badges), then
 *                     awardPlan() rows for everyone who already qualifies
 *
 * Once a proposal exists its tier count and thresholds change ONLY through a
 * vote: a change passes when approvals > half of all moderators and fails when
 * rejections >= half. The opener's own yes is cast when the change is opened.
 */
const crypto = require('crypto');
const {
  announceBadges,
  createBadge,
  deleteR2Images,
  getAuthenticatedUserId,
  isModerator,
  isOwner,
  supabase,
  upload,
  uploadBufferToR2,
} = require('../_lib/core');
const { consensusOrder } = require('../_lib/backlogOrder');
const {
  TRIGGER_BY_CHECK_TYPE, CLOCK_RULES, simulate, awardPlan, forgetData,
} = require('../_lib/badgeEval');

const MAX_TIERS = 10;
const CODE_STATUSES = ['unreviewed', 'ready', 'needs_code', 'needs_tracking'];
// Checks whose threshold is ignored (fixed rule), so a tier needs none to publish.
const FIXED_CHECKS = new Set(['date_award', 'first_approval_month']);
const BACKLOG_ART_PREFIX = 'assets/badge-backlog/';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const fail = (status, msg) => Object.assign(new Error(msg), { status });

async function requireMod(req) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) throw fail(401, 'Unauthorized');
  if (!(await isModerator(userId))) throw fail(403, 'Moderators only');
  return userId;
}

async function requireOwner(req) {
  const userId = await requireMod(req);
  if (!(await isOwner(userId))) throw fail(403, 'Owner only');
  return userId;
}

const send = (res, err) => {
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  console.error('badgeBacklog:', err);
  return res.status(500).json({ error: err.message });
};

async function loadMods() {
  const { data: rows, error } = await supabase.from('moderators').select('id');
  if (error) throw error;
  const ids = (rows || []).map(r => r.id);
  if (!ids.length) return [];
  const { data: users, error: uErr } = await supabase
    .from('users').select('id, display_name, username, avatar_url').in('id', ids);
  if (uErr) throw uErr;
  const byId = new Map((users || []).map(u => [u.id, u]));
  return ids.map(id => ({
    id,
    name: byId.get(id)?.display_name || byId.get(id)?.username || 'Mod',
    avatar_url: byId.get(id)?.avatar_url || null,
  }));
}

async function loadProposal(id) {
  const { data, error } = await supabase.from('badge_proposals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw fail(404, 'Proposal not found');
  return data;
}

async function loadTiers(proposalId) {
  const { data, error } = await supabase
    .from('badge_proposal_tiers').select('*')
    .eq('proposal_id', proposalId).order('tier_order');
  if (error) throw error;
  return data || [];
}

const requireOpen = (p) => { if (p.status !== 'open') throw fail(409, `Proposal is ${p.status}`); };

const slugify = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const parseThreshold = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw fail(400, 'Thresholds must be numbers ≥ 0');
  return n;
};

// ── Change votes ──────────────────────────────────────────────────────────────
// Decides an open change from the votes of CURRENT moderators. The status flip
// is a conditional update (WHERE status = 'open'), so two simultaneous deciding
// votes apply the change once.
async function resolveChange(changeId) {
  const [{ data: change, error }, mods, { data: votes, error: vErr }] = await Promise.all([
    supabase.from('badge_proposal_changes').select('*').eq('id', changeId).maybeSingle(),
    loadMods(),
    supabase.from('badge_proposal_change_votes').select('mod_id, approve').eq('change_id', changeId),
  ]);
  if (error) throw error;
  if (vErr) throw vErr;
  if (!change || change.status !== 'open') return change;

  const modIds = new Set(mods.map(m => m.id));
  const counted = (votes || []).filter(v => modIds.has(v.mod_id));
  const yes = counted.filter(v => v.approve).length;
  const no = counted.length - yes;
  const half = mods.length / 2;
  const outcome = yes > half ? 'passed' : no >= half ? 'failed' : null;
  if (!outcome) return change;

  const { data: flipped, error: fErr } = await supabase
    .from('badge_proposal_changes')
    .update({ status: outcome, resolved_at: new Date().toISOString() })
    .eq('id', changeId).eq('status', 'open')
    .select().maybeSingle();
  if (fErr) throw fErr;
  if (!flipped) return change;          // someone else resolved it first
  if (outcome === 'passed') await applyChange(flipped);
  return flipped;
}

async function applyChange(change) {
  const p = change.payload || {};
  if (change.kind === 'threshold') {
    const { data: rows, error } = await supabase.from('badge_proposal_tiers')
      .update({ threshold: p.to }).eq('id', p.tier_id).eq('proposal_id', change.proposal_id)
      .is('badge_id', null).select('id');
    if (error) throw error;
    if (!rows?.length) throw fail(409, 'This tier is a live badge. The Backlog never changes live criteria — see CLAUDE.md "Editing live badge criteria"');
    return;
  }
  // tier_count
  const tiers = await loadTiers(change.proposal_id);
  if (p.to > tiers.length) {
    const rows = [];
    for (let o = tiers.length + 1; o <= p.to; o++) rows.push({ proposal_id: change.proposal_id, tier_order: o, name: '' });
    const { error } = await supabase.from('badge_proposal_tiers').insert(rows);
    if (error) throw error;
  } else if (p.to < tiers.length) {
    const drop = tiers.filter(t => t.tier_order > p.to);
    if (drop.some(t => t.badge_id)) throw fail(409, 'Cannot remove a published tier');
    const { error } = await supabase.from('badge_proposal_tiers').delete().in('id', drop.map(t => t.id));
    if (error) throw error;
    const art = drop.map(t => t.image_url).filter(u => u && u.includes(BACKLOG_ART_PREFIX));
    if (art.length) deleteR2Images(art).catch(() => {});
  }
}

module.exports = function register(app) {

  // ── Board: everything the Backlog tab renders, in one payload ───────────────
  app.get('/api/admin/backlog', async (req, res) => {
    try {
      const viewerId = await requireMod(req);
      const [{ data: proposals, error: pErr }, mods, owner] = await Promise.all([
        supabase.from('badge_proposals').select('*').neq('status', 'archived').order('created_at'),
        loadMods(),
        isOwner(viewerId),
      ]);
      if (pErr) throw pErr;
      const ids = (proposals || []).map(p => p.id);
      const since = new Date(Date.now() - 14 * 864e5).toISOString();

      const [tiersR, rankR, changesR, commentsR, familiesR] = await Promise.all([
        ids.length ? supabase.from('badge_proposal_tiers').select('*').in('proposal_id', ids).order('tier_order') : { data: [] },
        supabase.from('badge_proposal_rankings').select('mod_id, proposal_id, position').order('position'),
        ids.length ? supabase.from('badge_proposal_changes').select('*').in('proposal_id', ids)
          .or(`status.eq.open,resolved_at.gte.${since}`).order('created_at') : { data: [] },
        ids.length ? supabase.from('badge_proposal_comments').select('proposal_id').in('proposal_id', ids) : { data: [] },
        supabase.from('badge_families').select('id, display_name, display_order').order('display_order'),
      ]);
      for (const r of [tiersR, rankR, changesR, commentsR, familiesR]) if (r.error) throw r.error;

      const changeIds = (changesR.data || []).map(c => c.id);
      const { data: votes, error: vErr } = changeIds.length
        ? await supabase.from('badge_proposal_change_votes').select('change_id, mod_id, approve').in('change_id', changeIds)
        : { data: [] };
      if (vErr) throw vErr;


      const open = (proposals || []).filter(p => p.status === 'open');
      const modIds = new Set(mods.map(m => m.id));
      const rankingsByMod = new Map();
      for (const r of rankR.data || []) {
        if (!modIds.has(r.mod_id)) continue;
        if (!rankingsByMod.has(r.mod_id)) rankingsByMod.set(r.mod_id, []);
        rankingsByMod.get(r.mod_id).push(r.proposal_id);
      }
      const consensus = consensusOrder(open, rankingsByMod);
      const N = open.length;
      const weights = Object.fromEntries(mods.map(m => [m.id,
        consensus.weights[m.id] ?? { placed: 0, total: N, weight: 0 }]));

      // Earn counts for every wired proposal (bulk data is memoised per trigger).
      const sims = {};
      await Promise.all(open.filter(p => p.check_type).map(async (p) => {
        try { sims[p.id] = await simulate({ check_type: p.check_type, check_qualifier: p.check_qualifier }, supabase); }
        catch (e) { sims[p.id] = { evaluable: false, reason: 'error', message: e.message }; }
      }));

      const commentCount = {};
      for (const c of commentsR.data || []) commentCount[c.proposal_id] = (commentCount[c.proposal_id] || 0) + 1;
      const votesBy = {};
      for (const v of votes || []) (votesBy[v.change_id] ||= []).push({ mod_id: v.mod_id, approve: v.approve });
      const famName = new Map((familiesR.data || []).map(f => [f.id, f.display_name]));

      const orderById = new Map(consensus.order.map(r => [r.id, r]));
      const out = (proposals || []).map(p => ({
        ...p,
        existing_family_name: p.existing_family ? famName.get(p.existing_family) || p.existing_family : null,
        tiers: (tiersR.data || []).filter(t => t.proposal_id === p.id),
        consensus: orderById.get(p.id) ? {
          rank: orderById.get(p.id).rank, score: orderById.get(p.id).score, placed_by: orderById.get(p.id).placedBy,
        } : null,
        sim: sims[p.id] ?? null,
        changes: (changesR.data || []).filter(c => c.proposal_id === p.id)
          .map(c => ({ ...c, votes: votesBy[c.id] || [] })),
        comment_count: commentCount[p.id] || 0,
      }));

      res.json({
        proposals: out,
        mods: mods.map(m => ({ ...m, ...weights[m.id] })),
        viewer: {
          id: viewerId,
          is_owner: owner,
          order: rankingsByMod.get(viewerId) || [],
        },
        families: familiesR.data || [],
      });
    } catch (err) { send(res, err); }
  });

  // ── Propose a family ────────────────────────────────────────────────────────
  app.post('/api/admin/backlog', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const { name, theme_notes, existing_family, tiers } = req.body || {};
      // Proposals only ever become NEW families. Adding badges to a live family
      // is not a Backlog operation (owner decision 2026-10-13).
      if (existing_family) throw fail(400, 'The Backlog only proposes new families — it cannot add badges to a live family');
      const clean = String(name || '').trim();
      if (!clean || clean.length > 80) throw fail(400, 'Name is required (80 characters max)');
      if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > MAX_TIERS) {
        throw fail(400, `A family needs 1–${MAX_TIERS} badges`);
      }
      const tierRows = tiers.map((t, i) => ({
        tier_order: i + 1,
        name: String(t?.name || '').trim().slice(0, 80),
        threshold: parseThreshold(t?.threshold),
      }));
      const { data: p, error } = await supabase.from('badge_proposals').insert({
        name: clean,
        theme_notes: String(theme_notes || '').slice(0, 2000),
        proposed_by: userId,
      }).select().single();
      if (error) throw error;
      const { error: tErr } = await supabase.from('badge_proposal_tiers')
        .insert(tierRows.map(t => ({ ...t, proposal_id: p.id })));
      if (tErr) {
        await supabase.from('badge_proposals').delete().eq('id', p.id);
        throw tErr;
      }
      res.status(201).json({ id: p.id });
    } catch (err) { send(res, err); }
  });

  // ── My ranking: the viewer's full ordering of what they've placed ───────────
  // Registered before /:id routes (different methods today, but keep it so).
  app.put('/api/admin/backlog/ranking', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const order = req.body?.order;
      if (!Array.isArray(order) || new Set(order).size !== order.length) throw fail(400, 'order must be a list of unique proposal ids');
      if (order.length) {
        const { data: open, error } = await supabase.from('badge_proposals')
          .select('id').eq('status', 'open').in('id', order);
        if (error) throw error;
        if ((open || []).length !== order.length) throw fail(400, 'order contains a proposal that is not open');
      }
      const { error: dErr } = await supabase.from('badge_proposal_rankings').delete().eq('mod_id', userId);
      if (dErr) throw dErr;
      if (order.length) {
        const now = new Date().toISOString();
        const { error: iErr } = await supabase.from('badge_proposal_rankings')
          .insert(order.map((proposal_id, i) => ({ mod_id: userId, proposal_id, position: i + 1, updated_at: now })));
        if (iErr) throw iErr;
      }
      res.json({ ok: true, placed: order.length });
    } catch (err) { send(res, err); }
  });

  // ── Vote on a change ────────────────────────────────────────────────────────
  app.post('/api/admin/backlog/changes/:cid/vote', async (req, res) => {
    try {
      const userId = await requireMod(req);
      if (typeof req.body?.approve !== 'boolean') throw fail(400, 'approve must be true or false');
      const { data: change, error } = await supabase.from('badge_proposal_changes')
        .select('id, status').eq('id', req.params.cid).maybeSingle();
      if (error) throw error;
      if (!change) throw fail(404, 'Change not found');
      if (change.status !== 'open') throw fail(409, `This vote already ${change.status}`);
      const { error: vErr } = await supabase.from('badge_proposal_change_votes')
        .upsert({ change_id: change.id, mod_id: userId, approve: req.body.approve, created_at: new Date().toISOString() },
          { onConflict: 'change_id,mod_id' });
      if (vErr) throw vErr;
      const resolved = await resolveChange(change.id);
      res.json({ status: resolved?.status ?? 'open' });
    } catch (err) { send(res, err); }
  });

  // Withdraw a change: its opener or the owner. Recorded as failed.
  app.delete('/api/admin/backlog/changes/:cid', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const { data: change, error } = await supabase.from('badge_proposal_changes')
        .select('id, status, opened_by').eq('id', req.params.cid).maybeSingle();
      if (error) throw error;
      if (!change) throw fail(404, 'Change not found');
      if (change.opened_by !== userId && !(await isOwner(userId))) throw fail(403, 'Only whoever opened it can withdraw it');
      const { error: uErr } = await supabase.from('badge_proposal_changes')
        .update({ status: 'failed', resolved_at: new Date().toISOString() })
        .eq('id', change.id).eq('status', 'open');
      if (uErr) throw uErr;
      res.json({ ok: true });
    } catch (err) { send(res, err); }
  });

  app.delete('/api/admin/backlog/comments/:cid', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const { data: c, error } = await supabase.from('badge_proposal_comments')
        .select('id, user_id').eq('id', req.params.cid).maybeSingle();
      if (error) throw error;
      if (!c) throw fail(404, 'Comment not found');
      if (c.user_id !== userId && !(await isOwner(userId))) throw fail(403, 'Not your comment');
      const { error: dErr } = await supabase.from('badge_proposal_comments').delete().eq('id', c.id);
      if (dErr) throw dErr;
      res.json({ ok: true });
    } catch (err) { send(res, err); }
  });

  // ── Edit copy (any mod) / archive (owner or proposer) ───────────────────────
  app.patch('/api/admin/backlog/:id', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const p = await loadProposal(req.params.id);
      const patch = {};
      if (req.body?.name !== undefined) {
        const n = String(req.body.name).trim();
        if (!n || n.length > 80) throw fail(400, 'Name is required (80 characters max)');
        patch.name = n;
      }
      if (req.body?.theme_notes !== undefined) patch.theme_notes = String(req.body.theme_notes).slice(0, 2000);
      if (req.body?.status !== undefined) {
        if (!['open', 'archived'].includes(req.body.status)) throw fail(400, 'status must be open or archived');
        if (p.status === 'published') throw fail(409, 'Published proposals cannot be reopened or archived');
        if (p.proposed_by !== userId && !(await isOwner(userId))) throw fail(403, 'Only the proposer or the owner can archive');
        patch.status = req.body.status;
      } else {
        requireOpen(p);
      }
      if (!Object.keys(patch).length) throw fail(400, 'Nothing to change');
      const { error } = await supabase.from('badge_proposals').update(patch).eq('id', p.id);
      if (error) throw error;
      if (patch.status === 'archived') {
        await supabase.from('badge_proposal_rankings').delete().eq('proposal_id', p.id);
        await supabase.from('badge_proposal_changes')
          .update({ status: 'failed', resolved_at: new Date().toISOString() })
          .eq('proposal_id', p.id).eq('status', 'open');
      }
      res.json({ ok: true });
    } catch (err) { send(res, err); }
  });

  // Owner: delete an unpublished proposal outright (tiers, votes, comments cascade).
  app.delete('/api/admin/backlog/:id', async (req, res) => {
    try {
      await requireOwner(req);
      const p = await loadProposal(req.params.id);
      if (p.status === 'published') throw fail(409, 'Published proposals are kept as the record of their badges');
      const tiers = await loadTiers(p.id);
      const { error } = await supabase.from('badge_proposals').delete().eq('id', p.id);
      if (error) throw error;
      const art = tiers.map(t => t.image_url).filter(u => u && u.includes(BACKLOG_ART_PREFIX));
      if (art.length) deleteR2Images(art).catch(() => {});
      res.json({ ok: true });
    } catch (err) { send(res, err); }
  });

  // Tier copy: name, description, hint. Thresholds are vote-only.
  app.patch('/api/admin/backlog/:id/tiers/:tid', async (req, res) => {
    try {
      await requireMod(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const patch = {};
      for (const [k, max] of [['name', 80], ['description', 300], ['hint', 300]]) {
        if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).slice(0, max);
      }
      if (req.body?.threshold !== undefined) throw fail(400, 'Thresholds change by vote — open a change instead');
      if (!Object.keys(patch).length) throw fail(400, 'Nothing to change');
      const { data, error } = await supabase.from('badge_proposal_tiers')
        .update(patch).eq('id', req.params.tid).eq('proposal_id', p.id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw fail(404, 'Tier not found');
      res.json(data);
    } catch (err) { send(res, err); }
  });

  // Tier art (any mod). PNG only — publish copies it to assets/badges/<key>.png.
  app.put('/api/admin/backlog/:id/tiers/:tid/art', upload.single('image'), async (req, res) => {
    try {
      await requireMod(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const file = req.file;
      if (!file) throw fail(400, 'Image file is required');
      if (file.mimetype !== 'image/png' || !file.buffer.subarray(0, 8).equals(PNG_MAGIC)) {
        throw fail(400, 'Badge art must be a PNG');
      }
      const { data: tier, error } = await supabase.from('badge_proposal_tiers')
        .select('id, image_url, badge_id').eq('id', req.params.tid).eq('proposal_id', p.id).maybeSingle();
      if (error) throw error;
      if (!tier) throw fail(404, 'Tier not found');
      if (tier.badge_id) throw fail(409, 'This tier is already published — use Replace Image');
      const url = await uploadBufferToR2({ buffer: file.buffer, mimetype: 'image/png' },
        `${BACKLOG_ART_PREFIX}${crypto.randomUUID()}.png`);
      const { error: uErr } = await supabase.from('badge_proposal_tiers').update({ image_url: url }).eq('id', tier.id);
      if (uErr) throw uErr;
      if (tier.image_url && tier.image_url.includes(BACKLOG_ART_PREFIX)) deleteR2Images([tier.image_url]).catch(() => {});
      res.json({ image_url: url });
    } catch (err) { send(res, err); }
  });

  // ── Open a change (tier count or one tier's threshold) ──────────────────────
  app.post('/api/admin/backlog/:id/changes', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const tiers = await loadTiers(p.id);
      const { kind } = req.body || {};
      let payload;
      if (kind === 'tier_count') {
        const to = Number(req.body.to);
        if (!Number.isInteger(to) || to < 1 || to > MAX_TIERS) throw fail(400, `Tier count must be 1–${MAX_TIERS}`);
        if (to === tiers.length) throw fail(400, 'That is already the tier count');
        if (to < tiers.length && tiers.some(t => t.tier_order > to && t.badge_id)) throw fail(409, 'Cannot remove a published tier');
        payload = { from: tiers.length, to };
      } else if (kind === 'threshold') {
        const tier = tiers.find(t => t.id === req.body.tier_id);
        if (!tier) throw fail(404, 'Tier not found');
        if (tier.badge_id) throw fail(409, 'This tier is a live badge. The Backlog never changes live criteria — see CLAUDE.md "Editing live badge criteria"');
        const to = parseThreshold(req.body.to);
        if (to == null) throw fail(400, 'A new threshold is required');
        if (Number(tier.threshold) === to && tier.threshold != null) throw fail(400, 'That is already the threshold');
        payload = { tier_id: tier.id, tier_order: tier.tier_order, from: tier.threshold == null ? null : Number(tier.threshold), to };
      } else {
        throw fail(400, 'kind must be tier_count or threshold');
      }

      // One open change per target, so a passing vote never applies a stale "from".
      const { data: openChanges, error: oErr } = await supabase.from('badge_proposal_changes')
        .select('id, kind, payload').eq('proposal_id', p.id).eq('status', 'open');
      if (oErr) throw oErr;
      const clash = (openChanges || []).find(c => c.kind === kind && (kind === 'tier_count' || c.payload?.tier_id === payload.tier_id));
      if (clash) throw Object.assign(fail(409, 'There is already an open vote on that'), { extra: { change_id: clash.id } });

      const { data: change, error } = await supabase.from('badge_proposal_changes')
        .insert({ proposal_id: p.id, kind, payload, opened_by: userId }).select().single();
      if (error) throw error;
      const { error: vErr } = await supabase.from('badge_proposal_change_votes')
        .insert({ change_id: change.id, mod_id: userId, approve: true });
      if (vErr) throw vErr;
      const resolved = await resolveChange(change.id);
      res.status(201).json({ id: change.id, status: resolved?.status ?? 'open' });
    } catch (err) { send(res, err); }
  });

  // ── Comments ────────────────────────────────────────────────────────────────
  app.get('/api/admin/backlog/:id/comments', async (req, res) => {
    try {
      await requireMod(req);
      const { data, error } = await supabase.from('badge_proposal_comments')
        .select('id, user_id, body, created_at, users(display_name, username, avatar_url)')
        .eq('proposal_id', req.params.id).order('created_at');
      if (error) throw error;
      res.json((data || []).map(c => ({
        id: c.id, user_id: c.user_id, body: c.body, created_at: c.created_at,
        name: c.users?.display_name || c.users?.username || 'Mod',
        avatar_url: c.users?.avatar_url || null,
      })));
    } catch (err) { send(res, err); }
  });

  app.post('/api/admin/backlog/:id/comments', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const p = await loadProposal(req.params.id);
      const body = String(req.body?.body || '').trim();
      if (!body || body.length > 2000) throw fail(400, 'Comment must be 1–2000 characters');
      const { data, error } = await supabase.from('badge_proposal_comments')
        .insert({ proposal_id: p.id, user_id: userId, body }).select().single();
      if (error) throw error;
      res.status(201).json(data);
    } catch (err) { send(res, err); }
  });

  // ── Owner: wiring ───────────────────────────────────────────────────────────
  app.patch('/api/admin/backlog/:id/wiring', async (req, res) => {
    try {
      await requireOwner(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      if ((await loadTiers(p.id)).some(t => t.badge_id)) {
        throw fail(409, 'Some tiers are already live badges, so this wiring is frozen — see CLAUDE.md "Editing live badge criteria"');
      }
      const patch = {};
      const b = req.body || {};
      if (b.check_type !== undefined) {
        if (b.check_type === null || b.check_type === '') {
          patch.check_type = null; patch.trigger = null; patch.check_qualifier = null;
        } else {
          const trigger = TRIGGER_BY_CHECK_TYPE[b.check_type];
          if (!trigger) throw fail(400, 'Unknown check type');
          patch.check_type = b.check_type;
          patch.trigger = trigger;
        }
      }
      if (b.check_qualifier !== undefined && patch.check_type !== null) {
        const q = b.check_qualifier == null ? '' : String(b.check_qualifier).trim();
        patch.check_qualifier = q || null;
      }
      if (b.code_status !== undefined) {
        if (!CODE_STATUSES.includes(b.code_status)) throw fail(400, 'Unknown code status');
        patch.code_status = b.code_status;
      }
      if (!Object.keys(patch).length) throw fail(400, 'Nothing to change');
      const { data, error } = await supabase.from('badge_proposals').update(patch).eq('id', p.id).select().single();
      if (error) throw error;
      const sim = data.check_type
        ? await simulate({ check_type: data.check_type, check_qualifier: data.check_qualifier }, supabase)
        : null;
      res.json({ ...data, sim });
    } catch (err) { send(res, err); }
  });

  // ── Owner: publish ──────────────────────────────────────────────────────────
  // ?dryRun=1 returns what would be awarded per tier (fresh data) and writes nothing.
  app.post('/api/admin/backlog/:id/publish', async (req, res) => {
    try {
      await requireOwner(req);
      const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const tiers = await loadTiers(p.id);
      const problems = [];
      if (p.existing_family) problems.push('Extends a live family — the Backlog only publishes new families');
      if (!p.check_type) problems.push('Not wired to a check yet');
      if (p.code_status !== 'ready') problems.push('Code status is not Ready');
      const fixed = FIXED_CHECKS.has(p.check_type);
      for (const t of tiers) {
        if (t.badge_id) continue;
        const label = t.name || `Tier ${t.tier_order}`;
        if (!t.image_url) problems.push(`${label}: no art`);
        if (!t.name) problems.push(`Tier ${t.tier_order}: no name`);
        if (!t.description) problems.push(`${label}: no description`);
        if (!fixed && t.threshold == null) problems.push(`${label}: no threshold`);
      }
      const { data: openVotes } = await supabase.from('badge_proposal_changes')
        .select('id').eq('proposal_id', p.id).eq('status', 'open');
      if (openVotes?.length) problems.push(`${openVotes.length} open vote(s) still pending`);

      const plans = [];
      for (const t of tiers) {
        if (t.badge_id) continue;
        if (!p.check_type) break;
        const plan = await awardPlan({ check_type: p.check_type, check_value: t.threshold ?? 1, check_qualifier: p.check_qualifier }, supabase);
        plans.push({ tier_id: t.id, timing: plan.timing, rows: plan.rows });
      }
      const summary = plans.map(x => ({ tier_id: x.tier_id, timing: x.timing, count: new Set(x.rows.map(r => r.user_id)).size }));
      if (dryRun) return res.json({ ok: !problems.length, problems, tiers: summary });
      if (problems.length) throw Object.assign(fail(400, problems[0]), { extra: { problems } });

      // Family: always a new one, named after the proposal.
      let family = null;
      let familyNew = null;
      {
        family = slugify(p.name);
        if (!family) throw fail(400, 'Proposal name has no letters or digits to build a family id from');
        const { data: clash } = await supabase.from('badge_families').select('id').eq('id', family).maybeSingle();
        const { data: alreadyOurs } = await supabase.from('badges').select('id')
          .in('id', tiers.map(t => t.badge_id).filter(Boolean)).eq('family', family);
        if (clash && !alreadyOurs?.length) {
          throw fail(409, `A family called "${family}" already exists — rename the proposal (the Backlog never adds to a live family)`);
        }
        if (!clash) {
          const { data: last } = await supabase.from('badge_families').select('display_order')
            .order('display_order', { ascending: false }).limit(1);
          familyNew = { display_name: p.name, display_order: (last?.[0]?.display_order ?? 0) + 1, is_sequential: true };
        }
      }

      const { data: keyRows } = await supabase.from('badges').select('key');
      const usedKeys = new Set((keyRows || []).map(r => r.key));
      const published = [];
      for (const t of tiers) {
        if (t.badge_id) continue;
        let key = slugify(`${family}_${t.name || t.tier_order}`) || `${family}_${t.tier_order}`;
        for (let n = 2; usedKeys.has(key); n++) key = `${slugify(`${family}_${t.name || t.tier_order}`)}_${n}`;
        usedKeys.add(key);

        const art = await fetch(t.image_url);
        if (!art.ok) throw fail(502, `Could not read the art for ${t.name} (${art.status})`);
        const imageBuffer = Buffer.from(await art.arrayBuffer());

        const badge = await createBadge({
          key, name: t.name, description: t.description, hint: t.hint || null, is_secret: false,
          family, family_order: t.tier_order,
          family_new: familyNew,
          trigger: p.trigger, check_type: p.check_type,
          check_value: t.threshold ?? 1, check_qualifier: p.check_qualifier,
          imageBuffer,
        });
        familyNew = null;   // created with the first badge
        const { error: tErr } = await supabase.from('badge_proposal_tiers').update({ badge_id: badge.id }).eq('id', t.id);
        if (tErr) throw tErr;

        // Award everyone who already qualifies — same rows the backfill would insert.
        const plan = await awardPlan(badge, supabase);
        let awarded = 0;
        if (plan.rows.length) {
          const { data: ins, error: aErr } = await supabase.from('user_badges')
            .insert(plan.rows.map(r => ({ user_id: r.user_id, badge_id: badge.id, ...(r.month_id != null ? { month_id: r.month_id } : {}) })))
            .select('user_id');
          if (aErr) throw aErr;
          awarded = ins?.length ?? 0;
          for (const u of new Set((ins || []).map(r => r.user_id))) {
            announceBadges(u, [badge]).catch(e => console.error('publish announce:', e.message));
          }
        }
        published.push({ tier_id: t.id, badge_id: badge.id, key, timing: plan.timing, awarded });
      }

      const { error: sErr } = await supabase.from('badge_proposals')
        .update({ status: 'published', published_at: new Date().toISOString() }).eq('id', p.id);
      if (sErr) throw sErr;
      await supabase.from('badge_proposal_rankings').delete().eq('proposal_id', p.id);
      forgetData();
      res.json({ ok: true, family, published });
    } catch (err) { send(res, err); }
  });

  // ── Simulator: the distribution of a check's metric over every hunter ───────
  app.post('/api/admin/badge-sim', async (req, res) => {
    try {
      await requireMod(req);
      const { check_type, check_qualifier, fresh } = req.body || {};
      if (!TRIGGER_BY_CHECK_TYPE[check_type]) throw fail(400, 'Unknown check type');
      res.json(await simulate({ check_type, check_qualifier: check_qualifier || null }, supabase, { fresh: !!fresh }));
    } catch (err) { send(res, err); }
  });

  // ── Award clocks (the Timing tab) ───────────────────────────────────────────
  app.get('/api/admin/award-clocks', async (req, res) => {
    try {
      await requireMod(req);
      const { data, error } = await supabase.from('award_clocks')
        .select('rule, clock, updated_at, updated_by, users(display_name, username)');
      if (error) throw error;
      res.json(CLOCK_RULES.map(rule => {
        const r = (data || []).find(x => x.rule === rule);
        return {
          rule,
          clock: r?.clock ?? 'submission',
          updated_at: r?.updated_at ?? null,
          updated_by_name: r?.users?.display_name || r?.users?.username || null,
        };
      }));
    } catch (err) { send(res, err); }
  });

  app.put('/api/admin/award-clocks/:rule', async (req, res) => {
    try {
      const userId = await requireOwner(req);
      const { rule } = req.params;
      const { clock } = req.body || {};
      if (!CLOCK_RULES.includes(rule)) throw fail(404, 'Unknown rule');
      if (!['submission', 'approval'].includes(clock)) throw fail(400, 'clock must be submission or approval');
      const { error } = await supabase.from('award_clocks')
        .upsert({ rule, clock, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'rule' });
      if (error) throw error;
      forgetData();   // first-of-month results in the simulator memo depend on the clock
      res.json({ rule, clock });
    } catch (err) { send(res, err); }
  });
};
