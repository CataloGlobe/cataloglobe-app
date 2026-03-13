BEGIN;

-- =========================================
-- V2: TENANT MEMBERSHIPS - FIX SELECT POLICY (NO RLS RECURSION)
-- =========================================

-- Replace recursive SELECT policy with non-recursive tenant-based check
DROP POLICY IF EXISTS "Active members can read memberships" ON public.v2_tenant_memberships;

CREATE POLICY "Active members can read memberships"
ON public.v2_tenant_memberships
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.v2_tenants t
    WHERE t.id = v2_tenant_memberships.tenant_id
      AND t.owner_user_id = auth.uid()
  )
);

COMMIT;
