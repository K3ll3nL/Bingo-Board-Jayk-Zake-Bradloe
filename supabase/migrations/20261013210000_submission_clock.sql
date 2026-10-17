-- Submission clock: "first" is decided by when a catch was SUBMITTED, not when a
-- mod got round to approving it.
--
-- Two rules use a clock, and both are now owner-configurable in `award_clocks`
-- (the Timing tab on /badge-upload):
--
--   first_of_month  the monthly "first catch" badge (check_type first_approval_month).
--                   Decided in the API: settleFirstOfMonth() in api/_lib/core.js,
--                   winner rule in api/_lib/badgeEval.js (firstOfMonthWinner).
--   bingo_first     the community-first row / column / X / blackout and its
--                   +2 / +2 / +5 / +15 bonus (and the +10 personal blackout).
--                   Decided here, by resolve_bingo_firsts().
--
-- Submission clock rules (the default for both):
--   * A catch's time is entries.submitted_at (= approvals.created_at, the upload
--     time). Entries approved before approval_history existed have no recorded
--     upload time and fall back to created_at (their approval time).
--   * A result is only SETTLED once no earlier-submitted catch for that month is
--     still pending. Until then nobody gets it; the approve or reject that clears
--     the last earlier submission settles it. That is why reject_submission now
--     resolves too.
-- Approval clock = the old behaviour: entries.created_at, settled immediately.
--
-- Bingos already awarded are never touched: a claimed type is skipped.
--
-- Additive. approve_submission / reject_submission are redefined with the same
-- signatures and the same JSON keys (plus `resolved`).
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Re-run the approve_submission / reject_submission bodies from
-- 20260716033850_remote_schema.sql (lines 435-668 and 1089-1121), then:
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.resolve_bingo_firsts(integer, boolean);
-- DROP TABLE IF EXISTS public.award_clocks;
-- ALTER TABLE public.entries DROP COLUMN IF EXISTS submitted_at;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. entries.submitted_at ─────────────────────────────────────────────────
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- Backfill from approval_history: same user + pokemon, an accepted status, and
-- processed within 10s of the entry row being written (the approve handler
-- writes both in one request). Verified 2026-10-13: matches all 554 accepted
-- history rows one-to-one; the 272 entries from before 2026-04-07 have no
-- history row and stay NULL.
WITH matched AS (
  SELECT DISTINCT ON (e.id) e.id, h.created_at AS submitted_at
  FROM public.entries e
  JOIN public.approval_history h
    ON  h.user_id    = e.user_id
    AND h.pokemon_id = e.pokemon_id
    AND h.status LIKE 'accepted%'
    AND abs(extract(epoch FROM (h.processed_at - e.created_at))) <= 10
  WHERE e.submitted_at IS NULL
  ORDER BY e.id, abs(extract(epoch FROM (h.processed_at - e.created_at)))
)
UPDATE public.entries e
SET submitted_at = matched.submitted_at
FROM matched
WHERE e.id = matched.id;

-- ── 2. award_clocks ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.award_clocks (
  rule       text PRIMARY KEY CHECK (rule IN ('first_of_month', 'bingo_first')),
  clock      text NOT NULL CHECK (clock IN ('submission', 'approval')),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.award_clocks (rule, clock) VALUES
  ('first_of_month', 'submission'),
  ('bingo_first',    'submission')
ON CONFLICT (rule) DO NOTHING;
-- RLS on, no policies: read and written only by the API (service role), like the
-- badge backlog tables. A permissive policy would let the anon key flip a clock.
ALTER TABLE public.award_clocks ENABLE ROW LEVEL SECURITY;

-- ── 3. resolve_bingo_firsts ─────────────────────────────────────────────────
-- Awards every community-first bingo in a month that is now settled, plus
-- personal blackouts. Idempotent: run it as often as you like. p_dry_run
-- reports what it would award without writing.
CREATE OR REPLACE FUNCTION public.resolve_bingo_firsts(p_month_id integer, p_dry_run boolean DEFAULT false)
RETURNS TABLE (awarded_user_id uuid, awarded_type text, awarded_bonus integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_clock    text;
  v_kind     text;
  v_restr    boolean;
  v_type     text;
  v_bonus    integer;
  v_holder   uuid;
  v_cand     record;
  v_personal record;
  v_ach_id   uuid;
BEGIN
  IF p_month_id IS NULL THEN RETURN; END IF;

  -- Serialise resolvers per month: two approvals committing together must not
  -- both see a type as unclaimed.
  PERFORM pg_advisory_xact_lock(hashtext('resolve_bingo_firsts'), p_month_id);

  SELECT clock INTO v_clock FROM award_clocks WHERE rule = 'bingo_first';
  v_clock := COALESCE(v_clock, 'submission');

  -- Per user, per shape kind, per board (standard / restricted): the moment the
  -- shape was first complete on that clock. Historical entries are not on the
  -- board (same rule as the home page and Month Stats). Free space 13 is never
  -- a pool position.
  CREATE TEMP TABLE IF NOT EXISTS _bingo_done (
    user_id uuid, kind text, restricted boolean, done_at timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _bingo_done;

  INSERT INTO _bingo_done (user_id, kind, restricted, done_at)
  WITH fills AS (
    SELECT e.user_id, mpp.position, b.restricted,
           MIN(CASE WHEN v_clock = 'approval' THEN e.created_at
                    ELSE COALESCE(e.submitted_at, e.created_at) END) AS t
    FROM entries e
    JOIN monthly_pokemon_pool mpp ON mpp.pokemon_id = e.pokemon_id AND mpp.month_id = p_month_id
    CROSS JOIN (VALUES (false), (true)) AS b(restricted)
    WHERE e.month_id = p_month_id
      AND NOT COALESCE(e.historical, false)
      AND (NOT b.restricted OR e.restricted_submission)
    GROUP BY e.user_id, mpp.position, b.restricted
  ),
  shapes(kind, cells) AS (
    VALUES
      ('row',      ARRAY[1,2,3,4,5]),     ('row',    ARRAY[6,7,8,9,10]),
      ('row',      ARRAY[11,12,14,15]),   ('row',    ARRAY[16,17,18,19,20]),
      ('row',      ARRAY[21,22,23,24,25]),
      ('column',   ARRAY[1,6,11,16,21]),  ('column', ARRAY[2,7,12,17,22]),
      ('column',   ARRAY[3,8,18,23]),     ('column', ARRAY[4,9,14,19,24]),
      ('column',   ARRAY[5,10,15,20,25]),
      ('x',        ARRAY[1,7,19,25,5,9,17,21]),
      ('blackout', ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25])
  ),
  per_shape AS (
    SELECT f.user_id, s.kind, f.restricted, MAX(f.t) AS done_at
    FROM shapes s
    JOIN fills f ON f.position = ANY(s.cells)
    GROUP BY f.user_id, s.kind, s.cells, f.restricted
    HAVING COUNT(*) = cardinality(s.cells)
  )
  SELECT user_id, kind, restricted, MIN(done_at)
  FROM per_shape
  GROUP BY user_id, kind, restricted;

  FOR v_kind, v_restr, v_bonus IN
    SELECT * FROM (VALUES ('row', false, 2), ('column', false, 2), ('x', false, 5), ('blackout', false, 15),
                          ('row', true, 2),  ('column', true, 2),  ('x', true, 5),  ('blackout', true, 15)) AS k(kind, restricted, bonus)
  LOOP
    v_type := v_kind || CASE WHEN v_restr THEN '_restricted' ELSE '' END;

    SELECT ba.user_id INTO v_holder
    FROM bingo_achievements ba
    WHERE ba.month_id = p_month_id AND ba.bingo_type = v_type
    ORDER BY ba.achieved_at
    LIMIT 1;

    IF v_holder IS NULL THEN
      -- Earliest completion; ties go to the lower user id so reruns agree.
      SELECT d.user_id, d.done_at INTO v_cand
      FROM _bingo_done d
      WHERE d.kind = v_kind AND d.restricted = v_restr
      ORDER BY d.done_at, d.user_id
      LIMIT 1;

      IF v_cand.user_id IS NULL THEN CONTINUE; END IF;

      -- Settled only when nothing submitted earlier is still waiting for a mod.
      IF v_clock = 'submission' AND EXISTS (
        SELECT 1 FROM approvals a
        WHERE a.month_id = p_month_id
          AND NOT COALESCE(a.historical, false)
          AND a.created_at < v_cand.done_at
      ) THEN
        CONTINUE;
      END IF;

      v_holder := v_cand.user_id;
      awarded_user_id := v_holder; awarded_type := v_type; awarded_bonus := v_bonus;
      RETURN NEXT;

      IF NOT p_dry_run THEN
        INSERT INTO bingo_achievements (user_id, month_id, bingo_type)
        VALUES (v_holder, p_month_id, v_type)
        RETURNING id INTO v_ach_id;
        INSERT INTO notifications (user_id, status, pokemon_id, award, message)
        VALUES (v_holder, 'award', NULL, v_ach_id, v_type);
        INSERT INTO user_monthly_points (user_id, month_id, points)
        VALUES (v_holder, p_month_id, v_bonus)
        ON CONFLICT (user_id, month_id) DO UPDATE
          SET points = user_monthly_points.points + v_bonus, last_updated = NOW();
      END IF;
    END IF;

    -- Personal blackout (+10): everyone else who has blacked out, once each,
    -- under the same settled rule.
    IF v_kind = 'blackout' THEN
      FOR v_personal IN
        SELECT d.user_id, d.done_at
        FROM _bingo_done d
        WHERE d.kind = 'blackout' AND d.restricted = v_restr
          AND d.user_id <> v_holder
          AND NOT EXISTS (
            SELECT 1 FROM bingo_achievements ba
            WHERE ba.month_id = p_month_id AND ba.user_id = d.user_id
              AND ba.bingo_type = 'personal_' || v_type)
          AND NOT (v_clock = 'submission' AND EXISTS (
            SELECT 1 FROM approvals a
            WHERE a.month_id = p_month_id
              AND NOT COALESCE(a.historical, false)
              AND a.created_at < d.done_at))
        ORDER BY d.done_at, d.user_id
      LOOP
        awarded_user_id := v_personal.user_id; awarded_type := 'personal_' || v_type; awarded_bonus := 10;
        RETURN NEXT;
        IF NOT p_dry_run THEN
          INSERT INTO bingo_achievements (user_id, month_id, bingo_type)
          VALUES (v_personal.user_id, p_month_id, 'personal_' || v_type)
          RETURNING id INTO v_ach_id;
          INSERT INTO notifications (user_id, status, pokemon_id, award, message)
          VALUES (v_personal.user_id, 'award', NULL, v_ach_id, 'personal_' || v_type);
          INSERT INTO user_monthly_points (user_id, month_id, points)
          VALUES (v_personal.user_id, p_month_id, 10)
          ON CONFLICT (user_id, month_id) DO UPDATE
            SET points = user_monthly_points.points + 10, last_updated = NOW();
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Server-only: PostgREST would otherwise expose it to the anon key.
REVOKE EXECUTE ON FUNCTION public.resolve_bingo_firsts(integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_bingo_firsts(integer, boolean) TO service_role;

-- ── 4. approve_submission ───────────────────────────────────────────────────
-- Same as 20260716033850_remote_schema.sql except:
--   * the entry records submitted_at (the approval row's created_at);
--   * the inline community-first block is replaced by resolve_bingo_firsts(),
--     which may award this user, someone else, or nobody yet;
--   * `achievements` / `points_awarded` cover only this user; `resolved` lists
--     every award the call made, so the API can toast other winners.
CREATE OR REPLACE FUNCTION public.approve_submission(p_approval_id bigint, p_moderator_id uuid, p_status text DEFAULT 'accepted'::text, p_game text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id          UUID;
  v_pokemon_id       INTEGER;
  v_month_id         INTEGER;
  v_proof_url        TEXT;
  v_proof_url2       TEXT;
  v_submitted_at     TIMESTAMPTZ;
  v_moderator_name   TEXT;
  v_moderator_note   TEXT;
  v_points_awarded   INTEGER := 1;
  v_bonus_points     INTEGER := 0;
  v_new_achievements TEXT[]  := ARRAY[]::TEXT[];
  v_resolved         JSON[]  := ARRAY[]::JSON[];
  v_already_caught   BOOLEAN := FALSE;
  v_restricted       BOOLEAN;
  r                  RECORD;
BEGIN
  IF p_status NOT IN ('accepted', 'accepted_restricted', 'accepted_downgraded', 'accepted_upgraded') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status;
  END IF;

  v_restricted := (p_status = 'accepted_restricted' OR p_status = 'accepted_upgraded');

  SELECT moderator_name INTO v_moderator_name
  FROM moderators
  WHERE id = p_moderator_id;

  IF v_moderator_name IS NULL THEN
    v_moderator_name := 'Unknown Moderator';
  END IF;

  SELECT user_id, pokemon_id, month_id, proof_url, proof_url2, created_at
  INTO v_user_id, v_pokemon_id, v_month_id, v_proof_url, v_proof_url2, v_submitted_at
  FROM approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  v_moderator_note := 'Approved by ' || v_moderator_name;
  IF v_proof_url2 IS NULL AND v_proof_url IS NOT NULL THEN
    v_moderator_note := v_moderator_note || '. Link was ' || v_proof_url;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM entries
    WHERE user_id    = v_user_id
      AND month_id   = v_month_id
      AND pokemon_id = v_pokemon_id
  ) INTO v_already_caught;

  IF v_restricted THEN
    v_points_awarded := CASE WHEN v_already_caught THEN 1 ELSE 2 END;
  ELSIF p_status = 'accepted_downgraded' THEN
    v_points_awarded := CASE WHEN v_already_caught THEN 0 ELSE 1 END;
  ELSE
    v_points_awarded := 1;
  END IF;

  INSERT INTO entries (user_id, month_id, pokemon_id, moderator_note, restricted_submission, game, submitted_at)
  VALUES (v_user_id, v_month_id, v_pokemon_id, v_moderator_note, v_restricted, p_game, v_submitted_at);

  DELETE FROM approvals WHERE id = p_approval_id;

  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, p_status, v_pokemon_id, NULL, NULL);

  IF v_points_awarded > 0 THEN
    INSERT INTO user_monthly_points (user_id, month_id, points)
    VALUES (v_user_id, v_month_id, v_points_awarded)
    ON CONFLICT (user_id, month_id)
    DO UPDATE SET
      points       = user_monthly_points.points + v_points_awarded,
      last_updated = NOW();
  END IF;

  -- Community-first bingos (and their bonus points) are awarded by the resolver.
  FOR r IN SELECT * FROM resolve_bingo_firsts(v_month_id) LOOP
    v_resolved := ARRAY_APPEND(v_resolved, JSON_BUILD_OBJECT('user_id', r.awarded_user_id, 'bingo_type', r.awarded_type, 'bonus', r.awarded_bonus));
    IF r.awarded_user_id = v_user_id THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, r.awarded_type);
      v_bonus_points     := v_bonus_points + r.awarded_bonus;
    END IF;
  END LOOP;

  RETURN JSON_BUILD_OBJECT(
    'success',        TRUE,
    'points_awarded', v_points_awarded + v_bonus_points,
    'achievements',   v_new_achievements,
    'resolved',       TO_JSON(v_resolved)
  );
END;
$$;

-- ── 5. reject_submission ────────────────────────────────────────────────────
-- Same as 20260716033850_remote_schema.sql plus a resolve: removing an earlier
-- pending submission can be what settles a bingo someone else already completed.
CREATE OR REPLACE FUNCTION public.reject_submission(p_approval_id bigint, p_moderator_id uuid, p_rejection_message text, p_status text DEFAULT 'rejected'::text)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id    UUID;
  v_pokemon_id INTEGER;
  v_month_id   INTEGER;
  v_resolved   JSON[] := ARRAY[]::JSON[];
  r            RECORD;
BEGIN
  IF p_status NOT IN ('rejected', 'rejected_restricted_ban') THEN
    RAISE EXCEPTION 'Invalid rejection status: %', p_status;
  END IF;

  SELECT user_id, pokemon_id, month_id
  INTO v_user_id, v_pokemon_id, v_month_id
  FROM approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  DELETE FROM approvals WHERE id = p_approval_id;

  -- TODO: if p_status = 'rejected_restricted_ban', apply restricted_banned flag to users table

  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, p_status, v_pokemon_id, NULL, p_rejection_message);

  FOR r IN SELECT * FROM resolve_bingo_firsts(v_month_id) LOOP
    v_resolved := ARRAY_APPEND(v_resolved, JSON_BUILD_OBJECT('user_id', r.awarded_user_id, 'bingo_type', r.awarded_type, 'bonus', r.awarded_bonus));
  END LOOP;

  RETURN JSON_BUILD_OBJECT('success', TRUE, 'resolved', TO_JSON(v_resolved));
END;
$$;

COMMIT;
