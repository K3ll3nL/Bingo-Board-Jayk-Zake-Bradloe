-- Point the monthly_active_badges trigger at the stable production domain.
--
-- Reason: audit plan phase 3, p0-03. The trigger currently calls a Vercel
-- preview-deploy URL that rotates on every config change. When it rotates,
-- monthly-active + account-age badge awards silently stop firing and nobody
-- notices for weeks (users just miss badges).
--
-- Not rotating the secret — its leak surface is trivial (endpoint only
-- triggers eligibility checks that would've fired anyway).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restore the old preview URL (do NOT — the preview URL is stale):
--   DROP TRIGGER IF EXISTS monthly_active_badges ON public.user_monthly_points;
--   CREATE TRIGGER monthly_active_badges AFTER INSERT ON public.user_monthly_points
--   FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request(
--     'https://bingo-board-jayk-zake-bradloe-gehw7uq0p-kellen-longs-projects.vercel.app/api/internal/monthly-active',
--     'POST',
--     '{"Content-type":"application/json","x-webhook-secret":"ogEw79lFobntU6hNQk82h73ha"}',
--     '{}',
--     '5000'
--   );
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP TRIGGER IF EXISTS monthly_active_badges ON public.user_monthly_points;

CREATE TRIGGER monthly_active_badges
AFTER INSERT ON public.user_monthly_points
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://www.pokeboard.net/api/internal/monthly-active',
  'POST',
  '{"Content-type":"application/json","x-webhook-secret":"ogEw79lFobntU6hNQk82h73ha"}',
  '{}',
  '5000'
);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: one row, action_statement contains 'www.pokeboard.net'.
SELECT trigger_name, event_manipulation, action_timing,
       CASE WHEN action_statement LIKE '%www.pokeboard.net%' THEN 'STABLE'
            WHEN action_statement LIKE '%preview%' OR action_statement LIKE '%-gehw7uq0p-%' THEN 'STALE — preview URL'
            ELSE 'unknown' END AS url_status
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'monthly_active_badges';
