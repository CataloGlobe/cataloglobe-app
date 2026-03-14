BEGIN;

-- =========================================
-- V2: RESEND INVITE RPC
-- =========================================
--
-- resend_invite(p_membership_id)
--
-- Generates a fresh invite token for an existing membership row (any non-active
-- status) and fires a new invite email via pg_net.
--
-- Handles all non-active statuses:
--   pending  — refreshes token + expiry, resends email (same person, new link)
--   expired  — reactivates to pending with new token
--   revoked  — reactivates to pending with new token
--
-- Rules:
--   - Caller must be an active owner or admin of the tenant.
--   - Cannot resend to an active member (they are already in the team).
--
-- Returns TRUE if the invite was sent, FALSE if the membership was not found.
-- =========================================

CREATE OR REPLACE FUNCTION public.resend_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id       uuid;
  v_status          text;
  v_email           text;
  v_role            text;
  v_token           uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
  v_updated_id      uuid;
BEGIN
  -- Fetch the membership and resolve the invitee email
  SELECT
    tm.tenant_id,
    tm.status,
    COALESCE(u.email, tm.invited_email),
    tm.role
  INTO v_tenant_id, v_status, v_email, v_role
  FROM public.v2_tenant_memberships tm
  LEFT JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'cannot resend invite to an active member';
  END IF;

  -- Caller must be an active owner or admin of the tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Resolve data needed for the email body
  SELECT t.name INTO v_tenant_name
  FROM public.v2_tenants t
  WHERE t.id = v_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  -- Refresh the row: set to pending with a new token and fresh expiry
  UPDATE public.v2_tenant_memberships
  SET
    status             = 'pending',
    invite_token       = v_token,
    invite_sent_at     = now(),
    invite_expires_at  = now() + interval '7 days',
    invite_accepted_at = NULL,
    invited_by         = auth.uid()
  WHERE id = p_membership_id
  RETURNING id INTO v_updated_id;

  -- Fire-and-forget: send new invite email via pg_net
  PERFORM net.http_post(
    url     := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        v_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN v_updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resend_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resend_invite(uuid) TO service_role;

COMMIT;
