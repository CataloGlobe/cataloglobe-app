-- =============================================================================
-- get_users_with_activity_permission
-- =============================================================================
-- Inverse of has_permission(p_permission_id, p_activity_id): returns the set
-- of user_id values that would pass has_permission for the given permission
-- on the given activity.
--
-- Used SOLELY service-side (e.g. submit-reservation Edge Function) to fan
-- out notifications to every user authorized to manage / read the resource
-- without making one has_permission round-trip per candidate user.
--
-- Mirrors the 4 branches of has_permission exactly:
--   1. tenant owner          — when role_permissions has the seed for 'owner'
--   2. tenant-wide admin     — tenant_memberships.role='admin' + status='active' + seed
--   3. activity-scoped role for permissions with scope='tenant'
--      (any tma row in the tenant whose role has the seed)
--   4. activity-scoped role for permissions with scope='activity'
--      (tma.activity_id = p_activity_id, role has the seed)
--
-- Filters applied uniformly (mirror has_permission):
--   - tenants.deleted_at IS NULL
--   - tenant_memberships.status = 'active'
--   - role_permissions seed must exist for the calling permission
--
-- Defense-in-depth (extra vs has_permission, justified by downstream consumer):
--   - owner_user_id IS NOT NULL on branch 1
--   - tm.user_id   IS NOT NULL on branches 2 / 3 / 4
-- (notifications.user_id is NOT NULL — a NULL recipient would crash the
-- INSERT in the fan-out caller.)
--
-- UNION (NOT UNION ALL) deduplicates users that match more than one branch.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_users_with_activity_permission(
    p_permission_id text,
    p_activity_id   uuid
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
    -- BRANCH 1: tenant owner of the activity's tenant.
    SELECT t.owner_user_id AS user_id
    FROM public.activities a
    JOIN public.tenants    t ON t.id = a.tenant_id
    WHERE a.id = p_activity_id
      AND t.deleted_at IS NULL
      AND t.owner_user_id IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = 'owner'
            AND rp.permission_id = p_permission_id
      )

    UNION

    -- BRANCH 2: tenant-wide admin of the activity's tenant.
    SELECT tm.user_id
    FROM public.activities a
    JOIN public.tenants            t  ON t.id = a.tenant_id
    JOIN public.tenant_memberships tm ON tm.tenant_id = t.id
    WHERE a.id = p_activity_id
      AND t.deleted_at IS NULL
      AND tm.status    = 'active'
      AND tm.role      = 'admin'
      AND tm.user_id   IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = 'admin'
            AND rp.permission_id = p_permission_id
      )

    UNION

    -- BRANCH 3: activity-scoped role grants a permission with scope='tenant'.
    -- Any tma row in the tenant whose role seeds the permission qualifies.
    -- (Does not fire for reservations.* which are scope='activity'; included
    --  for general correctness of the helper.)
    SELECT tm.user_id
    FROM public.activities a
    JOIN public.tenants                       t   ON t.id = a.tenant_id
    JOIN public.tenant_membership_activities  tma ON tma.tenant_id = t.id
    JOIN public.tenant_memberships            tm  ON tm.id = tma.tenant_membership_id
    JOIN public.permissions                   p   ON p.id  = p_permission_id
    JOIN public.role_permissions              rp  ON rp.role = tma.role
                                                AND rp.permission_id = p_permission_id
    WHERE a.id = p_activity_id
      AND t.deleted_at IS NULL
      AND tm.status    = 'active'
      AND tm.user_id   IS NOT NULL
      AND p.scope      = 'tenant'

    UNION

    -- BRANCH 4: activity-scoped role grants a permission with scope='activity',
    -- on the specific p_activity_id.
    SELECT tm.user_id
    FROM public.tenant_membership_activities tma
    JOIN public.tenant_memberships          tm  ON tm.id = tma.tenant_membership_id
    JOIN public.tenants                     t   ON t.id  = tma.tenant_id
    JOIN public.permissions                 p   ON p.id  = p_permission_id
    JOIN public.role_permissions            rp  ON rp.role = tma.role
                                              AND rp.permission_id = p_permission_id
    WHERE tma.activity_id = p_activity_id
      AND t.deleted_at    IS NULL
      AND tm.status       = 'active'
      AND tm.user_id      IS NOT NULL
      AND p.scope         = 'activity';
$$;

-- Lock down: SECURITY DEFINER → only service_role may invoke. Supabase grants
-- EXECUTE to anon/authenticated by default; REVOKE explicitly to close that.
REVOKE EXECUTE ON FUNCTION public.get_users_with_activity_permission(text, uuid)
    FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.get_users_with_activity_permission(text, uuid)
    TO service_role;

COMMENT ON FUNCTION public.get_users_with_activity_permission(text, uuid) IS
    'Inverse of has_permission(p_permission_id, p_activity_id): returns user_id '
    'values that would pass has_permission for the given (permission, activity). '
    'Used by fan-out notifications. service_role only.';
