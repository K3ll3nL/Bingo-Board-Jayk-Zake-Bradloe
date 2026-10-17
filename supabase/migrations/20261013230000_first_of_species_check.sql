-- New badge check_type: first_of_species_count (trigger 'approved').
--
-- Counts the (month, Pokémon) pairs where a hunter has that month's settled
-- first catch of that Pokémon. check_qualifier picks which catches compete:
--   'any' (or NULL) — every entry
--   'standard'      — non-restricted entries only
--   'restricted'    — restricted entries only
-- Maths: computeFirstOfSpecies in api/_badgeRegistry.js; loader in
-- api/_lib/badgeEval.js. "First" is timed by a new award_clocks rule,
-- first_of_species (default: submission), with the same settle rule as
-- first_of_month — an earlier upload still in the queue blocks the result.
--
-- Additive: both CHECK constraints are widened to a superset.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- (Only once no badge uses first_of_species_count.)
-- BEGIN;
-- DELETE FROM public.award_clocks WHERE rule = 'first_of_species';
-- ALTER TABLE public.award_clocks DROP CONSTRAINT award_clocks_rule_check;
-- ALTER TABLE public.award_clocks ADD CONSTRAINT award_clocks_rule_check
--   CHECK (rule IN ('first_of_month', 'bingo_first'));
-- ALTER TABLE public.badges DROP CONSTRAINT badges_check_type_check;
-- ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
--   'submission_count','approved_count','rejected_count','restricted_count','monthly_active_count',
--   'type_percentage','generation_percentage','collection_complete','bingo_achievement_count',
--   'date_award','account_age_months','approved_count_in_month','approved_count_in_season',
--   'approved_count_in_year','top_placement_month','top_placement_season','top_placement_year',
--   'first_approval_month']));
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_check_type_check;
ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
  'submission_count', 'approved_count', 'rejected_count', 'restricted_count', 'monthly_active_count',
  'type_percentage', 'generation_percentage', 'collection_complete', 'bingo_achievement_count',
  'date_award', 'account_age_months', 'approved_count_in_month', 'approved_count_in_season',
  'approved_count_in_year', 'top_placement_month', 'top_placement_season', 'top_placement_year',
  'first_approval_month', 'first_of_species_count']));

ALTER TABLE public.award_clocks DROP CONSTRAINT IF EXISTS award_clocks_rule_check;
ALTER TABLE public.award_clocks ADD CONSTRAINT award_clocks_rule_check
  CHECK (rule IN ('first_of_month', 'bingo_first', 'first_of_species'));

INSERT INTO public.award_clocks (rule, clock) VALUES ('first_of_species', 'submission')
ON CONFLICT (rule) DO NOTHING;

COMMIT;
