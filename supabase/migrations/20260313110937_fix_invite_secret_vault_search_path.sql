BEGIN;

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email text,
  p_role text
)
RETURNS TABLE (
  membership_id uuid,
  email text,
  role text,
  invite_token uuid,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
  v_token uuid;
  v_member_id uuid;
  v_tenant_name text;
  v_inviter_email text;
  v_internal_secret text;
BEGIN

  -- Authorization check
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Normalize email
  p_email := lower(trim(p_email));

  -- Resolve user_id
  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  -- Duplicate checks
  IF v_user_id IS NOT NULL THEN

    SELECT tm.status
    INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = v_user_id;

    IF v_status = 'active' THEN
      RAISE EXCEPTION 'user already member';
    END IF;

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

  ELSE

    SELECT tm.status
    INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

  END IF;

  -- Generate token
  v_token := gen_random_uuid();

  -- Get tenant name
  SELECT name
  INTO v_tenant_name
  FROM public.v2_tenants
  WHERE id = p_tenant_id;

  -- Get inviter email
  SELECT email
  INTO v_inviter_email
  FROM auth.users
  WHERE id = auth.uid();

  -- Get internal secret from vault
  SELECT decrypted_secret
  INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  -- Insert membership
  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    invited_email,
    role,
    status,
    invited_by,
    invite_token
  )
  VALUES (
    p_tenant_id,
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
    p_role,
    'pending',
    auth.uid(),
    v_token
  )
  RETURNING id INTO v_member_id;

  -- Call Edge Function
  PERFORM net.http_post(
    url := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Secret', coalesce(v_internal_secret,'')
    ),
    body := jsonb_build_object(
      'email', p_email,
      'tenantName', coalesce(v_tenant_name,''),
      'inviterEmail', coalesce(v_inviter_email,''),
      'inviteToken', v_token::text
    )
  );

  RETURN QUERY
  SELECT
    v_member_id,
    p_email,
    p_role,
    v_token,
    'pending'::text;

END;
$$;

COMMIT;