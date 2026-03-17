-- =============================================================================
-- FIX: public read policies for activities, activity_groups,
--      activity_group_members — broken subquery for anon callers
--
-- Problem: migration 20260315150000 replaced USING (true) with:
--
--     tenant_id IN (SELECT id FROM public.tenants WHERE deleted_at IS NULL)
--
-- This subquery reads the tenants table. The tenants SELECT policy is
-- TO authenticated only — anon has no matching policy, so with RLS enabled
-- the subquery returns an empty set for anon callers. All three tables
-- silently return 0 rows to the public catalog renderer's anon client.
--
-- Fix: introduce get_public_tenant_ids(), a SECURITY DEFINER function that
-- reads tenants bypassing RLS. No auth.uid() dependency — safe for both
-- anon and authenticated callers. Replace the broken inline subquery in
-- all three public SELECT policies with a call to this function.
--
-- Behaviour is identical to the intent of 20260315150000:
--   - Non-deleted tenants: visible to public
--   - Soft-deleted tenants: hidden from public
-- =============================================================================


-- =============================================================================
-- STEP 1: Create get_public_tenant_ids()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE deleted_at IS NULL
$$;

REVOKE ALL     ON FUNCTION public.get_public_tenant_ids() FROM PUBLIC;
GRANT EXECUTE  ON FUNCTION public.get_public_tenant_ids() TO anon;
GRANT EXECUTE  ON FUNCTION public.get_public_tenant_ids() TO authenticated;
GRANT EXECUTE  ON FUNCTION public.get_public_tenant_ids() TO service_role;


-- =============================================================================
-- STEP 2: Update public SELECT policies
-- =============================================================================

-- activities
DROP POLICY IF EXISTS "Public can read activities"         ON public.activities;
DROP POLICY IF EXISTS "Public can read v2_activities"      ON public.activities;

CREATE POLICY "Public can read activities"
ON public.activities
FOR SELECT
TO public
USING (
  tenant_id IN (SELECT public.get_public_tenant_ids())
);


-- activity_groups
DROP POLICY IF EXISTS "Public can read activity_groups"    ON public.activity_groups;
DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.activity_groups;

CREATE POLICY "Public can read activity_groups"
ON public.activity_groups
FOR SELECT
TO public
USING (
  tenant_id IN (SELECT public.get_public_tenant_ids())
);


-- activity_group_members
DROP POLICY IF EXISTS "Public can read activity_group_members"    ON public.activity_group_members;
DROP POLICY IF EXISTS "Public can read v2_activity_group_members" ON public.activity_group_members;

CREATE POLICY "Public can read activity_group_members"
ON public.activity_group_members
FOR SELECT
TO public
USING (
  tenant_id IN (SELECT public.get_public_tenant_ids())
);
