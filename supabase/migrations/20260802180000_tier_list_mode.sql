-- Tier list: per-mode submissions (Standard / Restricted).
--
-- A user may now rank the board twice — once for Standard hunting and once for
-- Restricted. Restricted is completely optional: its absence is simply the
-- absence of a row, never an incomplete Standard list. Per the owner's decision
-- (docs/TIER_LIST_PLAN.md → "Owner decisions", Q1) BOTH modes rank all 24 board
-- mons, so "complete" means the same thing in either mode and the two lists stay
-- comparable mon-for-mon. The restricted pool is deliberately NOT subset by
-- pokemon_master.restricted_game_slugs.
--
-- Backfill: every pre-existing row predates Restricted ranking, so it is a
-- Standard list by definition. The column DEFAULT handles that; the explicit
-- UPDATE is belt-and-braces for rows written mid-deploy.
--
-- NOTE ON THE UNIQUE CONSTRAINT NAME: the original migration
-- (20260801173000_add_tier_list_submissions.sql) declared `UNIQUE (user_id,
-- month_id)` inline, so Postgres named it
-- `tier_list_submissions_user_id_month_id_key`. If the deployed name differs the
-- DROP below silently no-ops and the new UNIQUE will fail on duplicate rows —
-- run the first VERIFY query before applying.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- DELETE FROM public.tier_list_submissions WHERE mode <> 'standard';
-- DROP INDEX IF EXISTS public.idx_tier_list_submissions_month_mode;
-- ALTER TABLE public.tier_list_submissions
--   DROP CONSTRAINT IF EXISTS tier_list_submissions_mode_check,
--   DROP CONSTRAINT IF EXISTS tier_list_submissions_user_month_mode_key,
--   DROP COLUMN IF EXISTS mode;
-- ALTER TABLE public.tier_list_submissions
--   ADD CONSTRAINT tier_list_submissions_user_id_month_id_key UNIQUE (user_id, month_id);
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.tier_list_submissions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE public.tier_list_submissions
  DROP CONSTRAINT IF EXISTS tier_list_submissions_mode_check;
ALTER TABLE public.tier_list_submissions
  ADD CONSTRAINT tier_list_submissions_mode_check
  CHECK (mode IN ('standard', 'restricted'));

UPDATE public.tier_list_submissions SET mode = 'standard' WHERE mode IS NULL;

-- Swap the uniqueness key from (user, month) to (user, month, mode).
ALTER TABLE public.tier_list_submissions
  DROP CONSTRAINT IF EXISTS tier_list_submissions_user_id_month_id_key;
ALTER TABLE public.tier_list_submissions
  DROP CONSTRAINT IF EXISTS tier_list_submissions_user_month_mode_key;
ALTER TABLE public.tier_list_submissions
  ADD CONSTRAINT tier_list_submissions_user_month_mode_key
  UNIQUE (user_id, month_id, mode);

CREATE INDEX IF NOT EXISTS idx_tier_list_submissions_month_mode
  ON public.tier_list_submissions (month_id, mode);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Run the first query BEFORE applying to confirm the legacy constraint name:
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.tier_list_submissions'::regclass AND contype = 'u';
--
-- After applying — expected: every legacy row mode='standard', no duplicates.
-- SELECT mode, count(*) FROM public.tier_list_submissions GROUP BY mode;
-- SELECT user_id, month_id, mode, count(*) FROM public.tier_list_submissions
--   GROUP BY 1,2,3 HAVING count(*) > 1;
