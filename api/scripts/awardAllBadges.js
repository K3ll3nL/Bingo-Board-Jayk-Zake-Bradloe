/**
 * awardAllBadges.js
 *
 * Retroactively awards all earned badges to all users based on their current stats.
 * Safe to run multiple times — skips badges already earned (INSERT ... ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   node api/scripts/awardAllBadges.js
 *   node api/scripts/awardAllBadges.js --dry-run   (print what would be awarded, no DB writes)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { contextBuilders, buildCheckFromDB } = require('../badgeRegistry');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

const TRIGGERS = ['submission', 'approved', 'rejected', 'monthly_active', 'account_age', 'bingo_achievement'];

// check_types that require per-month award logic — excluded from the main per-user loop
const MONTHLY_CHECK_TYPES = new Set(['first_approval_month']);

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // 1. Fetch all users
  const { data: users, error: usersError } = await supabase.from('users').select('id, display_name');
  if (usersError) throw usersError;
  console.log(`Processing ${users.length} users across ${TRIGGERS.length} triggers...\n`);

  // 2. Fetch all badge definitions from DB
  const { data: allBadges, error: badgesError } = await supabase
    .from('badges')
    .select('id, key, name, trigger, check_type, check_value, check_qualifier')
    .in('trigger', TRIGGERS);
  if (badgesError) throw badgesError;

  // Group badges by trigger — exclude monthly badges from the standard per-user loop
  const badgesByTrigger = {};
  for (const badge of allBadges) {
    if (MONTHLY_CHECK_TYPES.has(badge.check_type)) continue;
    (badgesByTrigger[badge.trigger] ??= []).push(badge);
  }

  // 3. Fetch all already-earned badges in one shot: { userId -> Set<badgeId> }
  //    Only fetch non-monthly rows (month_id IS NULL) for the flat earned map.
  const { data: earned, error: earnedError } = await supabase
    .from('user_badges')
    .select('user_id, badge_id')
    .is('month_id', null);
  if (earnedError) throw earnedError;

  const earnedMap = {};
  for (const row of earned) {
    (earnedMap[row.user_id] ??= new Set()).add(row.badge_id);
  }

  // 4. For each user × trigger, build context and check badges
  let totalAwarded = 0;

  for (const user of users) {
    const userEarned = earnedMap[user.id] ?? new Set();
    const toAward = []; // [{ badge_id, name }]

    for (const trigger of TRIGGERS) {
      const badges = badgesByTrigger[trigger];
      if (!badges?.length) continue;

      // Skip if user already has all badges for this trigger
      const unearned = badges.filter(b => !userEarned.has(b.id));
      if (!unearned.length) continue;

      // Build context once per trigger per user
      let ctx;
      try {
        const builder = contextBuilders[trigger];
        ctx = builder ? await builder(user.id, supabase) : {};
      } catch (e) {
        console.error(`  Context error for ${user.display_name} / ${trigger}:`, e.message);
        continue;
      }

      for (const badge of unearned) {
        const check = buildCheckFromDB(badge);
        if (check(ctx)) {
          toAward.push({ badge_id: badge.id, name: badge.name });
        }
      }
    }

    if (!toAward.length) continue;

    console.log(`${user.display_name}: ${toAward.map(b => b.name).join(', ')}`);

    if (!DRY_RUN) {
      const { error: insertError } = await supabase
        .from('user_badges')
        .insert(toAward.map(b => ({
          user_id: user.id,
          badge_id: b.badge_id,
          earned_at: new Date().toISOString(),
        })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true });

      if (insertError) {
        console.error(`  Insert error for ${user.display_name}:`, insertError.message);
      } else {
        totalAwarded += toAward.length;
      }
    } else {
      totalAwarded += toAward.length;
    }
  }

  // 5. Monthly winner badges (first_approval_month) — one winner per badge per month.
  //    For each past month, find the user with the lowest-ID entry (earliest approved catch)
  //    and award the badge if not already awarded for that month.
  console.log('\n--- Backfilling monthly winner badges ---');
  const monthlyBadges = allBadges.filter(b => MONTHLY_CHECK_TYPES.has(b.check_type));

  if (monthlyBadges.length) {
    const { data: months, error: monthsError } = await supabase
      .from('bingo_months')
      .select('id, label:end_date')
      .order('id', { ascending: true });
    if (monthsError) throw monthsError;

    // Fetch all already-awarded monthly badge rows: Set of "badge_id:month_id"
    const { data: monthlyEarned } = await supabase
      .from('user_badges')
      .select('badge_id, month_id')
      .not('month_id', 'is', null);
    const monthlyEarnedSet = new Set((monthlyEarned || []).map(r => `${r.badge_id}:${r.month_id}`));

    for (const badge of monthlyBadges) {
      console.log(`\nBadge: "${badge.name}"`);
      for (const month of months) {
        if (monthlyEarnedSet.has(`${badge.id}:${month.id}`)) {
          console.log(`  Month ${month.id}: already awarded — skip`);
          continue;
        }

        // Find the first non-historical entry for this month (lowest id = earliest approved)
        const { data: firstEntry } = await supabase
          .from('entries')
          .select('user_id')
          .eq('month_id', month.id)
          .eq('historical', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        if (!firstEntry) {
          console.log(`  Month ${month.id}: no entries — skip`);
          continue;
        }

        const winner = users.find(u => u.id === firstEntry.user_id);
        console.log(`  Month ${month.id}: award to ${winner?.display_name ?? firstEntry.user_id}`);
        totalAwarded++;

        if (!DRY_RUN) {
          const { error: insertError } = await supabase
            .from('user_badges')
            .insert({ user_id: firstEntry.user_id, badge_id: badge.id, month_id: month.id });
          if (insertError) console.error(`    Insert error:`, insertError.message);
        }
      }
    }
  }

  // 6. Date-award badges — award ALL users for any date_award badge whose date has passed
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: dateAwardBadges } = await supabase
    .from('badges')
    .select('id, name, check_qualifier')
    .eq('trigger', 'date_award')
    .lte('check_qualifier', todayStr);

  if (dateAwardBadges?.length) {
    const userIds = users.map(u => u.id);
    const allEarnedDateBadges = new Set(
      earned.filter(r => dateAwardBadges.some(b => b.id === r.badge_id)).map(r => `${r.user_id}:${r.badge_id}`)
    );

    for (const badge of dateAwardBadges) {
      const unearnedUsers = userIds.filter(uid => !allEarnedDateBadges.has(`${uid}:${badge.id}`));
      console.log(`\nDate badge "${badge.name}" (${badge.check_qualifier}): ${unearnedUsers.length} users to award`);

      if (!DRY_RUN && unearnedUsers.length) {
        const { error } = await supabase
          .from('user_badges')
          .insert(unearnedUsers.map(uid => ({
            user_id: uid,
            badge_id: badge.id,
            earned_at: new Date().toISOString(),
          })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
        if (error) console.error(`  Insert error for date badge ${badge.name}:`, error.message);
        else totalAwarded += unearnedUsers.length;
      } else {
        totalAwarded += unearnedUsers.length;
      }
    }
  }

  console.log(`\nDone. ${DRY_RUN ? 'Would award' : 'Awarded'} ${totalAwarded} badge(s) total.`);
}

main().catch(err => { console.error(err); process.exit(1); });
