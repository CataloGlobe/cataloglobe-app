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

  p_email := lower(trim(p_email));

  SELECT u.id
  INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  -- resto identico...

END;
$$;

COMMIT;