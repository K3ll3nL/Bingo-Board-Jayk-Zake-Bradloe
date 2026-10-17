-- Badge Backlog — the first tab of /badge-upload, replacing "Create Badge".
--
-- Mods pitch badge FAMILIES (proposals), rank them by dragging, discuss and
-- upload tier art, and vote on tier-count / threshold changes. The site owner
-- wires each proposal to a trigger + check_type (with the simulator showing how
-- many real hunters each tier would award) and publishes it into `badges`.
--
-- Consensus order: api/_lib/backlogOrder.js (weight = share of the list ranked).
-- Earn counts:     api/_lib/badgeEval.js    (verified by api/scripts/verifyBadgeSim.js).
--
-- Additive only. Auth lives in the API (api/_routes/badgeBacklog.js); see the
-- RLS note at the bottom for why these tables get no policies.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TABLE IF EXISTS public.badge_proposal_comments;
-- DROP TABLE IF EXISTS public.badge_proposal_change_votes;
-- DROP TABLE IF EXISTS public.badge_proposal_changes;
-- DROP TABLE IF EXISTS public.badge_proposal_rankings;
-- DROP TABLE IF EXISTS public.badge_proposal_tiers;
-- DROP TABLE IF EXISTS public.badge_proposals;
-- DROP TABLE IF EXISTS public.site_owners;
-- COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Who may wire and publish. A table rather than a UUID in route code, so a
-- second owner is a row, not a deploy.
CREATE TABLE IF NOT EXISTS public.site_owners (
  user_id    uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.site_owners (user_id)
SELECT id FROM public.users WHERE id = '3bb8389d-5147-4405-ad47-156315248565'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.badge_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  theme_notes     text NOT NULL DEFAULT '',
  -- Set when the proposal adds tiers to a family that already has live badges.
  existing_family text REFERENCES public.badge_families(id) ON DELETE SET NULL,
  proposed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'published', 'archived')),
  -- Owner-only from here down.
  code_status     text NOT NULL DEFAULT 'unreviewed'
                  CHECK (code_status IN ('unreviewed', 'ready', 'needs_code', 'needs_tracking')),
  trigger         text,
  check_type      text,
  check_qualifier text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_badge_proposals_status ON public.badge_proposals (status);

CREATE TABLE IF NOT EXISTS public.badge_proposal_tiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.badge_proposals(id) ON DELETE CASCADE,
  tier_order  integer NOT NULL CHECK (tier_order >= 1),
  name        text NOT NULL DEFAULT '',
  threshold   numeric,
  image_url   text,
  badge_id    integer REFERENCES public.badges(id) ON DELETE SET NULL,
  UNIQUE (proposal_id, tier_order) DEFERRABLE INITIALLY DEFERRED
);

-- One row per (mod, proposal) they have placed. Unplaced = no row.
CREATE TABLE IF NOT EXISTS public.badge_proposal_rankings (
  mod_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.badge_proposals(id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position >= 1),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mod_id, proposal_id)
);

-- A vote to change tier count or a tier's threshold. Resolves automatically on
-- a simple majority of all moderators.
CREATE TABLE IF NOT EXISTS public.badge_proposal_changes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.badge_proposals(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('tier_count', 'threshold')),
  payload     jsonb NOT NULL,
  opened_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'passed', 'failed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_badge_proposal_changes_proposal ON public.badge_proposal_changes (proposal_id, status);

CREATE TABLE IF NOT EXISTS public.badge_proposal_change_votes (
  change_id  uuid NOT NULL REFERENCES public.badge_proposal_changes(id) ON DELETE CASCADE,
  mod_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  approve    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (change_id, mod_id)
);

CREATE TABLE IF NOT EXISTS public.badge_proposal_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.badge_proposals(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_badge_proposal_comments_proposal ON public.badge_proposal_comments (proposal_id, created_at);

-- RLS on, NO policies: only the API (service role, which bypasses RLS) touches
-- these. Deliberately stricter than the permissive pattern — a FOR ALL USING
-- (true) policy here would let anyone holding the public anon key insert
-- themselves into site_owners or stuff the vote tables. The client never reads
-- them directly; everything goes through api/_routes/badgeBacklog.js.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_owners', 'badge_proposals', 'badge_proposal_tiers',
    'badge_proposal_rankings', 'badge_proposal_changes', 'badge_proposal_change_votes',
    'badge_proposal_comments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;
