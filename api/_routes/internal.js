/**
 * internal routes (3).
 * Registered from api/index.js — see api/API_INDEX.md for the full route map.
 */
const {
  awardBadgesForTrigger,
  bulkAwardBadge,
  deleteR2Images,
  getActiveMonth,
  nowForMonth,
  processMonthEnd,
  processSeasonEnd,
  processYearEnd,
  supabase,
} = require('../_lib/core');

// Number of days before a month's end_date at which the countdown banner appears.
const COUNTDOWN_WINDOW_DAYS = 7;

// Writes/refreshes the "month is ending" banner as a normal `banners` row, so it
// gets the same bar and dismiss button as every mod-authored banner for free.
// Idempotent: the row is keyed `month_countdown:<monthId>`, so the daily cron
// updates the same row instead of stacking duplicates. The key is per month (not
// a single global row) so dismissing this month's countdown does not also
// suppress next month's — dismissal is by banner id in localStorage.
async function upsertCountdownBanner() {
  const month = await getActiveMonth();
  if (!month) return null;

  const end = new Date(month.end_date);
  const msLeft = end.getTime() - nowForMonth().getTime();
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft <= 0 || daysLeft > COUNTDOWN_WINDOW_DAYS) return null;

  const message = daysLeft === 1
    ? `Last day of ${month.month_year_display} — get your submissions in before the board resets!`
    : `${daysLeft} days left in ${month.month_year_display} — get your submissions in before the board resets!`;

  const { error } = await supabase.from('banners').upsert({
    banner_key: `month_countdown:${month.id}`,
    message,
    link_url: '/upload',
    link_label: 'Submit a catch',
    starts_at: new Date().toISOString(),
    expires_at: month.end_date,
    condition: null,
  }, { onConflict: 'banner_key' });
  if (error) throw error;

  return { month_id: month.id, days_left: daysLeft };
}

module.exports = function register(app) {

  // ── Supabase webhook — fires on INSERT into user_monthly_points ───────────────
  // Configure in Supabase Dashboard → Database → Webhooks:
  //   Table: user_monthly_points | Event: INSERT
  //   HTTP POST → <your api url>/api/internal/monthly-active
  //   Add header:  x-webhook-secret: <value of WEBHOOK_SECRET in api/.env>
  app.post('/api/internal/monthly-active', async (req, res) => {
    if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
      return res.status(401).end();
    }
    const userId = req.body?.record?.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id in record' });

    await awardBadgesForTrigger(userId, 'monthly_active');
    await awardBadgesForTrigger(userId, 'account_age');
    res.status(200).end();
  });

  // ── Supabase webhook — fires on INSERT into bingo_achievements ────────────────
  // Configure in Supabase Dashboard → Database → Webhooks:
  //   Table: bingo_achievements | Event: INSERT
  //   HTTP POST → <your api url>/api/internal/bingo-achievement
  //   Add header:  x-webhook-secret: <value of WEBHOOK_SECRET in api/.env>
  app.post('/api/internal/bingo-achievement', async (req, res) => {
    if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET) {
      return res.status(401).end();
    }
    const userId = req.body?.record?.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id in record' });

    await awardBadgesForTrigger(userId, 'bingo_achievement');
    res.status(200).end();
  });

  // ── Vercel Cron — fires daily at 04:00 UTC (matches MONTH_ROLLOVER_OFFSET_MS) ─
  // vercel.json: { "crons": [{ "path": "/api/internal/period-end", "schedule": "0 4 * * *" }] }
  // Vercel sets x-vercel-cron-signature; we verify WEBHOOK_SECRET as a fallback
  // for manual triggers and local testing.
  app.post('/api/internal/period-end', async (req, res) => {
    if (req.headers['x-webhook-secret'] !== process.env.WEBHOOK_SECRET &&
        req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).end();
    }

    try {
      const todayUTC     = new Date();
      todayUTC.setUTCHours(0, 0, 0, 0);
      const todayStr     = todayUTC.toISOString().split('T')[0];
      const yesterdayStr = new Date(todayUTC - 864e5).toISOString().split('T')[0];

      const results = { dateAwards: [], months: [], seasons: [], years: [] };

      // ── Month-countdown banner — non-fatal, never blocks badge processing ────
      try {
        results.countdownBanner = await upsertCountdownBanner();
      } catch (bannerErr) {
        console.error('Failed to upsert countdown banner (non-fatal):', bannerErr.message);
      }

      // ── Date-award badges — award ALL users on a specific calendar date ───────
      const { data: dateAwardBadges } = await supabase
        .from('badges')
        .select('id, name')
        .eq('trigger', 'date_award')
        .eq('check_qualifier', yesterdayStr);

      if (dateAwardBadges?.length) {
        const { data: allUsers } = await supabase.from('users').select('id');
        const userIds = (allUsers || []).map(u => u.id);
        for (const badge of dateAwardBadges) {
          const count = await bulkAwardBadge(badge.id, userIds);
          results.dateAwards.push({ id: badge.id, name: badge.name, awarded: count });
        }
      }

      // ── Period-end badges — tied to bingo_months.end_date ────────────────────
      // end_date is TIMESTAMPTZ; a month "ended yesterday" if its end moment
      // falls anywhere in yesterday UTC.
      const yesterdayStartISO = `${yesterdayStr}T00:00:00.000Z`;
      const todayStartISO     = `${todayStr}T00:00:00.000Z`;
      const { data: endedMonths, error } = await supabase
        .from('bingo_months')
        .select('id, season_id, year_id')
        .gte('end_date', yesterdayStartISO)
        .lt('end_date',  todayStartISO);
      if (error) throw error;

      // ── Purge expired approval_history images ─────────────────────────────────
      try {
        const { data: expiredHistory } = await supabase
          .from('approval_history')
          .select('id, proof_url, proof_url2')
          .lt('purge_after', new Date().toISOString())
          .or('proof_url.not.is.null,proof_url2.not.is.null');

        if (expiredHistory?.length) {
          const urlsToPurge = expiredHistory.flatMap(h => [h.proof_url, h.proof_url2].filter(Boolean));
          await deleteR2Images(urlsToPurge);
          const ids = expiredHistory.map(h => h.id);
          await supabase.from('approval_history').update({ proof_url: null, proof_url2: null }).in('id', ids);
          results.purgedHistory = expiredHistory.length;
          console.log(`period-end: purged images for ${expiredHistory.length} approval_history records`);
        }
      } catch (purgeErr) {
        console.error('Failed to purge approval_history images (non-fatal):', purgeErr.message);
      }

      if (!endedMonths?.length && !dateAwardBadges?.length) {
        console.log(`period-end: nothing to process on ${todayStr}`);
        return res.status(200).json({
          message: 'Nothing to process',
          purgedHistory: results.purgedHistory,
          countdownBanner: results.countdownBanner,
        });
      }

      const doneSeasons = new Set();
      const doneYears   = new Set();

      for (const month of endedMonths) {
        results.months.push({ id: month.id, awarded: await processMonthEnd(month.id) });

        if (month.season_id && !doneSeasons.has(month.season_id)) {
          // Any OTHER month in this season that hasn't ended yet?
          // (end_date >= today_start means the month either ends later today or in the future.)
          const { count } = await supabase
            .from('bingo_months').select('*', { count: 'exact', head: true })
            .eq('season_id', month.season_id).gte('end_date', todayStartISO);
          if (count === 0) {
            doneSeasons.add(month.season_id);
            results.seasons.push({ id: month.season_id, awarded: await processSeasonEnd(month.season_id) });
          }
        }

        if (month.year_id && !doneYears.has(month.year_id)) {
          const { count } = await supabase
            .from('bingo_months').select('*', { count: 'exact', head: true })
            .eq('year_id', month.year_id).gte('end_date', todayStartISO);
          if (count === 0) {
            doneYears.add(month.year_id);
            results.years.push({ id: month.year_id, awarded: await processYearEnd(month.year_id) });
          }
        }
      }

      console.log('period-end results:', JSON.stringify(results));
      res.status(200).json({ success: true, results });
    } catch (err) {
      console.error('period-end error:', err);
      res.status(500).json({ error: err.message });
    }
  });

};
