BEGIN;

-- =============================================================================
-- V2: Subscription billing fields for v2_tenants
-- =============================================================================
--
-- Adds three columns to track the tenant's billing plan and subscription state.
-- Existing rows receive the defaults (plan = 'free', subscription_status = 'trial',
-- trial_until = NULL) so this migration is fully backwards-compatible.
--
-- No existing columns, policies, triggers, or indexes are modified.
-- =============================================================================


-- =============================================================================
-- Columns
-- =============================================================================

ALTER TABLE public.v2_tenants
    ADD COLUMN IF NOT EXISTS plan                text        NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS subscription_status text        NOT NULL DEFAULT 'trial',
    ADD COLUMN IF NOT EXISTS trial_until         timestamptz          DEFAULT NULL;


-- =============================================================================
-- Check constraints
-- =============================================================================

ALTER TABLE public.v2_tenants
    ADD CONSTRAINT v2_tenants_plan_check
        CHECK (plan IN ('free', 'pro', 'enterprise'));

ALTER TABLE public.v2_tenants
    ADD CONSTRAINT v2_tenants_subscription_status_check
        CHECK (subscription_status IN ('trial', 'active', 'past_due', 'suspended', 'cancelled'));


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    col_count        int;
    constraint_count int;
BEGIN
    -- All three columns exist
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'v2_tenants'
      AND column_name  IN ('plan', 'subscription_status', 'trial_until');

    IF col_count < 3 THEN
        RAISE EXCEPTION 'FAIL: only %/3 billing columns found on v2_tenants.', col_count;
    END IF;
    RAISE NOTICE 'OK: all 3 billing columns present on v2_tenants.';

    -- Both check constraints exist
    SELECT COUNT(*) INTO constraint_count
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name        = 'v2_tenants'
      AND constraint_type   = 'CHECK'
      AND constraint_name   IN (
          'v2_tenants_plan_check',
          'v2_tenants_subscription_status_check'
      );

    IF constraint_count < 2 THEN
        RAISE EXCEPTION 'FAIL: only %/2 check constraints found on v2_tenants.', constraint_count;
    END IF;
    RAISE NOTICE 'OK: both check constraints present on v2_tenants.';

    -- plan default is 'free'
    PERFORM 1
    FROM information_schema.columns
    WHERE table_schema  = 'public'
      AND table_name    = 'v2_tenants'
      AND column_name   = 'plan'
      AND column_default = '''free''::text';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: default for plan is not ''free''.';
    END IF;
    RAISE NOTICE 'OK: plan default is ''free''.';

    -- subscription_status default is 'trial'
    PERFORM 1
    FROM information_schema.columns
    WHERE table_schema  = 'public'
      AND table_name    = 'v2_tenants'
      AND column_name   = 'subscription_status'
      AND column_default = '''trial''::text';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: default for subscription_status is not ''trial''.';
    END IF;
    RAISE NOTICE 'OK: subscription_status default is ''trial''.';
END $$;


COMMIT;
