-- Contract step for 20261101120000_board_tags.sql.
--
-- The nine per-tag booleans on pokemon_master were backfilled into
-- pokemon_master.board_tags (text[] of board_tags.slug) and have not been read
-- or written by the API, client or scripts since. Drop them.
--
-- Safety: first fold any boolean still set but missing from board_tags into the
-- array, so nothing is lost even if a row was edited outside the app after the
-- backfill. Only adds slugs that still exist in board_tags (a tag deleted
-- through delete_board_tag() stays deleted).
--
-- Not reversible from the data: rollback would re-add the columns empty and
-- re-derive them from board_tags.

BEGIN;

WITH old AS (
  SELECT id, array_remove(ARRAY[
    CASE WHEN legendary        THEN 'legendary'        END,
    CASE WHEN baby             THEN 'baby'             END,
    CASE WHEN ultra_beast      THEN 'ultra_beast'      END,
    CASE WHEN paradox          THEN 'paradox'          END,
    CASE WHEN starter          THEN 'starter'          END,
    CASE WHEN fossil           THEN 'fossil'           END,
    CASE WHEN regional_alt     THEN 'regional_alt'     END,
    CASE WHEN pseudo_legendary THEN 'pseudo_legendary' END,
    CASE WHEN pla              THEN 'pla'              END
  ]::text[], NULL) AS slugs
  FROM public.pokemon_master
),
missing AS (
  SELECT o.id, array_agg(s ORDER BY s) AS add_slugs
  FROM old o
  CROSS JOIN LATERAL unnest(o.slugs) AS s
  JOIN public.pokemon_master pm ON pm.id = o.id
  WHERE NOT (s = ANY(pm.board_tags))
    AND EXISTS (SELECT 1 FROM public.board_tags bt WHERE bt.slug = s)
  GROUP BY o.id
)
UPDATE public.pokemon_master pm
   SET board_tags = pm.board_tags || m.add_slugs
  FROM missing m
 WHERE pm.id = m.id;

ALTER TABLE public.pokemon_master
  DROP COLUMN IF EXISTS legendary,
  DROP COLUMN IF EXISTS baby,
  DROP COLUMN IF EXISTS ultra_beast,
  DROP COLUMN IF EXISTS paradox,
  DROP COLUMN IF EXISTS starter,
  DROP COLUMN IF EXISTS fossil,
  DROP COLUMN IF EXISTS regional_alt,
  DROP COLUMN IF EXISTS pseudo_legendary,
  DROP COLUMN IF EXISTS pla;

COMMENT ON COLUMN public.pokemon_master.board_tags IS
  'Board-balancing tags: slugs from board_tags. The only tag storage (booleans dropped 2026-11-01).';

COMMIT;
