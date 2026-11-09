-- New badge check_type:
--   hours_left_in_month (trigger 'approved') — an approved catch whose UPLOAD came
--                 with check_value hours or fewer left in its month.
--                 check_qualifier: 'any'/NULL, 'standard', 'restricted'.
--                 Maths: computeMinHoursLeft in api/_badgeRegistry.js.
--
-- Additive: the constraint is widened to a superset.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- (Only once no badge uses hours_left_in_month.)
-- BEGIN;
-- ALTER TABLE public.badges DROP CONSTRAINT badges_check_type_check;
-- ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
--   'submission_count','approved_count','rejected_count','restricted_count','monthly_active_count',
--   'type_percentage','generation_percentage','collection_complete','bingo_achievement_count',
--   'date_award','account_age_months','approved_count_in_month','approved_count_in_season',
--   'approved_count_in_year','top_placement_month','top_placement_season','top_placement_year',
--   'first_approval_month','first_of_species_count','month_streak','games_count']));
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_check_type_check;
ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
  'submission_count', 'approved_count', 'rejected_count', 'restricted_count', 'monthly_active_count',
  'type_percentage', 'generation_percentage', 'collection_complete', 'bingo_achievement_count',
  'date_award', 'account_age_months', 'approved_count_in_month', 'approved_count_in_season',
  'approved_count_in_year', 'top_placement_month', 'top_placement_season', 'top_placement_year',
  'first_approval_month', 'first_of_species_count', 'month_streak', 'games_count',
  'hours_left_in_month']));

COMMIT;
