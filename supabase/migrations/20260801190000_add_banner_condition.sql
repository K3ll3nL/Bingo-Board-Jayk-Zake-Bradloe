-- Banner system overload.
--
-- Everything shown in BannerBar is a `banners` row. Two additions make that one
-- pipeline cover the cases that used to need bespoke components:
--
--   condition  — nullable visibility rule the client evaluates before rendering.
--                NULL keeps the existing behavior (always show inside the
--                starts_at/expires_at window). Values are validated in the API
--                (api/routes/banners.js BANNER_CONDITIONS) rather than by a CHECK
--                constraint, so new rules do not need a migration.
--   banner_key — stable identity for machine-written rows, so the daily cron can
--                upsert the month-countdown banner instead of stacking a new one
--                every run. NULL for mod-authored banners (UNIQUE ignores NULLs).
--
-- `banners` was originally created by hand in the Supabase dashboard, so the
-- table definition is repeated here idempotently to keep the migration lineage
-- self-contained.

CREATE TABLE IF NOT EXISTS banners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message     text NOT NULL,
  link_url    text,
  link_label  text,
  image_url   text,
  starts_at   timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON banners;
CREATE POLICY "public read" ON banners FOR SELECT USING (true);

DROP POLICY IF EXISTS "service write" ON banners;
CREATE POLICY "service write" ON banners FOR ALL USING (true);

ALTER TABLE banners ADD COLUMN IF NOT EXISTS condition  text;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS banner_key text;

CREATE UNIQUE INDEX IF NOT EXISTS banners_banner_key_key ON banners (banner_key);

-- Seeds the tier-list prompt that used to be the hardcoded PromoBanner in
-- HomeHighlights.jsx. It only renders for signed-in users who have not ranked
-- every mon in the current month's pool.
INSERT INTO banners (message, link_url, link_label, starts_at, expires_at, condition, banner_key)
VALUES (
  'You have not finished ranking this month''s board yet.',
  '/tier-list',
  'Open the Community Tier List',
  now(),
  now() + interval '5 years',
  'tier_list_incomplete',
  'tier_list_prompt'
)
ON CONFLICT (banner_key) DO NOTHING;
