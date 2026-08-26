-- Ordering guard for subscription_status writes driven by Stripe webhooks.
--
-- Problem: stripe-webhook applied subscription_status with pure last-write-wins
-- semantics, inferring the value from the event TYPE (invoice.payment_failed ->
-- past_due, invoice.payment_succeeded -> active). Two consequences:
--   1. A failed ONE-OFF invoice (e.g. the seat-delta charge issued by
--      chargeOneOffSeatDelta) flipped a perfectly healthy subscription to
--      past_due, and nothing corrected it until the next event arrived.
--   2. Out-of-order / redelivered events (Stripe "Resend", retries) could
--      overwrite a newer state with an older one.
--
-- Fix (application side): the webhook now re-reads the LIVE subscription from
-- Stripe and maps its real status. This column is the second barrier: it stores
-- the Stripe `event.created` timestamp of the event that produced the current
-- subscription_status, so an event older than (or equal to) the last applied one
-- is ignored for status purposes.
--
-- NULL = no status-bearing event applied yet under the new model (any event
-- passes the guard).

ALTER TABLE public.tenants
    ADD COLUMN subscription_status_event_at timestamptz;
