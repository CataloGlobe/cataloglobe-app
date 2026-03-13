BEGIN;

-- =========================================
-- V2: REMOVE TENANT MEMBER RPC
-- =========================================
CREATE OR REPLACE FUNCTION public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role text;
  deleted_count integer;
BEGIN
  -- Ensure caller owns the tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenants
    WHERE id = p_tenant_id
      AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Prevent removing the owner
SELECT role
INTO target_role
FROM public.v2_tenant_memberships
WHERE tenant_id = p_tenant_id
  AND user_id = p_user_id;

IF target_role IS NULL THEN
  RAISE EXCEPTION 'member not found';
END IF;

  IF target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot remove owner';
  END IF;

  -- Delete membership
  DELETE FROM public.v2_tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count = 0 THEN
    RAISE EXCEPTION 'member not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_tenant_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO service_role;

COMMIT;
