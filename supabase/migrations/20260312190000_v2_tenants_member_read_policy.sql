BEGIN;

-- =========================================
-- V2: TENANT READ POLICY — INCLUDE MEMBERS
-- =========================================
--
-- Previously only owners could SELECT from v2_tenants:
--   USING (owner_user_id = auth.uid())
--
-- This broke v2_user_tenants_view for non-owner members:
-- the tenant row was invisible, so the view returned nothing.
--
-- Fix: replace with a policy that delegates to get_my_tenant_ids(),
-- which already resolves both ownership and active memberships
-- (SECURITY DEFINER — bypasses RLS on v2_tenant_memberships safely).
-- =========================================

DROP POLICY IF EXISTS "Tenant can read own tenants" ON public.v2_tenants;

CREATE POLICY "Users can read their tenants"
ON public.v2_tenants
FOR SELECT TO authenticated
USING (id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
