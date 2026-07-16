-- Convert bingo_months.end_date from DATE to TIMESTAMPTZ.
--
-- Reason: audit plan phase 3, S9 — end_date as bare DATE (silently coerced to
-- midnight UTC by Postgres) forced a -4h band-aid in api/index.js
-- getActiveMonth() so months wouldn't expire before their nominal last day was
-- over. The band-aid was documented in code as "-2 hours" but actually written
-- as "-4 hours" — a semantic drift waiting to bite someone.
--
-- New semantic: end_date is the exact TIMESTAMPTZ moment the month becomes
-- inactive. No offset in code, no manual "push it to next day" hack.
--
-- Migration preserves current effective behavior: for every existing row,
-- new_end_date = old_end_date (midnight UTC) + 4 hours. Any future month
-- can be set to whatever end moment the streamer actually wants (e.g. UTC
-- midnight of the last day + a full local-day grace).
--
-- start_date is intentionally left as DATE. The code path
-- `new Date(m.start_date + 'T00:00:00Z')` at api/index.js:1075, :1273 etc.
-- depends on the bare-date string format; TIMESTAMPTZ would break it.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- ALTER TABLE public.bingo_months
--   ALTER COLUMN end_date TYPE DATE USING end_date::date;
-- (Warning: rolling back loses the 4-hour offset stored in the migration,
-- so the code would need the -4h band-aid restored simultaneously.)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.bingo_months
  ALTER COLUMN end_date TYPE TIMESTAMPTZ
    USING (end_date::timestamptz + interval '4 hours');

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: data_type = 'timestamp with time zone'.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bingo_months'
  AND column_name = 'end_date';

-- Sample values — expect each end_date to be 04:00:00 UTC on the date it used
-- to hold as a bare DATE.
SELECT id, month_year, start_date, end_date
FROM public.bingo_months
ORDER BY id DESC
LIMIT 5;
