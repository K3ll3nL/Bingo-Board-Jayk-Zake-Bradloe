-- Collection "bonus" games.
--
-- pokemon_master.collection_bonus maps a collection slug to that member's bonus
-- games, next to the collection_ids it qualifies:
--   { "legendary_birds": ["firered_leafgreen", "lets_go"] }
-- A badge whose check_qualifier is '<slug>:bonus' (check_type collection_complete)
-- counts the % of a collection's bonus members the hunter caught in ANY of that
-- member's bonus games; members with no entry for the slug are not part of the
-- bonus tier at all. Plain '<slug>' badges are unaffected.
--
-- Values are game KEYS (ALLOWED_GAMES / pokemon_master.game_slugs), not the label
-- entries.game stores. The API validates keys and membership on write; a slug
-- no longer in collection_ids is ignored on read.
--
-- This file was rewritten in place (Kellen, 2026-10-17). Its first version used a
-- separate collection_bonus_games table with one game per member; if that ran,
-- its rows are carried into collection_bonus and the table is dropped. Re-run it
-- with: supabase migration repair --status reverted 20261017120000 && supabase db push
--
-- Supersedes collection_game_filter (compared a key to a label, never matched,
-- no rows). Left in place; dropping it is a separate migration.
--
-- Rollback:
--   ALTER TABLE public.pokemon_master DROP COLUMN IF EXISTS collection_bonus;
--   ALTER TABLE public.badge_proposal_tiers DROP COLUMN IF EXISTS bonus;
--   ALTER TABLE public.badge_proposal_tiers DROP COLUMN IF EXISTS is_secret;

BEGIN;

ALTER TABLE public.pokemon_master
  ADD COLUMN IF NOT EXISTS collection_bonus jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pokemon_master DROP CONSTRAINT IF EXISTS pokemon_master_collection_bonus_object;
ALTER TABLE public.pokemon_master ADD CONSTRAINT pokemon_master_collection_bonus_object
  CHECK (jsonb_typeof(collection_bonus) = 'object');

DO $$
BEGIN
  IF to_regclass('public.collection_bonus_games') IS NOT NULL THEN
    UPDATE public.pokemon_master pm
       SET collection_bonus = pm.collection_bonus || b.obj
      FROM (
        SELECT pokemon_id, jsonb_object_agg(slug, jsonb_build_array(game)) AS obj
          FROM public.collection_bonus_games
         GROUP BY pokemon_id
      ) b
     WHERE pm.id = b.pokemon_id;
    DROP TABLE public.collection_bonus_games;
  END IF;
END $$;

-- Backlog: a tier can be the family's bonus tier (published as '<slug>:bonus').
ALTER TABLE public.badge_proposal_tiers ADD COLUMN IF NOT EXISTS bonus boolean NOT NULL DEFAULT false;

-- Backlog: a tier can publish as a secret badge (badges.is_secret = true), e.g.
-- a hidden bonus tier on top of a Bronze/Silver/Gold family.
ALTER TABLE public.badge_proposal_tiers ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;

COMMIT;
