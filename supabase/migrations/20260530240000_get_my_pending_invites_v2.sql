-- =============================================================================
-- Fase 5.B.3 — get_my_pending_invites rewrite (v2)
--
-- Aggiunge effective_role + activity_ids + activity_names per InviteModal
-- workspace (mostra info dell'invito ricevuto). Vecchia firma ritornava
-- solo `role` raw (NULL per scoped → display "Member" fallback BUG).
--
-- Cambio firma:
--   OLD: RETURNS TABLE(membership_id, tenant_id, tenant_name, invite_token,
--                      role text, status, inviter_email)
--   NEW: RETURNS TABLE(membership_id, tenant_id, tenant_name, invite_token,
--                      effective_role text, status, inviter_email,
--                      activity_ids uuid[], activity_names text[])
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_my_pending_invites();

CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE(
  membership_id  uuid,
  tenant_id      uuid,
  tenant_name    text,
  invite_token   uuid,
  effective_role text,
  status         text,
  inviter_email  text,
  activity_ids   uuid[],
  activity_names text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    tm.id              AS membership_id,
    tm.tenant_id,
    t.name             AS tenant_name,
    tm.invite_token,
    COALESCE(
      tm.role,
      (
        SELECT tma_p.role
        FROM public.tenant_membership_activities tma_p
        WHERE tma_p.tenant_membership_id = tm.id
        ORDER BY CASE tma_p.role
                   WHEN 'manager' THEN 1
                   WHEN 'staff'   THEN 2
                   WHEN 'viewer'  THEN 3
                   ELSE 99
                 END
        LIMIT 1
      ),
      'unknown'
    )::text            AS effective_role,
    tm.status          AS status,
    inviter.email::text AS inviter_email,
    COALESCE(
      (
        SELECT ARRAY_AGG(tma_a.activity_id ORDER BY tma_a.activity_id)
        FROM public.tenant_membership_activities tma_a
        WHERE tma_a.tenant_membership_id = tm.id
      ),
      ARRAY[]::uuid[]
    )                  AS activity_ids,
    COALESCE(
      (
        SELECT ARRAY_AGG(act.name ORDER BY tma_n.activity_id)
        FROM public.tenant_membership_activities tma_n
        JOIN public.activities act ON act.id = tma_n.activity_id
        WHERE tma_n.tenant_membership_id = tm.id
      ),
      ARRAY[]::text[]
    )                  AS activity_names
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
  WHERE tm.status = 'pending'
    AND tm.invited_by IS DISTINCT FROM auth.uid()
    AND (tm.invite_expires_at IS NULL OR tm.invite_expires_at > now())
    AND (
      lower(tm.invited_email) = lower(auth.email())
      OR tm.user_id = auth.uid()
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_pending_invites() TO authenticated;
