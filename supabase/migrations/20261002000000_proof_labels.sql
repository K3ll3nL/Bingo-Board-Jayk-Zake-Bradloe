-- Proof images: store the label each shot was uploaded under.
--
-- WHY: the upload form asks for per-game proof shots (games.js `proof_fields`,
-- e.g. Overworld Screenshot / TID Proof / Date Proof, or two for Let's Go). The
-- Approvals tab used to re-derive those names from the game's current config,
-- which mislabels a shot whenever a slot was skipped or the config later
-- changes. Saving the label at upload time makes each record self-describing.
--
-- `proof_labels[i]` names `proof_urls[i]`. An element may be NULL (a client that
-- did not send labels); readers fall back to the game's config for that shot.
--
-- ADDITIVE. No backfill: existing rows keep an empty array and use the same
-- fallback, which is exactly what they did before this column existed.

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS proof_labels text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.approval_history
  ADD COLUMN IF NOT EXISTS proof_labels text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.approvals.proof_labels IS
  'Upload-form label for each entry of proof_urls, index-aligned. Empty for rows submitted before labels were recorded.';
COMMENT ON COLUMN public.approval_history.proof_labels IS
  'Labels copied from the approval at review time, index-aligned with proof_urls.';
