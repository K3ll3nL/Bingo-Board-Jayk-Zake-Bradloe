-- Per-member edit permission for Shiny Jeopardy lobbies. Previously, tile
-- edits (reroll/swap/lock/shuffle) were gated purely on global moderator
-- status — any moderator could edit any lobby's board, even one they never
-- joined. Now editing is scoped to the lobby: the host can edit by default,
-- and can grant/revoke edit rights to individual joined players. Newly
-- joined players default to no edit access.
--
-- Reason: lobby-scoped edit permissions (2026-08-13).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TABLE public.jeopardy_members DROP COLUMN IF EXISTS can_edit;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.jeopardy_members
  ADD COLUMN IF NOT EXISTS can_edit BOOLEAN NOT NULL DEFAULT false;

-- Existing host rows should already be able to edit their own lobby.
UPDATE public.jeopardy_members SET can_edit = true WHERE role = 'host';

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'jeopardy_members' AND column_name = 'can_edit';
-- SELECT role, can_edit FROM public.jeopardy_members WHERE role = 'host';
