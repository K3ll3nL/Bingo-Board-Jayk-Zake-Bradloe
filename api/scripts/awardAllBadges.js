/**
 * awardAllBadges.js
 *
 * Retroactively awards every badge to everyone who qualifies right now, using
 * badgeEval.awardPlan — the SAME evaluator as live awards, the period-end cron
 * and the Backlog's publish/simulator (see api/_lib/badgeEval.js). Inserts only
 * rows that are missing; never revokes. Safe to run multiple times.
 *
 *   regular badges        → one row per qualifying user
 *   first_approval_month  → each month's settled winner, only for months with
 *                           no holder yet (a month's winner is never reassigned)
 *   period_end            → only badges naming a closed period; "every period"
 *                           badges are the cron's job at each period end
 *   date_award            → users that existed when that date's cron ran
 *
 * Rows are inserted silently (no notification/toast), as before.
 *
 * Usage:
 *   node api/scripts/awardAllBadges.js
 *   node api/scripts/awardAllBadges.js --dry-run   (print what would be awarded, no DB writes)
 *   node api/scripts/awardAllBadges.js --dry-run --verbose   (also list each hunter)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const { awardPlan } = require('../_lib/badgeEval');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function selectAll(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const [badges, holders, users] = await Promise.all([
    selectAll(() => supabase.from('badges').select('id, key, name, trigger, check_type, check_value, check_qualifier').order('key')),
    selectAll(() => supabase.from('user_badges').select('id, user_id, badge_id, month_id').order('id')),
    selectAll(() => supabase.from('users').select('id, display_name').order('id')),
  ]);
  const nameOf = new Map(users.map(u => [u.id, u.display_name ?? u.id]));

  const heldUser = new Set();        // `${badge}:${user}` for regular rows
  const heldMonth = new Set();       // `${badge}:${month}` — one winner per badge per month
  for (const h of holders) {
    if (h.month_id == null) heldUser.add(`${h.badge_id}:${h.user_id}`);
    else heldMonth.add(`${h.badge_id}:${h.month_id}`);
  }

  let total = 0;
  for (const badge of badges) {
    let plan;
    try {
      plan = await awardPlan(badge, supabase);
    } catch (e) {
      console.error(`  ${badge.key}: ${e.message}`);
      continue;
    }
    const missing = plan.rows.filter(r => (r.month_id == null
      ? !heldUser.has(`${badge.id}:${r.user_id}`)
      : !heldMonth.has(`${badge.id}:${r.month_id}`)));
    if (plan.timing !== 'now' && !missing.length) {
      if (VERBOSE) console.log(`  ${badge.key.padEnd(24)} awarded by the cron (${plan.timing})`);
      continue;
    }
    if (!missing.length) continue;

    console.log(`  ${badge.key.padEnd(24)} +${missing.length}`);
    if (VERBOSE) for (const r of missing) console.log(`      ${nameOf.get(r.user_id) ?? r.user_id}${r.month_id != null ? ` (month ${r.month_id})` : ''}`);
    total += missing.length;

    if (!DRY_RUN) {
      const { error } = await supabase.from('user_badges').insert(missing.map(r => ({
        user_id: r.user_id,
        badge_id: badge.id,
        ...(r.month_id != null ? { month_id: r.month_id } : {}),
      })));
      if (error) { console.error(`    insert failed for ${badge.key}: ${error.message}`); total -= missing.length; }
    }
  }

  console.log(`\nDone. ${DRY_RUN ? 'Would award' : 'Awarded'} ${total} badge row(s) total.`);
}

main().catch(err => { console.error(err); process.exit(1); });
