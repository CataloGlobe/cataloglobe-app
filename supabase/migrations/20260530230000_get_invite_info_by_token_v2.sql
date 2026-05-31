-- =============================================================================
-- Fase 5.B.3 — get_invite_info_by_token rewrite (v2)
--
-- La vecchia firma ritornava solo `role` raw (NULL per ruoli activity-scoped).
-- InvitePage + InviteModal mostravano "Member" fallback per manager/staff/viewer.
--
-- Cambio firma:
--   OLD: RETURNS TABLE(tenant_id, tenant_name, role text, status text)
--   NEW: RETURNS TABLE(tenant_id, tenant_name, effective_role text, status text,
--                      activity_ids uuid[], activity_names text[])
--
-- Pre-auth function: chiamabile da anon (utente non ancora loggato che cliccia
-- il link invito). Lookup per token UUID = sufficiente sicurezza
-- (token gen_random_uuid + invite_expires_at + status='pending' filter).
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_invite_info_by_token(uuid);

CREATE OR REPLACE FUNCTION public.get_invite_info_by_token(p_token uuid)
RETURNS TABLE(
  tenant_id      uuid,
  tenant_name    text,
  effective_role text,
  status         text,
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
    t.id                                AS tenant_id,
    t.name                              AS tenant_name,
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
    )::text                             AS effective_role,
    tm.status::text                     AS status,
    COALESCE(
      (
        SELECT ARRAY_AGG(tma_a.activity_id ORDER BY tma_a.activity_id)
        FROM public.tenant_membership_activities tma_a
        WHERE tma_a.tenant_membership_id = tm.id
      ),
      ARRAY[]::uuid[]
    )                                   AS activity_ids,
    COALESCE(
      (
        SELECT ARRAY_AGG(act.name ORDER BY tma_n.activity_id)
        FROM public.tenant_membership_activities tma_n
        JOIN public.activities act ON act.id = tma_n.activity_id
        WHERE tma_n.tenant_membership_id = tm.id
      ),
      ARRAY[]::text[]
    )                                   AS activity_names
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.invite_token = p_token;
END;
$function$;

-- Lockdown grants (pre-auth: anon + authenticated)
REVOKE EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_invite_info_by_token(uuid) IS
'Lookup invito pubblico via token UUID. Pre-auth (anon + authenticated). '
'Restituisce effective_role + activity_ids/names per display InvitePage/InviteModal. '
'Empty result se token non valido.';
