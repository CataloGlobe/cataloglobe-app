-- stripe-webhook idempotency: process-once via completion marker.
--
-- Before: a row in stripe_processed_events was inserted BEFORE dispatch; its
-- mere presence meant "already processed". On handler failure the catch block
-- DELETE'd the row so a retry could re-process. Edge: if that DELETE failed
-- (same DB blip that broke the handler) the row survived, the retry hit 23505
-- and returned 200 idempotent -> event silently lost.
--
-- After: a row counts as "already processed" ONLY when completed_at IS NOT NULL.
-- An inserted-but-not-completed row (a prior failed attempt) lets the retry
-- re-process. No DELETE needed in the error path.

ALTER TABLE public.stripe_processed_events
    ADD COLUMN completed_at timestamptz;

-- Backfill: rows that exist under the old model were already processed
-- (presence == done). Mark them completed so they are not re-processed if
-- Stripe ever redelivers. processed_at is NOT NULL DEFAULT now(), but COALESCE
-- guards against any unexpected null.
UPDATE public.stripe_processed_events
SET completed_at = COALESCE(processed_at, now())
WHERE completed_at IS NULL;

COMMENT ON COLUMN public.stripe_processed_events.completed_at IS
    'Completion marker for process-once idempotency. NULL = inserted but the handler has not yet succeeded (a retry may re-process). NOT NULL = event fully processed; redeliveries are acknowledged with 200 idempotent.';
