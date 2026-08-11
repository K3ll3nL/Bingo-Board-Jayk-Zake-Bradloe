-- Rename the "Game Board" claim game to Shiny Jeopardy, and turn it from a
-- single global instance into a real lobby system: a shareable connection
-- code, a visibility flag, and a membership roster, so many games can run
-- concurrently instead of "creating a new one completes whatever's running."
--
-- Claiming a square moves from moderator-only to "any joined member of that
-- lobby"; creating/managing a lobby (reroll, lock, shuffle, start, end) stays
-- moderator-only for now. Starting additionally requires >=2 members — Shiny
-- Jeopardy is a Team/Multiplayer game, not a Solo one.
--
-- Table renames (game_boards/game_board_pool/game_board_claims already exist
-- in production from the original mod-only "Game Board" feature — this is an
-- ALTER TABLE ... RENAME, not a drop/recreate, so existing history survives):
--   game_boards        -> jeopardy_boards
--   game_board_pool    -> jeopardy_pool
--   game_board_claims  -> jeopardy_claims
--   (new) jeopardy_members
--
-- Reason: Shiny Games hub — Shiny Jeopardy lobbies & multiplayer (2026-08-09).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TABLE IF EXISTS public.jeopardy_members;
-- DROP INDEX IF EXISTS public.idx_jeopardy_boards_code;
-- ALTER TABLE public.jeopardy_boards
--   DROP CONSTRAINT IF EXISTS jeopardy_boards_visibility_check,
--   DROP COLUMN IF EXISTS visibility,
--   DROP COLUMN IF EXISTS code;
-- ALTER TABLE public.jeopardy_claims RENAME TO game_board_claims;
-- ALTER TABLE public.jeopardy_pool RENAME TO game_board_pool;
-- ALTER TABLE public.jeopardy_boards RENAME TO game_boards;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE IF EXISTS public.game_boards RENAME TO jeopardy_boards;
ALTER TABLE IF EXISTS public.game_board_pool RENAME TO jeopardy_pool;
ALTER TABLE IF EXISTS public.game_board_claims RENAME TO jeopardy_claims;

ALTER TABLE public.jeopardy_boards
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS columns INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.jeopardy_boards
  DROP CONSTRAINT IF EXISTS jeopardy_boards_visibility_check;
ALTER TABLE public.jeopardy_boards
  ADD CONSTRAINT jeopardy_boards_visibility_check CHECK (visibility IN ('public', 'private'));

-- Partial unique index (not a table-level UNIQUE) so historical rows with a
-- NULL code — every board created before this migration — never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jeopardy_boards_code
  ON public.jeopardy_boards (code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.jeopardy_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.jeopardy_boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_jeopardy_members_board_id
  ON public.jeopardy_members (board_id);

-- Permissive RLS — same convention as every other table. Ownership/auth is
-- enforced in Express via getAuthenticatedUserId(req), not at the DB layer.
ALTER TABLE public.jeopardy_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.jeopardy_members;
CREATE POLICY "public read" ON public.jeopardy_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "public write" ON public.jeopardy_members;
CREATE POLICY "public write" ON public.jeopardy_members FOR ALL USING (true) WITH CHECK (true);

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: jeopardy_boards/jeopardy_pool/jeopardy_claims exist (renamed from
-- game_boards/game_board_pool/game_board_claims), jeopardy_boards has
-- code/visibility, jeopardy_members exists with RLS.
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'jeopardy_%';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'jeopardy_boards' AND column_name IN ('code','visibility');
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'jeopardy_members';
-- SELECT policyname FROM pg_policies WHERE tablename = 'jeopardy_members';
