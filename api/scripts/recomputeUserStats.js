/**
 * recomputeUserStats.js
 *
 * Rebuilds (or audits) the `user_stats` cache created by
 * supabase/migrations/20260903120000_user_stats_cache.sql.
 *
 * The cache is maintained by AFTER triggers on entries / bingo_achievements /
 * user_monthly_points / notifications, so in normal operation it is already
 * correct. This script exists for the two cases triggers cannot cover:
 *
 *   1. BACKFILL — after the migration, or after any bulk load / restore that ran
 *      with triggers disabled (`ALTER TABLE ... DISABLE TRIGGER`, `COPY`, a PITR
 *      restore, or a direct SQL edit in the dashboard).
 *   2. AUDIT — proving the SQL in `recompute_user_stats()` still agrees with the
 *      JS in `api/_badgeRegistry.js` contextBuilders.
 *
 * (2) is the reason this is a JS script rather than one line of SQL. The cache is
 * only useful if reading it returns what recomputing would have returned, and
 * there are now TWO implementations of those semantics — plpgsql and JS. They can
 * drift the moment someone edits one without the other. `--dry-run` recomputes
 * every user through the JS builders and diffs against the cached row, so that
 * drift shows up here instead of as a badge that silently never fires.
 *
 * Usage:
 *   node api/scripts/recomputeUserStats.js --dry-run   audit only, no writes
 *   node api/scripts/recomputeUserStats.js             refresh every user's row
 *   node api/scripts/recomputeUserStats.js --user <id> limit to one user
 *
 * Exit code is 1 when --dry-run finds a mismatch, so CI can gate on it.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { contextBuilders } = require('../_badgeRegistry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');
const userFlag = process.argv.indexOf('--user');
const ONLY_USER = userFlag !== -1 ? process.argv[userFlag + 1] : null;

// Scalars that both implementations produce, mapped to how each names them.
// Keeping this as data (rather than an ad-hoc chain of comparisons) means adding
// a counter later is one line here and the audit picks it up for free.
const SCALARS = [
  { col: 'total_submissions',   ctx: c => c.totalSubmissions },
  { col: 'total_approved',      ctx: c => c.totalApproved },
  { col: 'total_rejected',      ctx: c => c.totalRejected },
  { col: 'restricted_approved', ctx: c => c.restrictedApproved },
  { col: 'active_months',       ctx: c => c.activeMonths },
  // Bingo columns are COUNT(DISTINCT (month_id, base_type)), matching
  // contextBuilders.bingo_achievement. Compare against the DISTINCT columns,
  // NOT the *_folded ones: those retain the old award-engine rule on purpose,
  // so the historical over-award stays auditable, and by design they will
  // not match the builder.
  { col: 'bingo_row',      ctx: c => c.bingoTypeCounts?.row },
  { col: 'bingo_column',   ctx: c => c.bingoTypeCounts?.column },
  { col: 'bingo_x',        ctx: c => c.bingoTypeCounts?.x },
  { col: 'bingo_blackout', ctx: c => c.bingoTypeCounts?.blackout },
  { col: 'bingo_total',           ctx: c => c.bingoTotalCount },
];

// Compare two {key: count} maps, ignoring keys that are absent on one side but
// zero on the other — SQL omits an empty group, JS may emit an explicit 0.
function diffMap(cached, computed) {
  const out = [];
  const keys = new Set([...Object.keys(cached || {}), ...Object.keys(computed || {})]);
  for (const k of keys) {
    const a = Number(cached?.[k] ?? 0);
    const b = Number(computed?.[k] ?? 0);
    if (a !== b) out.push(`${k}: cached=${a} computed=${b}`);
  }
  return out;
}

async function buildJsContext(userId) {
  const [approved, submission, rejected, monthlyActive, bingo] = await Promise.all([
    contextBuilders.approved(userId, supabase),
    contextBuilders.submission(userId, supabase),
    contextBuilders.rejected(userId, supabase),
    contextBuilders.monthly_active(userId, supabase),
    contextBuilders.bingo_achievement(userId, supabase),
  ]);
  return { ...approved, ...submission, ...rejected, ...monthlyActive, ...bingo };
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (audit only, no writes) ===' : '=== LIVE RUN ===');

  let q = supabase.from('users').select('id, display_name, username');
  if (ONLY_USER) q = q.eq('id', ONLY_USER);
  const { data: users, error } = await q;
  if (error) throw error;

  console.log(`${users.length} user(s)\n`);

  let written = 0;
  let mismatched = 0;

  for (const u of users) {
    const label = `${u.display_name || u.username || '(no name)'} [${u.id.slice(0, 8)}]`;

    if (!DRY_RUN) {
      const { error: rpcErr } = await supabase.rpc('recompute_user_stats', { p_user_id: u.id });
      if (rpcErr) {
        console.error(`  ✗ ${label} — recompute failed: ${rpcErr.message}`);
        continue;
      }
      written++;
    }

    const { data: row, error: rowErr } = await supabase
      .from('user_stats').select('*').eq('user_id', u.id).maybeSingle();
    if (rowErr) throw rowErr;

    // In a live run the row was just written, so a diff here means the SQL and JS
    // genuinely disagree. In a dry run it can also mean the cache is merely stale,
    // which is itself worth reporting.
    if (!row) {
      console.log(`  ! ${label} — no user_stats row`);
      mismatched++;
      continue;
    }

    const ctx = await buildJsContext(u.id);
    const problems = [];

    for (const { col, ctx: get } of SCALARS) {
      const cached = Number(row[col] ?? 0);
      const computed = Number(get(ctx) ?? 0);
      if (cached !== computed) problems.push(`${col}: cached=${cached} computed=${computed}`);
    }

    problems.push(...diffMap(row.type_approved, ctx.typeApproved).map(s => `type.${s}`));
    problems.push(...diffMap(row.gen_approved, ctx.genApproved).map(s => `gen.${s}`));

    const collComputed = Object.fromEntries(
      Object.entries(ctx.collectionProgress || {}).map(([k, v]) => [k, v.caught])
    );
    problems.push(...diffMap(row.collections, collComputed).map(s => `coll.${s}`));

    if (problems.length) {
      mismatched++;
      console.log(`  ✗ ${label}`);
      for (const p of problems) console.log(`      ${p}`);
    }
  }

  console.log('');
  if (!DRY_RUN) console.log(`Recomputed ${written} row(s).`);
  if (mismatched) {
    console.log(`${mismatched} user(s) MISMATCHED between SQL cache and JS builders.`);
    console.log('The two implementations have drifted — reconcile');
    console.log('recompute_user_stats() against api/_badgeRegistry.js contextBuilders.');
    process.exitCode = 1;
  } else {
    console.log('All users agree: SQL cache matches JS builders.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
