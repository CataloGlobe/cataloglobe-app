BEGIN;

-- =========================================
-- V2: LOOKUP USER ID BY EMAIL
-- Used by the invite flow to resolve email → user_id
-- before calling invite_tenant_member().
-- SECURITY DEFINER allows access to auth.users.
-- Returns NULL if no user with that email exists.
-- =========================================
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;

COMMIT;
