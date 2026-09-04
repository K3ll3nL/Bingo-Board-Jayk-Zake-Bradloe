-- Allow 'legal' as a feedback type.
--
-- The Terms of Service and Privacy Policy both direct users to the Suggestions &
-- Bugs form for copyright takedown requests and for GDPR access/deletion
-- requests. Those documents are a public commitment, so the route they name has
-- to actually accept the submission -- without this the request 500s and the
-- user has no way to reach us, while the policy says they do.
--
-- Additive only: 'suggestion' and 'bug' keep working unchanged.

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_type_check;

ALTER TABLE feedback
  ADD CONSTRAINT feedback_type_check
  CHECK (type IN ('suggestion', 'bug', 'legal'));
