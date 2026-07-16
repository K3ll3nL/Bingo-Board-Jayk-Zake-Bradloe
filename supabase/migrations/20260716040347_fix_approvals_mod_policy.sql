-- Fix the moderator-visibility RLS policy on approvals.
-- Reason: audit plan phase 3, "T1: naming inconsistencies" — the policy
-- currently checks membership in `twitch_ambassadors`, but the API's mod check
-- uses `moderators`. These are two different tables tracking different roles.
-- Twitch ambassadors are streamers featured on the leaderboard; moderators are
-- the ones who approve/reject submissions. A moderator who isn't an ambassador
-- can currently NOT read approvals via anon-key SELECT.
--
-- The API bypasses RLS via service_role, so nothing user-visible breaks today.
-- Fixing it now so future direct-client mod tooling (if any) works right.

BEGIN;

DROP POLICY IF EXISTS "Moderators can view approvals" ON public.approvals;

CREATE POLICY "Moderators can view approvals" ON public.approvals
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.moderators
    WHERE moderators.id = auth.uid()
  ));

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: one row, qual references "moderators" (not "twitch_ambassadors").
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'approvals'
  AND policyname = 'Moderators can view approvals';
