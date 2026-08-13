-- Aggregate per-month/per-user entry counts server-side instead of fetching
-- every non-historical entry row into the API on every /api/stats/month call.
-- Reason: stats.js pulled the entire `entries` table unfiltered just to build
-- Overview trend + Hunter Spotlight per-month/per-user tallies in JS. That scan
-- grows unbounded with total catches; this RPC returns one row per
-- (month, user, restricted flag) combo instead.

BEGIN;

CREATE OR REPLACE FUNCTION entries_monthly_user_counts()
RETURNS TABLE (
  month_id integer,
  user_id uuid,
  restricted_submission boolean,
  cnt bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT month_id, user_id, restricted_submission, COUNT(*) AS cnt
  FROM entries
  WHERE historical = false
  GROUP BY month_id, user_id, restricted_submission;
$$;

COMMIT;

-- ROLLBACK (copy into a follow-up migration if this needs undoing):
-- DROP FUNCTION IF EXISTS entries_monthly_user_counts();

-- Cache the full GET /api/stats/month response per closed month. A closed
-- month's entries are immutable (nothing edits/deletes an approved entries
-- row besides moderator_note, which no stats panel reads), so once computed
-- a month's stats never change — this table lets api/_routes/stats.js skip
-- the whole computation on every subsequent read of a past month.
--
-- payload is the entire response body EXCEPT the four viewer_* tier_list
-- fields (those are per-viewer and are recomputed fresh on every read, cache
-- hit or not — see buildViewerTierFields in stats.js). Storing the raw
-- response as JSONB (rather than per-stat columns) is deliberate: new Hunter
-- Spotlight categories, or any other future panel, just become new keys
-- inside the same payload with no migration required.

BEGIN;

CREATE TABLE IF NOT EXISTS month_stats_cache (
  month_id integer PRIMARY KEY REFERENCES bingo_months(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE month_stats_cache ENABLE ROW LEVEL SECURITY;

-- Matches the project-wide permissive-RLS pattern (CLAUDE.md): enforcement
-- lives in the API (only the stats route reads/writes this table), not RLS.
DROP POLICY IF EXISTS "month_stats_cache_all" ON month_stats_cache;
CREATE POLICY "month_stats_cache_all" ON month_stats_cache
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ROLLBACK (copy into a follow-up migration if this needs undoing):
-- DROP TABLE IF EXISTS month_stats_cache;
