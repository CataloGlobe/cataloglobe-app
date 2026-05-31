-- =============================================================================
-- Permessi multi-sede — Fase 2 hardening (post security-review).
--
-- Addresses:
--   - HIGH (Vuln 1): cross-sede write hole on public.schedules. A manager
--     assigned to sede A could DELETE/UPDATE a schedule whose targets
--     reference only sede B (via cascade on schedule_targets), because the
--     existing UPDATE/DELETE policies only gated on
--     has_permission_any_activity('scheduling.write', tenant_id). This fix
--     adds a SECURITY DEFINER gateway can_write_schedule(uuid) that requires
--     either owner/admin role OR (activity-scoped role + apply_to_all=false
--     + at least one target + every target resolved to one of the caller's
--     activities).
--
--   - DiD-1: REVOKE EXECUTE FROM anon on the 5 helpers introduced by the
--     epic. PostgREST anon pre-grants don't bypass auth.uid() filters today,
--     but explicit revoke aligns with CLAUDE.md storage-sql pattern.
--
--   - DiD-2: has_permission BRANCH 3 and BRANCH 4 + has_permission_any_activity
--     activity-scoped branch did not filter tenants.deleted_at. During the
--     30-day soft-delete grace window an activity-scoped member retained
--     write authority on orders/tables. Adds the JOIN tenants ON … AND
--     t.deleted_at IS NULL.
--
--   - DiD-3: convert the PERMISSIVE write-blockers on
--     tenant_membership_activities, schedule_targets, analytics_events to
--     RESTRICTIVE policies (one per write cmd). PERMISSIVE blockers are
--     OR-defeated by any future permissive write policy; RESTRICTIVE are
--     AND-combined and cannot be bypassed.
--
-- NOT in scope: shipping the update_schedule_with_targets() RPC (Fase 3).
-- Direct schedules INSERT continues via the existing permissive policy,
-- which is correct since INSERT cannot mutate targets that don't yet exist.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Section 1 — HIGH: can_write_schedule(uuid) + tighten schedules WRITE policies
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_write_schedule(p_schedule_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
      AND (
        -- Owner/admin: full write. has_permission('scheduling.write', NULL)
        -- short-circuits to TRUE only for owner/admin because scheduling.write
        -- is scope='activity' and BRANCH 3 (tenant scope) / BRANCH 4
        -- (activity scope but p_activity_id IS NULL) both miss.
        public.has_permission('scheduling.write', NULL)
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
$$;

REVOKE EXECUTE ON FUNCTION public.can_write_schedule(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.can_write_schedule(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_write_schedule(uuid) IS
  'SECURITY DEFINER gateway used by UPDATE/DELETE policies on schedules. '
  'Returns true if the caller is owner/admin, or has scheduling.write on '
  'every target activity of the schedule (apply_to_all=true is reserved to '
  'owner/admin). Closes the cross-sede write hole identified in security '
  'review Fase 2 (Vuln 1).';

-- Replace UPDATE policy
DROP POLICY IF EXISTS "Roles can update schedules" ON public.schedules;

CREATE POLICY "Roles can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING       (public.can_write_schedule(id))
  WITH CHECK  (public.can_write_schedule(id));

-- Replace DELETE policy
DROP POLICY IF EXISTS "Roles can delete schedules" ON public.schedules;

CREATE POLICY "Roles can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (public.can_write_schedule(id));

-- INSERT policy left intact: existing "Roles can insert schedules" gates by
-- has_permission_any_activity('scheduling.write', tenant_id). At INSERT time
-- targets do not yet exist, so cross-sede mutation is impossible at this step.

-- =============================================================================
-- Section 2 — DiD-1: REVOKE EXECUTE FROM anon on the 5 existing helpers
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_my_activity_ids()                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text, uuid)                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission_any_activity(text, uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_schedule(uuid)                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_schedule_target(uuid, text, uuid)           FROM anon;

-- =============================================================================
-- Section 3 — DiD-2: filter tenants.deleted_at in activity-scoped branches
-- =============================================================================

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
    -- BRANCH 3: activity-scoped role grants a tenant-scoped permission via
    -- role_permissions seed. Only fires when permission scope = 'tenant'.
    -- Hardening: filter out soft-deleted tenants.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'tenant'
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.tenants               t   ON t.id = tma.tenant_id
      JOIN public.role_permissions      rp  ON rp.role = tma.role
      WHERE tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND t.deleted_at     IS NULL
        AND rp.permission_id = p_permission_id
    )
    OR
    -- BRANCH 4: activity-scoped role grants an activity-scoped permission
    -- on the specific p_activity_id. Hardening: filter out soft-deleted tenants.
    EXISTS (
      SELECT 1
      FROM permission_info pi
      JOIN public.tenant_membership_activities tma ON pi.scope = 'activity'
                                                  AND tma.activity_id = p_activity_id
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.tenants               t  ON t.id = tma.tenant_id
      JOIN public.role_permissions      rp ON rp.role = tma.role
      WHERE p_activity_id IS NOT NULL
        AND tm.user_id       = auth.uid()
        AND tm.status        = 'active'
        AND t.deleted_at     IS NULL
        AND rp.permission_id = p_permission_id
    );
$$;

COMMENT ON FUNCTION public.has_permission(text, uuid) IS
  'Verifica se l''utente corrente ha un permesso atomico. '
  '4 branch: (1) owner del tenant, (2) admin del tenant, '
  '(3) ruolo activity-scoped che possiede un permesso tenant-scoped via '
  'role_permissions seed, (4) ruolo activity-scoped che possiede un '
  'permesso activity-scoped sulla p_activity_id passata. '
  'Tutti i branch filtrano tenants.deleted_at IS NULL (hardening Fase 2).';

-- Hardening on has_permission_any_activity: same fix on the activity-scoped branch
CREATE OR REPLACE FUNCTION public.has_permission_any_activity(
  p_permission_id text,
  p_tenant_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    -- owner of the tenant
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'owner' AND rp.permission_id = p_permission_id
        )
    )
    OR
    -- admin membership in the tenant
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.status    = 'active'
        AND tm.role      = 'admin'
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'admin' AND rp.permission_id = p_permission_id
        )
    )
    OR
    -- activity-scoped assignment in the tenant. Hardening: filter
    -- tenants.deleted_at IS NULL.
    EXISTS (
      SELECT 1
      FROM public.tenant_membership_activities tma
      JOIN public.tenant_memberships tm ON tm.id  = tma.tenant_membership_id
      JOIN public.tenants               t  ON t.id  = tma.tenant_id
      JOIN public.role_permissions     rp ON rp.role = tma.role
      WHERE tma.tenant_id     = p_tenant_id
        AND tm.user_id        = auth.uid()
        AND tm.status         = 'active'
        AND t.deleted_at      IS NULL
        AND rp.permission_id  = p_permission_id
    );
$$;

-- =============================================================================
-- Section 4 — DiD-3: convert write-blockers to RESTRICTIVE
--
-- The PERMISSIVE FOR ALL USING(false) policies coexist with PERMISSIVE
-- SELECT policies. PERMISSIVE policies are OR-combined per command, so the
-- USING(false) clause is OR-discarded if any future permissive write policy
-- is added. Switch to one RESTRICTIVE per write command (INSERT/UPDATE/
-- DELETE). RESTRICTIVE policies AND-combine and cannot be bypassed.
--
-- Each RESTRICTIVE FOR <cmd>:
--   - INSERT  → WITH CHECK (false)
--   - UPDATE  → USING (false) WITH CHECK (false)
--   - DELETE  → USING (false)
-- =============================================================================

-- tenant_membership_activities
DROP POLICY IF EXISTS "No direct writes" ON public.tenant_membership_activities;

CREATE POLICY "No direct INSERT"
  ON public.tenant_membership_activities AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct UPDATE"
  ON public.tenant_membership_activities AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No direct DELETE"
  ON public.tenant_membership_activities AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- schedule_targets
DROP POLICY IF EXISTS "No direct writes to schedule_targets" ON public.schedule_targets;

CREATE POLICY "No direct INSERT on schedule_targets"
  ON public.schedule_targets AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct UPDATE on schedule_targets"
  ON public.schedule_targets AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No direct DELETE on schedule_targets"
  ON public.schedule_targets AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

-- analytics_events
DROP POLICY IF EXISTS "No direct writes to analytics_events" ON public.analytics_events;

CREATE POLICY "No direct INSERT on analytics_events"
  ON public.analytics_events AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct UPDATE on analytics_events"
  ON public.analytics_events AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "No direct DELETE on analytics_events"
  ON public.analytics_events AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

COMMIT;
