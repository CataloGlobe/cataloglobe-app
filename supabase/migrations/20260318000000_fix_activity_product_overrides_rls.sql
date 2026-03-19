BEGIN;

-- =============================================================================
-- FIX RLS ON activity_product_overrides
-- =============================================================================
-- The previous policies checked `tenant_id IN (SELECT public.get_my_tenant_ids())`.
-- However, `tenant_id` does not have a DEFAULT and is not sent from the frontend 
-- during UPSERTs, causing valid inserts to be rejected by RLS (tenant_id evaluates to NULL).
--
-- This fix replaces explicit `tenant_id` checks on the `activity_product_overrides` table
-- with robust EXISTS subqueries that dynamically verify authorization against the 
-- parent `activities` table.
-- =============================================================================

-- 1. Drop existing broken / explicit tenant_id policies
DROP POLICY IF EXISTS "Tenant select own rows" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.activity_product_overrides;

-- 2. Create the correct policies using `activities` relationships
CREATE POLICY "policy_activity_product_overrides_select"
ON public.activity_product_overrides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = activity_product_overrides.activity_id
    AND a.tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "policy_activity_product_overrides_insert"
ON public.activity_product_overrides
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = activity_id
    AND a.tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "policy_activity_product_overrides_update"
ON public.activity_product_overrides
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = activity_id
    AND a.tenant_id IN (SELECT public.get_my_tenant_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = activity_id
    AND a.tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "policy_activity_product_overrides_delete"
ON public.activity_product_overrides
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = activity_id
    AND a.tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

COMMIT;
