/**
 * Badge evaluator — the ONE place that decides who qualifies for a badge.
 *
 * Every award path calls into this module, so "would earn" and "did earn" can
 * never disagree:
 *
 *   live events      awardBadgesForTrigger (core.js) → contextBuilders[trigger]
 *                    = loadData(…, { userIds: [id] }) — the same loader, scoped
 *   first of month   settleFirstOfMonth (core.js) → firstOfMonthWinner
 *   first of species contextBuilders.approved (site-wide); on reject,
 *                    settleFirstOfSpecies (core.js) → firstOfSpeciesHolders
 *   period end cron  processMonth/Season/YearEnd (core.js) → periodQualifiers
 *   date award cron  _routes/internal.js → dateAwardUsers
 *   backfill         scripts/awardAllBadges.js → awardPlan
 *   Backlog counts   _routes/badgeBacklog.js → simulate / countAt / awardPlan
 *
 * Context MATHS lives in api/_badgeRegistry.js (computeApprovedContext,
 * computeBingoContext, computeAccountAgeMonths, buildCheckFromDB); this file only
 * LOADS data — in bulk for everyone, or scoped to some users — and applies it.
 * A scoped load runs the same function over a filtered query, so a user's
 * context is identical whichever way it was built. `node
 * api/scripts/verifyBadgeSim.js` proves that on the real database; run it after
 * touching anything here or in the compute functions.
 *
 * The clock (submission vs approval) for "first" rules comes from the
 * award_clocks table (migration 20261013210000_submission_clock.sql).
 */
const {
  buildCheckFromDB,
  computeApprovedContext,
  collectionProgressFor,
  computeFirstOfSpecies,
  firstOfSpeciesMode,
  computeAccountAgeMonths,
  computeBingoContext,
} = require('../_badgeRegistry');
const { resolveGame } = require('./games');
const { bonusRowsFrom } = require('./collectionBonus');

// Same value as MONTH_ROLLOVER_OFFSET_MS in core.js (core requires this module,
// so it can't be imported from there). A month starts at start_date + 4h.
const MONTH_START_OFFSET_MS = 4 * 60 * 60 * 1000;

// Server-side mirror of client/src/constants/badgeCheckTypes.js CHECK_TYPES_BY_TRIGGER.
const TRIGGER_BY_CHECK_TYPE = {
  submission_count: 'submission',
  approved_count: 'approved',
  restricted_count: 'approved',
  type_percentage: 'approved',
  generation_percentage: 'approved',
  collection_complete: 'approved',
  first_approval_month: 'approved',
  first_of_species_count: 'approved',
  rejected_count: 'rejected',
  monthly_active_count: 'monthly_active',
  approved_count_in_month: 'period_end',
  approved_count_in_season: 'period_end',
  approved_count_in_year: 'period_end',
  top_placement_month: 'period_end',
  top_placement_season: 'period_end',
  top_placement_year: 'period_end',
  bingo_achievement_count: 'bingo_achievement',
  date_award: 'date_award',
  account_age_months: 'account_age',
};

const PAGE_SIZE = 1000;
async function selectAll(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

const groupBy = (rows, key) => {
  const out = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(r);
  }
  return out;
};

// ── Clocks ─────────────────────────────────────────────────────────────────────
const CLOCK_RULES = ['first_of_month', 'bingo_first', 'first_of_species'];
async function loadClocks(supabase) {
  const { data, error } = await supabase.from('award_clocks').select('rule, clock');
  if (error) throw error;
  const out = { first_of_month: 'submission', bingo_first: 'submission', first_of_species: 'submission' };
  for (const r of data || []) out[r.rule] = r.clock;
  return out;
}

// ── First catch of the month ──────────────────────────────────────────────────
/**
 * Who won month M's first catch, and is it settled?
 *
 * Submission clock: a catch's time is submitted_at (upload time), falling back
 * to created_at for entries approved before upload times were recorded. Catches
 * submitted before the month began (filed into it by mistake) don't count. The
 * result is settled only when no catch submitted earlier is still pending.
 * Approval clock: the earliest approved entry, settled immediately (old rule).
 *
 * → { status: 'none' } | { status: 'pending', candidate } | { status: 'settled', user_id }
 */
function firstOfMonthWinner({ month, entries, pending = [], clock = 'submission' }) {
  const startMs = Date.parse(`${month.start_date}T00:00:00Z`) + MONTH_START_OFFSET_MS;
  const timeOf = (e) => Date.parse(clock === 'approval' ? e.created_at : (e.submitted_at ?? e.created_at));
  let best = null;
  for (const e of entries) {
    if (e.historical || e.month_id !== month.id) continue;
    const t = timeOf(e);
    if (clock === 'submission' && t < startMs) continue;
    if (!best || t < best.t || (t === best.t && String(e.id) < String(best.e.id))) best = { e, t };
  }
  if (!best) return { status: 'none' };
  if (clock === 'submission') {
    const blocked = pending.some(a => a.month_id === month.id && !a.historical
      && Date.parse(a.created_at) < best.t && Date.parse(a.created_at) >= startMs);
    if (blocked) return { status: 'pending', candidate: best.e.user_id };
  }
  return { status: 'settled', user_id: best.e.user_id };
}

// Loads what firstOfMonthWinner needs for the given months (all when omitted).
async function loadFirstOfMonthData(supabase, monthIds) {
  const scope = (q) => (monthIds ? q.in('month_id', monthIds) : q);
  const [entries, pending, monthsRes, clocks] = await Promise.all([
    selectAll(() => scope(supabase.from('entries')
      .select('id, user_id, month_id, historical, created_at, submitted_at')
      .eq('historical', false)).order('id')),
    selectAll(() => scope(supabase.from('approvals')
      .select('id, month_id, historical, created_at')).order('id')),
    (monthIds ? supabase.from('bingo_months').select('id, start_date').in('id', monthIds)
      : supabase.from('bingo_months').select('id, start_date')),
    loadClocks(supabase),
  ]);
  if (monthsRes.error) throw monthsRes.error;
  return { entries, pending, months: monthsRes.data || [], clock: clocks.first_of_month };
}

function firstOfMonthResults({ entries, pending, months, clock }) {
  const byMonth = groupBy(entries, 'month_id');
  return months
    .map(m => ({ month_id: m.id, ...firstOfMonthWinner({ month: m, entries: byMonth.get(m.id) || [], pending, clock }) }))
    .sort((a, b) => a.month_id - b.month_id);
}

// ── First of species in a month ────────────────────────────────────────────────
// Always site-wide: whether a hunter holds a mon's first catch depends on
// everyone else's entries and pending uploads, so even a scoped (one-user) load
// reads all of them. The maths is computeFirstOfSpecies in _badgeRegistry.js.
// `only` = { monthId, pokemonId } narrows the read to one pair (reject path).
async function loadFirstOfSpecies(supabase, only) {
  const scope = (q) => (only ? q.eq('month_id', only.monthId).eq('pokemon_id', only.pokemonId) : q);
  const [entries, pending, monthsRes, clocks] = await Promise.all([
    selectAll(() => scope(supabase.from('entries')
      .select('id, user_id, month_id, pokemon_id, restricted_submission, historical, created_at, submitted_at')
      .eq('historical', false)).order('id')),
    selectAll(() => scope(supabase.from('approvals')
      .select('id, user_id, month_id, pokemon_id, historical, created_at')).order('id')),
    (only ? supabase.from('bingo_months').select('id, start_date').eq('id', only.monthId)
      : supabase.from('bingo_months').select('id, start_date')),
    loadClocks(supabase),
  ]);
  if (monthsRes.error) throw monthsRes.error;
  return computeFirstOfSpecies(entries, pending, monthsRes.data || [], clocks.first_of_species);
}

// Users holding the settled first catch of (month, pokemon) in any mode.
async function firstOfSpeciesHolders(supabase, monthId, pokemonId) {
  const { holders } = await loadFirstOfSpecies(supabase, { monthId, pokemonId });
  const key = `${monthId}:${pokemonId}`;
  return [...new Set(Object.values(holders).map(m => m.get(key)).filter(Boolean))];
}

// ── Date award ─────────────────────────────────────────────────────────────────
// The cron awards date D at 04:00Z on D+1 to every user that exists then.
function dateAwardRunsAt(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(day ?? '')) ? Date.parse(`${day}T04:00:00Z`) + 864e5 : null;
}
function dateAwardUsers(users, day) {
  const runsAt = dateAwardRunsAt(day);
  if (runsAt == null) return [];
  return users.filter(u => Date.parse(u.created_at) < runsAt).map(u => u.id);
}

// ── Loaders: one per trigger, each returning { ctx: Map<userId, context>, fallback } ─
// `scope.userIds` filters every per-user query; nothing else changes, so a
// scoped context is the bulk context for that user.
const LOADERS = {
  async submission(supabase, users, scope) {
    const rows = await selectAll(() => scope.q(supabase.from('notifications').select('id, user_id').eq('status', 'pending')).order('id'));
    const ctx = new Map();
    for (const [uid, list] of groupBy(rows, 'user_id')) ctx.set(uid, { totalSubmissions: list.length });
    return { ctx, fallback: { totalSubmissions: 0 } };
  },

  async rejected(supabase, users, scope) {
    const rows = await selectAll(() => scope.q(supabase.from('notifications').select('id, user_id').eq('status', 'rejected')).order('id'));
    const ctx = new Map();
    for (const [uid, list] of groupBy(rows, 'user_id')) ctx.set(uid, { totalRejected: list.length });
    return { ctx, fallback: { totalRejected: 0 } };
  },

  async monthly_active(supabase, users, scope) {
    const rows = await selectAll(() => scope.q(supabase.from('user_monthly_points').select('id, user_id')).order('id'));
    const ctx = new Map();
    for (const [uid, list] of groupBy(rows, 'user_id')) ctx.set(uid, { activeMonths: list.length });
    return { ctx, fallback: { activeMonths: 0 } };
  },

  async account_age(supabase, users) {
    const ctx = new Map();
    for (const u of users) ctx.set(u.id, { accountAgeMonths: computeAccountAgeMonths(u.created_at) });
    return { ctx, fallback: { accountAgeMonths: 0 } };
  },

  // Distinct (month, base type) — see computeBingoContext in _badgeRegistry.js.
  async bingo_achievement(supabase, users, scope) {
    const rows = await selectAll(() => scope.q(supabase.from('bingo_achievements').select('id, user_id, month_id, bingo_type')).order('id'));
    const ctx = new Map();
    for (const [uid, list] of groupBy(rows, 'user_id')) ctx.set(uid, computeBingoContext(list));
    return { ctx, fallback: computeBingoContext([]) };
  },

  async approved(supabase, users, scope) {
    const [entries, master] = await Promise.all([
      selectAll(() => scope.q(supabase.from('entries')
        .select('id, user_id, pokemon_id, restricted_submission, game')).order('id')),
      selectAll(() => supabase.from('pokemon_master')
        .select('id, type1, type2, generation, collection_ids, collection_bonus, shiny_available').order('id')),
    ]);
    const bonusRows = bonusRowsFrom(master);

    // Entries reference every pokemon_master row; totals use shiny_available only.
    const meta = new Map(master.map(p => [p.id, {
      type1: p.type1, type2: p.type2, generation: p.generation, collection_ids: p.collection_ids,
    }]));
    const allPokemon = master.filter(p => p.shiny_available).map(p => meta.get(p.id));

    const ctx = new Map();
    for (const [uid, list] of groupBy(entries, 'user_id')) {
      const userEntries = list.map(e => ({
        pokemon_id: e.pokemon_id,
        restricted_submission: e.restricted_submission,
        game_key: resolveGame(e.game).key,   // entries.game is the label
        pokemon_master: meta.get(e.pokemon_id) ?? null,
      }));
      ctx.set(uid, computeApprovedContext(userEntries, allPokemon, bonusRows));
    }
    const out = { ctx, fallback: { ...computeApprovedContext([], allPokemon, bonusRows), firstOfSpecies: { any: 0, standard: 0, restricted: 0 } } };

    // Site-wide on every load, scoped or not (see loadFirstOfSpecies).
    const { counts: firsts } = await loadFirstOfSpecies(supabase);
    for (const [uid, c] of ctx) {
      c.firstOfSpecies = { any: firsts.any.get(uid) ?? 0, standard: firsts.standard.get(uid) ?? 0, restricted: firsts.restricted.get(uid) ?? 0 };
    }

    // first_approval_month is decided per MONTH, not per user, so it only rides
    // along on unscoped loads (simulator / backfill). Live awards go through
    // settleFirstOfMonth instead.
    if (!scope.userIds) {
      const results = firstOfMonthResults(await loadFirstOfMonthData(supabase));
      out.firstOfMonth = results;
      const wins = new Map();
      for (const r of results) if (r.status === 'settled') wins.set(r.user_id, (wins.get(r.user_id) ?? 0) + 1);
      for (const [uid, c] of ctx) c.monthsWonFirstApproval = wins.get(uid) ?? 0;
      for (const [uid, n] of wins) if (!ctx.has(uid)) ctx.set(uid, { ...out.fallback, monthsWonFirstApproval: n });
      out.fallback = { ...out.fallback, monthsWonFirstApproval: 0 };
    }
    return out;
  },

  // Mirrors the SQL the cron used (users_with_min_entries_in_*, which counts
  // every entry incl. historical; rank_users_by_*_points, ROW_NUMBER over points
  // DESC, last_updated ASC with season/year using SUM and MIN). One deliberate
  // difference: exact ties fall to user_id, where SQL's order was arbitrary.
  async period_end(supabase) {
    const [entries, points, { data: months, error: mErr }] = await Promise.all([
      selectAll(() => supabase.from('entries').select('id, user_id, month_id').order('id')),
      selectAll(() => supabase.from('user_monthly_points').select('id, user_id, month_id, points, last_updated').order('id')),
      supabase.from('bingo_months').select('id, season_id, year_id, end_date'),
    ]);
    if (mErr) throw mErr;
    const monthById = new Map(months.map(m => [m.id, m]));
    const now = Date.now();
    // A season/year is closed once every month in it has ended.
    const closed = { month: new Set(), season: new Set(), year: new Set() };
    const open = { season: new Set(), year: new Set() };
    for (const m of months) {
      const ended = new Date(m.end_date).getTime() < now;
      if (ended) closed.month.add(m.id);
      for (const p of ['season', 'year']) {
        const id = m[`${p}_id`];
        if (id != null && !ended) open[p].add(id);
      }
    }
    for (const m of months) for (const p of ['season', 'year']) {
      const id = m[`${p}_id`];
      if (id != null && !open[p].has(id)) closed[p].add(id);
    }

    const counts = { month: new Map(), season: new Map(), year: new Map() };
    const bump = (map, pid, uid) => {
      if (pid == null) return;
      if (!map.has(pid)) map.set(pid, new Map());
      const m = map.get(pid);
      m.set(uid, (m.get(uid) ?? 0) + 1);
    };
    for (const e of entries) {
      const m = monthById.get(e.month_id);
      bump(counts.month, e.month_id, e.user_id);
      if (m) { bump(counts.season, m.season_id, e.user_id); bump(counts.year, m.year_id, e.user_id); }
    }

    const agg = { month: new Map(), season: new Map(), year: new Map() };
    for (const r of points) {
      const m = monthById.get(r.month_id);
      const pids = { month: r.month_id, season: m?.season_id, year: m?.year_id };
      for (const p of ['month', 'season', 'year']) {
        const pid = pids[p];
        if (pid == null) continue;
        if (!agg[p].has(pid)) agg[p].set(pid, new Map());
        const users = agg[p].get(pid);
        const cur = users.get(r.user_id) ?? { points: 0, last: null };
        cur.points += r.points ?? 0;
        if (r.last_updated != null && (cur.last == null || Date.parse(r.last_updated) < cur.last)) cur.last = Date.parse(r.last_updated);
        users.set(r.user_id, cur);
      }
    }
    const ranks = { month: new Map(), season: new Map(), year: new Map() };
    for (const p of ['month', 'season', 'year']) {
      for (const [pid, users] of agg[p]) {
        const ordered = [...users.entries()].sort((a, b) =>
          (b[1].points - a[1].points)
          || ((a[1].last ?? Infinity) - (b[1].last ?? Infinity))   // NULLS LAST, like SQL ASC
          || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        ranks[p].set(pid, new Map(ordered.map(([uid], i) => [uid, i + 1])));
      }
    }
    return { ctx: null, period: { counts, ranks, closed, scores: agg } };
  },

  async date_award() {
    return { ctx: null, fallback: {} };
  },
};

// ── Data loading (bulk memo is module-local; never exported) ───────────────────
const DATA_TTL_MS = 10 * 60 * 1000;
const dataMemo = new Map(); // trigger -> { at, promise }

/**
 * loadData(supabase, trigger, { userIds?, fresh? })
 *   userIds → scoped to those users, never memoised (award paths).
 *   fresh   → bypass the bulk memo (publish / backfill / cron).
 */
async function loadData(supabase, trigger, { userIds, fresh = false } = {}) {
  if (!LOADERS[trigger]) throw new Error(`Unknown trigger ${trigger}`);
  const run = async () => {
    const users = userIds
      ? (userIds.length ? await selectAll(() => supabase.from('users').select('id, created_at').in('id', userIds).order('id')) : [])
      : await selectAll(() => supabase.from('users').select('id, created_at').order('id'));
    const scope = userIds ? { userIds, q: (qb) => qb.in('user_id', userIds) } : { q: (qb) => qb };
    const loaded = await LOADERS[trigger](supabase, users, scope);
    return { users, ...loaded };
  };
  if (userIds) return run();
  const hit = dataMemo.get(trigger);
  if (!fresh && hit && Date.now() - hit.at < DATA_TTL_MS) return hit.promise;
  const promise = run();
  dataMemo.set(trigger, { at: Date.now(), promise });
  promise.catch(() => dataMemo.delete(trigger));
  return promise;
}

// Per-user context for the live award path. Signature kept from the old
// _badgeRegistry builders so callers (badges.js progress, scripts) are unchanged.
const contextBuilders = Object.fromEntries(
  ['submission', 'approved', 'monthly_active', 'rejected', 'account_age', 'bingo_achievement'].map(trigger => [
    trigger,
    async (userId, supabase) => {
      const data = await loadData(supabase, trigger, { userIds: [userId] });
      return data.ctx.get(userId) ?? data.fallback;
    },
  ])
);

// ── Period qualifiers (cron + simulator) ────────────────────────────────────────
const PERIODS = ['month', 'season', 'year'];
function periodOf(check_type) {
  const kind = check_type.startsWith('top_placement_') ? 'rank' : 'count';
  const period = check_type.replace('top_placement_', '').replace('approved_count_in_', '');
  return PERIODS.includes(period) ? { kind, period } : null;
}

// Users who qualify for a period_end badge in ONE period at a threshold.
function periodQualifiers(periodData, check_type, periodId, check_value) {
  const p = periodOf(check_type);
  if (!p) return [];
  const source = (p.kind === 'rank' ? periodData.ranks : periodData.counts)[p.period].get(Number(periodId));
  if (!source) return [];
  const t = Number(check_value);
  const out = [];
  for (const [uid, v] of source) if (p.kind === 'rank' ? v <= t : v >= t) out.push(uid);
  return out;
}

function periodMetric(data, check_type, qualifier) {
  const p = periodOf(check_type);
  if (!p) return null;
  const { counts, ranks, closed } = data.period;
  const source = p.kind === 'rank' ? ranks[p.period] : counts[p.period];
  const q = qualifier === '' || qualifier == null ? null : Number(qualifier);
  const periodIds = q != null ? [q] : [...closed[p.period]];
  const best = new Map();
  for (const pid of periodIds) {
    const users = source.get(pid);
    if (!users) continue;
    for (const [uid, v] of users) {
      const cur = best.get(uid);
      if (cur == null || (p.kind === 'rank' ? v < cur : v > cur)) best.set(uid, v);
    }
  }
  // A named period that hasn't ended yet reports the standings so far.
  const scope = q == null ? 'closed' : closed[p.period].has(q) ? 'one' : 'in_progress';
  return { values: best, direction: p.kind === 'rank' ? 'lte' : 'gte', scope, periods: periodIds.length };
}

// ── Metric per check_type (simulator distribution) ──────────────────────────────
// direction: 'gte' — earned when metric >= threshold
//            'lte' — earned when metric <= threshold (Top-X placements: best rank)
//            'fixed' — threshold ignored; earned when metric >= fixedAt
function metricFor(check_type, qualifier) {
  switch (check_type) {
    case 'submission_count':     return { direction: 'gte', read: c => c.totalSubmissions };
    case 'approved_count':       return { direction: 'gte', read: c => c.totalApproved };
    case 'restricted_count':     return { direction: 'gte', read: c => c.restrictedApproved };
    case 'rejected_count':       return { direction: 'gte', read: c => c.totalRejected };
    case 'monthly_active_count': return { direction: 'gte', read: c => c.activeMonths };
    case 'account_age_months':   return { direction: 'gte', read: c => c.accountAgeMonths };
    case 'type_percentage': {
      const t = String(qualifier ?? '').toLowerCase();
      return { direction: 'gte', read: c => {
        const total = c.typeTotal?.[t] ?? 0;
        return total > 0 ? ((c.typeApproved?.[t] ?? 0) / total) * 100 : null;
      } };
    }
    case 'generation_percentage': {
      const g = Number(qualifier);
      return { direction: 'gte', read: c => {
        const total = c.genTotal?.[g] ?? 0;
        return total > 0 ? ((c.genApproved?.[g] ?? 0) / total) * 100 : null;
      } };
    }
    case 'collection_complete': {
      return { direction: 'gte', read: c => {
        const prog = collectionProgressFor(c, qualifier);
        return prog && prog.total > 0 ? (prog.caught / prog.total) * 100 : null;
      } };
    }
    case 'bingo_achievement_count': {
      const types = (!qualifier || qualifier === 'any')
        ? ['row', 'column', 'x', 'blackout']
        : String(qualifier).split(',').map(t => t.trim()).filter(Boolean);
      return { direction: 'gte', read: c => types.reduce((s, t) => s + (c.bingoTypeCounts?.[t] ?? 0), 0) };
    }
    case 'first_approval_month': return { direction: 'fixed', fixedAt: 1, read: c => c.monthsWonFirstApproval ?? 0 };
    case 'first_of_species_count': {
      const mode = firstOfSpeciesMode(qualifier);
      return { direction: 'gte', read: c => c.firstOfSpecies?.[mode] ?? 0 };
    }
    default: return null;
  }
}

/**
 * simulate({ check_type, check_qualifier }, supabase) →
 *   { evaluable: false, reason }
 * | { evaluable: true, trigger, direction, fixed_at?, total_users, values: number[] (sorted asc), timing, note? }
 */
async function simulate({ check_type, check_qualifier }, supabase, opts = {}) {
  const trigger = TRIGGER_BY_CHECK_TYPE[check_type];
  if (!trigger) return { evaluable: false, reason: 'unknown_check_type' };
  const data = await loadData(supabase, trigger, opts);
  const total_users = data.users.length;

  if (check_type === 'date_award') {
    const runsAt = dateAwardRunsAt(check_qualifier);
    if (runsAt == null) return { evaluable: false, reason: 'unknown_qualifier' };
    const past = runsAt <= Date.now();
    const who = new Set(dateAwardUsers(data.users, check_qualifier));
    return { evaluable: true, trigger, direction: 'fixed', fixed_at: 1, total_users,
      values: data.users.map(u => (!past || who.has(u.id) ? 1 : 0)),
      note: past ? 'users_on_date' : 'every_current_user',
      timing: past ? 'now' : 'on_date' };
  }

  if (trigger === 'period_end') {
    const pm = periodMetric(data, check_type, check_qualifier);
    if (!pm) return { evaluable: false, reason: 'unknown_period' };
    // The cron only ever awards the period that just closed, so a blank
    // qualifier ("every period") or an unfinished period awards nobody on
    // publish. Only a named, already-closed period is awarded at publish time.
    return { evaluable: true, trigger, direction: pm.direction, total_users,
      values: [...pm.values.values()].sort((a, b) => a - b),
      note: pm.scope === 'closed' ? `best_of_${pm.periods}_closed_periods` : pm.scope,
      timing: pm.scope === 'one' ? 'now' : 'period_end' };
  }

  const metric = metricFor(check_type, check_qualifier);
  if (!metric) return { evaluable: false, reason: 'unknown_check_type' };
  if (['type_percentage', 'generation_percentage', 'collection_complete'].includes(check_type)
      && metric.read(data.fallback) == null) {
    return { evaluable: false, reason: 'unknown_qualifier' };
  }
  const values = [];
  for (const u of data.users) {
    const v = metric.read(data.ctx.get(u.id) ?? data.fallback);
    if (v != null) values.push(v);
  }
  values.sort((a, b) => a - b);
  return { evaluable: true, trigger, direction: metric.direction,
    ...(metric.fixedAt != null ? { fixed_at: metric.fixedAt } : {}), total_users, values, timing: 'now' };
}

// Count of hunters a simulation awards at a threshold. The client has a copy
// (client/src/components/badgeBacklog/sim.js) — keep the two identical.
function countAt(sim, threshold) {
  if (!sim?.evaluable) return null;
  if (sim.direction === 'fixed') return sim.values.filter(v => v >= sim.fixed_at).length;
  const t = Number(threshold);
  if (!Number.isFinite(t)) return null;
  return sim.direction === 'lte'
    ? sim.values.filter(v => v <= t).length
    : sim.values.filter(v => v >= t).length;
}

/**
 * awardPlan(badgeRow, supabase) → { timing, rows: [{ user_id, month_id? }] }
 *
 * Every user_badges row this badge should have RIGHT NOW, from fresh data:
 *   event triggers        → users passing buildCheckFromDB
 *   first_approval_month  → each month's settled winner (firstOfMonthWinner)
 *   period_end, named closed period → that period's qualifiers
 *   period_end, blank / unfinished  → nobody now; the cron awards at period end
 *   date_award, past date → dateAwardUsers
 *   date_award, future    → nobody now; the cron awards on the date
 * Publishing inserts these rows and the backfill diffs against them.
 */
async function awardPlan(badge, supabase) {
  const { check_type, check_value, check_qualifier } = badge;
  const trigger = TRIGGER_BY_CHECK_TYPE[check_type];
  if (!trigger) throw new Error(`Unknown check_type ${check_type}`);
  const data = await loadData(supabase, trigger, { fresh: true });

  if (check_type === 'first_approval_month') {
    return { timing: 'now', rows: data.firstOfMonth.filter(r => r.status === 'settled').map(r => ({ user_id: r.user_id, month_id: r.month_id })) };
  }
  if (trigger === 'date_award') {
    const runsAt = dateAwardRunsAt(check_qualifier);
    if (runsAt == null) return { timing: 'never', rows: [] };
    if (runsAt > Date.now()) return { timing: 'on_date', rows: [] };
    return { timing: 'now', rows: dateAwardUsers(data.users, check_qualifier).map(user_id => ({ user_id })) };
  }
  if (trigger === 'period_end') {
    const pm = periodMetric(data, check_type, check_qualifier);
    if (!pm) return { timing: 'never', rows: [] };
    if (pm.scope !== 'one') return { timing: 'period_end', rows: [] };
    return { timing: 'now', rows: periodQualifiers(data.period, check_type, check_qualifier, check_value).map(user_id => ({ user_id })) };
  }
  const check = buildCheckFromDB(badge);
  return { timing: 'now', rows: data.users.filter(u => check(data.ctx.get(u.id) ?? data.fallback)).map(u => ({ user_id: u.id })) };
}

/** Drop the bulk memo — after a publish or a clock change, the next read is fresh. */
function forgetData() { dataMemo.clear(); }

module.exports = {
  TRIGGER_BY_CHECK_TYPE,
  CLOCK_RULES,
  MONTH_START_OFFSET_MS,
  loadClocks,
  loadData,
  contextBuilders,
  firstOfMonthWinner,
  loadFirstOfMonthData,
  firstOfMonthResults,
  loadFirstOfSpecies,
  firstOfSpeciesHolders,
  dateAwardRunsAt,
  dateAwardUsers,
  periodQualifiers,
  simulate,
  countAt,
  awardPlan,
  forgetData,
};
