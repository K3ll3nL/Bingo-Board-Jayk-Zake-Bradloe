/**
 * verifyBadgeSim.js — read-only parity check for api/_lib/badgeEval.js, the one
 * evaluator behind live awards, the period-end cron, the backfill and the
 * Backlog's earn counts. Run it after touching badgeEval.js or the compute
 * functions in _badgeRegistry.js.
 *
 * All checks run on the real database:
 *   1. CONTEXTS   every user's context built scoped (the live award path) equals
 *                 the bulk context (simulator / backfill), for every trigger.
 *   2. COUNTS     for every badge, the simulator's count at check_value equals
 *                 the number of users awardPlan would award (metricFor vs
 *                 buildCheckFromDB — two readings of the same context).
 *   3. PERIODS    periodQualifiers equals the SQL RPCs the cron used to call
 *                 (users_with_min_entries_in_*, rank_users_by_*_points) for every
 *                 closed period at every threshold that changes the answer.
 *                 Exact ties (where SQL's order was arbitrary) are reported.
 *   4. FIRSTS     each month's first-catch winner under the current clock.
 *   5. HOLDERS    the plan vs real user_badges rows, per user. Differences are
 *                 information, not failures: awards are never revoked.
 *
 * Usage: node api/scripts/verifyBadgeSim.js [--skip-contexts]
 * Exit code 1 if check 1, 2 or 3 finds a mismatch.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const {
  loadData, contextBuilders, simulate, countAt, awardPlan, periodQualifiers,
  loadFirstOfMonthData, firstOfMonthResults, TRIGGER_BY_CHECK_TYPE,
} = require('../_lib/badgeEval');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SKIP_CONTEXTS = process.argv.includes('--skip-contexts');

const stable = (v) => JSON.stringify(v, (k, x) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]]))
    : x);

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const n = i++; out[n] = await fn(items[n]); }
  }));
  return out;
}

async function checkContexts() {
  let failures = 0;
  for (const trigger of Object.keys(contextBuilders)) {
    const { users, ctx, fallback } = await loadData(supabase, trigger, { fresh: true });
    let diff = 0;
    const examples = [];
    await mapLimit(users, 8, async (u) => {
      const scoped = await contextBuilders[trigger](u.id, supabase);
      const bulk = { ...(ctx.get(u.id) ?? fallback) };
      delete bulk.monthsWonFirstApproval;   // per-month, bulk-only by design
      if (stable(scoped) !== stable(bulk)) {
        diff++;
        if (examples.length < 2) examples.push({ user: u.id, scoped, bulk });
      }
    });
    console.log(`  ${diff ? 'FAIL' : 'ok  '} ${trigger.padEnd(18)} ${users.length - diff}/${users.length} users identical`);
    for (const e of examples) console.log('       ', e.user, '\n        scoped:', stable(e.scoped).slice(0, 400), '\n        bulk:  ', stable(e.bulk).slice(0, 400));
    failures += diff;
  }
  return failures;
}

const RPC = {
  month:  { count: 'users_with_min_entries_in_month',  rank: 'rank_users_by_month_points',  id: 'p_month_id' },
  season: { count: 'users_with_min_entries_in_season', rank: 'rank_users_by_season_points', id: 'p_season_id' },
  year:   { count: 'users_with_min_entries_in_year',   rank: 'rank_users_by_year_points',   id: 'p_year_id' },
};

async function checkPeriods() {
  const { period } = await loadData(supabase, 'period_end', { fresh: true });
  let failures = 0, calls = 0, tieNotes = 0;
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  for (const p of ['month', 'season', 'year']) {
    for (const pid of [...period.closed[p]].sort((a, b) => a - b)) {
      // Counts: every distinct value plus one above it is a threshold where the answer changes.
      const counts = period.counts[p].get(pid) ?? new Map();
      const thresholds = [...new Set([1, ...[...counts.values()].flatMap(v => [v, v + 1])])].sort((a, b) => a - b);
      for (const t of thresholds) {
        const { data, error } = await supabase.rpc(RPC[p].count, { [RPC[p].id]: pid, p_min_count: t });
        calls++;
        if (error) throw error;
        const sql = data.map(r => r.user_id);
        const js = periodQualifiers(period, `approved_count_in_${p}`, pid, t);
        if (!sameSet(sql, js)) { failures++; console.log(`  FAIL count ${p} ${pid} >=${t}: sql ${sql.length} js ${js.length}`); }
      }
      // Ranks: full SQL ordering vs JS ordering at every cut.
      const ranks = period.ranks[p].get(pid) ?? new Map();
      const { data, error } = await supabase.rpc(RPC[p].rank, { [RPC[p].id]: pid, p_max_rank: 100000 });
      calls++;
      if (error) throw error;
      const sqlOrder = [...data].sort((a, b) => Number(a.rank) - Number(b.rank)).map(r => r.user_id);
      const score = period.scores[p].get(pid) ?? new Map();
      for (let k = 1; k <= Math.max(sqlOrder.length, ranks.size); k++) {
        const sql = sqlOrder.slice(0, k);
        const js = periodQualifiers(period, `top_placement_${p}`, pid, k);
        if (!sameSet(sql, js)) {
          // Only acceptable when the users at the cut are exactly tied on
          // (points, last_updated) — SQL's ROW_NUMBER order was arbitrary there.
          const a = score.get(sql.find(u => !js.includes(u))), b = score.get(js.find(u => !sql.includes(u)));
          const tie = a && b && a.points === b.points && a.last === b.last;
          if (tie) { tieNotes++; console.log(`  tie  rank ${p} ${pid} top ${k}: exact tie at the cut (SQL arbitrary, JS by user_id)`); }
          else { failures++; console.log(`  FAIL rank ${p} ${pid} top ${k}: sql [${sql.join(',')}] js [${js.join(',')}]`); }
        }
      }
    }
  }
  console.log(`  ${failures ? 'FAIL' : 'ok  '} ${calls} RPC calls compared, ${failures} mismatch(es), ${tieNotes} exact-tie note(s)`);
  return failures;
}

async function main() {
  console.log('=== badge evaluator parity (read-only) ===\n');
  let failures = 0;

  if (!SKIP_CONTEXTS) {
    console.log('1. Contexts: scoped (live award) vs bulk (simulator/backfill)');
    failures += await checkContexts();
    console.log();
  }

  const [{ data: badges, error: bErr }, { data: holders, error: hErr }] = await Promise.all([
    supabase.from('badges').select('id, key, name, trigger, check_type, check_value, check_qualifier').order('key'),
    supabase.from('user_badges').select('user_id, badge_id, month_id'),
  ]);
  if (bErr) throw bErr;
  if (hErr) throw hErr;

  console.log('2. Simulated count vs award plan, every badge');
  const plans = new Map();
  let countFails = 0;
  for (const b of badges) {
    const sim = await simulate({ check_type: b.check_type, check_qualifier: b.check_qualifier }, supabase);
    const plan = await awardPlan(b, supabase);
    plans.set(b.id, { plan, sim });
    if (plan.timing !== 'now' || !sim.evaluable) continue;
    const shown = countAt(sim, b.check_value);
    const awarded = new Set(plan.rows.map(r => r.user_id)).size;
    // first_approval_month counts distinct winners; same unit both sides.
    if (shown !== awarded) { countFails++; console.log(`  FAIL ${b.key}: display ${shown}, plan awards ${awarded}`); }
  }
  console.log(`  ${countFails ? 'FAIL' : 'ok  '} ${badges.length} badges, ${countFails} mismatch(es)`);
  failures += countFails;

  console.log('\n3. Period qualifiers vs SQL RPCs (every closed period)');
  failures += await checkPeriods();

  console.log('\n4. First catch of each month (current clock)');
  const fom = await loadFirstOfMonthData(supabase);
  const firstBadgeIds = new Set(badges.filter(b => b.check_type === 'first_approval_month').map(b => b.id));
  const realFirst = new Map(holders.filter(h => firstBadgeIds.has(h.badge_id)).map(h => [h.month_id, h.user_id]));
  console.log(`  clock: ${fom.clock}`);
  for (const r of firstOfMonthResults(fom)) {
    const real = realFirst.get(r.month_id);
    const who = r.status === 'settled' ? r.user_id : r.status === 'pending' ? `pending (${r.candidate})` : '—';
    const note = real == null ? (r.status === 'settled' ? 'not yet awarded' : '') : real === r.user_id ? 'matches holder' : `HOLDER DIFFERS: ${real}`;
    console.log(`  month ${String(r.month_id).padStart(2)}  ${who.padEnd(40)} ${note}`);
  }

  console.log('\n5. Award plan vs real holders (per user)');
  const holderKeys = new Map();
  for (const h of holders) {
    if (!holderKeys.has(h.badge_id)) holderKeys.set(h.badge_id, new Set());
    holderKeys.get(h.badge_id).add(h.month_id == null ? h.user_id : `${h.user_id}:${h.month_id}`);
  }
  let same = 0;
  for (const b of badges) {
    const { plan, sim } = plans.get(b.id);
    const keys = new Set(plan.rows.map(r => (r.month_id == null ? r.user_id : `${r.user_id}:${r.month_id}`)));
    const real = holderKeys.get(b.id) ?? new Set();
    const wouldAdd = [...keys].filter(k => !real.has(k));
    const outside = plan.timing === 'now' ? [...real].filter(k => !keys.has(k)) : [];
    if (!wouldAdd.length && !outside.length) { same++; continue; }
    let why = '';
    if (TRIGGER_BY_CHECK_TYPE[b.check_type] === 'period_end') why = `period badge, ${sim.note ?? ''}`;
    else if (outside.length && !wouldAdd.length) why = 'manual grant or stats dropped since award';
    else if (wouldAdd.length) why = 'qualify, trigger has not fired for them';
    console.log(`  ${b.key.padEnd(24)} ${plan.timing.padEnd(10)} plan ${String(keys.size).padStart(3)}  real ${String(real.size).padStart(3)}  +${wouldAdd.length} missing  ${outside.length} outside rule  ${why}`);
  }
  console.log(`  ${same}/${badges.length} badges: plan == real holders (same people)`);

  console.log(failures ? `\nFAIL — ${failures} parity mismatch(es)` : '\nPASS — every award path agrees');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
