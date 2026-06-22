-- Fix: revoke_invite owner-aware guard
--
-- Bug: il guard faceva un singolo EXISTS su tenant_memberships con
-- role IN ('owner','admin'). L'owner non ha riga in tenant_memberships
-- (vive su tenants.owner_user_id) → sempre rifiutato con P0001 'not allowed'.
-- Inoltre 'owner' e' dead code: il constraint su tenant_memberships.role
-- ammette solo NULL|'admin' (post-Fase 5.B.2).
--
-- Fix: pattern canonico a due check (stesso di resend_invite /
-- invite_tenant_member / change_member_role / remove_tenant_member):
--   owner via tenants.owner_user_id, admin via membership role='admin'.
--
-- Bar di permesso invariato nell'intento (owner OR admin). Nessun
-- has_permission, nessun manager. Resto del body identico al live,
-- inclusa la logica GDPR di azzeramento invited_email (20260503173131).
--
-- CREATE OR REPLACE puro: firma invariata → privilegi (GRANT authenticated
-- + service_role) preservati automaticamente. Niente REVOKE/GRANT qui
-- (evita SQLSTATE 42601). search_path TO 'public' invariato.

CREATE OR REPLACE FUNCTION public.revoke_invite(p_membership_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id       uuid;
  v_is_email_only   boolean;
  v_revoked_id      uuid;
  v_caller_is_owner boolean;
  v_caller_is_admin boolean;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Guard owner-aware: owner via tenants.owner_user_id, admin via membership.
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = v_tenant_id
      AND owner_user_id = auth.uid()
      AND deleted_at IS NULL
  );

  v_caller_is_admin := EXISTS (
    SELECT 1 FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      = 'admin'
  );

  IF NOT (v_caller_is_owner OR v_caller_is_admin) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT user_id IS NULL INTO v_is_email_only
  FROM public.tenant_memberships
  WHERE id = p_membership_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_is_email_only THEN
    DELETE FROM public.tenant_memberships
    WHERE id = p_membership_id
      AND status = 'pending'
    RETURNING id INTO v_revoked_id;
  ELSE
    UPDATE public.tenant_memberships
    SET
      status        = 'revoked',
      invite_token  = NULL,
      invited_email = NULL
    WHERE id = p_membership_id
      AND status = 'pending'
    RETURNING id INTO v_revoked_id;
  END IF;

  RETURN v_revoked_id IS NOT NULL;
END;
$function$;
