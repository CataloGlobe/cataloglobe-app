BEGIN;

-- =============================================================================
-- Add `current_period_end` to tenants for "Prossimo rinnovo" display
-- =============================================================================
-- Source: Stripe subscription.current_period_end via stripe-webhook.
-- Populated on: checkout.session.completed + customer.subscription.updated.
-- Cleared on:    customer.subscription.deleted.
-- Used for:      "Prossimo rinnovo" in SubscriptionPage when status='active'.
--
-- Existing tenants: column initially NULL. Webhook will populate on next
-- subscription event; UI shows "—" until then (non-blocking).
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

COMMENT ON COLUMN public.tenants.current_period_end IS
    'Next billing renewal date (Stripe subscription.current_period_end). Synced via stripe-webhook.';

-- Validation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'tenants'
          AND column_name  = 'current_period_end'
    ) THEN
        RAISE EXCEPTION 'FAIL: current_period_end column not created.';
    END IF;
    RAISE NOTICE 'OK: current_period_end column present on tenants.';
END $$;

COMMIT;
