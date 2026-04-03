BEGIN;

-- 1. Change get_my_tenant_ids to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL
  UNION
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE (tm.user_id = auth.uid() OR tm.invited_email = auth.email())
    AND tm.status     = 'active'
    AND t.deleted_at  IS NULL
$$;

-- 2. Ensure users can read their own memberships/invites
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tenant_memberships' AND policyname = 'Users can read own memberships or invites'
    ) THEN
        CREATE POLICY "Users can read own memberships or invites"
          ON public.tenant_memberships
          FOR SELECT TO authenticated
          USING (user_id = auth.uid() OR invited_email = auth.email());
    END IF;
END
$$;

-- 3. Fix tenant_members_view
CREATE OR REPLACE VIEW public.tenant_members_view AS
SELECT
  tm.id                               AS membership_id,
  tm.tenant_id,
  tm.user_id,
  COALESCE(u.email, tm.invited_email) AS email,
  tm.role,
  tm.status,
  tm.invited_by,
  inviter.email                       AS inviter_email,
  tm.invite_token,
  tm.invite_expires_at,
  tm.created_at
FROM public.tenant_memberships tm
LEFT JOIN auth.users u       ON u.id       = tm.user_id
LEFT JOIN auth.users inviter ON inviter.id = tm.invited_by
WHERE tm.tenant_id IN (SELECT public.get_my_tenant_ids());

-- 4. Harden products RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read v2_products" ON public.products;
DROP POLICY IF EXISTS "Tenant select own rows" ON public.products;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.products;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.products;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.products;

-- SELECT
CREATE POLICY "Tenant select own products"
ON public.products FOR SELECT TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- INSERT
CREATE POLICY "Tenant insert own products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- UPDATE
CREATE POLICY "Tenant update own products"
ON public.products FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- DELETE
CREATE POLICY "Tenant delete own products"
ON public.products FOR DELETE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
