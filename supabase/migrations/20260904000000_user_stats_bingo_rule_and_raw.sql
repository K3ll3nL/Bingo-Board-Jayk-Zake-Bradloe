-- user_stats, revision 2. Three changes, all additive or corrective:
--
-- 1. THE BINGO COLUMNS WERE COUNTED WRONG. Revision 1 stored exact-type counts
--    ("strict"). That undercounts: approve_submission awards the base type
--    community-first (`NOT 'row' = ANY(claimed_by_anyone)`), so a hunter who
--    completes a restricted line in a month where someone else already claimed
--    `row` receives ONLY `row_restricted`. Exact-type counting drops that line
--    entirely -- on production data one hunter lost 3 of 8 lines that way.
--    The correct rule, matching contextBuilders.bingo_achievement, is
--    COUNT(DISTINCT (month_id, base_type)): a same-month base/_restricted pair is
--    ONE physical line, while a lone `_restricted` still counts as one.
--    (The folded columns stay as they are -- they are what the old award engine
--    used, and keeping them makes the historical over-award auditable.)
--
-- 2. total_entries -- raw entries row count. Distinct from total_approved, which
--    is COUNT(DISTINCT pokemon_id). The profile page shows both: "shinies logged"
--    is the raw count, dex completion is the distinct one.
--
-- 3. bingo_raw -- exact bingo_type => raw count, every type including
--    personal_blackout and the _restricted variants. The profile renders that
--    full breakdown, which neither the distinct nor the folded columns can
--    reconstruct. Badge logic must NOT read this; it is display data.

BEGIN;

ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS total_entries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bingo_raw     jsonb   NOT NULL DEFAULT '{}'::jsonb;

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
    -- DISTINCT (month_id, base_type) -- see header note 1.
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
    -- bingo_total also becomes DISTINCT, to stay consistent with the columns.
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

COMMIT;

SELECT public.recompute_user_stats(id) FROM public.users;
