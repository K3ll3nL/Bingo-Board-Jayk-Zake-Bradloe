-- Badge Backlog: each tier's card copy, written by mods alongside the art.
-- Publishing (POST /api/admin/backlog/:id/publish) copies these into
-- badges.description / badges.hint. Additive only.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.badge_proposal_tiers DROP COLUMN IF EXISTS description;
-- ALTER TABLE public.badge_proposal_tiers DROP COLUMN IF EXISTS hint;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.badge_proposal_tiers
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  ADD COLUMN IF NOT EXISTS hint        text NOT NULL DEFAULT '' CHECK (char_length(hint) <= 300);
