BEGIN;

-- =============================================================================
-- FIX: Append `current_period_end` to user_tenants_view + get_user_tenants()
-- =============================================================================
-- Previous attempt (20260606190100) used CREATE OR REPLACE FUNCTION and failed
-- with 42P13 (cannot change return type of existing function — row type defined
-- by OUT parameters differs). Fix: DROP VIEW CASCADE + DROP FUNCTION explicit,
-- then CREATE FUNCTION fresh with the extended RETURNS TABLE signature and
-- recreate the view identical to baseline + new column appended at end.
--
-- Baseline (pg_get_viewdef pre-fix) — 15 columns preserved IN ORDER:
--   id, name, vertical_type, business_subtype, created_at, owner_user_id,
--   user_role, logo_url, plan, subscription_status, trial_until,
--   stripe_customer_id, stripe_subscription_id, paid_seats, is_founder
-- Appended at end (new): current_period_end
-- =============================================================================

-- Drop view first (depends on function return type)
DROP VIEW IF EXISTS public.user_tenants_view CASCADE;

-- Drop function explicit (CREATE OR REPLACE cannot change RETURNS TABLE signature)
DROP FUNCTION IF EXISTS public.get_user_tenants();

-- Recreate function with the extra column appended
CREATE FUNCTION public.get_user_tenants()
RETURNS TABLE(
    id                     uuid,
    name                   text,
    vertical_type          text,
    business_subtype       text,
    created_at             timestamptz,
    owner_user_id          uuid,
    user_role              text,
    logo_url               text,
    plan                   text,
    subscription_status    text,
    trial_until            timestamptz,
    stripe_customer_id     text,
    stripe_subscription_id text,
    paid_seats             integer,
    is_founder             boolean,
    current_period_end     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
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
            WHEN tm.role IS NOT NULL          THEN tm.role
            ELSE NULL
        END AS user_role,
        t.logo_url,
        t.plan,
        t.subscription_status,
        t.trial_until,
        t.stripe_customer_id,
        t.stripe_subscription_id,
        t.paid_seats,
        t.is_founder,
        t.current_period_end
    FROM public.tenants t
    LEFT JOIN public.tenant_memberships tm
        ON  tm.tenant_id = t.id
        AND tm.user_id   = auth.uid()
        AND tm.status    = 'active'
    WHERE t.deleted_at IS NULL
      AND (
          t.owner_user_id = auth.uid()
          OR tm.user_id IS NOT NULL
      )
$$;

-- Recreate view exposing all 16 columns (baseline 15 + new current_period_end)
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
        paid_seats,
        is_founder,
        current_period_end
    FROM public.get_user_tenants();

GRANT SELECT ON public.user_tenants_view TO authenticated;

-- Validation: exactly 16 expected columns on the view
DO $$
DECLARE
    col_count integer;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_tenants_view'
      AND column_name IN (
          'id','name','vertical_type','business_subtype','created_at',
          'owner_user_id','user_role','logo_url','plan','subscription_status',
          'trial_until','stripe_customer_id','stripe_subscription_id',
          'paid_seats','is_founder','current_period_end'
      );

    IF col_count = 16 THEN
        RAISE NOTICE 'OK: user_tenants_view exposes all 16 expected columns.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/16 expected columns found on user_tenants_view.', col_count;
    END IF;
END $$;

COMMIT;
