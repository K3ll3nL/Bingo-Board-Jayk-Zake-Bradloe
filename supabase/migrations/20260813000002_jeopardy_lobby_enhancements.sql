-- Lobby-level enhancements found by reviewing Shiny Jeopardy end-to-end:
--   1. kicked_user_ids — a plain array column logging who got kicked from a
--      lobby, and the check for "is this user banned from this lobby" on
--      join/list/direct-code access. A lobby only ever accumulates a handful
--      of kicks, so a separate audit table would be overkill.
--   2. timed_minutes / ends_at — optional timed events. A lobby can auto-
--      finish a set number of minutes after the host starts it, instead of
--      running until manually ended.
--   3. jeopardy_history — since ending/discarding a lobby deletes the board
--      outright (see the 20260813 migrations above), a finished *active*
--      game now leaves a one-row summary behind (winner, points, game,
--      dates) instead of vanishing without a trace. Lobbies discarded while
--      still 'building' (nothing played) still leave nothing.
--
-- Reason: post-launch feature review (2026-08-13) — kick enforcement,
-- timed events, and win-state history.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TABLE IF EXISTS public.jeopardy_history;
-- ALTER TABLE public.jeopardy_boards
--   DROP COLUMN IF EXISTS kicked_user_ids,
--   DROP COLUMN IF EXISTS timed_minutes,
--   DROP COLUMN IF EXISTS ends_at;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.jeopardy_boards
  ADD COLUMN IF NOT EXISTS kicked_user_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS timed_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

ALTER TABLE public.jeopardy_boards
  DROP CONSTRAINT IF EXISTS jeopardy_boards_timed_minutes_check;
ALTER TABLE public.jeopardy_boards
  ADD CONSTRAINT jeopardy_boards_timed_minutes_check CHECK (timed_minutes IS NULL OR (timed_minutes > 0 AND timed_minutes <= 480));

CREATE TABLE IF NOT EXISTS public.jeopardy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  columns INTEGER NOT NULL,
  hosted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  winner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  winner_points INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  claim_count INTEGER NOT NULL DEFAULT 0,
  was_timed BOOLEAN NOT NULL DEFAULT false,
  timed_out BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jeopardy_history_winner ON public.jeopardy_history (winner_user_id);
CREATE INDEX IF NOT EXISTS idx_jeopardy_history_hosted_by ON public.jeopardy_history (hosted_by);

-- Permissive RLS — same convention as every other table.
ALTER TABLE public.jeopardy_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.jeopardy_history;
CREATE POLICY "public read" ON public.jeopardy_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON public.jeopardy_history;
CREATE POLICY "public write" ON public.jeopardy_history FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'jeopardy_boards' AND column_name IN ('kicked_user_ids','timed_minutes','ends_at');
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'jeopardy_history';
