-- Documents the ordering-guard column added in 20260728120000_add_subscription_status_event_at.sql
-- Split into its own migration file: `supabase db push` fails (SQLSTATE 42601)
-- on files containing more than one top-level SQL command.

COMMENT ON COLUMN public.tenants.subscription_status_event_at IS
    'Stripe event.created (NOT now()) of the webhook event that produced the current subscription_status. Ordering guard: stripe-webhook ignores, for status purposes, any event whose created <= this value. NULL = never set under the live-state sync model.';
