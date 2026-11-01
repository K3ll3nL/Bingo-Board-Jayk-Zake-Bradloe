-- Board-balancing tags: ONE source of truth.
--
-- Before: nine boolean columns on pokemon_master (legendary, baby, ultra_beast,
-- paradox, starter, fossil, regional_alt, pseudo_legendary, pla), each one
-- hardcoded in ~8 places (core.js, boardBuilder.js, admin.js, the Game
-- Manager). Adding a tag meant a migration plus edits everywhere.
--
-- After:
--   board_tags                 -- the tag list (slug, label, order). Add/remove rows at will.
--   pokemon_master.board_tags  -- which tags each mon carries (text[] of slugs).
-- The board generator balances every tag in board_tags; the Game Manager's
-- Properties card edits both.
--
-- Separate from collection_ids on purpose: collections are badge sets and are
-- not touched here.
--
-- The nine booleans are left in place (backfilled from, no longer read or
-- written) and get dropped in a later contract migration once this has shipped.

BEGIN;

CREATE TABLE IF NOT EXISTS public.board_tags (
  slug          text PRIMARY KEY CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
  label         text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  display_order integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS on, no policies: only the API (service role) touches it, like the
-- badge backlog tables.
ALTER TABLE public.board_tags ENABLE ROW LEVEL SECURITY;

INSERT INTO public.board_tags (slug, label, display_order) VALUES
  ('legendary',        'Legendary',        1),
  ('baby',             'Baby',             2),
  ('ultra_beast',      'Ultra Beast',      3),
  ('paradox',          'Paradox',          4),
  ('starter',          'Starter',          5),
  ('fossil',           'Fossil',           6),
  ('regional_alt',     'Regional Variant', 7),
  ('pseudo_legendary', 'Pseudo-Legendary', 8),
  ('pla',              'PLA',              9)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.pokemon_master
  ADD COLUMN IF NOT EXISTS board_tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_pokemon_master_board_tags
  ON public.pokemon_master USING gin (board_tags);

-- Backfill from the booleans (only rows not already carrying tags, so a
-- re-run never clobbers edits made since).
UPDATE public.pokemon_master SET board_tags = array_remove(ARRAY[
  CASE WHEN legendary        THEN 'legendary'        END,
  CASE WHEN baby             THEN 'baby'             END,
  CASE WHEN ultra_beast      THEN 'ultra_beast'      END,
  CASE WHEN paradox          THEN 'paradox'          END,
  CASE WHEN starter          THEN 'starter'          END,
  CASE WHEN fossil           THEN 'fossil'           END,
  CASE WHEN regional_alt     THEN 'regional_alt'     END,
  CASE WHEN pseudo_legendary THEN 'pseudo_legendary' END,
  CASE WHEN pla              THEN 'pla'              END
]::text[], NULL)
WHERE board_tags = '{}';

-- Deleting a tag removes it from every mon in the same transaction.
CREATE OR REPLACE FUNCTION public.delete_board_tag(p_slug text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.pokemon_master
     SET board_tags = array_remove(board_tags, p_slug)
   WHERE p_slug = ANY(board_tags);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.board_tags WHERE slug = p_slug;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.delete_board_tag(text) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.pokemon_master.legendary        IS 'DEPRECATED 2026-11-01: use board_tags. Drop in a contract migration.';
COMMENT ON COLUMN public.pokemon_master.baby             IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.ultra_beast      IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.paradox          IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.starter          IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.fossil           IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.regional_alt     IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.pseudo_legendary IS 'DEPRECATED 2026-11-01: use board_tags.';
COMMENT ON COLUMN public.pokemon_master.pla              IS 'DEPRECATED 2026-11-01: use board_tags.';

COMMIT;
