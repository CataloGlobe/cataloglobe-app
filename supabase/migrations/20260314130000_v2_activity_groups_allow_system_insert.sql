BEGIN;

-- =========================================================
-- Fix: allow INSERT of system rows in v2_activity_groups
-- =========================================================
--
-- Root cause: handle_new_tenant_system_group() (SECURITY DEFINER)
-- inserts a system activity group immediately after tenant creation.
-- At that moment the owner's membership row in v2_tenant_memberships
-- has not yet been committed, so get_my_tenant_ids() returns an empty
-- set and the INSERT fails RLS — surfacing as a v2_tenants violation.
--
-- Fix: extend the INSERT policy to also allow rows where is_system = TRUE.
-- System rows are only created by the trigger (which sets is_system = TRUE);
-- non-system user-created groups still require normal tenant ownership.
-- =========================================================

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.v2_activity_groups;

CREATE POLICY "Tenant insert own rows"
ON public.v2_activity_groups
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id IN (SELECT public.get_my_tenant_ids())
  OR is_system = TRUE
);

COMMIT;
