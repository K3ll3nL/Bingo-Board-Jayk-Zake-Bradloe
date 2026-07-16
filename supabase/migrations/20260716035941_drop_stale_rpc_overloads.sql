-- Drop stale approve_submission / reject_submission overloads.
-- Reason: audit plan phase 3, findings section — S3 / "Confirmed HIGH: RPC
-- overloading is fragile". Postgres picks the overload based on argument
-- names/count, so drift between caller and any of the older overloads would
-- silently pick the wrong function.
--
-- Audited callers (grep of api/ and client/ on 2026-07-16):
--   • api/index.js:3024 → approve_submission(p_approval_id, p_moderator_id, p_status, p_game)
--     Resolves to the 4-arg overload (only one with p_game).
--   • api/index.js:3226 → reject_submission(p_approval_id, p_moderator_id, p_rejection_message, p_status)
--     Resolves to the 4-arg overload (only one with p_status).
--
-- No other callers exist in the repo. The dropped overloads are dead code.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- If any external caller (dashboard SQL snippet, Postgres client, etc.) turns
-- out to depend on a dropped signature, recreate it via the definitions in the
-- baseline migration 20260716033850_remote_schema.sql (lines noted below).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- approve_submission — drop 2-arg and 3-arg, keep 4-arg
-- Baseline defs at 20260716033850_remote_schema.sql:26 and :199
DROP FUNCTION IF EXISTS public.approve_submission(bigint, uuid);
DROP FUNCTION IF EXISTS public.approve_submission(bigint, uuid, text);

-- reject_submission — drop 3-arg, keep 4-arg
-- Baseline def at 20260716033850_remote_schema.sql:1057
DROP FUNCTION IF EXISTS public.reject_submission(bigint, uuid, text);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: one row each for approve_submission and reject_submission,
-- both with 4 args.
SELECT p.proname AS name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('approve_submission','reject_submission')
ORDER BY name, args;
