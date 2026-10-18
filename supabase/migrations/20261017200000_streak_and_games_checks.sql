-- Two new badge check_types:
--   month_streak  (trigger 'monthly_active') — longest run of consecutive months
--                 (bingo_months by start_date) with a user_monthly_points row.
--                 Maths: computeMonthStreak in api/_badgeRegistry.js.
--   games_count   (trigger 'approved') — distinct games with at least one approved
--                 entry. check_qualifier: 'any'/NULL, 'standard', 'restricted'.
--                 Entries with no game recorded don't count.
--
-- Additive: the constraint is widened to a superset.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- (Only once no badge uses month_streak or games_count.)
-- BEGIN;
-- ALTER TABLE public.badges DROP CONSTRAINT badges_check_type_check;
-- ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
--   'submission_count','approved_count','rejected_count','restricted_count','monthly_active_count',
--   'type_percentage','generation_percentage','collection_complete','bingo_achievement_count',
--   'date_award','account_age_months','approved_count_in_month','approved_count_in_season',
--   'approved_count_in_year','top_placement_month','top_placement_season','top_placement_year',
--   'first_approval_month','first_of_species_count']));
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_check_type_check;
ALTER TABLE public.badges ADD CONSTRAINT badges_check_type_check CHECK (check_type = ANY (ARRAY[
  'submission_count', 'approved_count', 'rejected_count', 'restricted_count', 'monthly_active_count',
  'type_percentage', 'generation_percentage', 'collection_complete', 'bingo_achievement_count',
  'date_award', 'account_age_months', 'approved_count_in_month', 'approved_count_in_season',
  'approved_count_in_year', 'top_placement_month', 'top_placement_season', 'top_placement_year',
  'first_approval_month', 'first_of_species_count', 'month_streak', 'games_count']));

COMMIT;
