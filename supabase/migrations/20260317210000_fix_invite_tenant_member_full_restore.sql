-- =============================================================================
-- FIX: invite_tenant_member — full restore of pre-refactor behavior
--
-- Regression introduced in 20260317120000_rename_v2_tables.sql (section 7-E),
-- which snapshotted an older version of the function that predates the
-- invite-hardening migration 20260313050000 and the unify-lookup migration
-- 20260313120000.
--
-- What was lost in the rename migration snapshot:
--
--   1. v_existing_id variable + re-invite UPDATE path
--      Without it, re-inviting a revoked/expired user hits the unique index
--      v2_unique_pending_invites on (tenant_id, lower(invited_email)) because
--      the old row still exists. The resulting unique_violation has no handler,
--      so PostgREST returns an empty RETURNS TABLE result — the caller sees
--      no error but no row is written.
--
--   2. EXCEPTION WHEN unique_violation handler
--      Guards against the race condition where two concurrent requests both
--      pass the lookup and race to INSERT.
--
--   3. invite_sent_at and invite_expires_at in the INSERT column list
--      The columns have table-level defaults, but not listing them explicitly
--      means re-invite UPDATEs could not reset them. Also makes behavior
--      unpredictable when defaults change.
--
--   4. v_tenant_name, v_inviter_email, v_internal_secret variables and
--      the PERFORM net.http_post(...) block that calls send-tenant-invite.
--      Without this, no email is ever dispatched to the invitee.
--
-- This migration restores the full logic from 20260313120000
-- (v2_invite_tenant_member_unify_lookup), adapted for the renamed tables:
--   v2_tenant_memberships → tenant_memberships
--   v2_tenants            → tenants
--
-- The tm. alias on the caller-guard subquery is also preserved (fixes the
-- 42702 column-reference ambiguity with the RETURNS TABLE output columns).
-- This supersedes 20260317190000 which only fixed the alias issue.
-- =============================================================================

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
  -- Table alias `tm` is required to avoid ambiguity with the output
  -- columns `status` and `role` declared in RETURNS TABLE above.
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
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

  -- Unified lookup: covers both known-user rows (matched by user_id) and
  -- email-only rows (matched by invited_email). ORDER BY created_at DESC
  -- ensures the most-recent row is picked when historical rows exist.
  SELECT tm.id, tm.status
  INTO v_existing_id, v_status
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id = p_tenant_id
    AND (
          tm.user_id              = v_user_id          -- NULL = NULL is false in SQL, safe
       OR lower(tm.invited_email) = p_email
    )
  ORDER BY tm.created_at DESC
  LIMIT 1;

  IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
  IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
  -- 'revoked' or 'expired': v_existing_id is set → will UPDATE below
  -- NULL (no row found): v_existing_id is NULL → will INSERT below

  -- Resolve data needed by the Edge Function email body
  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
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
    -- UPDATE is not subject to the unique index (no new pending row is
    -- created), so no race condition applies here.
    UPDATE public.tenant_memberships
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
      invited_email      = CASE WHEN v_user_id IS NOT NULL THEN NULL ELSE p_email END
    WHERE id = v_existing_id
    RETURNING id INTO v_member_id;

  ELSE
    -- Fresh invite: insert new row.
    -- Nested block catches unique_violation from a concurrent INSERT that
    -- races past the lookup above.
    BEGIN
      INSERT INTO public.tenant_memberships (
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
        -- between our lookup and this INSERT.
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

REVOKE ALL   ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;
