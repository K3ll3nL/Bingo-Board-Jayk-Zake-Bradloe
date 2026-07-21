-- Add tos_version_accepted column to users to support re-consent on T&C
-- changes. Existing users who accepted the original ToS (tos_accepted_at IS
-- NOT NULL) are backfilled to version 1. Users who never accepted stay NULL
-- so ConsentGate still prompts them as first-timers.
--
-- Current version constant lives in api/index.js (TOS_VERSION).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.users DROP COLUMN tos_version_accepted;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.users
  ADD COLUMN tos_version_accepted INT;

UPDATE public.users
   SET tos_version_accepted = 1
 WHERE tos_accepted_at IS NOT NULL;

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: every row with a tos_accepted_at has version = 1; rest are NULL.
SELECT
  COUNT(*) FILTER (WHERE tos_accepted_at IS NOT NULL AND tos_version_accepted = 1) AS backfilled,
  COUNT(*) FILTER (WHERE tos_accepted_at IS NULL AND tos_version_accepted IS NULL) AS never_accepted,
  COUNT(*) FILTER (WHERE tos_accepted_at IS NOT NULL AND tos_version_accepted IS DISTINCT FROM 1) AS mismatched
FROM public.users;
