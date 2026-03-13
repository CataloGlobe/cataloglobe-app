BEGIN;

-- =========================================
-- V2: INVITE TENANT MEMBER — pg_net INTEGRATION
-- =========================================
--
-- Adds fire-and-forget email dispatch to invite_tenant_member via pg_net.
--
-- After the membership INSERT, the function enqueues an async HTTP POST
-- to the send-tenant-invite Edge Function. The RPC commits and returns
-- regardless of whether the email call succeeds.
--
-- Authentication uses a shared internal secret (not the service role key).
-- The secret is stored in two places that must be kept in sync:
--   - Supabase Vault:  vault.create_secret('<value>', 'internal_edge_secret')
--   - Edge Function:   supabase secrets set INTERNAL_EDGE_SECRET=<value>
--
-- The RPC reads the secret from vault.decrypted_secrets at call time and
-- passes it via the X-Internal-Secret request header. The Edge Function
-- validates the header against its Deno.env copy.
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Enable pg_net (no-op if already active)
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;


-- -----------------------------------------------------------------------
-- 2. Replace invite_tenant_member with pg_net variant
--
--    Return type is unchanged:
--      RETURNS TABLE(membership_id, email, role, invite_token, status)
--
--    Added DECLARE variables:
--      v_tenant_name     — resolved from v2_tenants for the email body
--      v_inviter_email   — resolved from auth.users for the email body
--      v_internal_secret — read from vault.decrypted_secrets at call time
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.invite_tenant_member(uuid, text, text);

CREATE FUNCTION public.invite_tenant_member(
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

    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_user_id;

    IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

    -- Guard against a stale email-only invite for the same address
    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

  ELSE
    -- Path B: invitee has no account yet — check for existing email invite
    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
  END IF;

  -- Resolve data needed by the Edge Function email body.
  -- Done before the INSERT so all reads are grouped before the write.
  SELECT t.name INTO v_tenant_name
  FROM public.v2_tenants t
  WHERE t.id = p_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Read the internal shared secret from the Supabase Vault.
  -- Returns NULL silently if the secret has not been created yet.
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    invited_email,
    role,
    status,
    invited_by,
    invite_token
  ) VALUES (
    p_tenant_id,
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
    p_role,
    'pending',
    auth.uid(),
    v_token
  )
  RETURNING id INTO v_member_id;

  -- -----------------------------------------------------------------------
  -- Fire-and-forget: enqueue the invite email via pg_net.
  --
  -- net.http_post is asynchronous — it enqueues the request and returns
  -- a bigint request ID immediately. PERFORM discards that ID.
  -- The membership row is committed regardless of HTTP outcome.
  --
  -- Body matches InvitePayload in send-tenant-invite:
  --   { email, tenantName, inviterEmail, inviteToken }
  --
  -- X-Internal-Secret is a shared secret known only to the DB (via Vault)
  -- and the Edge Function (via Deno.env). It is not the service role key.
  -- -----------------------------------------------------------------------
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

  RETURN QUERY SELECT
    v_member_id,
    p_email,
    p_role,
    v_token,
    'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;

COMMIT;


-- =========================================
-- SETUP: store the internal secret (run once, outside this migration)
-- =========================================
--
-- 1. Generate a random secret (example using openssl):
--
--      openssl rand -hex 32
--
-- 2. Store in the Supabase Vault (SQL editor or psql):
--
--      select vault.create_secret('<value>', 'internal_edge_secret');
--
--    To rotate the secret later:
--      update vault.secrets
--        set secret = '<new_value>'
--        where name = 'internal_edge_secret';
--
-- 3. Store the same value as an Edge Function secret:
--
--      supabase secrets set INTERNAL_EDGE_SECRET=<value>
--
-- 4. Deploy the Edge Function:
--
--      supabase functions deploy send-tenant-invite
-- =========================================
