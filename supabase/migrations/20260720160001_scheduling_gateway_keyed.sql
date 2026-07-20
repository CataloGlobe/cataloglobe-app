-- Grant per has_permission_owner_admin (creata in 20260720160000, senza
-- REVOKE/GRANT nello stesso file per evitare il 42601 di CREATE FUNCTION +
-- REVOKE/GRANT combinati — vedi docs/patterns/storage-sql.md).

REVOKE EXECUTE ON FUNCTION public.has_permission_owner_admin(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission_owner_admin(text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_permission_owner_admin(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.has_permission_owner_admin(text, uuid) IS
  'Owner/admin-only permission check, keyed on tenant_id. Isolates branch 1+2 '
  'of has_permission_any_activity (no activity-scoped-role branch) for use in '
  'gateway functions that need a full-access check correlated to a specific '
  'tenant without the target-filtering semantics of activity-scoped roles.';

-- Fix gap #6 (residuo scheduling): can_read_schedule, can_read_schedule_target,
-- can_write_schedule usano has_permission(perm, NULL) bare per il ramo
-- owner/admin. Sostituito con has_permission_owner_admin(perm, tenant_id),
-- keyed sul tenant dello schedule. Il ramo activity-scoped (gia' corretto,
-- con filtro su schedule_targets ∩ get_my_activity_ids()) resta invariato.
-- CREATE OR REPLACE preserva i grant esistenti delle 3 funzioni: nessun
-- REVOKE/GRANT necessario qui.

-- ── can_read_schedule(uuid, uuid, boolean) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_schedule(
  p_schedule_id uuid,
  p_tenant_id uuid,
  p_apply_to_all boolean
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    p_tenant_id IN (SELECT public.get_my_tenant_ids())
    AND (
      -- Owner/admin of the tenant: full read. Keyed on p_tenant_id.
      public.has_permission_owner_admin('scheduling.read', p_tenant_id)
      OR (
        -- Activity-scoped role with scheduling.read in this tenant:
        -- visible only if apply_to_all OR at least one target on a
        -- caller-accessible activity.
        public.has_permission_any_activity('scheduling.read', p_tenant_id)
        AND (
          p_apply_to_all = true
          OR EXISTS (
            SELECT 1
            FROM public.schedule_targets st
            WHERE st.schedule_id = p_schedule_id
              AND (
                (st.target_type = 'activity'
                  AND st.target_id IN (SELECT public.get_my_activity_ids()))
                OR (st.target_type = 'activity_group' AND EXISTS (
                  SELECT 1 FROM public.activity_group_members agm
                  WHERE agm.group_id = st.target_id
                    AND agm.activity_id IN (SELECT public.get_my_activity_ids())
                ))
              )
          )
        )
      )
    );
$function$;

-- ── can_read_schedule_target(uuid, text, uuid) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.can_read_schedule_target(
  p_schedule_id uuid,
  p_target_type text,
  p_target_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    -- Owner/admin in the schedule's tenant see all targets. Keyed on
    -- s.tenant_id (the schedule's own tenant).
    EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.id = p_schedule_id
        AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_owner_admin('scheduling.read', s.tenant_id)
    )
    OR (
      p_target_type = 'activity'
      AND public.has_permission('scheduling.read', p_target_id)
    )
    OR (
      p_target_type = 'activity_group'
      AND EXISTS (
        SELECT 1 FROM public.activity_group_members agm
        WHERE agm.group_id = p_target_id
          AND public.has_permission('scheduling.read', agm.activity_id)
      )
    );
$function$;

-- ── can_write_schedule(uuid) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_write_schedule(p_schedule_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
      AND (
        -- Owner/admin: full write. Keyed on s.tenant_id.
        public.has_permission_owner_admin('scheduling.write', s.tenant_id)
        OR (
          -- Activity-scoped role with scheduling.write in this tenant.
          public.has_permission_any_activity('scheduling.write', s.tenant_id)
          -- apply_to_all is a tenant-wide mutation — reserved to owner/admin.
          AND s.apply_to_all = false
          -- The schedule must have at least one target. A row with
          -- apply_to_all=false AND no targets is anomalous; deny by default.
          AND EXISTS (
            SELECT 1 FROM public.schedule_targets st
            WHERE st.schedule_id = s.id
          )
          -- Every target must resolve to one of the caller's activities.
          AND NOT EXISTS (
            SELECT 1 FROM public.schedule_targets st
            WHERE st.schedule_id = s.id
              AND NOT (
                (st.target_type = 'activity'
                  AND st.target_id IN (SELECT public.get_my_activity_ids()))
                OR (st.target_type = 'activity_group' AND EXISTS (
                  SELECT 1 FROM public.activity_group_members agm
                  WHERE agm.group_id = st.target_id
                    AND agm.activity_id IN (SELECT public.get_my_activity_ids())
                ))
              )
          )
        )
      )
  );
$function$;
