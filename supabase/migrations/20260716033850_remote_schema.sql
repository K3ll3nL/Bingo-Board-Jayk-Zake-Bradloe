


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_user_id UUID;
  v_pokemon_id INTEGER;
  v_month_id INTEGER;
  v_current_month_id INTEGER;
  v_proof_url TEXT;
  v_proof_url2 TEXT;
  v_moderator_name TEXT;
  v_moderator_note TEXT;
  v_points_awarded INTEGER := 1;
  v_bonus_points INTEGER := 0;
  v_new_achievements TEXT[] := ARRAY[]::TEXT[];
  v_board_state INTEGER[];
  v_achievement_id UUID;
  v_claimed_by_anyone TEXT[];
BEGIN
  -- Get moderator name
  SELECT moderator_name INTO v_moderator_name
  FROM twitch_ambassadors
  WHERE id = p_moderator_id;
  
  IF v_moderator_name IS NULL THEN
    v_moderator_name := 'Unknown Moderator';
  END IF;
  
  -- Get approval details
  SELECT user_id, pokemon_id, month_id, proof_url, proof_url2
  INTO v_user_id, v_pokemon_id, v_month_id, v_proof_url, v_proof_url2
  FROM approvals
  WHERE id = p_approval_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  
  -- Build moderator note
  v_moderator_note := 'Approved by ' || v_moderator_name;
  
  -- If it was a link submission (no proof_url2), include the link
  IF v_proof_url2 IS NULL AND v_proof_url IS NOT NULL THEN
    v_moderator_note := v_moderator_note || '. Link was ' || v_proof_url;
  END IF;
  
  -- Get current active month
  SELECT id INTO v_current_month_id
  FROM bingo_months
  WHERE CURRENT_DATE BETWEEN start_date AND end_date
  LIMIT 1;
  
  -- Create entry in entries table with moderator note
  INSERT INTO entries (user_id, month_id, pokemon_id, moderator_note)
  VALUES (v_user_id, v_current_month_id, v_pokemon_id, v_moderator_note);
  
  -- Delete the approval
  DELETE FROM approvals WHERE id = p_approval_id;
  
  -- Add acceptance notification
  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, 'accepted', v_pokemon_id, NULL, NULL);
  
  -- Increment user points (or create if doesn't exist)
  INSERT INTO user_monthly_points (user_id, month_id, points)
  VALUES (v_user_id, v_current_month_id, v_points_awarded)
  ON CONFLICT (user_id, month_id)
  DO UPDATE SET 
    points = user_monthly_points.points + v_points_awarded,
    last_updated = NOW();
  
  -- Get achievements already claimed by ANY user this month
  SELECT ARRAY_AGG(bingo_type)
  INTO v_claimed_by_anyone
  FROM bingo_achievements
  WHERE month_id = v_current_month_id;
  
  IF v_claimed_by_anyone IS NULL THEN
    v_claimed_by_anyone := ARRAY[]::TEXT[];
  END IF;
  
  -- Get user's current board state (which positions are checked)
  SELECT ARRAY_AGG(mpp.position)
  INTO v_board_state
  FROM monthly_pokemon_pool mpp
  INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
  WHERE mpp.month_id = v_current_month_id
    AND e.user_id = v_user_id
    AND e.month_id = v_current_month_id;
  
  -- Add position 13 (free space) to board state
  IF v_board_state IS NULL THEN
    v_board_state := ARRAY[13];
  ELSE
    v_board_state := ARRAY_APPEND(v_board_state, 13);
  END IF;
  
  -- Check for ROW achievement (only if not claimed by anyone yet)
  IF NOT 'row' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,2,3,4,5]) OR
       (v_board_state @> ARRAY[6,7,8,9,10]) OR
       (v_board_state @> ARRAY[11,12,13,14,15]) OR
       (v_board_state @> ARRAY[16,17,18,19,20]) OR
       (v_board_state @> ARRAY[21,22,23,24,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row');
      v_bonus_points := v_bonus_points + 3;
    END IF;
  END IF;
  
  -- Check for COLUMN achievement (only if not claimed by anyone yet)
  IF NOT 'column' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,6,11,16,21]) OR
       (v_board_state @> ARRAY[2,7,12,17,22]) OR
       (v_board_state @> ARRAY[3,8,13,18,23]) OR
       (v_board_state @> ARRAY[4,9,14,19,24]) OR
       (v_board_state @> ARRAY[5,10,15,20,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column');
      v_bonus_points := v_bonus_points + 3;
    END IF;
  END IF;
  
  -- Check for X achievement (only if not claimed by anyone yet)
  IF NOT 'x' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,7,13,19,25]) AND
       (v_board_state @> ARRAY[5,9,13,17,21]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x');
      v_bonus_points := v_bonus_points + 6;
    END IF;
  END IF;
  
  -- Check for BLACKOUT (only if not claimed by anyone yet)
  IF NOT 'blackout' = ANY(v_claimed_by_anyone) THEN
    IF ARRAY_LENGTH(v_board_state, 1) >= 25 THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout');
      v_bonus_points := v_bonus_points + 12;
    END IF;
  END IF;
  
  -- Add bonus points if any achievements earned
  IF v_bonus_points > 0 THEN
    UPDATE user_monthly_points
    SET points = points + v_bonus_points,
        last_updated = NOW()
    WHERE user_id = v_user_id AND month_id = v_current_month_id;
  END IF;
  
  -- Insert achievement records and notifications
  IF ARRAY_LENGTH(v_new_achievements, 1) > 0 THEN
    FOR i IN 1..ARRAY_LENGTH(v_new_achievements, 1) LOOP
      -- Insert into bingo_achievements
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type)
      VALUES (v_user_id, v_current_month_id, v_new_achievements[i])
      RETURNING id INTO v_achievement_id;
      
      -- Insert award notification
      INSERT INTO notifications (user_id, status, pokemon_id, award, message)
      VALUES (v_user_id, 'award', NULL, v_achievement_id, v_new_achievements[i]);
    END LOOP;
  END IF;
  
  -- Return summary
  RETURN JSON_BUILD_OBJECT(
    'success', TRUE,
    'points_awarded', v_points_awarded + v_bonus_points,
    'achievements', v_new_achievements
  );
END;
$$;


ALTER FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text" DEFAULT 'accepted'::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_user_id                UUID;
  v_pokemon_id             INTEGER;
  v_month_id               INTEGER;
  v_current_month_id       INTEGER;
  v_proof_url              TEXT;
  v_proof_url2             TEXT;
  v_moderator_name         TEXT;
  v_moderator_note         TEXT;
  v_points_awarded         INTEGER := 1;
  v_bonus_points           INTEGER := 0;
  v_new_achievements       TEXT[]  := ARRAY[]::TEXT[];
  v_board_state            INTEGER[];
  v_restricted_board_state INTEGER[];
  v_achievement_id         UUID;
  v_claimed_by_anyone      TEXT[];
  v_already_caught         BOOLEAN := FALSE;
  v_restricted             BOOLEAN;
BEGIN
  IF p_status NOT IN ('accepted', 'accepted_restricted', 'accepted_downgraded') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status;
  END IF;

  v_restricted := (p_status = 'accepted_restricted');

  -- Get moderator name
  SELECT moderator_name INTO v_moderator_name
  FROM moderators
  WHERE id = p_moderator_id;

  IF v_moderator_name IS NULL THEN
    v_moderator_name := 'Unknown Moderator';
  END IF;

  -- Get approval details
  SELECT user_id, pokemon_id, month_id, proof_url, proof_url2
  INTO v_user_id, v_pokemon_id, v_month_id, v_proof_url, v_proof_url2
  FROM approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  v_moderator_note := 'Approved by ' || v_moderator_name;
  IF v_proof_url2 IS NULL AND v_proof_url IS NOT NULL THEN
    v_moderator_note := v_moderator_note || '. Link was ' || v_proof_url;
  END IF;

  SELECT id INTO v_current_month_id
  FROM bingo_months
  WHERE CURRENT_DATE BETWEEN start_date AND end_date
  LIMIT 1;

  SELECT EXISTS(
    SELECT 1 FROM entries
    WHERE user_id   = v_user_id
      AND month_id  = v_current_month_id
      AND pokemon_id = v_pokemon_id
  ) INTO v_already_caught;

  -- Base points
  --   accepted:            1 pt
  --   accepted_restricted, new:     2 pts (1 base + 1 restricted bonus)
  --   accepted_restricted, repeat:  1 pt  (restricted bonus only)
  --   accepted_downgraded: 1 pt if new, 0 if already caught (no double-dip, no restricted bonus)
  IF v_restricted THEN
    v_points_awarded := CASE WHEN v_already_caught THEN 1 ELSE 2 END;
  ELSIF p_status = 'accepted_downgraded' THEN
    v_points_awarded := CASE WHEN v_already_caught THEN 0 ELSE 1 END;
  ELSE
    v_points_awarded := 1;
  END IF;

  -- Entry: downgraded submissions stored with restricted_submission = FALSE
  INSERT INTO entries (user_id, month_id, pokemon_id, moderator_note, restricted_submission)
  VALUES (v_user_id, v_current_month_id, v_pokemon_id, v_moderator_note, v_restricted);

  DELETE FROM approvals WHERE id = p_approval_id;

  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, p_status, v_pokemon_id, NULL, NULL);

  IF v_points_awarded > 0 THEN
    INSERT INTO user_monthly_points (user_id, month_id, points)
    VALUES (v_user_id, v_current_month_id, v_points_awarded)
    ON CONFLICT (user_id, month_id)
    DO UPDATE SET
      points       = user_monthly_points.points + v_points_awarded,
      last_updated = NOW();
  END IF;

  SELECT ARRAY_AGG(bingo_type)
  INTO v_claimed_by_anyone
  FROM bingo_achievements
  WHERE month_id = v_current_month_id;

  IF v_claimed_by_anyone IS NULL THEN
    v_claimed_by_anyone := ARRAY[]::TEXT[];
  END IF;

  -- Normal board state (all entries)
  SELECT ARRAY_AGG(DISTINCT mpp.position)
  INTO v_board_state
  FROM monthly_pokemon_pool mpp
  INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
  WHERE mpp.month_id = v_current_month_id
    AND e.user_id    = v_user_id
    AND e.month_id   = v_current_month_id;

  v_board_state := COALESCE(v_board_state, ARRAY[]::INTEGER[]);
  v_board_state := ARRAY_APPEND(v_board_state, 13);

  IF NOT 'row' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,2,3,4,5])     OR
       (v_board_state @> ARRAY[6,7,8,9,10])    OR
       (v_board_state @> ARRAY[11,12,13,14,15]) OR
       (v_board_state @> ARRAY[16,17,18,19,20]) OR
       (v_board_state @> ARRAY[21,22,23,24,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row');
      v_bonus_points := v_bonus_points + 3;
    END IF;
  END IF;

  IF NOT 'column' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,6,11,16,21]) OR
       (v_board_state @> ARRAY[2,7,12,17,22]) OR
       (v_board_state @> ARRAY[3,8,13,18,23]) OR
       (v_board_state @> ARRAY[4,9,14,19,24]) OR
       (v_board_state @> ARRAY[5,10,15,20,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column');
      v_bonus_points := v_bonus_points + 3;
    END IF;
  END IF;

  IF NOT 'x' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,7,13,19,25]) AND
       (v_board_state @> ARRAY[5,9,13,17,21]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x');
      v_bonus_points := v_bonus_points + 6;
    END IF;
  END IF;

  IF NOT 'blackout' = ANY(v_claimed_by_anyone) THEN
    IF ARRAY_LENGTH(v_board_state, 1) >= 25 THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout');
      v_bonus_points := v_bonus_points + 12;
    END IF;
  END IF;

  -- Restricted achievement checks (only for accepted_restricted)
  IF v_restricted THEN
    SELECT ARRAY_AGG(DISTINCT mpp.position)
    INTO v_restricted_board_state
    FROM monthly_pokemon_pool mpp
    INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
    WHERE mpp.month_id            = v_current_month_id
      AND e.user_id               = v_user_id
      AND e.month_id              = v_current_month_id
      AND e.restricted_submission = TRUE;

    v_restricted_board_state := COALESCE(v_restricted_board_state, ARRAY[]::INTEGER[]);
    v_restricted_board_state := ARRAY_APPEND(v_restricted_board_state, 13);

    IF NOT 'row_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,2,3,4,5])     OR
         (v_restricted_board_state @> ARRAY[6,7,8,9,10])    OR
         (v_restricted_board_state @> ARRAY[11,12,13,14,15]) OR
         (v_restricted_board_state @> ARRAY[16,17,18,19,20]) OR
         (v_restricted_board_state @> ARRAY[21,22,23,24,25]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row_restricted');
        v_bonus_points := v_bonus_points + 3;
      END IF;
    END IF;

    IF NOT 'column_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,6,11,16,21]) OR
         (v_restricted_board_state @> ARRAY[2,7,12,17,22]) OR
         (v_restricted_board_state @> ARRAY[3,8,13,18,23]) OR
         (v_restricted_board_state @> ARRAY[4,9,14,19,24]) OR
         (v_restricted_board_state @> ARRAY[5,10,15,20,25]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column_restricted');
        v_bonus_points := v_bonus_points + 3;
      END IF;
    END IF;

    IF NOT 'x_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,7,13,19,25]) AND
         (v_restricted_board_state @> ARRAY[5,9,13,17,21]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x_restricted');
        v_bonus_points := v_bonus_points + 6;
      END IF;
    END IF;

    IF NOT 'blackout_restricted' = ANY(v_claimed_by_anyone) THEN
      IF ARRAY_LENGTH(v_restricted_board_state, 1) >= 25 THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout_restricted');
        v_bonus_points := v_bonus_points + 12;
      END IF;
    END IF;
  END IF;

  IF v_bonus_points > 0 THEN
    UPDATE user_monthly_points
    SET points       = points + v_bonus_points,
        last_updated = NOW()
    WHERE user_id  = v_user_id
      AND month_id = v_current_month_id;
  END IF;

  IF ARRAY_LENGTH(v_new_achievements, 1) > 0 THEN
    FOR i IN 1..ARRAY_LENGTH(v_new_achievements, 1) LOOP
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type)
      VALUES (v_user_id, v_current_month_id, v_new_achievements[i])
      RETURNING id INTO v_achievement_id;

      INSERT INTO notifications (user_id, status, pokemon_id, award, message)
      VALUES (v_user_id, 'award', NULL, v_achievement_id, v_new_achievements[i]);
    END LOOP;
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'success',        TRUE,
    'points_awarded', v_points_awarded + v_bonus_points,
    'achievements',   v_new_achievements
  );
END;
$$;


ALTER FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text" DEFAULT 'accepted'::"text", "p_game" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_user_id                UUID;
  v_pokemon_id             INTEGER;
  v_month_id               INTEGER;
  v_proof_url              TEXT;
  v_proof_url2             TEXT;
  v_moderator_name         TEXT;
  v_moderator_note         TEXT;
  v_points_awarded         INTEGER := 1;
  v_bonus_points           INTEGER := 0;
  v_new_achievements       TEXT[]  := ARRAY[]::TEXT[];
  v_board_state            INTEGER[];
  v_restricted_board_state INTEGER[];
  v_achievement_id         UUID;
  v_claimed_by_anyone      TEXT[];
  v_already_caught         BOOLEAN := FALSE;
  v_restricted             BOOLEAN;
BEGIN
  IF p_status NOT IN ('accepted', 'accepted_restricted', 'accepted_downgraded', 'accepted_upgraded') THEN
    RAISE EXCEPTION 'Invalid approval status: %', p_status;
  END IF;

  v_restricted := (p_status = 'accepted_restricted' OR p_status = 'accepted_upgraded');

  -- Get moderator name
  SELECT moderator_name INTO v_moderator_name
  FROM moderators
  WHERE id = p_moderator_id;

  IF v_moderator_name IS NULL THEN
    v_moderator_name := 'Unknown Moderator';
  END IF;

  -- Get approval details
  SELECT user_id, pokemon_id, month_id, proof_url, proof_url2
  INTO v_user_id, v_pokemon_id, v_month_id, v_proof_url, v_proof_url2
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

  INSERT INTO entries (user_id, month_id, pokemon_id, moderator_note, restricted_submission, game)
  VALUES (v_user_id, v_month_id, v_pokemon_id, v_moderator_note, v_restricted, p_game);

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

  SELECT ARRAY_AGG(bingo_type)
  INTO v_claimed_by_anyone
  FROM bingo_achievements
  WHERE month_id = v_month_id;

  IF v_claimed_by_anyone IS NULL THEN
    v_claimed_by_anyone := ARRAY[]::TEXT[];
  END IF;

  SELECT ARRAY_AGG(DISTINCT mpp.position)
  INTO v_board_state
  FROM monthly_pokemon_pool mpp
  INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
  WHERE mpp.month_id = v_month_id
    AND e.user_id    = v_user_id
    AND e.month_id   = v_month_id;

  v_board_state := COALESCE(v_board_state, ARRAY[]::INTEGER[]);
  v_board_state := ARRAY_APPEND(v_board_state, 13);

  IF NOT 'row' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,2,3,4,5])     OR
       (v_board_state @> ARRAY[6,7,8,9,10])    OR
       (v_board_state @> ARRAY[11,12,13,14,15]) OR
       (v_board_state @> ARRAY[16,17,18,19,20]) OR
       (v_board_state @> ARRAY[21,22,23,24,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row');
      v_bonus_points := v_bonus_points + 2;
    END IF;
  END IF;

  IF NOT 'column' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,6,11,16,21]) OR
       (v_board_state @> ARRAY[2,7,12,17,22]) OR
       (v_board_state @> ARRAY[3,8,13,18,23]) OR
       (v_board_state @> ARRAY[4,9,14,19,24]) OR
       (v_board_state @> ARRAY[5,10,15,20,25]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column');
      v_bonus_points := v_bonus_points + 2;
    END IF;
  END IF;

  IF NOT 'x' = ANY(v_claimed_by_anyone) THEN
    IF (v_board_state @> ARRAY[1,7,13,19,25]) AND
       (v_board_state @> ARRAY[5,9,13,17,21]) THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x');
      v_bonus_points := v_bonus_points + 5;
    END IF;
  END IF;

  -- BLACKOUT (non-restricted): store 'blackout' for the community-first, guard on
  -- the same value so subsequent blackouts fall to 'personal_blackout'.
  IF NOT 'blackout' = ANY(v_claimed_by_anyone) THEN
    IF ARRAY_LENGTH(v_board_state, 1) >= 25 THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout');
      v_bonus_points := v_bonus_points + 15;
    END IF;
  ELSE
    IF ARRAY_LENGTH(v_board_state, 1) >= 25 THEN
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'personal_blackout');
      v_bonus_points := v_bonus_points + 10;
    END IF;
  END IF;

  IF v_restricted THEN
    SELECT ARRAY_AGG(DISTINCT mpp.position)
    INTO v_restricted_board_state
    FROM monthly_pokemon_pool mpp
    INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
    WHERE mpp.month_id            = v_month_id
      AND e.user_id               = v_user_id
      AND e.month_id              = v_month_id
      AND e.restricted_submission = TRUE;

    v_restricted_board_state := COALESCE(v_restricted_board_state, ARRAY[]::INTEGER[]);
    v_restricted_board_state := ARRAY_APPEND(v_restricted_board_state, 13);

    IF NOT 'row_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,2,3,4,5])     OR
         (v_restricted_board_state @> ARRAY[6,7,8,9,10])    OR
         (v_restricted_board_state @> ARRAY[11,12,13,14,15]) OR
         (v_restricted_board_state @> ARRAY[16,17,18,19,20]) OR
         (v_restricted_board_state @> ARRAY[21,22,23,24,25]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row_restricted');
        v_bonus_points := v_bonus_points + 2;
      END IF;
    END IF;

    IF NOT 'column_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,6,11,16,21]) OR
         (v_restricted_board_state @> ARRAY[2,7,12,17,22]) OR
         (v_restricted_board_state @> ARRAY[3,8,13,18,23]) OR
         (v_restricted_board_state @> ARRAY[4,9,14,19,24]) OR
         (v_restricted_board_state @> ARRAY[5,10,15,20,25]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column_restricted');
        v_bonus_points := v_bonus_points + 2;
      END IF;
    END IF;

    IF NOT 'x_restricted' = ANY(v_claimed_by_anyone) THEN
      IF (v_restricted_board_state @> ARRAY[1,7,13,19,25]) AND
         (v_restricted_board_state @> ARRAY[5,9,13,17,21]) THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x_restricted');
        v_bonus_points := v_bonus_points + 5;
      END IF;
    END IF;

    -- BLACKOUT (restricted): guard/store 'blackout_restricted'; the ELSE now checks
    -- v_restricted_board_state (was v_board_state — the original bug).
    IF NOT 'blackout_restricted' = ANY(v_claimed_by_anyone) THEN
      IF ARRAY_LENGTH(v_restricted_board_state, 1) >= 25 THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout_restricted');
        v_bonus_points := v_bonus_points + 15;
      END IF;
    ELSE
      IF ARRAY_LENGTH(v_restricted_board_state, 1) >= 25 THEN
        v_new_achievements := ARRAY_APPEND(v_new_achievements, 'personal_blackout_restricted');
        v_bonus_points := v_bonus_points + 10;
      END IF;
    END IF;
  END IF;

  IF v_bonus_points > 0 THEN
    UPDATE user_monthly_points
    SET points       = points + v_bonus_points,
        last_updated = NOW()
    WHERE user_id  = v_user_id
      AND month_id = v_month_id;
  END IF;

  IF ARRAY_LENGTH(v_new_achievements, 1) > 0 THEN
    FOR i IN 1..ARRAY_LENGTH(v_new_achievements, 1) LOOP
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type)
      VALUES (v_user_id, v_month_id, v_new_achievements[i])
      RETURNING id INTO v_achievement_id;

      INSERT INTO notifications (user_id, status, pokemon_id, award, message)
      VALUES (v_user_id, 'award', NULL, v_achievement_id, v_new_achievements[i]);
    END LOOP;
  END IF;

  RETURN JSON_BUILD_OBJECT(
    'success',        TRUE,
    'points_awarded', v_points_awarded + v_bonus_points,
    'achievements',   v_new_achievements
  );
END;
$$;


ALTER FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text", "p_game" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_and_update_bingos"("p_user_id" "uuid", "p_month_id" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_bingo_count INTEGER := 0;
  v_row INTEGER;
  v_col INTEGER;
  v_all_checked BOOLEAN;
BEGIN
  -- Check rows (5 rows, positions 1-5, 6-10, 11-15, 16-20, 21-25)
  FOR v_row IN 1..5 LOOP
    SELECT bool_and(e.id IS NOT NULL OR b.position = 13) INTO v_all_checked
    FROM user_bingo_boards b
    LEFT JOIN pokemon_entries e ON (
      e.user_id = b.user_id 
      AND e.month_id = b.month_id 
      AND e.position = b.position
    )
    WHERE b.user_id = p_user_id 
      AND b.month_id = p_month_id 
      AND b.position BETWEEN (v_row - 1) * 5 + 1 AND v_row * 5;
    
    IF v_all_checked THEN
      v_bingo_count := v_bingo_count + 1;
      
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
      VALUES (p_user_id, p_month_id, 'row', v_row)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Check columns (5 columns)
  FOR v_col IN 1..5 LOOP
    SELECT bool_and(e.id IS NOT NULL OR b.position = 13) INTO v_all_checked
    FROM user_bingo_boards b
    LEFT JOIN pokemon_entries e ON (
      e.user_id = b.user_id 
      AND e.month_id = b.month_id 
      AND e.position = b.position
    )
    WHERE b.user_id = p_user_id 
      AND b.month_id = p_month_id 
      AND b.position IN (v_col, v_col + 5, v_col + 10, v_col + 15, v_col + 20);
    
    IF v_all_checked THEN
      v_bingo_count := v_bingo_count + 1;
      
      INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
      VALUES (p_user_id, p_month_id, 'column', v_col)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  
  -- Check diagonal (top-left to bottom-right: 1, 7, 13, 19, 25)
  SELECT bool_and(e.id IS NOT NULL OR b.position = 13) INTO v_all_checked
  FROM user_bingo_boards b
  LEFT JOIN pokemon_entries e ON (
    e.user_id = b.user_id 
    AND e.month_id = b.month_id 
    AND e.position = b.position
  )
  WHERE b.user_id = p_user_id 
    AND b.month_id = p_month_id 
    AND b.position IN (1, 7, 13, 19, 25);
  
  IF v_all_checked THEN
    v_bingo_count := v_bingo_count + 1;
    
    INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
    VALUES (p_user_id, p_month_id, 'diagonal', 1)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Check diagonal (top-right to bottom-left: 5, 9, 13, 17, 21)
  SELECT bool_and(e.id IS NOT NULL OR b.position = 13) INTO v_all_checked
  FROM user_bingo_boards b
  LEFT JOIN pokemon_entries e ON (
    e.user_id = b.user_id 
    AND e.month_id = b.month_id 
    AND e.position = b.position
  )
  WHERE b.user_id = p_user_id 
    AND b.month_id = p_month_id 
    AND b.position IN (5, 9, 13, 17, 21);
  
  IF v_all_checked THEN
    v_bingo_count := v_bingo_count + 1;
    
    INSERT INTO bingo_achievements (user_id, month_id, bingo_type, bingo_index)
    VALUES (p_user_id, p_month_id, 'diagonal', 2)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Update points (e.g., 100 points per bingo)
  INSERT INTO user_monthly_points (user_id, month_id, points, bingos_completed)
  VALUES (p_user_id, p_month_id, v_bingo_count * 100, v_bingo_count)
  ON CONFLICT (user_id, month_id) 
  DO UPDATE SET 
    points = v_bingo_count * 100,
    bingos_completed = v_bingo_count,
    last_updated = NOW();
  
  RETURN v_bingo_count;
END;
$$;


ALTER FUNCTION "public"."check_and_update_bingos"("p_user_id" "uuid", "p_month_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_user_achievements"("p_user_id" "uuid", "p_month_id" integer) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_board_state INTEGER[];
  v_has_row BOOLEAN := FALSE;
  v_has_column BOOLEAN := FALSE;
  v_has_x BOOLEAN := FALSE;
  v_has_blackout BOOLEAN := FALSE;
  v_existing_achievements TEXT[];
  v_new_achievements TEXT[] := ARRAY[]::TEXT[];
  v_total_positions INTEGER;
BEGIN
  -- Get existing achievements for this user/month
  SELECT ARRAY_AGG(bingo_type)
  INTO v_existing_achievements
  FROM bingo_achievements
  WHERE user_id = p_user_id AND month_id = p_month_id;
  
  IF v_existing_achievements IS NULL THEN
    v_existing_achievements := ARRAY[]::TEXT[];
  END IF;
  
  -- Get user's current board state (which positions are checked)
  SELECT ARRAY_AGG(mpp.position)
  INTO v_board_state
  FROM monthly_pokemon_pool mpp
  INNER JOIN entries e ON e.pokemon_id = mpp.pokemon_id
  WHERE mpp.month_id = p_month_id
    AND e.user_id = p_user_id
    AND e.month_id = p_month_id;
  
  IF v_board_state IS NULL THEN
    v_board_state := ARRAY[]::INTEGER[];
  END IF;
  
  -- Add position 13 (free space) to board state
  v_board_state := ARRAY_APPEND(v_board_state, 13);
  
  v_total_positions := ARRAY_LENGTH(v_board_state, 1);
  
  -- Check for ROW achievements
  IF NOT 'row' = ANY(v_existing_achievements) THEN
    IF (v_board_state @> ARRAY[1,2,3,4,5]) OR
       (v_board_state @> ARRAY[6,7,8,9,10]) OR
       (v_board_state @> ARRAY[11,12,13,14,15]) OR
       (v_board_state @> ARRAY[16,17,18,19,20]) OR
       (v_board_state @> ARRAY[21,22,23,24,25]) THEN
      v_has_row := TRUE;
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'row');
    END IF;
  END IF;
  
  -- Check for COLUMN achievements
  IF NOT 'column' = ANY(v_existing_achievements) THEN
    IF (v_board_state @> ARRAY[1,6,11,16,21]) OR
       (v_board_state @> ARRAY[2,7,12,17,22]) OR
       (v_board_state @> ARRAY[3,8,13,18,23]) OR
       (v_board_state @> ARRAY[4,9,14,19,24]) OR
       (v_board_state @> ARRAY[5,10,15,20,25]) THEN
      v_has_column := TRUE;
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'column');
    END IF;
  END IF;
  
  -- Check for X achievement
  IF NOT 'x' = ANY(v_existing_achievements) THEN
    IF (v_board_state @> ARRAY[1,7,13,19,25]) AND
       (v_board_state @> ARRAY[5,9,13,17,21]) THEN
      v_has_x := TRUE;
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'x');
    END IF;
  END IF;
  
  -- Check for BLACKOUT (all 25 positions)
  IF NOT 'blackout' = ANY(v_existing_achievements) THEN
    IF v_total_positions >= 25 THEN
      v_has_blackout := TRUE;
      v_new_achievements := ARRAY_APPEND(v_new_achievements, 'blackout');
    END IF;
  END IF;
  
  RETURN JSON_BUILD_OBJECT(
    'user_id', p_user_id,
    'month_id', p_month_id,
    'board_state', v_board_state,
    'total_positions', v_total_positions,
    'existing_achievements', v_existing_achievements,
    'new_achievements', v_new_achievements,
    'would_earn', JSON_BUILD_OBJECT(
      'row', v_has_row,
      'column', v_has_column,
      'x', v_has_x,
      'blackout', v_has_blackout
    )
  );
END;
$$;


ALTER FUNCTION "public"."check_user_achievements"("p_user_id" "uuid", "p_month_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fan_out_award_broadcast"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if NEW.status = 'award' then
    insert into public.broadcast_notifications (user_id, award, winner_user_id)
    select id, NEW.award, NEW.user_id
    from public.users
    where id != NEW.user_id;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."fan_out_award_broadcast"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_user_board"("p_user_id" "uuid", "p_month_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_pokemon RECORD;
  v_position INTEGER := 1;
BEGIN
  -- Delete existing board if any
  DELETE FROM user_bingo_boards WHERE user_id = p_user_id AND month_id = p_month_id;
  
  -- Insert free space at position 13
  INSERT INTO user_bingo_boards (user_id, month_id, position, national_dex_id)
  VALUES (p_user_id, p_month_id, 13, NULL);
  
  -- Get 24 random Pokemon from the monthly pool and assign to positions
  FOR v_pokemon IN (
    SELECT national_dex_id 
    FROM monthly_pokemon_pool 
    WHERE month_id = p_month_id 
    ORDER BY RANDOM()
    LIMIT 24
  ) LOOP
    -- Skip position 13 (free space)
    IF v_position = 13 THEN
      v_position := v_position + 1;
    END IF;
    
    INSERT INTO user_bingo_boards (user_id, month_id, position, national_dex_id)
    VALUES (p_user_id, p_month_id, v_position, v_pokemon.national_dex_id);
    
    v_position := v_position + 1;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_user_board"("p_user_id" "uuid", "p_month_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_username TEXT;
  v_display_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Discord: custom_claims.global_name; Twitch: preferred_username; Google: name/email prefix
  v_username := COALESCE(
    NEW.raw_user_meta_data->'custom_claims'->>'global_name',
    NEW.raw_user_meta_data->>'preferred_username',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );
  v_avatar_url := NEW.raw_user_meta_data->>'avatar_url';

  INSERT INTO public.users (id, username, display_name, avatar_url, created_at)
  VALUES (NEW.id, v_username, v_display_name, v_avatar_url, NOW())
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_entry_by_position"("p_user_id" "uuid", "p_month_id" integer, "p_position" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.entries (user_id, month_id, pokemon_id)
  SELECT
    p_user_id,
    p_month_id,
    mpp.pokemon_id
  FROM public.monthly_pokemon_pool mpp
  WHERE mpp.month_id = p_month_id
    AND mpp.position = p_position;
END;
$$;


ALTER FUNCTION "public"."insert_entry_by_position"("p_user_id" "uuid", "p_month_id" integer, "p_position" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_approval_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO notifications (user_id, status, pokemon_id, award, message, notified)
  VALUES (NEW.user_id, 'pending', NEW.pokemon_id, NULL, NULL, true);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_approval_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rank_users_by_month_points"("p_month_id" integer, "p_max_rank" integer) RETURNS TABLE("user_id" "uuid", "rank" bigint)
    LANGUAGE "sql"
    AS $$
  SELECT user_id, rank FROM (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY points DESC, last_updated ASC) AS rank
    FROM user_monthly_points
    WHERE month_id = p_month_id
  ) ranked WHERE rank <= p_max_rank;
$$;


ALTER FUNCTION "public"."rank_users_by_month_points"("p_month_id" integer, "p_max_rank" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rank_users_by_season_points"("p_season_id" integer, "p_max_rank" integer) RETURNS TABLE("user_id" "uuid", "rank" bigint)
    LANGUAGE "sql"
    AS $$
  SELECT user_id, rank FROM (
    SELECT ump.user_id,
           ROW_NUMBER() OVER (ORDER BY SUM(ump.points) DESC, MIN(ump.last_updated) ASC) AS rank
    FROM user_monthly_points ump
    JOIN bingo_months m ON ump.month_id = m.id
    WHERE m.season_id = p_season_id
    GROUP BY ump.user_id
  ) ranked WHERE rank <= p_max_rank;
$$;


ALTER FUNCTION "public"."rank_users_by_season_points"("p_season_id" integer, "p_max_rank" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rank_users_by_year_points"("p_year_id" integer, "p_max_rank" integer) RETURNS TABLE("user_id" "uuid", "rank" bigint)
    LANGUAGE "sql"
    AS $$
  SELECT user_id, rank FROM (
    SELECT ump.user_id,
           ROW_NUMBER() OVER (ORDER BY SUM(ump.points) DESC, MIN(ump.last_updated) ASC) AS rank
    FROM user_monthly_points ump
    JOIN bingo_months m ON ump.month_id = m.id
    WHERE m.year_id = p_year_id
    GROUP BY ump.user_id
  ) ranked WHERE rank <= p_max_rank;
$$;


ALTER FUNCTION "public"."rank_users_by_year_points"("p_year_id" integer, "p_max_rank" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_user_id UUID;
  v_pokemon_id INTEGER;
BEGIN
  -- Get approval details
  SELECT user_id, pokemon_id
  INTO v_user_id, v_pokemon_id
  FROM approvals
  WHERE id = p_approval_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;
  
  -- Delete the approval
  DELETE FROM approvals WHERE id = p_approval_id;
  
  -- Add rejection notification
  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, 'rejected', v_pokemon_id, NULL, p_rejection_message);
  
  RETURN JSON_BUILD_OBJECT('success', TRUE);
END;
$$;


ALTER FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text", "p_status" "text" DEFAULT 'rejected'::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_user_id    UUID;
  v_pokemon_id INTEGER;
BEGIN
  IF p_status NOT IN ('rejected', 'rejected_restricted_ban') THEN
    RAISE EXCEPTION 'Invalid rejection status: %', p_status;
  END IF;

  SELECT user_id, pokemon_id
  INTO v_user_id, v_pokemon_id
  FROM approvals
  WHERE id = p_approval_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found';
  END IF;

  DELETE FROM approvals WHERE id = p_approval_id;

  -- TODO: if p_status = 'rejected_restricted_ban', apply restricted_banned flag to users table

  INSERT INTO notifications (user_id, status, pokemon_id, award, message)
  VALUES (v_user_id, p_status, v_pokemon_id, NULL, p_rejection_message);

  RETURN JSON_BUILD_OBJECT('success', TRUE);
END;
$$;


ALTER FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pokemon_types"("p_limit" integer DEFAULT NULL::integer, "p_force" boolean DEFAULT false) RETURNS TABLE("out_dex_id" integer, "out_name" "text", "out_type1" "text", "out_type2" "text", "out_gen" smallint, "out_status" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  poke         RECORD;
  poke_json    JSONB;
  species_json JSONB;
  t1           TEXT;
  t2           TEXT;
  gen_num      SMALLINT;
BEGIN
  FOR poke IN
    SELECT pm.id, pm.national_dex_id, pm.name
    FROM   pokemon_master pm
    WHERE  p_force OR (pm.type1 IS NULL OR pm.generation IS NULL)
    ORDER  BY pm.national_dex_id
    LIMIT  p_limit
  LOOP
    BEGIN
      -- Fetch types and generation in two calls (PokeAPI has no bulk endpoint)
      SELECT content::JSONB INTO poke_json
        FROM http_get('https://pokeapi.co/api/v2/pokemon/' || poke.national_dex_id);

      SELECT content::JSONB INTO species_json
        FROM http_get('https://pokeapi.co/api/v2/pokemon-species/' || poke.national_dex_id);

      -- Types: slot 1 = primary, slot 2 = secondary (may be absent)
      t1 := (
        SELECT elem -> 'type' ->> 'name'
        FROM   jsonb_array_elements(poke_json -> 'types') AS elem
        WHERE  (elem ->> 'slot')::INT = 1
        LIMIT  1
      );
      t2 := (
        SELECT elem -> 'type' ->> 'name'
        FROM   jsonb_array_elements(poke_json -> 'types') AS elem
        WHERE  (elem ->> 'slot')::INT = 2
        LIMIT  1
      );

      -- Generation: convert slug to integer
      gen_num := CASE species_json -> 'generation' ->> 'name'
        WHEN 'generation-i'    THEN 1
        WHEN 'generation-ii'   THEN 2
        WHEN 'generation-iii'  THEN 3
        WHEN 'generation-iv'   THEN 4
        WHEN 'generation-v'    THEN 5
        WHEN 'generation-vi'   THEN 6
        WHEN 'generation-vii'  THEN 7
        WHEN 'generation-viii' THEN 8
        WHEN 'generation-ix'   THEN 9
        ELSE NULL
      END;

      UPDATE pokemon_master
        SET type1      = t1,
            type2      = t2,
            generation = gen_num
        WHERE id = poke.id;

      out_dex_id := poke.national_dex_id;
      out_name   := poke.name;
      out_type1  := t1;
      out_type2  := t2;
      out_gen    := gen_num;
      out_status := 'ok';
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      out_dex_id := poke.national_dex_id;
      out_name   := poke.name;
      out_type1  := NULL;
      out_type2  := NULL;
      out_gen    := NULL;
      out_status := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."sync_pokemon_types"("p_limit" integer, "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_check_bingos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.is_checked = true AND (OLD.is_checked IS NULL OR OLD.is_checked = false) THEN
    PERFORM check_and_update_bingos(NEW.user_id, NEW.month_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_check_bingos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_with_min_entries_in_month"("p_month_id" integer, "p_min_count" integer) RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT user_id FROM entries
  WHERE month_id = p_month_id
  GROUP BY user_id HAVING COUNT(*) >= p_min_count;
$$;


ALTER FUNCTION "public"."users_with_min_entries_in_month"("p_month_id" integer, "p_min_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_with_min_entries_in_season"("p_season_id" smallint, "p_min_count" integer) RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT e.user_id FROM entries e
  JOIN bingo_months m ON e.month_id = m.id
  WHERE m.season_id = p_season_id
  GROUP BY e.user_id HAVING COUNT(*) >= p_min_count;
$$;


ALTER FUNCTION "public"."users_with_min_entries_in_season"("p_season_id" smallint, "p_min_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."users_with_min_entries_in_year"("p_year_id" smallint, "p_min_count" integer) RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT e.user_id FROM entries e
  JOIN bingo_months m ON e.month_id = m.id
  WHERE m.year_id = p_year_id
  GROUP BY e.user_id HAVING COUNT(*) >= p_min_count;
$$;


ALTER FUNCTION "public"."users_with_min_entries_in_year"("p_year_id" smallint, "p_min_count" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid",
    "status" "text" NOT NULL,
    "pokemon_id" integer,
    "award" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message" "text",
    "notified" boolean DEFAULT false
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


ALTER TABLE "public"."notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'default'::"text",
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "key_value" "text",
    CONSTRAINT "api_keys_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 50)))
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_history" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pokemon_id" integer NOT NULL,
    "month_id" integer,
    "game" "text",
    "historical" boolean DEFAULT false NOT NULL,
    "restricted_submission" boolean DEFAULT false NOT NULL,
    "proof_url" "text",
    "proof_url2" "text",
    "proof_link" "text"[],
    "status" "text" NOT NULL,
    "moderator_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "purge_after" timestamp with time zone DEFAULT ("now"() + '90 days'::interval) NOT NULL,
    "had_images" boolean DEFAULT false NOT NULL,
    "caught_in_game" "text",
    "proof_url3" "text",
    "proof_url4" "text",
    "extra_images" "text"[]
);


ALTER TABLE "public"."approval_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."approval_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."approval_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."approval_history_id_seq" OWNED BY "public"."approval_history"."id";



CREATE TABLE IF NOT EXISTS "public"."approvals" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "pokemon_id" integer,
    "month_id" integer,
    "proof_url" "text",
    "proof_url2" "text",
    "restricted_submission" boolean DEFAULT false NOT NULL,
    "proof_link" "text"[],
    "game" "text",
    "historical" boolean DEFAULT false NOT NULL,
    "caught_in_game" "text",
    "proof_url3" "text",
    "proof_url4" "text",
    "extra_images" "text"[],
    "note" "text"
);


ALTER TABLE "public"."approvals" OWNER TO "postgres";


ALTER TABLE "public"."approvals" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."apptovals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."badge_families" (
    "id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_sequential" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."badge_families" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."badges" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "image_url" "text" NOT NULL,
    "is_secret" boolean DEFAULT false NOT NULL,
    "hint" "text",
    "family" "text",
    "family_order" integer,
    "trigger" "text" NOT NULL,
    "trigger_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "key" "text",
    "check_type" "text" DEFAULT 'approved_count'::"text" NOT NULL,
    "check_value" numeric DEFAULT 1 NOT NULL,
    "check_qualifier" "text",
    "is_super_secret" boolean DEFAULT false NOT NULL,
    CONSTRAINT "badges_check_type_check" CHECK (("check_type" = ANY (ARRAY['submission_count'::"text", 'approved_count'::"text", 'rejected_count'::"text", 'restricted_count'::"text", 'monthly_active_count'::"text", 'type_percentage'::"text", 'generation_percentage'::"text", 'collection_complete'::"text", 'bingo_achievement_count'::"text", 'date_award'::"text", 'account_age_months'::"text", 'approved_count_in_month'::"text", 'approved_count_in_season'::"text", 'approved_count_in_year'::"text", 'top_placement_month'::"text", 'top_placement_season'::"text", 'top_placement_year'::"text", 'first_approval_month'::"text"]))),
    CONSTRAINT "badges_trigger_check" CHECK (("trigger" = ANY (ARRAY['submission'::"text", 'approved'::"text", 'rejected'::"text", 'monthly_active'::"text", 'period_end'::"text", 'bingo_achievement'::"text", 'date_award'::"text"])))
);


ALTER TABLE "public"."badges" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."badges_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."badges_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."badges_id_seq" OWNED BY "public"."badges"."id";



CREATE TABLE IF NOT EXISTS "public"."banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message" "text" NOT NULL,
    "link_url" "text",
    "link_label" "text",
    "image_url" "text",
    "starts_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bingo_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_id" integer NOT NULL,
    "bingo_type" "text" NOT NULL,
    "achieved_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bingo_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bingo_months" (
    "id" integer NOT NULL,
    "month_year" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "month_year_display" "text" NOT NULL,
    "season_id" smallint,
    "year_id" smallint
);


ALTER TABLE "public"."bingo_months" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."bingo_months_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."bingo_months_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."bingo_months_id_seq" OWNED BY "public"."bingo_months"."id";



CREATE TABLE IF NOT EXISTS "public"."board_builder_state" (
    "id" bigint NOT NULL,
    "month_id" integer NOT NULL,
    "locked_positions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_positions" CHECK (("jsonb_typeof"("locked_positions") = 'array'::"text"))
);


ALTER TABLE "public"."board_builder_state" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."board_builder_state_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."board_builder_state_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."board_builder_state_id_seq" OWNED BY "public"."board_builder_state"."id";



CREATE TABLE IF NOT EXISTS "public"."broadcast_notifications" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "award" "uuid" NOT NULL,
    "winner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."broadcast_notifications" OWNER TO "postgres";


ALTER TABLE "public"."broadcast_notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."broadcast_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."collection_game_filter" (
    "slug" "text" NOT NULL,
    "required_game" "text"
);


ALTER TABLE "public"."collection_game_filter" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_id" integer NOT NULL,
    "moderator_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pokemon_id" integer NOT NULL,
    "restricted_submission" boolean DEFAULT false NOT NULL,
    "game" "text",
    "historical" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'open'::"text",
    CONSTRAINT "feedback_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'reviewed'::"text", 'closed'::"text"]))),
    CONSTRAINT "feedback_type_check" CHECK (("type" = ANY (ARRAY['suggestion'::"text", 'bug'::"text"])))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_board_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "claimed_by" "uuid" NOT NULL,
    "claim_type" "text" DEFAULT 'standard'::"text" NOT NULL,
    "original_claimed_by" "uuid",
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_board_claims_claim_type_check" CHECK (("claim_type" = ANY (ARRAY['standard'::"text", 'shalpha'::"text"])))
);


ALTER TABLE "public"."game_board_claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_board_pool" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "pokemon_id" bigint NOT NULL,
    "locked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."game_board_pool" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game" "text" NOT NULL,
    "status" "text" DEFAULT 'building'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "board_mode" "text" DEFAULT 'standard'::"text" NOT NULL,
    "shalpha_double_points" boolean DEFAULT false NOT NULL,
    "row_points" "jsonb" DEFAULT '[1, 2, 3, 4, 5]'::"jsonb" NOT NULL,
    CONSTRAINT "game_boards_status_check" CHECK (("status" = ANY (ARRAY['building'::"text", 'active'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."game_boards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_locations_reference" (
    "id" integer NOT NULL,
    "game_slug" "text" NOT NULL,
    "location_slug" "text" NOT NULL,
    "location_name" "text" NOT NULL,
    "image_url" "text",
    "modifier" "jsonb",
    "flags" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."game_locations_reference" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."game_locations_reference_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."game_locations_reference_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."game_locations_reference_id_seq" OWNED BY "public"."game_locations_reference"."id";



CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slug" "text",
    "name" "text"
);


ALTER TABLE "public"."games" OWNER TO "postgres";


COMMENT ON TABLE "public"."games" IS 'table of games allowed to submit in';



ALTER TABLE "public"."games" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."games_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."moderators" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moderator_name" "text"
);


ALTER TABLE "public"."moderators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_pokemon_pool" (
    "id" integer NOT NULL,
    "month_id" integer NOT NULL,
    "position" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "pokemon_id" integer NOT NULL
);


ALTER TABLE "public"."monthly_pokemon_pool" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."monthly_pokemon_pool_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."monthly_pokemon_pool_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."monthly_pokemon_pool_id_seq" OWNED BY "public"."monthly_pokemon_pool"."id";



CREATE TABLE IF NOT EXISTS "public"."pokemon_master" (
    "id" integer NOT NULL,
    "national_dex_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "has_gender_difference" boolean DEFAULT false,
    "genderless" boolean DEFAULT false,
    "form_id" smallint DEFAULT '0'::smallint,
    "custom_gender_code" "text",
    "shiny_available" boolean DEFAULT true,
    "family_id" integer,
    "type1" "text",
    "type2" "text",
    "generation" real,
    "collection_ids" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "game_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "restricted_game_slugs" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "forms_count" smallint DEFAULT '1'::smallint NOT NULL,
    "has_major_gender_difference" boolean DEFAULT false NOT NULL,
    "game_locations" "jsonb" DEFAULT '{}'::"jsonb",
    "legendary" boolean DEFAULT false,
    "baby" boolean DEFAULT false,
    "ultra_beast" boolean DEFAULT false,
    "paradox" boolean DEFAULT false,
    "starter" boolean DEFAULT false,
    "fossil" boolean DEFAULT false,
    "regional_alt" boolean DEFAULT false,
    "pseudo_legendary" boolean DEFAULT false,
    "pla" boolean DEFAULT false
);


ALTER TABLE "public"."pokemon_master" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pokemon_master_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pokemon_master_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pokemon_master_id_seq" OWNED BY "public"."pokemon_master"."id";



CREATE TABLE IF NOT EXISTS "public"."radar_route_maps" (
    "route_id" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "tiles" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "chain_spot" "jsonb",
    "shiny_spot" "jsonb"
);


ALTER TABLE "public"."radar_route_maps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sandwich_cache" (
    "target" "text" NOT NULL,
    "results" "jsonb" NOT NULL,
    "result_count" integer DEFAULT 0 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"(),
    "cooccurrences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."sandwich_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_pro" (
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."site_pro" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."twitch_ambassadors" (
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "twitch_url" "text",
    "hex_code" "text"
);


ALTER TABLE "public"."twitch_ambassadors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_badges" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "badge_id" integer NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slot" smallint,
    "month_id" integer,
    "seen" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_badges" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_badges_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_badges_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_badges_id_seq" OWNED BY "public"."user_badges"."id";



CREATE TABLE IF NOT EXISTS "public"."user_monthly_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_id" integer NOT NULL,
    "points" integer DEFAULT 0,
    "last_updated" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_monthly_points" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text",
    "twitch_url" "text",
    "time_offset_days" integer DEFAULT 0,
    "restricted_strikes" smallint DEFAULT '0'::smallint NOT NULL,
    "tos_accepted_at" timestamp with time zone,
    "youtube_url" "text",
    "shinydex_url" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."approval_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."approval_history_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."badges" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."badges_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."bingo_months" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."bingo_months_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."board_builder_state" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."board_builder_state_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."game_locations_reference" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."game_locations_reference_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."monthly_pokemon_pool" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."monthly_pokemon_pool_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pokemon_master" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."pokemon_master_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_badges" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_badges_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_name_key" UNIQUE ("user_id", "name");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "apptovals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badge_families"
    ADD CONSTRAINT "badge_families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banners"
    ADD CONSTRAINT "banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bingo_achievements"
    ADD CONSTRAINT "bingo_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bingo_months"
    ADD CONSTRAINT "bingo_months_month_year_key" UNIQUE ("month_year");



ALTER TABLE ONLY "public"."bingo_months"
    ADD CONSTRAINT "bingo_months_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."board_builder_state"
    ADD CONSTRAINT "board_builder_state_month_id_key" UNIQUE ("month_id");



ALTER TABLE ONLY "public"."board_builder_state"
    ADD CONSTRAINT "board_builder_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_notifications"
    ADD CONSTRAINT "broadcast_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."collection_game_filter"
    ADD CONSTRAINT "collection_game_filter_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_board_claims"
    ADD CONSTRAINT "game_board_claims_board_id_position_key" UNIQUE ("board_id", "position");



ALTER TABLE ONLY "public"."game_board_claims"
    ADD CONSTRAINT "game_board_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_board_pool"
    ADD CONSTRAINT "game_board_pool_board_id_position_key" UNIQUE ("board_id", "position");



ALTER TABLE ONLY "public"."game_board_pool"
    ADD CONSTRAINT "game_board_pool_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_boards"
    ADD CONSTRAINT "game_boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."game_locations_reference"
    ADD CONSTRAINT "game_locations_reference_game_slug_location_slug_key" UNIQUE ("game_slug", "location_slug");



ALTER TABLE ONLY "public"."game_locations_reference"
    ADD CONSTRAINT "game_locations_reference_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_pokemon_pool"
    ADD CONSTRAINT "monthly_pokemon_pool_month_id_position_key" UNIQUE ("month_id", "position");



ALTER TABLE ONLY "public"."monthly_pokemon_pool"
    ADD CONSTRAINT "monthly_pokemon_pool_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pokemon_master"
    ADD CONSTRAINT "pokemon_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_route_maps"
    ADD CONSTRAINT "radar_route_maps_pkey" PRIMARY KEY ("route_id");



ALTER TABLE ONLY "public"."sandwich_cache"
    ADD CONSTRAINT "sandwich_cache_pkey" PRIMARY KEY ("target");



ALTER TABLE ONLY "public"."site_pro"
    ADD CONSTRAINT "site_pro_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."twitch_ambassadors"
    ADD CONSTRAINT "twitch_ambassadors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_monthly_points"
    ADD CONSTRAINT "user_monthly_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_monthly_points"
    ADD CONSTRAINT "user_monthly_points_user_id_month_id_key" UNIQUE ("user_id", "month_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



CREATE INDEX "broadcast_notifications_user_id_idx" ON "public"."broadcast_notifications" USING "btree" ("user_id");



CREATE INDEX "idx_board_builder_state_month_id" ON "public"."board_builder_state" USING "btree" ("month_id");



CREATE INDEX "idx_entries_user_month" ON "public"."entries" USING "btree" ("user_id", "month_id");



CREATE INDEX "idx_game_locations_reference_game_slug" ON "public"."game_locations_reference" USING "btree" ("game_slug");



CREATE INDEX "idx_monthly_pool_month" ON "public"."monthly_pokemon_pool" USING "btree" ("month_id");



CREATE INDEX "idx_pokemon_master_dex_id" ON "public"."pokemon_master" USING "btree" ("national_dex_id");



CREATE INDEX "idx_pokemon_master_display_name" ON "public"."pokemon_master" USING "btree" ("display_name");



CREATE INDEX "idx_user_badges_user" ON "public"."user_badges" USING "btree" ("user_id");



CREATE INDEX "idx_user_points_month" ON "public"."user_monthly_points" USING "btree" ("month_id");



CREATE UNIQUE INDEX "user_badges_unique_monthly_per_user" ON "public"."user_badges" USING "btree" ("user_id", "badge_id", "month_id") WHERE ("month_id" IS NOT NULL);



CREATE UNIQUE INDEX "user_badges_unique_monthly_winner" ON "public"."user_badges" USING "btree" ("badge_id", "month_id") WHERE ("month_id" IS NOT NULL);



CREATE UNIQUE INDEX "user_badges_unique_regular" ON "public"."user_badges" USING "btree" ("user_id", "badge_id") WHERE ("month_id" IS NULL);



CREATE OR REPLACE TRIGGER "monthly_active_badges" AFTER INSERT ON "public"."user_monthly_points" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://bingo-board-jayk-zake-bradloe-gehw7uq0p-kellen-longs-projects.vercel.app/api/internal/monthly-active', 'POST', '{"Content-type":"application/json","x-webhook-secret":"ogEw79lFobntU6hNQk82h73ha"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "on_award_notification_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."fan_out_award_broadcast"();



CREATE OR REPLACE TRIGGER "trg_notify_approval_insert" AFTER INSERT ON "public"."approvals" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_approval_insert"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "Notifications_award_fkey" FOREIGN KEY ("award") REFERENCES "public"."bingo_achievements"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "Notifications_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon_master"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "Notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id");



ALTER TABLE ONLY "public"."approval_history"
    ADD CONSTRAINT "approval_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "apptovals_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "apptovals_pokemon_id_fkey" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon_master"("id");



ALTER TABLE ONLY "public"."approvals"
    ADD CONSTRAINT "apptovals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."badges"
    ADD CONSTRAINT "badges_family_fkey" FOREIGN KEY ("family") REFERENCES "public"."badge_families"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bingo_achievements"
    ADD CONSTRAINT "bingo_achievements_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bingo_achievements"
    ADD CONSTRAINT "bingo_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."board_builder_state"
    ADD CONSTRAINT "board_builder_state_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_notifications"
    ADD CONSTRAINT "broadcast_notifications_award_fkey" FOREIGN KEY ("award") REFERENCES "public"."bingo_achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_notifications"
    ADD CONSTRAINT "broadcast_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_notifications"
    ADD CONSTRAINT "broadcast_notifications_winner_user_id_fkey" FOREIGN KEY ("winner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "fk_entries_pokemon" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon_master"("id");



ALTER TABLE ONLY "public"."monthly_pokemon_pool"
    ADD CONSTRAINT "fk_monthly_pokemon_pool_pokemon" FOREIGN KEY ("pokemon_id") REFERENCES "public"."pokemon_master"("id");



ALTER TABLE ONLY "public"."user_monthly_points"
    ADD CONSTRAINT "fk_user_monthly_points_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_board_claims"
    ADD CONSTRAINT "game_board_claims_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."game_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_board_pool"
    ADD CONSTRAINT "game_board_pool_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."game_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."monthly_pokemon_pool"
    ADD CONSTRAINT "monthly_pokemon_pool_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."radar_route_maps"
    ADD CONSTRAINT "radar_route_maps_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."site_pro"
    ADD CONSTRAINT "site_pro_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."twitch_ambassadors"
    ADD CONSTRAINT "twitch_ambassadors_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id");



ALTER TABLE ONLY "public"."user_badges"
    ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_monthly_points"
    ADD CONSTRAINT "user_monthly_points_month_id_fkey" FOREIGN KEY ("month_id") REFERENCES "public"."bingo_months"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_monthly_points"
    ADD CONSTRAINT "user_monthly_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow public read entries" ON "public"."entries" FOR SELECT USING (true);



CREATE POLICY "Anyone can view achievements" ON "public"."bingo_achievements" FOR SELECT USING (true);



CREATE POLICY "Anyone can view ambassadors" ON "public"."twitch_ambassadors" FOR SELECT USING (true);



CREATE POLICY "Anyone can view bingo months" ON "public"."bingo_months" FOR SELECT USING (true);



CREATE POLICY "Anyone can view entries" ON "public"."entries" FOR SELECT USING (true);



CREATE POLICY "Anyone can view points" ON "public"."user_monthly_points" FOR SELECT USING (true);



CREATE POLICY "Anyone can view pokemon" ON "public"."pokemon_master" FOR SELECT USING (true);



CREATE POLICY "Anyone can view pokemon pool" ON "public"."monthly_pokemon_pool" FOR SELECT USING (true);



CREATE POLICY "Anyone can view user profiles" ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "Moderators can view approvals" ON "public"."approvals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."twitch_ambassadors"
  WHERE ("twitch_ambassadors"."id" = "auth"."uid"()))));



CREATE POLICY "Public read bingo_achievements" ON "public"."bingo_achievements" FOR SELECT USING (true);



CREATE POLICY "Public read bingo_months" ON "public"."bingo_months" FOR SELECT USING (true);



CREATE POLICY "Public read monthly_pokemon_pool" ON "public"."monthly_pokemon_pool" FOR SELECT USING (true);



CREATE POLICY "Public read user_monthly_points" ON "public"."user_monthly_points" FOR SELECT USING (true);



CREATE POLICY "Public read users" ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "Users can create own feedback" ON "public"."feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create own keys" ON "public"."api_keys" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own broadcast notifications" ON "public"."broadcast_notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own keys" ON "public"."api_keys" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can submit own approvals" ON "public"."approvals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own broadcast notifications" ON "public"."broadcast_notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own keys" ON "public"."api_keys" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own monthly points" ON "public"."user_monthly_points" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own pro status" ON "public"."site_pro" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."badge_families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badge_families_public_read" ON "public"."badge_families" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "badges_public_read" ON "public"."badges" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bingo_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bingo_months" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."board_builder_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcast_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."collection_game_filter" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_board_claims" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_board_pool" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_boards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_locations_reference" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_pokemon_pool" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pokemon_master" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read" ON "public"."approval_history" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."banners" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."collection_game_filter" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."game_board_claims" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."game_board_pool" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."game_boards" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."radar_route_maps" FOR SELECT USING (true);



CREATE POLICY "public read" ON "public"."sandwich_cache" FOR SELECT USING (true);



ALTER TABLE "public"."radar_route_maps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sandwich_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."site_pro" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."twitch_ambassadors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_badges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_badges_public_read" ON "public"."user_badges" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."user_monthly_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text", "p_game" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text", "p_game" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_status" "text", "p_game" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_and_update_bingos"("p_user_id" "uuid", "p_month_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_and_update_bingos"("p_user_id" "uuid", "p_month_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_and_update_bingos"("p_user_id" "uuid", "p_month_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_user_achievements"("p_user_id" "uuid", "p_month_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_user_achievements"("p_user_id" "uuid", "p_month_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_user_achievements"("p_user_id" "uuid", "p_month_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."fan_out_award_broadcast"() TO "anon";
GRANT ALL ON FUNCTION "public"."fan_out_award_broadcast"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fan_out_award_broadcast"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_user_board"("p_user_id" "uuid", "p_month_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."generate_user_board"("p_user_id" "uuid", "p_month_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_user_board"("p_user_id" "uuid", "p_month_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_entry_by_position"("p_user_id" "uuid", "p_month_id" integer, "p_position" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_entry_by_position"("p_user_id" "uuid", "p_month_id" integer, "p_position" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_entry_by_position"("p_user_id" "uuid", "p_month_id" integer, "p_position" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_approval_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_approval_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_approval_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rank_users_by_month_points"("p_month_id" integer, "p_max_rank" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rank_users_by_month_points"("p_month_id" integer, "p_max_rank" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rank_users_by_month_points"("p_month_id" integer, "p_max_rank" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rank_users_by_season_points"("p_season_id" integer, "p_max_rank" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rank_users_by_season_points"("p_season_id" integer, "p_max_rank" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rank_users_by_season_points"("p_season_id" integer, "p_max_rank" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rank_users_by_year_points"("p_year_id" integer, "p_max_rank" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rank_users_by_year_points"("p_year_id" integer, "p_max_rank" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rank_users_by_year_points"("p_year_id" integer, "p_max_rank" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_submission"("p_approval_id" bigint, "p_moderator_id" "uuid", "p_rejection_message" "text", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_pokemon_types"("p_limit" integer, "p_force" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sync_pokemon_types"("p_limit" integer, "p_force" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_pokemon_types"("p_limit" integer, "p_force" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_check_bingos"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_check_bingos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_check_bingos"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_month"("p_month_id" integer, "p_min_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_month"("p_month_id" integer, "p_min_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_month"("p_month_id" integer, "p_min_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_season"("p_season_id" smallint, "p_min_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_season"("p_season_id" smallint, "p_min_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_season"("p_season_id" smallint, "p_min_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_year"("p_year_id" smallint, "p_min_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_year"("p_year_id" smallint, "p_min_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."users_with_min_entries_in_year"("p_year_id" smallint, "p_min_count" integer) TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."approval_history" TO "anon";
GRANT ALL ON TABLE "public"."approval_history" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."approval_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."approval_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."approval_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."approvals" TO "anon";
GRANT ALL ON TABLE "public"."approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."approvals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."apptovals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."apptovals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."apptovals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."badge_families" TO "anon";
GRANT ALL ON TABLE "public"."badge_families" TO "authenticated";
GRANT ALL ON TABLE "public"."badge_families" TO "service_role";



GRANT ALL ON TABLE "public"."badges" TO "anon";
GRANT ALL ON TABLE "public"."badges" TO "authenticated";
GRANT ALL ON TABLE "public"."badges" TO "service_role";



GRANT ALL ON SEQUENCE "public"."badges_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."badges_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."badges_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."banners" TO "anon";
GRANT ALL ON TABLE "public"."banners" TO "authenticated";
GRANT ALL ON TABLE "public"."banners" TO "service_role";



GRANT ALL ON TABLE "public"."bingo_achievements" TO "anon";
GRANT ALL ON TABLE "public"."bingo_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."bingo_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."bingo_months" TO "anon";
GRANT ALL ON TABLE "public"."bingo_months" TO "authenticated";
GRANT ALL ON TABLE "public"."bingo_months" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bingo_months_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bingo_months_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bingo_months_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."board_builder_state" TO "anon";
GRANT ALL ON TABLE "public"."board_builder_state" TO "authenticated";
GRANT ALL ON TABLE "public"."board_builder_state" TO "service_role";



GRANT ALL ON SEQUENCE "public"."board_builder_state_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."board_builder_state_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."board_builder_state_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_notifications" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."broadcast_notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."broadcast_notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."broadcast_notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."collection_game_filter" TO "anon";
GRANT ALL ON TABLE "public"."collection_game_filter" TO "authenticated";
GRANT ALL ON TABLE "public"."collection_game_filter" TO "service_role";



GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."game_board_claims" TO "anon";
GRANT ALL ON TABLE "public"."game_board_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."game_board_claims" TO "service_role";



GRANT ALL ON TABLE "public"."game_board_pool" TO "anon";
GRANT ALL ON TABLE "public"."game_board_pool" TO "authenticated";
GRANT ALL ON TABLE "public"."game_board_pool" TO "service_role";



GRANT ALL ON TABLE "public"."game_boards" TO "anon";
GRANT ALL ON TABLE "public"."game_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."game_boards" TO "service_role";



GRANT ALL ON TABLE "public"."game_locations_reference" TO "anon";
GRANT ALL ON TABLE "public"."game_locations_reference" TO "authenticated";
GRANT ALL ON TABLE "public"."game_locations_reference" TO "service_role";



GRANT ALL ON SEQUENCE "public"."game_locations_reference_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."game_locations_reference_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."game_locations_reference_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."games_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."moderators" TO "anon";
GRANT ALL ON TABLE "public"."moderators" TO "authenticated";
GRANT ALL ON TABLE "public"."moderators" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_pokemon_pool" TO "anon";
GRANT ALL ON TABLE "public"."monthly_pokemon_pool" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_pokemon_pool" TO "service_role";



GRANT ALL ON SEQUENCE "public"."monthly_pokemon_pool_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."monthly_pokemon_pool_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."monthly_pokemon_pool_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pokemon_master" TO "anon";
GRANT ALL ON TABLE "public"."pokemon_master" TO "authenticated";
GRANT ALL ON TABLE "public"."pokemon_master" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pokemon_master_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pokemon_master_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pokemon_master_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."radar_route_maps" TO "anon";
GRANT ALL ON TABLE "public"."radar_route_maps" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_route_maps" TO "service_role";



GRANT ALL ON TABLE "public"."sandwich_cache" TO "anon";
GRANT ALL ON TABLE "public"."sandwich_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."sandwich_cache" TO "service_role";



GRANT ALL ON TABLE "public"."site_pro" TO "anon";
GRANT ALL ON TABLE "public"."site_pro" TO "authenticated";
GRANT ALL ON TABLE "public"."site_pro" TO "service_role";



GRANT ALL ON TABLE "public"."twitch_ambassadors" TO "anon";
GRANT ALL ON TABLE "public"."twitch_ambassadors" TO "authenticated";
GRANT ALL ON TABLE "public"."twitch_ambassadors" TO "service_role";



GRANT ALL ON TABLE "public"."user_badges" TO "anon";
GRANT ALL ON TABLE "public"."user_badges" TO "authenticated";
GRANT ALL ON TABLE "public"."user_badges" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_badges_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_badges_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_badges_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_monthly_points" TO "anon";
GRANT ALL ON TABLE "public"."user_monthly_points" TO "authenticated";
GRANT ALL ON TABLE "public"."user_monthly_points" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







