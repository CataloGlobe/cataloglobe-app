-- =============================================================================
-- FIX: Regressions introduced by 20260330173000_security_audit_fixes.sql
-- =============================================================================
--
-- This migration corrects two regressions:
--
-- REGRESSION 1 — get_my_tenant_ids() downgraded to SECURITY INVOKER
--   Migration 20260330173000 changed get_my_tenant_ids() from SECURITY DEFINER
--   to SECURITY INVOKER. This function is called inside RLS policies on every
--   tenant-scoped table. With SECURITY INVOKER, when PostgreSQL evaluates an RLS
--   policy on (e.g.) products, it calls get_my_tenant_ids(), which then queries
--   public.tenants — a table that itself has RLS enabled. This either causes
--   infinite recursion or complete access denial depending on the tenants policy.
--   Symptom observed: severe performance degradation / query timeouts.
--
--   Fix: restore SECURITY DEFINER with the same logic already in place since
--   migration 20260329120000, preserving the invited_email branch added by
--   20260330173000 (that part was correct and useful).
--
-- REGRESSION 2 — "Public can read v2_products" policy dropped, no replacement
--   Migration 20260330173000 dropped the policy that allowed anon callers to
--   read products. The public catalog page (PublicCollectionPage) uses an anon
--   Supabase client — without a public SELECT policy it returns 0 products.
--
--   Fix: add a public SELECT policy following the established pattern:
--   tenant_id IN (SELECT get_public_tenant_ids()). This function is SECURITY
--   DEFINER and safe for anon callers (no auth.uid() dependency).
--
-- RETAINED from 20260330173000 (correct, not reverted):
--   - Authenticated SELECT / INSERT / UPDATE / DELETE policies on products
--   - tenant_members_view definition
--   - tenant_memberships read policy for own memberships
--
-- =============================================================================

BEGIN;


-- ---------------------------------------------------------------------------
-- 1. Restore get_my_tenant_ids() as SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required so the function can bypass RLS when reading
-- public.tenants and public.tenant_memberships. Without it, the function runs
-- with the caller's privileges, triggering RLS on those tables and causing
-- recursion or denial when called from inside other RLS policies.
--
-- WARNING: Do NOT change this function to SECURITY INVOKER.
--          See migration 20260329120000 for the full rationale.

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Branch A: caller is the tenant owner
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: caller has an active membership (by user_id or pending invite by email)
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE (tm.user_id = auth.uid() OR tm.invited_email = auth.email())
    AND tm.status    = 'active'
    AND t.deleted_at IS NULL
$$;


-- ---------------------------------------------------------------------------
-- 2. Restore public read access to products
-- ---------------------------------------------------------------------------
-- get_public_tenant_ids() is SECURITY DEFINER and safe for anon callers.
-- It returns all non-deleted tenant IDs without requiring auth.uid().
-- This follows the same pattern used by the public read policies on:
--   activities, product_attribute_definitions, product_attribute_values.

DROP POLICY IF EXISTS "Public can read products" ON public.products;

CREATE POLICY "Public can read products"
  ON public.products
  FOR SELECT
  TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 3. Validation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn_row record;
BEGIN
  -- 3a. get_my_tenant_ids() must be SECURITY DEFINER
  SELECT p.prosecdef, p.provolatile, p.prosrc
  INTO fn_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_my_tenant_ids';

  IF fn_row IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.get_my_tenant_ids() not found.';
  END IF;

  IF NOT fn_row.prosecdef THEN
    RAISE EXCEPTION
      'FAIL: get_my_tenant_ids() is not SECURITY DEFINER. '
      'All tenant-scoped RLS policies are broken.';
  END IF;

  IF fn_row.provolatile <> 's' THEN
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids() is not STABLE (got %).', fn_row.provolatile;
  END IF;

  IF fn_row.prosrc NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL: get_my_tenant_ids() body missing auth.uid() filter.';
  END IF;

  IF fn_row.prosrc NOT ILIKE '%deleted_at IS NULL%' THEN
    RAISE WARNING 'get_my_tenant_ids() missing deleted_at IS NULL — soft-deleted tenants may be accessible.';
  END IF;

  RAISE NOTICE 'OK: get_my_tenant_ids() — SECURITY DEFINER, STABLE, auth.uid() confirmed.';

  -- 3b. Public read policy on products must exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'products'
      AND policyname = 'Public can read products'
  ) THEN
    RAISE EXCEPTION 'FAIL: "Public can read products" policy not found on public.products.';
  END IF;

  RAISE NOTICE 'OK: "Public can read products" policy confirmed on public.products.';
END $$;


COMMIT;
