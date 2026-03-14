BEGIN;

-- =============================================================================
-- V2: Fix v2_tenants SELECT policy to break bootstrap RLS recursion
-- =============================================================================
--
-- Problem:
--   During tenant creation the SECURITY DEFINER triggers
--   (handle_new_tenant_membership, handle_new_tenant_system_group) fire
--   before the ownership row is visible through get_my_tenant_ids().
--
--   The membership INSERT policy on v2_tenant_memberships checks:
--     EXISTS (SELECT 1 FROM v2_tenants WHERE id = ... AND owner_user_id = auth.uid())
--
--   But the v2_tenants SELECT policy only allowed:
--     id IN (SELECT get_my_tenant_ids())
--
--   get_my_tenant_ids() itself queries v2_tenant_memberships, which in turn
--   needs to read v2_tenants — a circular dependency that can deadlock or
--   return empty during the bootstrap window.
--
-- Fix:
--   Add owner_user_id = auth.uid() as an explicit short-circuit so the
--   tenant owner can always read their own row directly, without touching
--   get_my_tenant_ids() at all. Members still resolve through memberships.
--
-- No write permissions are changed.
-- =============================================================================

DROP POLICY IF EXISTS "Users can read their tenants" ON public.v2_tenants;

CREATE POLICY "Users can read their tenants"
ON public.v2_tenants
FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid()
  OR id IN (SELECT public.get_my_tenant_ids())
);

COMMIT;
