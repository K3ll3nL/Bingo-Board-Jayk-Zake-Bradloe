/**
 * seedFirstApprovalBadge.js
 *
 * Inserts the "first_approval_month" badge into the DB, then backfills
 * all past months — awarding it to the first player approved each month.
 *
 * Safe to re-run: badge insert uses ON CONFLICT DO NOTHING; backfill
 * skips months already awarded.
 *
 * Usage:
 *   node api/scripts/seedFirstApprovalBadge.js
 *   node api/scripts/seedFirstApprovalBadge.js --dry-run
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');
const BASE_URL = 'https://pub-583ae6cd5f8b4b58b0ee7053ea1d4b0b.r2.dev/assets/badges';

const BADGE = {
  key:             'first_month',
  name:            'Quick Hunter',
  description:     'Submit the first bounty of the month!',
  hint:            'Submit a bounty really fast!',
  image_url:       `${BASE_URL}/first_month.png`,
  is_secret:       false,
  family:          'first_month',
  family_order:    1,
  trigger:         'approved',
  check_type:      'first_approval_month',
  check_value:     1,
  check_qualifier: null,
};

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // 1. Upsert the badge record
  console.log('\n--- Seeding badge ---');
  if (!DRY_RUN) {
    const { error } = await supabase
      .from('badges')
      .upsert(BADGE, { onConflict: 'key', ignoreDuplicates: true });
    if (error) throw error;
    console.log(`Badge upserted (key: ${BADGE.key})`);
  } else {
    console.log(`Would upsert badge: "${BADGE.name}" (key: ${BADGE.key})`);
  }

  // Fetch the badge id for the backfill
  const { data: badgeRow, error: fetchErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('key', BADGE.key)
    .single();
  if (fetchErr) {
    if (DRY_RUN) {
      console.log('(dry-run: badge not in DB yet, skipping backfill)');
      return;
    }
    throw fetchErr;
  }

  // 2. Backfill — one winner per past month
  console.log('\n--- Backfilling monthly winners ---');

  const { data: months, error: monthsErr } = await supabase
    .from('bingo_months')
    .select('id, end_date')
    .order('id', { ascending: true });
  if (monthsErr) throw monthsErr;

  const { data: alreadyAwarded } = await supabase
    .from('user_badges')
    .select('month_id')
    .eq('badge_id', badgeRow.id)
    .not('month_id', 'is', null);
  const awardedMonths = new Set((alreadyAwarded || []).map(r => r.month_id));

  const { data: users } = await supabase.from('users').select('id, display_name');
  const userMap = Object.fromEntries((users || []).map(u => [u.id, u.display_name]));

  let awarded = 0;
  for (const month of months) {
    if (awardedMonths.has(month.id)) {
      console.log(`  Month ${month.id} (${month.end_date}): already awarded — skip`);
      continue;
    }

    const { data: firstEntry } = await supabase
      .from('entries')
      .select('user_id')
      .eq('month_id', month.id)
      .eq('historical', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!firstEntry) {
      console.log(`  Month ${month.id} (${month.end_date}): no entries — skip`);
      continue;
    }

    const name = userMap[firstEntry.user_id] ?? firstEntry.user_id;
    console.log(`  Month ${month.id} (${month.end_date}): award to ${name}`);
    awarded++;

    if (!DRY_RUN) {
      const { error: insertErr } = await supabase
        .from('user_badges')
        .insert({ user_id: firstEntry.user_id, badge_id: badgeRow.id, month_id: month.id });
      if (insertErr) console.error(`    Insert error:`, insertErr.message);
    }
  }

  console.log(`\nDone. ${DRY_RUN ? 'Would award' : 'Awarded'} ${awarded} monthly winner(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
