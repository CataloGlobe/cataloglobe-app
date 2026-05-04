-- =============================================================================
-- Extend public.get_my_pending_invites() to include tenant_name via DB join.
--
-- Elimina la second batch query in WorkspacePage.tsx (SELECT id,name FROM tenants)
-- e rimuove i cast `any` lato consumer. Body identico all'originale (migration
-- 20260427100000_security_advisor_fixes.sql, STEP 4) con SOLO l'aggiunta del
-- JOIN public.tenants e del campo tenant_name nella SELECT/RETURNS TABLE.
--
-- DROP + CREATE perché stiamo cambiando la signature TABLE (CREATE OR REPLACE
-- non può cambiare il return type).
--
-- Permission stack ricostruito:
--   - 20260427100000: GRANT EXECUTE TO authenticated
--   - 20260429170000: REVOKE EXECUTE FROM anon
--   - 20260429180000: REVOKE EXECUTE FROM PUBLIC
-- Re-applico tutto qui per preservare lo stato pre-DROP.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_my_pending_invites();

CREATE FUNCTION public.get_my_pending_invites()
RETURNS TABLE(
    membership_id uuid,
    tenant_id     uuid,
    tenant_name   text,
    invite_token  uuid,
    role          text,
    status        text,
    inviter_email text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
    SELECT
        tm.id              AS membership_id,
        tm.tenant_id,
        t.name             AS tenant_name,
        tm.invite_token,
        tm.role,
        tm.status,
        inviter.email::text AS inviter_email
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_pending_invites() TO authenticated;

COMMIT;
