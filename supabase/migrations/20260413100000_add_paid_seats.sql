BEGIN;

-- =============================================================================
-- Add paid_seats column to tenants
-- =============================================================================
-- Tracks the number of seats (locations) the tenant has paid for via Stripe.
-- Updated by the stripe-webhook when subscription quantity changes.

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS paid_seats integer NOT NULL DEFAULT 1;

-- Add constraint: paid_seats must be >= 1
ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_paid_seats_check CHECK (paid_seats >= 1);


-- =============================================================================
-- Rebuild get_user_tenants() to include paid_seats
-- =============================================================================

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
    stripe_subscription_id  text,
    paid_seats              integer
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
        t.stripe_subscription_id,
        t.paid_seats
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
-- Rebuild user_tenants_view
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
    stripe_subscription_id,
    paid_seats
FROM public.get_user_tenants();


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    col_exists boolean;
    view_col_exists boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'paid_seats'
    ) INTO col_exists;

    IF NOT col_exists THEN
        RAISE EXCEPTION 'FAIL: paid_seats column not found on tenants.';
    END IF;
    RAISE NOTICE 'OK: paid_seats column present on tenants.';

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_tenants_view' AND column_name = 'paid_seats'
    ) INTO view_col_exists;

    IF NOT view_col_exists THEN
        RAISE EXCEPTION 'FAIL: paid_seats not in user_tenants_view.';
    END IF;
    RAISE NOTICE 'OK: paid_seats present in user_tenants_view.';
END $$;

COMMIT;
