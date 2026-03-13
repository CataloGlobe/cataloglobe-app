BEGIN;

-- =========================================
-- V2: INVITE SYSTEM HARDENING
-- =========================================
--
-- 1. Add lifecycle + expiry columns
-- 2. Replace partial unique index with canonical name
-- 3. Update accept_invite_by_token: expiry check + invite_accepted_at
-- 4. Update invite_tenant_member: handle re-invite for revoked/expired rows
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Lifecycle and expiry columns
-- -----------------------------------------------------------------------
ALTER TABLE public.v2_tenant_memberships
  ADD COLUMN IF NOT EXISTS invite_sent_at     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_expires_at  timestamptz DEFAULT now() + interval '7 days';

-- Back-fill existing pending rows that have a token but no values yet
UPDATE public.v2_tenant_memberships
SET
  invite_sent_at    = COALESCE(invite_sent_at,    created_at),
  invite_expires_at = COALESCE(invite_expires_at, created_at + interval '7 days')
WHERE status       = 'pending'
  AND invite_token IS NOT NULL;


-- -----------------------------------------------------------------------
-- 2. Partial unique index (canonical name)
--
-- Replaces v2_tenant_memberships_unique_pending_email.
-- Keeps case-insensitive semantics (lower()) and the NOT NULL guard.
-- Combined with the existing v2_tenant_memberships_unique_pending index on
-- (tenant_id, user_id), both invite paths are now covered.
-- -----------------------------------------------------------------------
DROP INDEX IF EXISTS v2_tenant_memberships_unique_pending_email;

CREATE UNIQUE INDEX v2_unique_pending_invites
  ON public.v2_tenant_memberships (tenant_id, lower(invited_email))
  WHERE status = 'pending' AND invited_email IS NOT NULL;


-- -----------------------------------------------------------------------
-- 3. accept_invite_by_token
--
-- Changes from previous version:
--   - Explicit expiry check before accepting
--   - Sets status = 'expired' if token is presented after expiry
--   - Sets invite_accepted_at = now() on success
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_expires_at timestamptz;
BEGIN
  -- Fetch invite; NOT FOUND means invalid or already used
  SELECT tenant_id, invite_expires_at
    INTO v_tenant_id,  v_expires_at
  FROM public.v2_tenant_memberships
  WHERE invite_token = p_token
    AND status       = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  -- Expiry check: mark as expired and raise a distinct error
  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    UPDATE public.v2_tenant_memberships
    SET status = 'expired'
    WHERE invite_token = p_token;
    RAISE EXCEPTION 'invite expired';
  END IF;

  -- Accept: activate membership and record timestamp
  UPDATE public.v2_tenant_memberships
  SET
    user_id            = auth.uid(),
    status             = 'active',
    invited_email      = NULL,
    invite_token       = NULL,
    invite_accepted_at = now()
  WHERE invite_token = p_token
    AND status       = 'pending'
  RETURNING tenant_id INTO v_tenant_id;

  -- Guard against a concurrent accept winning the race
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO service_role;


-- -----------------------------------------------------------------------
-- 4. invite_tenant_member
--
-- Changes from previous version (20260313030000):
--   - Tracks v_existing_id for revoked/expired rows
--   - Re-invite path: UPDATE existing row instead of INSERT (avoids unique
--     index violation and preserves row history)
--   - Fresh invite path: INSERT now populates invite_sent_at and
--     invite_expires_at
-- -----------------------------------------------------------------------
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
  -- Caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
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
      AND tm.user_id   = v_user_id;

    IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
    -- 'revoked' or 'expired': v_existing_id is set → will UPDATE below

    -- If no user_id row exists, also check for a stale email-only invite
    IF v_existing_id IS NULL THEN
      SELECT tm.status INTO v_status
      FROM public.v2_tenant_memberships tm
      WHERE tm.tenant_id            = p_tenant_id
        AND lower(tm.invited_email) = p_email;

      IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
      -- revoked/expired email-only row: leave as-is, a new user_id row is
      -- inserted below (NULLs are distinct in the unique index, no conflict)
    END IF;

  ELSE
    -- Path B: invitee has no account yet

    SELECT tm.id, tm.status INTO v_existing_id, v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

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
    -- Re-invite: refresh the revoked/expired row in-place
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
    -- Fresh invite: insert new row
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
