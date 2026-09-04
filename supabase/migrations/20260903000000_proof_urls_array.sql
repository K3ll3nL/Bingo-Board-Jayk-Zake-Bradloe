-- Proof images: two named columns -> one array.
--
-- WHY: `approvals` and `approval_history` each carry exactly `proof_url` and
-- `proof_url2`, which caps a submission at two images. The approve path copies
-- those two columns into `approval_history`, so any additional proof a hunter
-- attached is dropped on approval and the moderator history shows an incomplete
-- record of what was actually reviewed.
--
-- This migration is ADDITIVE and safe to deploy before the code that uses it:
-- the new column is backfilled from the existing pair, and both old columns are
-- left in place so a running deployment keeps working mid-rollout. Dropping
-- `proof_url` / `proof_url2` is a SEPARATE migration, after the API and client
-- have stopped reading them.

-- 1. New array column on both tables ------------------------------------------
ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS proof_urls text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.approval_history
  ADD COLUMN IF NOT EXISTS proof_urls text[] NOT NULL DEFAULT '{}'::text[];

-- 2. Backfill from the existing pair, preserving order and dropping NULLs ------
UPDATE public.approvals
   SET proof_urls = ARRAY_REMOVE(ARRAY[proof_url, proof_url2], NULL)
 WHERE proof_urls = '{}'::text[]
   AND (proof_url IS NOT NULL OR proof_url2 IS NOT NULL);

UPDATE public.approval_history
   SET proof_urls = ARRAY_REMOVE(ARRAY[proof_url, proof_url2], NULL)
 WHERE proof_urls = '{}'::text[]
   AND (proof_url IS NOT NULL OR proof_url2 IS NOT NULL);

-- 3. Purge support -------------------------------------------------------------
-- The nightly period-end job selects expired rows that still hold images. With
-- an array that test becomes cardinality-based, so index the rows that still
-- have something to purge. Partial index: purged rows (empty array) are the
-- majority over time and do not need to be in it.
CREATE INDEX IF NOT EXISTS approval_history_pending_purge_idx
  ON public.approval_history (purge_after)
  WHERE cardinality(proof_urls) > 0;

COMMENT ON COLUMN public.approvals.proof_urls IS
  'Ordered proof image URLs. Replaces proof_url/proof_url2, which remain only for backward compatibility during rollout.';
COMMENT ON COLUMN public.approval_history.proof_urls IS
  'Ordered proof image URLs copied from the approval at review time. Emptied by the period-end purge once purge_after passes.';
