-- seed.sql — data inserted after every `supabase db reset` on a local dev DB.
-- Keep MINIMAL. Only enough to boot the app for local development.
-- Do NOT run this against production; production data is not seeded, it's live.

-- ─── Bingo month ─────────────────────────────────────────────────────────────
-- Populate with a single active month spanning today ± 15 days so any date
-- comparison in the API returns "current."
INSERT INTO bingo_months (id, month_year, month_year_display, start_date, end_date)
VALUES (
  1,
  to_char(now(), 'YYYY-MM'),
  to_char(now(), 'FMMonth YYYY'),
  date_trunc('month', now())::date,
  (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date
)
ON CONFLICT (id) DO NOTHING;

-- ─── Dev user + moderator ────────────────────────────────────────────────────
-- The API's dev-token shortcut uses DEBUG_USER_ID from api/.env — this row must
-- match. Update the UUID here if you change your local DEBUG_USER_ID.
INSERT INTO users (id, username, display_name, hex_code)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'dev_local',
  'Local Dev',
  '#7c3aed'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO moderators (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── One badge family (needed for BadgeCase / BadgePicker to render) ─────────
INSERT INTO badge_families (id, display_name, display_order, is_sequential)
VALUES ('dev_family', 'Dev Test Family', 1, false)
ON CONFLICT (id) DO NOTHING;

-- Note: pokemon_master (1000+ rows) is deliberately not seeded here.
-- For local dev, populate it once via:
--   supabase db dump --data-only --schema public -t pokemon_master \
--     -f supabase/dev-fixtures/pokemon_master.sql
-- Then `psql -f supabase/dev-fixtures/pokemon_master.sql` after each
-- `supabase db reset`. dev-fixtures/ should be gitignored.
