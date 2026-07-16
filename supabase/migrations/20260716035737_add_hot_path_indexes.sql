-- Add missing indexes on hot-path tables identified in the DB quality audit.
-- Reason: audit plan phase 3, S11 — approvals/notifications/approval_history
-- had only their PK before this; every filtered query was a seq scan.
--
-- All CREATE INDEX statements are IF NOT EXISTS so re-running is safe.
-- Not using CONCURRENTLY: current row counts are tiny (approvals: 1,
-- notifications: ~1K, entries: 528) so ACCESS EXCLUSIVE locks resolve in
-- milliseconds. Revisit if any table crosses ~100K rows.

-- ─── entries ────────────────────────────────────────────────────────────────
-- CLAUDE.md rule: "always sort by created_at, never by id" — this index makes
-- that the cheap path.
CREATE INDEX IF NOT EXISTS entries_month_created_idx
  ON public.entries (month_id, created_at DESC);

-- Used by the moderator-note update in api/index.js:3067 (post-approval
-- fire-and-forget), which filters user_id + pokemon_id + month_id + historical.
CREATE INDEX IF NOT EXISTS entries_user_pokemon_month_historical_idx
  ON public.entries (user_id, pokemon_id, month_id, historical);

-- ─── approvals ──────────────────────────────────────────────────────────────
-- Currently only the PK exists. Pending-queue reads filter by historical +
-- month_id and sort by created_at.
CREATE INDEX IF NOT EXISTS approvals_historical_month_created_idx
  ON public.approvals (historical, month_id, created_at DESC);

-- Own-approvals-lookup path (user checking their pending queue).
CREATE INDEX IF NOT EXISTS approvals_user_month_pokemon_idx
  ON public.approvals (user_id, month_id, pokemon_id);

-- ─── approval_history ───────────────────────────────────────────────────────
-- Currently only the PK exists. History views filter by user_id + sort by
-- processed_at DESC.
CREATE INDEX IF NOT EXISTS approval_history_user_processed_idx
  ON public.approval_history (user_id, processed_at DESC);

-- 90-day retention sweep hits this predicate — will scan the whole table
-- without the index.
CREATE INDEX IF NOT EXISTS approval_history_purge_after_idx
  ON public.approval_history (purge_after);

-- ─── notifications ──────────────────────────────────────────────────────────
-- broadcastNotificationToasts in api/index.js:98-104 hits this exact predicate
-- on every submission. Currently the ONLY index is the PK.
-- Partial index keeps it small — most rows are notified=true and irrelevant.
CREATE INDEX IF NOT EXISTS notifications_user_unnotified_created_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE notified = false;

-- ─── bingo_achievements ─────────────────────────────────────────────────────
-- Leaderboard queries filter by user_id + month_id.
CREATE INDEX IF NOT EXISTS bingo_achievements_user_month_idx
  ON public.bingo_achievements (user_id, month_id);

-- Rollup queries need month-scoped enumeration.
CREATE INDEX IF NOT EXISTS bingo_achievements_month_achieved_idx
  ON public.bingo_achievements (month_id, achieved_at DESC);

-- ─── bingo_months ───────────────────────────────────────────────────────────
-- The three ranking RPCs (rank_users_by_month/season/year_points) filter
-- bingo_months by season_id and year_id.
CREATE INDEX IF NOT EXISTS bingo_months_season_idx
  ON public.bingo_months (season_id) WHERE season_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bingo_months_year_idx
  ON public.bingo_months (year_id) WHERE year_id IS NOT NULL;

-- Run ANALYZE on the affected tables so the planner sees the new indexes.
-- (VACUUM ANALYZE would also work; ANALYZE alone is enough to update stats.)
ANALYZE public.entries;
ANALYZE public.approvals;
ANALYZE public.approval_history;
ANALYZE public.notifications;
ANALYZE public.bingo_achievements;
ANALYZE public.bingo_months;
