/**
 * badgeBacklog routes — the Backlog and Timing tabs of /badge-upload.
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 *
 * Mods pitch badge families (proposals), rank them by dragging, write tier copy,
 * upload tier art and discuss in a comment thread. The site owner
 * (site_owners) sets tier count and thresholds, wires each proposal to a
 * check_type watching the simulator's real earn counts, and publishes it.
 *
 *   Consensus order   api/_lib/backlogOrder.js
 *   Earn counts       api/_lib/badgeEval.js simulate() — the same evaluator as
 *                     live awards, the cron and the backfill
 *   Publish           createBadge() (same insert as POST /api/badges), then
 *                     awardPlan() rows for everyone who already qualifies
 *
 * A published tier (badge_id set) is a live badge: its threshold never changes
 * and it can't be removed here — see CLAUDE.md "Editing live badge criteria".
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
const { loadBonusRows } = require('../_lib/collectionBonus');
const { GAME_LABELS } = require('../_lib/games');

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

const LIVE_TIER = 'This tier is a live badge. The Backlog never changes live criteria — see CLAUDE.md "Editing live badge criteria"';

// Adds empty tiers at the end, or drops the last ones (never a published tier).
async function setTierCount(proposalId, to) {
  const tiers = await loadTiers(proposalId);
  if (to > tiers.length) {
    const rows = [];
    for (let o = tiers.length + 1; o <= to; o++) rows.push({ proposal_id: proposalId, tier_order: o, name: '' });
    const { error } = await supabase.from('badge_proposal_tiers').insert(rows);
    if (error) throw error;
  } else if (to < tiers.length) {
    const drop = tiers.filter(t => t.tier_order > to);
    if (drop.some(t => t.badge_id)) throw fail(409, 'Cannot remove a published tier');
    const { error } = await supabase.from('badge_proposal_tiers').delete().in('id', drop.map(t => t.id)).is('badge_id', null);
    if (error) throw error;
    const art = drop.map(t => t.image_url).filter(u => u && u.includes(BACKLOG_ART_PREFIX));
    if (art.length) deleteR2Images(art).catch(() => {});
  }
}

// A tier flagged `bonus` (collection_complete only) publishes as '<slug>:bonus':
// % of the collection's bonus members caught in their bonus game.
function tierQualifier(p, t) {
  if (t.bonus && p.check_qualifier) return `${p.check_qualifier}:bonus`;
  return modeQualifier(p, t.mode);
}

// The list route re-simulated every proposal on every load (~1s). Backlog counts are estimates,
// so a minute-old simulation is fine; publish and the dry run use awardPlan (always fresh).
const SIM_TTL_MS = 60 * 1000;
const simMemo = new Map();
async function simulateCached(args, db) {
  const key = JSON.stringify(args);
  const hit = simMemo.get(key);
  if (hit && Date.now() - hit.at < SIM_TTL_MS) return hit.sim;
  const sim = await simulate(args, db);
  if (sim?.evaluable) simMemo.set(key, { at: Date.now(), sim });
  return sim;
}

// Mode-based checks (Standard / Restricted / All) can differ per badge. A tier's own
// mode overrides the proposal's; approved_count keeps its game filter.
const MODE_CHECKS = new Set(['approved_count', 'games_count', 'hours_left_in_month']);
function modeQualifier(p, mode) {
  if (!mode || !MODE_CHECKS.has(p.check_type)) return p.check_qualifier;
  const games = p.check_type === 'approved_count' ? String(p.check_qualifier || '').split(':')[1] : null;
  if (games) return `${mode}:${games}`;
  return mode === 'any' ? null : mode;
}

// Earn counts for each distinct tier mode that differs from the proposal's own.
async function modeSimsFor(p, tiers) {
  if (!MODE_CHECKS.has(p.check_type)) return null;
  const own = String(p.check_qualifier || 'any').split(':')[0];
  const out = {};
  for (const mode of new Set(tiers.filter(t => t.mode && !t.badge_id).map(t => t.mode))) {
    if (mode === own) continue;
    try { out[mode] = await simulateCached({ check_type: p.check_type, check_qualifier: modeQualifier(p, mode) }, supabase); }
    catch (e) { out[mode] = { evaluable: false, reason: 'error', message: e.message }; }
  }
  return Object.keys(out).length ? out : null;
}

// Earn counts for a proposal's bonus tiers (null when it has none).
async function bonusSimFor(p, tiers) {
  if (p.check_type !== 'collection_complete' || !p.check_qualifier) return null;
  if (!tiers.some(t => t.bonus && !t.badge_id)) return null;
  try { return await simulateCached({ check_type: p.check_type, check_qualifier: `${p.check_qualifier}:bonus` }, supabase); }
  catch (e) { return { evaluable: false, reason: 'error', message: e.message }; }
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
      const { data: hunterRows } = await supabase.from('users').select('id, display_name, username, avatar_url');
      const hunters = (hunterRows || []).map(u => ({ id: u.id, name: u.display_name || u.username || 'Hunter', avatar_url: u.avatar_url }));
      const ids = (proposals || []).map(p => p.id);

      const [tiersR, rankR, commentsR, familiesR] = await Promise.all([
        ids.length ? supabase.from('badge_proposal_tiers').select('*').in('proposal_id', ids).order('tier_order') : { data: [] },
        supabase.from('badge_proposal_rankings').select('mod_id, proposal_id, position').order('position'),
        ids.length ? supabase.from('badge_proposal_comments').select('proposal_id').in('proposal_id', ids) : { data: [] },
        supabase.from('badge_families').select('id, display_name, display_order').order('display_order'),
      ]);
      for (const r of [tiersR, rankR, commentsR, familiesR]) if (r.error) throw r.error;

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
        try { sims[p.id] = await simulateCached({ check_type: p.check_type, check_qualifier: p.check_qualifier }, supabase); }
        catch (e) { sims[p.id] = { evaluable: false, reason: 'error', message: e.message }; }
      }));
      const modeSims = {};
      await Promise.all(open.map(async (p) => {
        modeSims[p.id] = await modeSimsFor(p, (tiersR.data || []).filter(t => t.proposal_id === p.id));
      }));
      const bonusSims = {};
      await Promise.all(open.map(async (p) => {
        bonusSims[p.id] = await bonusSimFor(p, (tiersR.data || []).filter(t => t.proposal_id === p.id));
      }));

      const commentCount = {};
      for (const c of commentsR.data || []) commentCount[c.proposal_id] = (commentCount[c.proposal_id] || 0) + 1;

      const orderById = new Map(consensus.order.map(r => [r.id, r]));
      const out = (proposals || []).map(p => ({
        ...p,
        tiers: (tiersR.data || []).filter(t => t.proposal_id === p.id),
        consensus: orderById.get(p.id) ? {
          rank: orderById.get(p.id).rank, score: orderById.get(p.id).score, placed_by: orderById.get(p.id).placedBy,
        } : null,
        sim: sims[p.id] ?? null,
        bonus_sim: bonusSims[p.id] ?? null,
        mode_sims: modeSims[p.id] ?? null,
        comment_count: commentCount[p.id] || 0,
      }));

      res.json({
        proposals: out,
        mods: mods.map(m => ({ ...m, ...weights[m.id] })),
        hunters,
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
      // Proposals only ever become NEW families (owner decision 2026-10-13).
      const { name, theme_notes, tiers } = req.body || {};
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
      }
      res.json({ ok: true });
    } catch (err) { send(res, err); }
  });

  // Owner: delete an unpublished proposal outright (tiers, rankings, comments cascade).
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

  // Tier copy: name, description, hint (any mod). Threshold: owner only, and
  // never on a published tier.
  app.patch('/api/admin/backlog/:id/tiers/:tid', async (req, res) => {
    try {
      const userId = await requireMod(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const patch = {};
      for (const [k, max] of [['name', 80], ['description', 300], ['hint', 300]]) {
        if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).slice(0, max);
      }
      if (req.body?.threshold !== undefined) {
        if (!(await isOwner(userId))) throw fail(403, 'Only the owner sets thresholds');
        patch.threshold = parseThreshold(req.body.threshold);
      }
      if (!Object.keys(patch).length) throw fail(400, 'Nothing to change');
      let q = supabase.from('badge_proposal_tiers').update(patch).eq('id', req.params.tid).eq('proposal_id', p.id);
      if ('threshold' in patch) q = q.is('badge_id', null);
      const { data, error } = await q.select().maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: t } = await supabase.from('badge_proposal_tiers')
          .select('badge_id').eq('id', req.params.tid).eq('proposal_id', p.id).maybeSingle();
        throw t?.badge_id ? fail(409, LIVE_TIER) : fail(404, 'Tier not found');
      }
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

  // ── Tier count (owner) ──────────────────────────────────────────────────────
  app.put('/api/admin/backlog/:id/tier-count', async (req, res) => {
    try {
      await requireOwner(req);
      const p = await loadProposal(req.params.id);
      requireOpen(p);
      const to = Number(req.body?.to);
      if (!Number.isInteger(to) || to < 1 || to > MAX_TIERS) throw fail(400, `Tier count must be 1–${MAX_TIERS}`);
      await setTierCount(p.id, to);
      res.json({ tiers: await loadTiers(p.id) });
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
      const tiers = await loadTiers(p.id);
      if (tiers.some(t => t.badge_id)) {
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
        if (q.endsWith(':bonus')) throw fail(400, 'Bonus is set per tier, not in the qualifier');
        const ct = patch.check_type !== undefined ? patch.check_type : p.check_type;
        // approved_count: "<any|standard|restricted>[:<game key>,<game key>,...]"
        if (ct === 'approved_count' && q) {
          const [mode, list, extra] = q.split(':');
          const games = list === undefined ? [] : list.split(',');
          if (!['any', 'standard', 'restricted'].includes(mode) || extra !== undefined
              || (list !== undefined && (!games.length || games.some(g => !GAME_LABELS[g]) || new Set(games).size !== games.length))) {
            throw fail(400, 'Approvals filter must be any|standard|restricted, optionally :<game key>,<game key>,...');
          }
        }
        // games_count, hours_left_in_month: mode only
        if ((ct === 'games_count' || ct === 'hours_left_in_month') && q && !['any', 'standard', 'restricted'].includes(q)) {
          throw fail(400, 'Filter must be any|standard|restricted');
        }
        patch.check_qualifier = q || null;
      }
      if (b.code_status !== undefined) {
        if (!CODE_STATUSES.includes(b.code_status)) throw fail(400, 'Unknown code status');
        patch.code_status = b.code_status;
      }
      // Per-tier flags: { [tierId]: boolean }. Bonus only makes sense on a collection.
      const tierPatches = new Map();
      const tierIds = new Set(tiers.map(t => t.id));
      for (const [field, key] of [['bonus', 'tier_bonus'], ['is_secret', 'tier_secret'], ['mode', 'tier_mode']]) {
        if (b[key] == null) continue;
        if (typeof b[key] !== 'object') throw fail(400, `${key} must be an object`);
        for (const [tid, v] of Object.entries(b[key])) {
          if (!tierIds.has(tid)) throw fail(404, 'Tier not found');
          if (field === 'mode') {
            if (v !== null && !['any', 'standard', 'restricted'].includes(v)) throw fail(400, 'Mode must be any|standard|restricted');
            tierPatches.set(tid, { ...tierPatches.get(tid), mode: v });
          } else tierPatches.set(tid, { ...tierPatches.get(tid), [field]: !!v });
        }
      }
      const nextType = patch.check_type !== undefined ? patch.check_type : p.check_type;
      const nextQual = patch.check_qualifier !== undefined ? patch.check_qualifier : p.check_qualifier;
      if ([...tierPatches.values()].some(t => t.bonus) && (nextType !== 'collection_complete' || !nextQual)) {
        throw fail(400, 'Only a collection check can have a bonus tier');
      }
      // A new check or collection makes old bonus picks meaningless — clear them.
      if (nextType !== p.check_type || nextQual !== p.check_qualifier) {
        for (const t of tiers) if (t.bonus) tierPatches.set(t.id, { ...tierPatches.get(t.id), bonus: false });
      }
      if (!MODE_CHECKS.has(nextType)) {
        for (const t of tiers) if (t.mode) tierPatches.set(t.id, { ...tierPatches.get(t.id), mode: null });
      }
      if ([...tierPatches.values()].some(t => t.mode) && !MODE_CHECKS.has(nextType)) {
        throw fail(400, 'Only Approvals, Games and Hours-left checks have a per-badge mode');
      }
      if (!Object.keys(patch).length && !tierPatches.size) throw fail(400, 'Nothing to change');

      let data = p;
      if (Object.keys(patch).length) {
        const r = await supabase.from('badge_proposals').update(patch).eq('id', p.id).select().single();
        if (r.error) throw r.error;
        data = r.data;
      }
      for (const [tid, tp] of tierPatches) {
        const { error } = await supabase.from('badge_proposal_tiers').update(tp).eq('id', tid).eq('proposal_id', p.id);
        if (error) throw error;
      }
      const nextTiers = tierPatches.size ? await loadTiers(p.id) : tiers;
      const sim = data.check_type
        ? await simulateCached({ check_type: data.check_type, check_qualifier: data.check_qualifier }, supabase)
        : null;
      res.json({ ...data, tiers: nextTiers, sim, bonus_sim: await bonusSimFor(data, nextTiers), mode_sims: await modeSimsFor(data, nextTiers) });
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
        if (t.bonus && p.check_type !== 'collection_complete') problems.push(`${label}: bonus tier on a non-collection check`);
      }
      if (p.check_type === 'collection_complete' && p.check_qualifier && tiers.some(t => t.bonus && !t.badge_id)) {
        const count = (await loadBonusRows(supabase, { slug: p.check_qualifier })).length;
        if (!count) problems.push(`'${p.check_qualifier}' has no bonus games set — add them in the Collections tab`);
      }

      const plans = [];
      for (const t of tiers) {
        if (t.badge_id) continue;
        if (!p.check_type) break;
        const plan = await awardPlan({ check_type: p.check_type, check_value: t.threshold ?? 1, check_qualifier: tierQualifier(p, t) }, supabase);
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
          key, name: t.name, description: t.description, hint: t.hint || null, is_secret: !!t.is_secret,
          family, family_order: t.tier_order,
          family_new: familyNew,
          trigger: p.trigger, check_type: p.check_type,
          check_value: t.threshold ?? 1, check_qualifier: tierQualifier(p, t),
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
