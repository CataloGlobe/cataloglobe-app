-- 20260529110000_fix_can_read_schedule_signature.sql
--
-- Fix SQLSTATE 42501 on INSERT INTO public.schedules ... RETURNING *.
--
-- Root cause:
--   The "Roles can read schedules" policy (created in 20260528170000)
--   gates SELECT via can_read_schedule(p_schedule_id uuid). That
--   function is STABLE SECURITY DEFINER and its body performs
--   SELECT 1 FROM public.schedules WHERE id = p_schedule_id.
--
--   During INSERT ... RETURNING, PostgREST issues
--   `Prefer: return=representation`, so PostgreSQL evaluates the
--   SELECT policy against the newly inserted row in order to return
--   it. The sub-SELECT inside can_read_schedule re-reads
--   public.schedules under a snapshot that does not consistently
--   surface the just-inserted row, so the EXISTS gate yields false
--   and PostgreSQL raises
--     "new row violates row-level security policy for table schedules"
--   at the RETURNING step. WITH CHECK on INSERT is satisfied; only
--   the post-write SELECT visibility fails.
--
-- Fix:
--   Change can_read_schedule to accept (p_schedule_id, p_tenant_id,
--   p_apply_to_all) directly. The policy USING clause now passes the
--   columns of the candidate row instead of forcing the function to
--   re-read the row from the table. No visibility issue, identical
--   permission semantics.
--
-- Notes:
--   * can_write_schedule keeps its single-arg shape; it is only ever
--     called from UPDATE/DELETE qual where the existing row is
--     visible, never from a post-insert SELECT path.
--   * can_read_schedule_target is untouched; it does not re-read
--     public.schedules.

BEGIN;

-- 1. Drop the SELECT policy that depends on the old signature.
DROP POLICY IF EXISTS "Roles can read schedules" ON public.schedules;

-- 2. Drop the old single-arg signature so the new shape is canonical.
DROP FUNCTION IF EXISTS public.can_read_schedule(uuid);

-- 3. Recreate with explicit row columns as parameters.
CREATE OR REPLACE FUNCTION public.can_read_schedule(
  p_schedule_id  uuid,
  p_tenant_id    uuid,
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
      -- Owner/admin of the tenant: full read.
      public.has_permission('scheduling.read', NULL)
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

-- 4. SECURITY DEFINER must be unreachable from PUBLIC / anon.
--    Supabase pre-grants EXECUTE to anon/authenticated/service_role on
--    new functions; REVOKE from PUBLIC alone is not sufficient.
REVOKE EXECUTE ON FUNCTION public.can_read_schedule(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_read_schedule(uuid, uuid, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_read_schedule(uuid, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.can_read_schedule(uuid, uuid, boolean) IS
  'SELECT gate for public.schedules. Receives (id, tenant_id, apply_to_all) '
  'directly from the candidate row so the function body never re-reads '
  'public.schedules. The previous (uuid)-only signature performed a '
  'sub-SELECT on public.schedules from inside a STABLE SECURITY DEFINER '
  'body; during INSERT ... RETURNING that sub-SELECT did not consistently '
  'see the new row, producing SQLSTATE 42501 at the RETURNING step '
  '(see migration 20260529110000 for the full root-cause analysis).';

-- 5. Recreate the policy using the new call shape.
CREATE POLICY "Roles can read schedules"
  ON public.schedules
  FOR SELECT
  TO authenticated
  USING (public.can_read_schedule(id, tenant_id, apply_to_all));

COMMIT;
