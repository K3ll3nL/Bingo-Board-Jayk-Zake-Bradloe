-- Make approvals.user_id / pokemon_id / month_id NOT NULL.
--
-- Reason: audit plan phase 3, "Confirmed MEDIUM: approvals columns are
-- nullable when they shouldn't be". Every insert path in Express supplies
-- non-null values, but a bug or a direct-anon insert (before p0-02 landed)
-- could have produced a NULL row that then crashes the moderator queue with
-- an unrelated error.
--
-- Guarded delete first: any pre-existing NULL rows are inert (mod queue can't
-- display them anyway) — remove them so the ALTER can succeed.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.approvals
--   ALTER COLUMN user_id DROP NOT NULL,
--   ALTER COLUMN pokemon_id DROP NOT NULL,
--   ALTER COLUMN month_id DROP NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Defensive: strip any orphan rows created by pre-p0-02 anon INSERTs.
DELETE FROM public.approvals
WHERE user_id IS NULL OR pokemon_id IS NULL OR month_id IS NULL;

ALTER TABLE public.approvals
  ALTER COLUMN user_id    SET NOT NULL,
  ALTER COLUMN pokemon_id SET NOT NULL,
  ALTER COLUMN month_id   SET NOT NULL;

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: is_nullable = 'NO' for all three.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'approvals'
  AND column_name IN ('user_id','pokemon_id','month_id')
ORDER BY column_name;
