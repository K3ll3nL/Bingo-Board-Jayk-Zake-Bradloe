-- Per-badge Standard/Restricted for mode-based checks (approved_count, games_count,
-- hours_left_in_month). NULL = follow the proposal's own qualifier. Additive.
ALTER TABLE badge_proposal_tiers
  ADD COLUMN IF NOT EXISTS mode text
  CHECK (mode IS NULL OR mode IN ('any', 'standard', 'restricted'));
