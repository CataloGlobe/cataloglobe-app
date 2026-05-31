-- =============================================================================
-- Permessi multi-sede — Fix infinite recursion on schedules ↔ schedule_targets
--
-- BUG (Fase 2 — 20260528120000):
--   The SELECT policy "Roles can read schedules" contains an EXISTS subquery
--   on schedule_targets. The SELECT policy "Roles can read schedule_targets"
--   contains an EXISTS subquery on schedules. When the planner tries to
--   resolve a SELECT on schedules, it recursively applies both policies,
--   producing SQLSTATE 42P17 "infinite recursion detected in policy for
--   relation schedules". The Programmazione frontend page is broken for
--   every role, including owner.
--
-- FIX strategy — "SECURITY DEFINER gateway functions":
--   Move the cross-table check inside SECURITY DEFINER functions. Inside a
--   SECURITY DEFINER body the inner queries bypass the caller's RLS, so the
--   recursion is broken. The policies become trivial calls.
--
-- Step 1: can_read_schedule(uuid)
-- Step 2: can_read_schedule_target(uuid, text, uuid)
-- Step 3: DROP + CREATE the two SELECT policies referencing the new helpers
--
-- Step 4 audit (executed via MCP staging pg_policies):
--   Only schedules ↔ schedule_targets are mutually recursive. Other policies
--   that JOIN across tables either:
--     - call has_permission(text, uuid) which is SECURITY DEFINER → bypass
--     - reference orders/activities whose own policies are pure has_permission()
--       calls with no back-reference (no cycle).
--   Verified scan covered: order_items, activity_media,
--   activity_product_overrides, activity_slug_aliases, activity_group_members,
--   featured_contents, schedule_featured_contents, product_availability_overrides,
--   analytics_events, reviews, tables, customer_sessions, order_groups.
--   None require additional SECURITY DEFINER gateways.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 1 — can_read_schedule(uuid)
--
-- Semantic mirror of the original "Roles can read schedules" policy:
--   - owner/admin in the schedule's tenant see everything
--   - activity-scoped roles see apply_to_all schedules iff they hold
--     scheduling.read on at least one activity in the tenant
--   - activity-scoped roles see specific-target schedules iff at least one
--     target resolves to an activity they hold scheduling.read on
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_schedule(p_schedule_id uuid)
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
        -- Owner/admin of the tenant see all schedules
        public.has_permission('scheduling.read', NULL)
        OR (
          -- Activity-scoped roles: must hold scheduling.read in the tenant
          -- AND the schedule must either apply_to_all or have at least one
          -- target on one of their activities
          public.has_permission_any_activity('scheduling.read', s.tenant_id)
          AND (
            s.apply_to_all = true
            OR EXISTS (
              SELECT 1
              FROM public.schedule_targets st
              WHERE st.schedule_id = s.id
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
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_schedule(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_read_schedule(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_read_schedule(uuid) IS
  'SECURITY DEFINER gateway used by the SELECT policy on schedules. '
  'Breaks the schedules ↔ schedule_targets RLS recursion (Fase 2 fix).';

-- -----------------------------------------------------------------------------
-- Step 2 — can_read_schedule_target(uuid, text, uuid)
--
-- Semantic mirror of "Roles can read schedule_targets":
--   - owner/admin see all targets of schedules in their tenants
--   - activity-scoped roles see targets that resolve to an activity they
--     hold scheduling.read on (direct activity target OR activity_group
--     whose members include such an activity)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_schedule_target(
  p_schedule_id uuid,
  p_target_type text,
  p_target_id   uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT
    -- Owner/admin in the schedule's tenant see all targets
    EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.id = p_schedule_id
        AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission('scheduling.read', NULL)
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
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_schedule_target(uuid, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.can_read_schedule_target(uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.can_read_schedule_target(uuid, text, uuid) IS
  'SECURITY DEFINER gateway used by the SELECT policy on schedule_targets. '
  'Breaks the schedules ↔ schedule_targets RLS recursion (Fase 2 fix).';

-- -----------------------------------------------------------------------------
-- Step 3 — Replace the two SELECT policies with trivial gateway calls
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Roles can read schedules" ON public.schedules;

CREATE POLICY "Roles can read schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (public.can_read_schedule(id));

DROP POLICY IF EXISTS "Roles can read schedule_targets" ON public.schedule_targets;

CREATE POLICY "Roles can read schedule_targets"
  ON public.schedule_targets FOR SELECT TO authenticated
  USING (public.can_read_schedule_target(schedule_id, target_type, target_id));

COMMIT;
