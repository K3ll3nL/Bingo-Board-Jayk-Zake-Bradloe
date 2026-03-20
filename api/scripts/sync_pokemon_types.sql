-- Syncs type1, type2, and generation for every row in pokemon_master
-- by calling the PokeAPI directly from Postgres via the http extension.
--
-- Prerequisites:
--   1. Enable the http extension in Supabase:
--      Dashboard → Database → Extensions → search "http" → enable
--   2. Run this entire script in the Supabase SQL editor.
--
-- Safe to re-run — skips rows that already have both type1 and generation set.
-- Use the FORCE variant at the bottom to overwrite existing values.
--
-- NOTE: http_get() is synchronous. For large tables this may be slow.
-- If it times out, call sync_pokemon_types() in smaller batches (see bottom).

-- ── 1. Add generation column if it doesn't exist ─────────────────────────────
ALTER TABLE public.pokemon_master
  ADD COLUMN IF NOT EXISTS generation smallint;

-- ── 2. Create the sync function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_pokemon_types(
  p_limit  INT     DEFAULT NULL,   -- max rows to process in one call (NULL = all)
  p_force  BOOLEAN DEFAULT FALSE   -- if true, overwrite existing values
)
RETURNS TABLE (
  out_dex_id   INT,
  out_name     TEXT,
  out_type1    TEXT,
  out_type2    TEXT,
  out_gen      SMALLINT,
  out_status   TEXT
)
LANGUAGE plpgsql
SET search_path = public, extensions
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

-- ── 3. Run it ─────────────────────────────────────────────────────────────────

-- Sync all missing rows:
SELECT * FROM sync_pokemon_types();

-- Or process in batches of 50 if the above times out — re-run until no rows return:
-- SELECT * FROM sync_pokemon_types(50);

-- Force-overwrite everything:
-- SELECT * FROM sync_pokemon_types(p_force => TRUE);
