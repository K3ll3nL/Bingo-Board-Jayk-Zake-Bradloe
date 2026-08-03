-- Add tier_list_submissions table backing the Community Tier List feature.
-- One row per (user_id, month_id); `tiers` is a JSONB map of
-- { "<pokemon_id>": "easy" | "medium" | "hard" | "super_hard" | "sleeper" }.
-- Pokemon absent from the map are "Unranked" — never store an explicit
-- "unranked" value. Tier codes are validated in Express (VALID_TIER_CODES in
-- api/index.js), not via a Postgres CHECK constraint, since they live inside
-- a JSONB value rather than a dedicated column.
-- Reason: gan-harness/spec.md — Month Stats + Community Tier List + Home Rework
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.tier_list_submissions;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.tier_list_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month_id INTEGER NOT NULL REFERENCES public.bingo_months(id) ON DELETE CASCADE,
  tiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_id)
);

CREATE INDEX IF NOT EXISTS idx_tier_list_submissions_month_id
  ON public.tier_list_submissions (month_id);

-- Permissive RLS — same convention as every other table. Ownership/auth is
-- enforced in Express via getAuthenticatedUserId(req), not at the DB layer.
ALTER TABLE public.tier_list_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.tier_list_submissions;
CREATE POLICY "public read" ON public.tier_list_submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON public.tier_list_submissions;
CREATE POLICY "public write" ON public.tier_list_submissions FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: table exists, RLS enabled, both policies present.
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'tier_list_submissions';
-- SELECT policyname FROM pg_policies WHERE tablename = 'tier_list_submissions';
