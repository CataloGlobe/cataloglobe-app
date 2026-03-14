BEGIN;

-- =========================================
-- V2: HANDLE RACE CONDITION IN invite_tenant_member
-- =========================================
--
-- Two admins sending an invite simultaneously can both pass the SELECT guard
-- and then race to INSERT. The second INSERT violates the partial unique index:
--
--   v2_unique_pending_invites ON (tenant_id, lower(invited_email))
--   WHERE status = 'pending'
--
-- Fix: wrap the fresh-invite INSERT in a nested BEGIN … EXCEPTION block.
-- On unique_violation we raise 'invite already pending', consistent with the
-- guard check above it.
--
-- No other logic is changed.
-- =========================================

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
)
RETURNS TABLE (
  membership_id uuid,
  email         text,
  role          text,
  invite_token  uuid,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid;
  v_status          text;
  v_existing_id     uuid;   -- row to UPDATE when re-inviting revoked/expired
  v_token           uuid;
  v_member_id       uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
BEGIN
  -- Caller must be an active owner or admin of this tenant.
  -- Table alias `tm` used to avoid ambiguity with the output column `status`.
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Normalize email once at entry
  p_email := lower(trim(p_email));

  -- Try to resolve email → user_id from auth.users
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Path A: invitee already has an account

    SELECT tm.id, tm.status INTO v_existing_id, v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_user_id
    ORDER BY tm.created_at DESC
    LIMIT 1;

    IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
    -- 'revoked' or 'expired': v_existing_id is set → will UPDATE below

    -- If no user_id row exists, also check for a stale email-only invite
    IF v_existing_id IS NULL THEN
      SELECT tm.status INTO v_status
      FROM public.v2_tenant_memberships tm
      WHERE tm.tenant_id            = p_tenant_id
        AND lower(tm.invited_email) = p_email
      ORDER BY tm.created_at DESC
      LIMIT 1;

      IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
      -- revoked/expired email-only row: leave as-is, a new user_id row is
      -- inserted below (NULLs are distinct in the unique index, no conflict)
    END IF;

  ELSE
    -- Path B: invitee has no account yet

    SELECT tm.id, tm.status INTO v_existing_id, v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email
    ORDER BY tm.created_at DESC
    LIMIT 1;

    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
    -- 'revoked' or 'expired': v_existing_id is set → will UPDATE below
  END IF;

  -- Resolve data needed by the Edge Function email body
  SELECT t.name INTO v_tenant_name
  FROM public.v2_tenants t
  WHERE t.id = p_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Read internal shared secret from Vault
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  IF v_existing_id IS NOT NULL THEN
    -- Re-invite: refresh the revoked/expired row in-place.
    -- UPDATE is not subject to the unique index (status changes away from
    -- 'pending' only on the losing side of a race, so no violation possible).
    UPDATE public.v2_tenant_memberships
    SET
      role               = p_role,
      status             = 'pending',
      invited_by         = auth.uid(),
      invite_token       = v_token,
      invite_sent_at     = now(),
      invite_expires_at  = now() + interval '7 days',
      invite_accepted_at = NULL,
      -- If we now know the user_id, attach it and clear the email field
      user_id            = COALESCE(v_user_id, user_id),
      invited_email      = CASE WHEN v_user_id IS NOT NULL THEN NULL ELSE invited_email END
    WHERE id = v_existing_id
    RETURNING id INTO v_member_id;

  ELSE
    -- Fresh invite: insert new row.
    -- Wrapped in a nested block to catch a unique_violation that can occur
    -- when two admins race past the SELECT guard simultaneously.
    BEGIN
      INSERT INTO public.v2_tenant_memberships (
        tenant_id,
        user_id,
        invited_email,
        role,
        status,
        invited_by,
        invite_token,
        invite_sent_at,
        invite_expires_at
      ) VALUES (
        p_tenant_id,
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
        p_role,
        'pending',
        auth.uid(),
        v_token,
        now(),
        now() + interval '7 days'
      )
      RETURNING id INTO v_member_id;

    EXCEPTION
      WHEN unique_violation THEN
        -- Another transaction inserted a pending invite for this email
        -- between our SELECT guard and this INSERT.
        RAISE EXCEPTION 'invite already pending';
    END;
  END IF;

  -- Fire-and-forget: send invite email via pg_net
  PERFORM net.http_post(
    url     := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        p_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN QUERY SELECT v_member_id, p_email, p_role, v_token, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;

COMMIT;
