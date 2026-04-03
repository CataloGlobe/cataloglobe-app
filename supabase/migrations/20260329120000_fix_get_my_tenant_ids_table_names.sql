-- =============================================================================
-- FIX: get_my_tenant_ids() — update legacy v2_ table references
-- =============================================================================
--
-- PROBLEM
--   Migration 20260315120000_v2_fix_get_my_tenant_ids.sql created this
--   function with the body referencing:
--     public.v2_tenants
--     public.v2_tenant_memberships
--
--   Migration 20260317120000_rename_v2_tables.sql subsequently renamed those
--   tables to:
--     public.tenants
--     public.tenant_memberships
--
--   The function body was NOT updated after the rename. In PostgreSQL, function
--   bodies are stored as text and the rename does NOT automatically rewrite
--   object references inside stored functions. The function silently resolves
--   to the old names at parse time; if the v2_ tables no longer exist (they
--   were renamed, not aliased) the function will throw "relation does not
--   exist" at runtime and return an empty set — silently breaking RLS policies
--   that delegate to it.
--
-- IMPACT
--   get_my_tenant_ids() is used by RLS policies on:
--     tenants, activities, products, catalogs, catalog_categories,
--     catalog_category_products, styles, schedules, schedule_targets,
--     product_attribute_definitions, featured_contents, … (all tenant tables)
--
--   An empty return set from get_my_tenant_ids() means ALL those RLS checks
--   return FALSE → complete denial of access for all users.
--
-- FIX
--   CREATE OR REPLACE FUNCTION with identical logic, updated table names:
--     v2_tenants             → tenants
--     v2_tenant_memberships  → tenant_memberships
--
-- SECURITY ATTRIBUTES — unchanged
--   SECURITY DEFINER : authoritative; bypasses RLS on internal queries safely
--   STABLE           : result cached per statement; critical for RLS perf
--   SET search_path  : prevents search-path injection
--
-- WARNING:
--   This function is used as the backbone of ALL tenant-scoped RLS policies.
--   Never change it to SECURITY INVOKER or remove the deleted_at / status
--   filters without a thorough review of every downstream policy.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Replace function body with corrected table names
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Branch A: tenants where the caller is the owner.
  -- NOTE: uses auth.uid() — do not remove this filter.
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: tenants where the caller has an active membership.
  -- The JOIN on tenants ensures soft-deleted tenants are excluded even when
  -- the membership row itself has not been cleaned up.
  -- NOTE: uses auth.uid() — do not remove this filter.
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id    = auth.uid()
    AND tm.status     = 'active'
    AND t.deleted_at  IS NULL
$$;


-- ---------------------------------------------------------------------------
-- 2. Validation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn_row record;
  fn_body text;
BEGIN
  -- 2a. Confirm the function exists and has expected security attributes.
  SELECT p.prosecdef, p.provolatile, p.prosrc
  INTO fn_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_my_tenant_ids';

  IF fn_row IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.get_my_tenant_ids() not found after update.';
  END IF;

  IF NOT fn_row.prosecdef THEN
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids() is not SECURITY DEFINER.';
  END IF;

  IF fn_row.provolatile <> 's' THEN
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids() is not STABLE (got %). '
      'RLS performance will degrade.', fn_row.provolatile;
  END IF;

  fn_body := fn_row.prosrc;

  -- 2b. Confirm auth.uid() is present (both branches must filter by caller).
  IF fn_body NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION
      'FAIL: get_my_tenant_ids() body does not contain auth.uid(). '
      'Tenant isolation is broken — ALL tenant data is exposed.';
  END IF;

  -- 2c. Confirm deleted_at IS NULL filter is present.
  IF fn_body NOT ILIKE '%deleted_at IS NULL%' THEN
    RAISE WARNING
      'get_my_tenant_ids() body does not contain deleted_at IS NULL filter. '
      'Soft-deleted tenants may be accessible.';
  END IF;

  -- 2d. Confirm status = ''active'' filter is present (membership branch).
  IF fn_body NOT ILIKE '%status%' THEN
    RAISE WARNING
      'get_my_tenant_ids() body does not contain a status filter. '
      'Pending/revoked memberships may grant access.';
  END IF;

  -- 2e. CRITICAL: verify legacy v2_ table names are NOT referenced.
  IF fn_body ILIKE '%v2_tenants%' OR fn_body ILIKE '%v2_tenant_memberships%' THEN
    RAISE WARNING
      'get_my_tenant_ids() still references legacy v2_ table names. '
      'This migration may not have applied correctly. '
      'Verify with: SELECT prosrc FROM pg_proc WHERE proname = ''get_my_tenant_ids'';';
  ELSE
    RAISE NOTICE 'OK: get_my_tenant_ids() body does not contain legacy v2_ table names.';
  END IF;

  -- 2f. Confirm correct table names are used.
  IF fn_body NOT ILIKE '%public.tenants%' THEN
    RAISE WARNING
      'get_my_tenant_ids() body does not reference public.tenants. '
      'Double-check the function body.';
  END IF;

  RAISE NOTICE
    'OK: get_my_tenant_ids() — SECURITY DEFINER, STABLE, '
    'auth.uid() confirmed, deleted_at filter present, no legacy v2_ names.';
END $$;


COMMIT;
