CREATE OR REPLACE FUNCTION public.get_tenant_member_names(p_tenant_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
  WITH candidates AS (
    SELECT t.owner_user_id AS uid
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.deleted_at IS NULL
    UNION
    SELECT tm.user_id
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND tm.user_id IS NOT NULL
  )
  SELECT
    c.uid AS user_id,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
      p.first_name,
      p.email,
      u.email
    ) AS display_name
  FROM candidates c
  LEFT JOIN public.profiles p ON p.id = c.uid
  LEFT JOIN auth.users u ON u.id = c.uid
  WHERE p_tenant_id IN (SELECT public.get_my_tenant_ids());
$$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_member_names(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_member_names(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_member_names(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_tenant_member_names(uuid) IS
  'Returns user_id -> display_name for the owner and active members of a tenant the caller belongs to. Gated on tenant membership (any role). Used to attribute manual orders to the operator on the orders board.';
