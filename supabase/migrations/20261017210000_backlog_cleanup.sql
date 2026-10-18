-- Backlog + collections cleanup (owner go-ahead 2026-10-17). DESTRUCTIVE.
--
-- 1. Threshold / tier-count voting is retired: the owner edits them directly
--    (PATCH /api/admin/backlog/:id/tiers/:tid { threshold }, PUT …/:id/tier-count).
--    Neither table ever held a row.
--      DROP badge_proposal_change_votes, badge_proposal_changes
-- 2. badge_proposals.existing_family: the Backlog only proposes new families;
--    nothing writes it and no row has a value.
-- 3. collection_game_filter: retired (compared a game key to entries.game's
--    label, so it never matched; 0 rows). recompute_user_stats LEFT JOINed it,
--    and plpgsql resolves tables at run time, so the function is redefined
--    WITHOUT the join first; otherwise every user_stats recompute would error.
--    With the table empty the join filtered nothing, so the output is identical.
--    Collection bonus games live in pokemon_master.collection_bonus.
--
-- ─── ROLLBACK (schema only; the dropped tables were empty) ────────────────────
-- Re-run the CREATE TABLE blocks for badge_proposal_changes / _change_votes from
-- 20261013200000_badge_backlog.sql, collection_game_filter from
-- 20260716033850_remote_schema.sql, `ALTER TABLE badge_proposals ADD COLUMN
-- existing_family text REFERENCES badge_families(id) ON DELETE SET NULL`, and the
-- recompute_user_stats body from 20260904000000_user_stats_bingo_rule_and_raw.sql.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_user_stats(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_type jsonb;
  v_gen  jsonb;
  v_coll jsonb;
  v_raw  jsonb;
BEGIN
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

  WITH ce AS (
    SELECT e.pokemon_id, pm.collection_ids
    FROM entries e JOIN pokemon_master pm ON pm.id = e.pokemon_id
    WHERE e.user_id = p_user_id
  ), expanded AS (
    SELECT unnest(ce.collection_ids) AS slug, ce.pokemon_id FROM ce
  )
  SELECT COALESCE(jsonb_object_agg(slug, n), '{}'::jsonb) INTO v_coll
  FROM (SELECT slug, COUNT(DISTINCT pokemon_id) AS n FROM expanded GROUP BY slug) s;

  SELECT COALESCE(jsonb_object_agg(bingo_type, n), '{}'::jsonb) INTO v_raw
  FROM (
    SELECT bingo_type, COUNT(*) AS n
    FROM bingo_achievements WHERE user_id = p_user_id GROUP BY bingo_type
  ) s;

  INSERT INTO user_stats AS us (
    user_id,
    total_submissions, total_approved, total_rejected, restricted_approved, active_months,
    total_entries,
    bingo_row, bingo_column, bingo_x, bingo_blackout,
    bingo_row_folded, bingo_column_folded, bingo_x_folded, bingo_blackout_folded,
    bingo_total, bingo_raw, type_approved, gen_approved, collections, recomputed_at
  )
  SELECT
    p_user_id,
    (SELECT COUNT(*) FROM notifications n WHERE n.user_id = p_user_id AND n.status = 'pending'),
    (SELECT COUNT(DISTINCT e.pokemon_id) FROM entries e WHERE e.user_id = p_user_id),
    (SELECT COUNT(*) FROM notifications n WHERE n.user_id = p_user_id AND n.status = 'rejected'),
    (SELECT COUNT(*) FROM entries e WHERE e.user_id = p_user_id AND e.restricted_submission),
    (SELECT COUNT(*) FROM user_monthly_points p WHERE p.user_id = p_user_id),
    (SELECT COUNT(*) FROM entries e WHERE e.user_id = p_user_id),
    -- DISTINCT (month_id, base_type): see 20260904000000 header note 1.
    (SELECT COUNT(DISTINCT (b.month_id, replace(b.bingo_type, '_restricted', '')))
       FROM bingo_achievements b
      WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'row'),
    (SELECT COUNT(DISTINCT (b.month_id, replace(b.bingo_type, '_restricted', '')))
       FROM bingo_achievements b
      WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'column'),
    (SELECT COUNT(DISTINCT (b.month_id, replace(b.bingo_type, '_restricted', '')))
       FROM bingo_achievements b
      WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'x'),
    (SELECT COUNT(DISTINCT (b.month_id, replace(b.bingo_type, '_restricted', '')))
       FROM bingo_achievements b
      WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'blackout'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'row'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'column'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'x'),
    (SELECT COUNT(*) FROM bingo_achievements b WHERE b.user_id = p_user_id AND replace(b.bingo_type, '_restricted', '') = 'blackout'),
    (SELECT COUNT(DISTINCT (b.month_id, replace(b.bingo_type, '_restricted', '')))
       FROM bingo_achievements b
      WHERE b.user_id = p_user_id
        AND replace(b.bingo_type, '_restricted', '') IN ('row', 'column', 'x', 'blackout')),
    v_raw, v_type, v_gen, v_coll, now()
  ON CONFLICT (user_id) DO UPDATE SET
    total_submissions     = EXCLUDED.total_submissions,
    total_approved        = EXCLUDED.total_approved,
    total_rejected        = EXCLUDED.total_rejected,
    restricted_approved   = EXCLUDED.restricted_approved,
    active_months         = EXCLUDED.active_months,
    total_entries         = EXCLUDED.total_entries,
    bingo_row             = EXCLUDED.bingo_row,
    bingo_column          = EXCLUDED.bingo_column,
    bingo_x               = EXCLUDED.bingo_x,
    bingo_blackout        = EXCLUDED.bingo_blackout,
    bingo_row_folded      = EXCLUDED.bingo_row_folded,
    bingo_column_folded   = EXCLUDED.bingo_column_folded,
    bingo_x_folded        = EXCLUDED.bingo_x_folded,
    bingo_blackout_folded = EXCLUDED.bingo_blackout_folded,
    bingo_total           = EXCLUDED.bingo_total,
    bingo_raw             = EXCLUDED.bingo_raw,
    type_approved         = EXCLUDED.type_approved,
    gen_approved          = EXCLUDED.gen_approved,
    collections           = EXCLUDED.collections,
    recomputed_at         = now();
END;
$fn$;

DROP TABLE IF EXISTS public.collection_game_filter;

DROP TABLE IF EXISTS public.badge_proposal_change_votes;
DROP TABLE IF EXISTS public.badge_proposal_changes;

ALTER TABLE public.badge_proposals DROP COLUMN IF EXISTS existing_family;

COMMIT;
