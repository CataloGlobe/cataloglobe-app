BEGIN;

-- =============================================================================
-- Fix: restore team-member support in get_my_tenant_ids()
-- =============================================================================
--
-- Problem: migration 20260314170000_v2_soft_delete_tenant.sql introduced two
-- regressions when adding deleted_at filtering:
--
--   1. The UNION branch that resolves tenant IDs from v2_tenant_memberships was
--      dropped, making the function owner-only. As a result, admin/member users
--      receive an empty set from get_my_tenant_ids() and are blocked from all
--      tables whose RLS policies delegate to this function.
--
--   2. SECURITY DEFINER was changed to SECURITY INVOKER. Because the function
--      queries v2_tenants, and v2_tenants has an RLS policy that calls
--      get_my_tenant_ids(), this creates a recursive policy evaluation.
--      SECURITY DEFINER bypasses RLS on the internal query, which is the correct
--      pattern for a helper function of this kind.
--
-- Fix:
--   - Restore the UNION branch for active memberships.
--   - Add t.deleted_at IS NULL to the membership branch via a JOIN on v2_tenants
--     (cannot rely on v2_tenant_memberships for this — soft-delete lives on the
--     tenant row, not on the membership row).
--   - Revert to SECURITY DEFINER.
--
-- Result after this migration:
--   get_my_tenant_ids() returns the union of:
--     a) tenants owned by the calling user that are not soft-deleted
--     b) tenants where the calling user has an active membership and the
--        tenant is not soft-deleted
--
-- All RLS policies that use get_my_tenant_ids() (v2_activities, v2_products,
-- v2_featured_contents, v2_catalog_*, v2_styles, etc.) automatically inherit
-- this correct behaviour — no other changes are required.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Branch A: tenants where the caller is the owner
  SELECT t.id
  FROM public.v2_tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: tenants where the caller has an active membership
  -- JOIN ensures soft-deleted tenants are excluded even if the membership row
  -- still exists (memberships are not soft-deleted independently of the tenant)
  SELECT tm.tenant_id
  FROM public.v2_tenant_memberships tm
  JOIN public.v2_tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND t.deleted_at IS NULL
$$;


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
  fn_security text;
  fn_volatility text;
BEGIN
  SELECT
    CASE p.prosecdef WHEN true THEN 'definer' ELSE 'invoker' END,
    CASE p.provolatile
      WHEN 's' THEN 'stable'
      WHEN 'i' THEN 'immutable'
      WHEN 'v' THEN 'volatile'
    END
  INTO fn_security, fn_volatility
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_my_tenant_ids';

  IF fn_security = 'definer' THEN
    RAISE NOTICE 'OK: get_my_tenant_ids is SECURITY DEFINER.';
  ELSE
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids is SECURITY %. Expected DEFINER.', upper(fn_security);
  END IF;

  IF fn_volatility = 'stable' THEN
    RAISE NOTICE 'OK: get_my_tenant_ids is STABLE.';
  ELSE
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids is %. Expected STABLE.', upper(fn_volatility);
  END IF;
END $$;


COMMIT;
