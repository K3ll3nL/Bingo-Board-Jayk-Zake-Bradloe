-- user_stats — denormalized per-user badge/profile counters.
--
-- WHY THIS EXISTS
-- `/api/badges/progress` and `Profile.jsx` both re-derive the same aggregates on
-- every request, and the `approved` context builder pulls EVERY entry for the
-- user plus all ~1080 `pokemon_master` rows to do it. This table is the cached
-- answer so those paths become a single indexed row read.
--
-- WHY A SEPARATE TABLE, NOT COLUMNS ON `users`
--   1. `users` is on the hot path for leaderboard, profile and approvals. Widening
--      it with counters that churn on every approval adds write contention to
--      reads that never wanted the columns.
--   2. This is DERIVED data. Its own table makes it obviously safe to truncate and
--      rebuild -- which you will do -- rather than a scary operation on `users`.
--
-- WHY WHOLESALE RECOMPUTE INSTEAD OF DELTA INCREMENTS
-- The tempting design is `SET total_approved = total_approved + 1` in a trigger.
-- It is wrong here, for two concrete reasons:
--   * `total_approved` is COUNT(DISTINCT pokemon_id), not a row count. A second
--     catch of the same mon must NOT increment. A delta trigger would have to
--     run the existence check anyway.
--   * `collections` is game-filtered through `collection_game_filter`, so a delta
--     would have to reimplement that join in plpgsql and stay in sync with the
--     JS builder forever. That is a drift bug with a long fuse.
-- Recomputing one user's row from source is a handful of rows (median user has
-- well under 100 entries) and approvals are a low-frequency, human-paced event.
-- It buys exact agreement with the read path by construction: `recompute_user_stats`
-- IS the reconciler, so cache and truth cannot disagree.
--
-- SEMANTICS ARE MIRRORED FROM api/_badgeRegistry.js contextBuilders -- deliberately,
-- including the parts that look odd:
--   * total_approved      = COUNT(DISTINCT pokemon_id)   (builder: seenIds.size)
--   * restricted_approved = COUNT(*) rows                (NOT distinct)
--   * total_submissions   = notifications WHERE status='pending'
--   * total_rejected      = notifications WHERE status='rejected'
--   * active_months       = user_monthly_points row count
--   * historical entries ARE counted, because the builder counts them.
-- If you change a builder, change this function in the same commit.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_stats (
  user_id             uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,

  total_submissions   integer NOT NULL DEFAULT 0,
  total_approved      integer NOT NULL DEFAULT 0,
  total_rejected      integer NOT NULL DEFAULT 0,
  restricted_approved integer NOT NULL DEFAULT 0,
  active_months       integer NOT NULL DEFAULT 0,

  -- STRICT counts: exact bingo_type, no folding. `row_restricted` is the same
  -- physical line as the `row` it also satisfies, so folding double-counts it.
  -- This is the count the badge ladder means. See api/_routes/badges.js.
  bingo_row           integer NOT NULL DEFAULT 0,
  bingo_column        integer NOT NULL DEFAULT 0,
  bingo_x             integer NOT NULL DEFAULT 0,
  bingo_blackout      integer NOT NULL DEFAULT 0,

  -- FOLDED counts: `_restricted` collapsed into the base type. This is what the
  -- award engine currently uses. Both are stored so the two consumers can be
  -- reconciled deliberately rather than one silently changing under the other.
  bingo_row_folded      integer NOT NULL DEFAULT 0,
  bingo_column_folded   integer NOT NULL DEFAULT 0,
  bingo_x_folded        integer NOT NULL DEFAULT 0,
  bingo_blackout_folded integer NOT NULL DEFAULT 0,

  bingo_total         integer NOT NULL DEFAULT 0,

  -- Dimensional aggregates. JSONB rather than columns because these are ~18 /
  -- ~9 / ~40 keys and `collections` grows whenever a collection is added -- as
  -- columns that is an unbounded migration treadmill.
  type_approved       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { fire: 3, water: 2 }
  gen_approved        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "1": 45, "2": 12 }
  collections         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { weather_trio: 2 }

  recomputed_at       timestamptz NOT NULL DEFAULT now()
);

-- Permissive RLS to match every other table in this schema; auth is enforced in
-- the API via getAuthenticatedUserId(req). See CLAUDE.md "RLS Pattern".
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_stats_all ON public.user_stats;
CREATE POLICY user_stats_all ON public.user_stats USING (true) WITH CHECK (true);

GRANT SELECT ON public.user_stats TO anon, authenticated;
GRANT ALL    ON public.user_stats TO service_role;


-- ── The single source of truth for the cache ────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_user_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_type  jsonb;
  v_gen   jsonb;
  v_coll  jsonb;
BEGIN
  -- Type + generation are keyed on DISTINCT pokemon, matching the builder's
  -- `caughtMeta` (deduped by pokemon_id before tallying).
  WITH mons AS (
    SELECT DISTINCT e.pokemon_id FROM entries e WHERE e.user_id = p_user_id
  ), meta AS (
    SELECT pm.type1, pm.type2
    FROM pokemon_master pm JOIN mons m ON m.pokemon_id = pm.id
  ), t AS (
    SELECT type1 AS ty FROM meta WHERE type1 IS NOT NULL
    UNION ALL
    SELECT type2      FROM meta WHERE type2 IS NOT NULL
  )
  SELECT COALESCE(jsonb_object_agg(ty, n), '{}'::jsonb) INTO v_type
  FROM (SELECT ty, COUNT(*) AS n FROM t GROUP BY ty) s;

  WITH mons AS (
    SELECT DISTINCT e.pokemon_id FROM entries e WHERE e.user_id = p_user_id
  ), meta AS (
    SELECT pm.generation FROM pokemon_master pm JOIN mons m ON m.pokemon_id = pm.id
  )
  SELECT COALESCE(jsonb_object_agg(generation::text, n), '{}'::jsonb) INTO v_gen
  FROM (
    SELECT generation, COUNT(*) AS n FROM meta WHERE generation IS NOT NULL GROUP BY generation
  ) s;

  -- Collections use UNDEDUPED entries, because a game-filtered collection counts
  -- the same mon differently depending on which game it was caught in.
  WITH ce AS (
    SELECT e.pokemon_id, e.game, pm.collection_ids
    FROM entries e JOIN pokemon_master pm ON pm.id = e.pokemon_id
    WHERE e.user_id = p_user_id
  ), expanded AS (
    SELECT unnest(ce.collection_ids) AS slug, ce.pokemon_id, ce.game FROM ce
  ), filtered AS (
    SELECT ex.slug, ex.pokemon_id
    FROM expanded ex
    LEFT JOIN collection_game_filter f ON f.slug = ex.slug
    WHERE f.required_game IS NULL OR f.required_game = ex.game
  )
  SELECT COALESCE(jsonb_object_agg(slug, n), '{}'::jsonb) INTO v_coll
  FROM (SELECT slug, COUNT(DISTINCT pokemon_id) AS n FROM filtered GROUP BY slug) s;

  INSERT INTO user_stats AS us (
    user_id,
    total_submissions, total_approved, total_rejected, restricted_approved, active_months,
    bingo_row, bingo_column, bingo_x, bingo_blackout,
    bingo_row_folded, bingo_column_folded, bingo_x_folded, bingo_blackout_folded,
    bingo_total, type_approved, gen_approved, collections, recomputed_at
  )
  SELECT
    p_user_id,
    (SELECT COUNT(*) FROM notifications n WHERE n.user_id = p_user_id AND n.status = 'pending'),
    (SELECT COUNT(DISTINCT e.pokemon_id) FROM entries e WHERE e.user_id = p_user_id),
    (SELECT COUNT(*) FROM notifications n WHERE n.user_id = p_user_id AND n.status = 'rejected'),
    (SELECT COUNT(*) FROM entries e WHERE e.user_id = p_user_id AND e.restricted_submission),
    (SELECT COUNT(*) FROM user_monthly_points p WHERE p.user_id = p_user_id),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND b.bingo_type = 'row'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND b.bingo_type = 'column'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND b.bingo_type = 'x'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND b.bingo_type = 'blackout'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'row'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'column'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'x'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'blackout'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id),
    v_type, v_gen, v_coll, now()
  ON CONFLICT (user_id) DO UPDATE SET
    total_submissions     = EXCLUDED.total_submissions,
    total_approved        = EXCLUDED.total_approved,
    total_rejected        = EXCLUDED.total_rejected,
    restricted_approved   = EXCLUDED.restricted_approved,
    active_months         = EXCLUDED.active_months,
    bingo_row             = EXCLUDED.bingo_row,
    bingo_column          = EXCLUDED.bingo_column,
    bingo_x               = EXCLUDED.bingo_x,
    bingo_blackout        = EXCLUDED.bingo_blackout,
    bingo_row_folded      = EXCLUDED.bingo_row_folded,
    bingo_column_folded   = EXCLUDED.bingo_column_folded,
    bingo_x_folded        = EXCLUDED.bingo_x_folded,
    bingo_blackout_folded = EXCLUDED.bingo_blackout_folded,
    bingo_total           = EXCLUDED.bingo_total,
    type_approved         = EXCLUDED.type_approved,
    gen_approved          = EXCLUDED.gen_approved,
    collections           = EXCLUDED.collections,
    recomputed_at         = now();
END;
$fn$;

-- Guard: a user row must exist first (FK). Writes for a deleted user are a no-op
-- rather than an exception that would roll back the whole approval.
CREATE OR REPLACE FUNCTION public.tg_recompute_user_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg$
DECLARE
  v_user uuid;
BEGIN
  -- Branch on TG_OP rather than COALESCE(NEW.user_id, OLD.user_id): in PL/pgSQL,
  -- NEW is unassigned during DELETE and OLD is unassigned during INSERT, so
  -- touching the wrong one raises `record "new" is not assigned yet` instead of
  -- returning NULL. COALESCE does not save you -- the field access happens first.
  IF TG_OP = 'DELETE' THEN
    v_user := OLD.user_id;
  ELSE
    v_user := NEW.user_id;
  END IF;

  IF v_user IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = v_user) THEN
    PERFORM recompute_user_stats(v_user);
  END IF;

  -- An UPDATE that reassigns a row to a different user leaves the ORIGINAL owner
  -- overcounted. Rare, but silent, and the fix is one extra call.
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id
     AND OLD.user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
    PERFORM recompute_user_stats(OLD.user_id);
  END IF;

  RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$tg$;

-- ── Wire-up ─────────────────────────────────────────────────────────────────
-- Triggers on the TABLES, not inside approve_submission. The RPC's own INSERTs
-- fire these, and so does every other write path: historical submissions, admin
-- grants/revokes, awardAllBadges.js, moderator deletions, and manual SQL. Hooking
-- the RPC alone would have left all of those silently stale.

DROP TRIGGER IF EXISTS trg_user_stats_entries ON public.entries;
CREATE TRIGGER trg_user_stats_entries
AFTER INSERT OR UPDATE OR DELETE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_user_stats();

DROP TRIGGER IF EXISTS trg_user_stats_bingo ON public.bingo_achievements;
CREATE TRIGGER trg_user_stats_bingo
AFTER INSERT OR UPDATE OR DELETE ON public.bingo_achievements
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_user_stats();

DROP TRIGGER IF EXISTS trg_user_stats_points ON public.user_monthly_points;
CREATE TRIGGER trg_user_stats_points
AFTER INSERT OR DELETE ON public.user_monthly_points
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_user_stats();

-- Notifications are the highest-volume table here and most rows are irrelevant
-- ('accepted', 'award', 'badge_earned'). The WHEN clause keeps the recompute off
-- the path of every approval notification and every badge toast.
-- Split into two triggers, NOT one `AFTER INSERT OR DELETE ... WHEN
-- (COALESCE(NEW.status, OLD.status) ...)`. Postgres rejects that at CREATE time:
-- a WHEN clause may not reference NEW on a trigger that fires for DELETE, nor OLD
-- on one that fires for INSERT. Two triggers is the only way to filter both.
DROP TRIGGER IF EXISTS trg_user_stats_notifications ON public.notifications;
DROP TRIGGER IF EXISTS trg_user_stats_notifications_ins ON public.notifications;
CREATE TRIGGER trg_user_stats_notifications_ins
AFTER INSERT ON public.notifications
FOR EACH ROW
WHEN (NEW.status IN ('pending', 'rejected'))
EXECUTE FUNCTION public.tg_recompute_user_stats();

DROP TRIGGER IF EXISTS trg_user_stats_notifications_del ON public.notifications;
CREATE TRIGGER trg_user_stats_notifications_del
AFTER DELETE ON public.notifications
FOR EACH ROW
WHEN (OLD.status IN ('pending', 'rejected'))
EXECUTE FUNCTION public.tg_recompute_user_stats();

COMMIT;

-- Backfill runs OUTSIDE the transaction above so a slow pass cannot hold locks
-- on entries/notifications while moderators are approving.
SELECT public.recompute_user_stats(id) FROM public.users;
