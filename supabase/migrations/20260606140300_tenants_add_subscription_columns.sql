BEGIN;

-- =============================================================================
-- Subscription refactor — Step 4/8: tenants — add is_founder, applied_promo_code, legacy_price_id
-- =============================================================================
--
-- - is_founder         : bool, marks the first 20 founder customers (special
--                        treatment: 60-day trial, 10% off seat #1, grandfathered
--                        pricing forever). Default false. No founder exists yet
--                        (current tenants are test).
-- - applied_promo_code : text nullable, tracks the Stripe Promotion Code that
--                        was applied at signup. Useful for analytics. Stripe is
--                        the source of truth for the actual discount.
-- - legacy_price_id    : text nullable, tracks a grandfathered Stripe Price ID
--                        that overrides the plan's standard price. Used in
                          --                        future to honor "old pricing" promises.
-- =============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS is_founder         boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS applied_promo_code text,
    ADD COLUMN IF NOT EXISTS legacy_price_id    text;

-- Partial index for founder analytics (small subset, fast filter).
CREATE INDEX IF NOT EXISTS idx_tenants_is_founder
    ON public.tenants (is_founder)
    WHERE is_founder = true;

-- ────────────────────────────────────────────────────────────────────────────
-- Rebuild get_user_tenants() + user_tenants_view to expose is_founder
-- (other two columns kept internal — no consumer needs them in the workspace
--  selector view today).
-- ────────────────────────────────────────────────────────────────────────────

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
    is_founder              boolean
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
            WHEN tm.role IS NOT NULL          THEN tm.role
            ELSE NULL
        END AS user_role,
        t.logo_url,
        t.plan,
        t.subscription_status,
        t.trial_until,
        t.stripe_customer_id,
        t.stripe_subscription_id,
        t.is_founder
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

REVOKE ALL ON FUNCTION public.get_user_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;

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
    is_founder
FROM public.get_user_tenants();

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    col_count int;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tenants'
      AND column_name  IN ('is_founder','applied_promo_code','legacy_price_id');

    IF col_count = 3 THEN
        RAISE NOTICE 'OK: 3 new columns on tenants.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/3 new columns on tenants.', col_count;
    END IF;

    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_tenants_view'
      AND column_name  = 'is_founder';

    IF col_count = 1 THEN
        RAISE NOTICE 'OK: is_founder exposed in user_tenants_view.';
    ELSE
        RAISE EXCEPTION 'FAIL: user_tenants_view missing is_founder.';
    END IF;
END $$;

COMMIT;
