-- Fix ON DELETE behavior on FKs that were NO ACTION, and clean up a handful
-- of typo'd / capitalized / duplicate constraint names while we're at it.
--
-- Reason: audit plan phase 3, "Confirmed MEDIUM: FK ON DELETE actions are
-- inconsistent" and "T1: naming inconsistencies".
--
-- Policy per relationship:
--   • Owned-by-user data (notifications, approvals, moderators, site_pro,
--     twitch_ambassadors, user_badges.month_id) → CASCADE.
--     Deleting a user tears down everything they own.
--   • Audit-only references (feedback.user_id, radar_route_maps.updated_by)
--     → SET NULL. Preserve the row for moderator review; disconnect the
--     deleted user.
--   • Reference-data pointers (approvals.pokemon_id, notifications.pokemon_id,
--     approval_history.month_id, entries.pokemon_id, monthly_pokemon_pool.pokemon_id)
--     → keep NO ACTION. Those parent rows aren't deleted; if they ever were,
--     failing loud is better than silent data loss.
--
-- Naming cleanup:
--   • approvals typo:  apptovals_* → approvals_*
--   • notifications case: "Notifications_*" (quoted, capitalized) → notifications_*
--   • user_monthly_points has a duplicate FK on user_id (both `fk_user_monthly_points_user`
--     and `user_monthly_points_user_id_fkey` do the same thing) → drop the fk_ variant.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Recreate the old constraints from the baseline migration file
-- 20260716033850_remote_schema.sql. Names are: apptovals_*_fkey,
-- "Notifications_*_fkey", moderators_id_fkey (NO ACTION), etc.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── notifications ──────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT "Notifications_user_id_fkey",
  ADD  CONSTRAINT notifications_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT "Notifications_award_fkey",
  ADD  CONSTRAINT notifications_award_fkey
       FOREIGN KEY (award) REFERENCES public.bingo_achievements(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT "Notifications_pokemon_id_fkey",
  ADD  CONSTRAINT notifications_pokemon_id_fkey
       FOREIGN KEY (pokemon_id) REFERENCES public.pokemon_master(id) ON DELETE NO ACTION;

-- Rename the capitalized PK for consistency with every other table.
ALTER TABLE public.notifications
  RENAME CONSTRAINT "Notifications_pkey" TO notifications_pkey;

-- ── approvals ──────────────────────────────────────────────────────────────
ALTER TABLE public.approvals
  DROP CONSTRAINT apptovals_user_id_fkey,
  ADD  CONSTRAINT approvals_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.approvals
  DROP CONSTRAINT apptovals_month_id_fkey,
  ADD  CONSTRAINT approvals_month_id_fkey
       FOREIGN KEY (month_id) REFERENCES public.bingo_months(id) ON DELETE CASCADE;

ALTER TABLE public.approvals
  DROP CONSTRAINT apptovals_pokemon_id_fkey,
  ADD  CONSTRAINT approvals_pokemon_id_fkey
       FOREIGN KEY (pokemon_id) REFERENCES public.pokemon_master(id) ON DELETE NO ACTION;

-- Rename the typo'd PK.
ALTER TABLE public.approvals
  RENAME CONSTRAINT apptovals_pkey TO approvals_pkey;

-- ── moderators, site_pro, twitch_ambassadors — deleting the user should nuke
--    these membership rows too. They're pointless without their user.
ALTER TABLE public.moderators
  DROP CONSTRAINT moderators_id_fkey,
  ADD  CONSTRAINT moderators_id_fkey
       FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.site_pro
  DROP CONSTRAINT site_pro_user_id_fkey,
  ADD  CONSTRAINT site_pro_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.twitch_ambassadors
  DROP CONSTRAINT twitch_ambassadors_id_fkey,
  ADD  CONSTRAINT twitch_ambassadors_id_fkey
       FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ── feedback — SET NULL so mods can still see the feedback content after
--    the reporter deletes their account.
ALTER TABLE public.feedback ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.feedback
  DROP CONSTRAINT feedback_user_id_fkey,
  ADD  CONSTRAINT feedback_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ── radar_route_maps — audit-of-who-updated. Preserve the row.
ALTER TABLE public.radar_route_maps
  DROP CONSTRAINT radar_route_maps_updated_by_fkey,
  ADD  CONSTRAINT radar_route_maps_updated_by_fkey
       FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ── user_badges.month_id — if the month is gone, the "won in that month"
--    badge is meaningless.
ALTER TABLE public.user_badges
  DROP CONSTRAINT user_badges_month_id_fkey,
  ADD  CONSTRAINT user_badges_month_id_fkey
       FOREIGN KEY (month_id) REFERENCES public.bingo_months(id) ON DELETE CASCADE;

-- ── user_monthly_points has TWO FKs on user_id doing the same thing.
--    Drop the duplicate.
ALTER TABLE public.user_monthly_points
  DROP CONSTRAINT IF EXISTS fk_user_monthly_points_user;

COMMIT;

-- ─── VERIFY ─────────────────────────────────────────────────────────────────
-- Expected: no rows returned. Any row is a FK still on NO ACTION that should
-- have been fixed by this migration.
SELECT tc.table_name, tc.constraint_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
JOIN information_schema.referential_constraints rc USING (constraint_schema, constraint_name)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND rc.delete_rule = 'NO ACTION'
  AND (tc.table_name, kcu.column_name) IN (
    ('notifications','user_id'), ('notifications','award'),
    ('approvals','user_id'), ('approvals','month_id'),
    ('moderators','id'),
    ('site_pro','user_id'),
    ('twitch_ambassadors','id'),
    ('feedback','user_id'),
    ('radar_route_maps','updated_by'),
    ('user_badges','month_id')
  );

-- Expected: no "apptovals" or "Notifications" constraint names left.
SELECT conrelid::regclass::text AS table_name, conname
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND (conname LIKE 'apptovals%' OR conname LIKE 'Notifications%');
