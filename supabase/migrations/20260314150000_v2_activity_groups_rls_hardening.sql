BEGIN;

-- =========================================================
-- Hardening: remove temporary bootstrap workaround
-- =========================================================
--
-- The policy previously allowed:
--    OR is_system = TRUE
-- to bypass RLS during tenant bootstrap.
--
-- After fixing the v2_tenants SELECT policy to allow:
--    owner_user_id = auth.uid()
-- the bootstrap deadlock is resolved and this workaround
-- is no longer required.
--
-- This migration restores the secure rule:
--    tenant_id IN (SELECT get_my_tenant_ids())
--
-- preventing potential write-only pollution.
-- =========================================================

DROP POLICY IF EXISTS "Tenant insert own rows"
ON public.v2_activity_groups;

CREATE POLICY "Tenant insert own rows"
ON public.v2_activity_groups
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT get_my_tenant_ids()
  )
);

COMMIT;