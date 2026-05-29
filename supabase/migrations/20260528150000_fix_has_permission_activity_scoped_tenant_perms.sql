-- =============================================================================
-- Permessi multi-sede — Fix has_permission(): missing branch for
-- tenant-scoped permissions held by activity-scoped roles.
--
-- BUG (Fase 1 — 20260526170000):
--   The original has_permission() only matched:
--     - tenant-scoped permissions via owner/admin
--     - activity-scoped permissions via tenant_membership_activities
--   It did NOT cover the case where an activity-scoped role
--   (manager/staff/viewer) holds a tenant-scoped permission via
--   role_permissions seed.
--
--   Example: manager has 'team.invite' (scope=tenant) per matrix.
--   The user has role='manager' in tenant_membership_activities, but no
--   row in tenant_memberships with role='admin'. Result:
--   has_permission('team.invite', NULL) returned false when it should be true.
--
-- Tenant-scoped permissions wrongly returned false for the affected roles:
--   manager: tenant.read, team.read, team.invite, team.manage_roles,
--            team.remove, products.read, catalogs.read, styles.read,
--            activity_groups.read
--   staff:   tenant.read, products.read, catalogs.read, styles.read
--   viewer:  tenant.read, products.read, catalogs.read, styles.read
--
-- FIX: rewrite has_permission() with 4 explicit branches:
--   1. Owner of tenant holds the permission
--   2. Admin membership in tenant holds the permission
--   3. NEW — activity-scoped role grants a tenant-scoped permission via
--      role_permissions
--   4. Activity-scoped role grants an activity-scoped permission on the
--      specific p_activity_id
--
-- Notes:
--   - Function signature unchanged: has_permission(text, uuid DEFAULT NULL).
--   - SECURITY DEFINER + SET search_path TO '' preserved.
--   - Prior REVOKE/GRANT on EXECUTE survive CREATE OR REPLACE — no need
--     to re-issue them (verified against the original migration
--     20260526170000_permissions_foundation.sql).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_id text,
  p_activity_id   uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH permission_info AS (
    SELECT scope FROM public.permissions WHERE id = p_permission_id
  )
  SELECT
    -- BRANCH 1: owner of tenant holds the permission
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'owner' AND rp.permission_id = p_permission_id
        )
    )
    OR
    -- BRANCH 2: admin of tenant holds the permission
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id  = auth.uid()
        AND tm.status   = 'active'
        AND tm.role     = 'admin'
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'admin' AND rp.permission_id = p_permission_id
        )
    )
    OR
    -- BRANCH 3 (NEW): activity-scoped role grants a tenant-scoped
    -- permission via role_permissions seed.
    -- Only applies when permission scope = 'tenant'.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'tenant'
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.role_permissions     rp ON rp.role = tma.role
      WHERE tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND rp.permission_id = p_permission_id
    )
    OR
    -- BRANCH 4: activity-scoped role grants an activity-scoped permission
    -- on the specific p_activity_id.
    -- Only applies when permission scope = 'activity' and p_activity_id is set.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'activity'
                                                  AND tma.activity_id = p_activity_id
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.role_permissions     rp ON rp.role = tma.role
      WHERE p_activity_id IS NOT NULL
        AND tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND rp.permission_id = p_permission_id
    );
$$;

COMMENT ON FUNCTION public.has_permission(text, uuid) IS
  'Verifica se l''utente corrente ha un permesso atomico. '
  '4 branch: (1) owner del tenant, (2) admin del tenant, '
  '(3) ruolo activity-scoped che possiede un permesso tenant-scoped via '
  'role_permissions seed, (4) ruolo activity-scoped che possiede un '
  'permesso activity-scoped sulla p_activity_id passata. '
  'Per permessi tenant-scoped p_activity_id può essere NULL. '
  'Per permessi activity-scoped p_activity_id è obbligatorio.';

COMMIT;
