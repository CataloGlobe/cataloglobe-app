BEGIN;

-- =============================================================================
-- Stripe subscription setup
-- =============================================================================
--
-- 1. Add stripe_customer_id, stripe_subscription_id to tenants
-- 2. Consolidate plans to 'pro' only (no free tier)
-- 3. Align subscription_status values with Stripe naming (trialing, canceled)
-- 4. Update cron job for new status names
-- 5. Rebuild get_user_tenants() + user_tenants_view with billing fields
-- =============================================================================


-- =============================================================================
-- STEP 1: Add Stripe columns
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_id_key
    ON public.tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_subscription_id_key
    ON public.tenants (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;


-- =============================================================================
-- STEP 2: Consolidate plans — keep only 'pro'
-- =============================================================================

-- Move all existing tenants to 'pro' before removing other plan rows
UPDATE public.tenants SET plan = 'pro' WHERE plan IN ('free', 'enterprise');

-- Remove obsolete plan rows (FK is satisfied: no tenant references them now)
DELETE FROM public.plans WHERE code IN ('free', 'enterprise');

-- Tighten CHECK constraint to only allow 'pro'
ALTER TABLE public.tenants DROP CONSTRAINT v2_tenants_plan_check;
ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_plan_check CHECK (plan IN ('pro'));

-- Change column default
ALTER TABLE public.tenants ALTER COLUMN plan SET DEFAULT 'pro';


-- =============================================================================
-- STEP 3: Align subscription_status with Stripe naming
-- =============================================================================

-- Drop old CHECK first — allows UPDATE to new values
ALTER TABLE public.tenants DROP CONSTRAINT v2_tenants_subscription_status_check;

-- Rename existing values
UPDATE public.tenants SET subscription_status = 'trialing' WHERE subscription_status = 'trial';
UPDATE public.tenants SET subscription_status = 'canceled' WHERE subscription_status = 'cancelled';

-- Add new CHECK constraint with Stripe-aligned values
ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_subscription_status_check
        CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled'));

-- Change column default
ALTER TABLE public.tenants ALTER COLUMN subscription_status SET DEFAULT 'trialing';


-- =============================================================================
-- STEP 4: Update cron job for new status name
-- =============================================================================

SELECT cron.unschedule('expire-tenant-trials')
FROM cron.job
WHERE jobname = 'expire-tenant-trials';

SELECT cron.schedule(
    'expire-tenant-trials',
    '0 2 * * *',
    $$
    UPDATE public.tenants
    SET subscription_status = 'past_due'
    WHERE subscription_status = 'trialing'
      AND trial_until IS NOT NULL
      AND trial_until < now();
    $$
);


-- =============================================================================
-- STEP 5: Rebuild get_user_tenants() with billing fields
-- =============================================================================

-- Drop dependents first
DROP VIEW IF EXISTS public.user_tenants_view;
DROP FUNCTION IF EXISTS public.get_user_tenants();

CREATE FUNCTION public.get_user_tenants()
RETURNS TABLE (
    id                      uuid,
    name                    text,
    vertical_type           text,
    business_subtype        text,
    created_at              timestamptz,
    owner_user_id           uuid,
    user_role               text,
    logo_url                text,
    plan                    text,
    subscription_status     text,
    trial_until             timestamptz,
    stripe_customer_id      text,
    stripe_subscription_id  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT
        t.id,
        t.name,
        t.vertical_type,
        t.business_subtype,
        t.created_at,
        t.owner_user_id,
        CASE
            WHEN t.owner_user_id = auth.uid() THEN 'owner'
            WHEN tm.role IS NOT NULL           THEN tm.role
            ELSE NULL
        END AS user_role,
        t.logo_url,
        t.plan,
        t.subscription_status,
        t.trial_until,
        t.stripe_customer_id,
        t.stripe_subscription_id
    FROM public.tenants t
    LEFT JOIN public.tenant_memberships tm
        ON  tm.tenant_id = t.id
        AND tm.user_id   = auth.uid()
        AND tm.status     = 'active'
    WHERE t.deleted_at IS NULL
      AND (
          t.owner_user_id = auth.uid()
          OR tm.user_id IS NOT NULL
      )
$$;

REVOKE ALL ON FUNCTION public.get_user_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;


-- =============================================================================
-- STEP 6: Rebuild user_tenants_view
-- =============================================================================

CREATE VIEW public.user_tenants_view AS
SELECT
    id,
    name,
    vertical_type,
    business_subtype,
    created_at,
    owner_user_id,
    user_role,
    logo_url,
    plan,
    subscription_status,
    trial_until,
    stripe_customer_id,
    stripe_subscription_id
FROM public.get_user_tenants();


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    col_count int;
BEGIN
    -- Stripe columns exist
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tenants'
      AND column_name  IN ('stripe_customer_id', 'stripe_subscription_id');

    IF col_count < 2 THEN
        RAISE EXCEPTION 'FAIL: only %/2 Stripe columns found on tenants.', col_count;
    END IF;
    RAISE NOTICE 'OK: stripe_customer_id and stripe_subscription_id present.';

    -- Only 'pro' plan remains
    PERFORM 1 FROM public.plans WHERE code IN ('free', 'enterprise');
    IF FOUND THEN
        RAISE EXCEPTION 'FAIL: free or enterprise plan still exists in plans table.';
    END IF;
    RAISE NOTICE 'OK: only pro plan remains.';

    -- No tenant with old status values
    PERFORM 1 FROM public.tenants WHERE subscription_status IN ('trial', 'cancelled');
    IF FOUND THEN
        RAISE EXCEPTION 'FAIL: tenants with old status values (trial/cancelled) still exist.';
    END IF;
    RAISE NOTICE 'OK: all subscription_status values aligned with Stripe naming.';

    -- View includes billing columns
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_tenants_view'
      AND column_name  IN ('plan', 'subscription_status', 'trial_until',
                           'stripe_customer_id', 'stripe_subscription_id');

    IF col_count < 5 THEN
        RAISE EXCEPTION 'FAIL: user_tenants_view missing billing columns (%/5).', col_count;
    END IF;
    RAISE NOTICE 'OK: user_tenants_view includes all 5 billing columns.';
END $$;


COMMIT;
