BEGIN;

-- 1. Colonna logo_url su tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT NULL;

-- 2. Ricrea user_tenants_view con logo_url
DROP VIEW IF EXISTS public.user_tenants_view;

CREATE VIEW public.user_tenants_view AS
SELECT
  t.id,
  t.name,
  t.vertical_type,
  t.created_at,
  t.owner_user_id,
  t.logo_url,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    ELSE tm.role
  END AS user_role
FROM public.tenants t
LEFT JOIN public.tenant_memberships tm
  ON  tm.tenant_id = t.id
  AND tm.user_id   = auth.uid()
  AND tm.status    = 'active'
WHERE t.deleted_at IS NULL;

-- 3. Bucket tenant-assets (pubblico in lettura)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-assets', 'tenant-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage policies
CREATE POLICY "tenant_assets_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-assets');

CREATE POLICY "tenant_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-assets');

-- 5. RPC per update logo (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.update_tenant_logo(p_tenant_id uuid, p_logo_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND owner_user_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.tenants SET logo_url = p_logo_url WHERE id = p_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_logo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_logo(uuid, text) TO authenticated;

-- 6. RPC pubblica per pagina pubblica (leggibile da anon)
CREATE OR REPLACE FUNCTION public.get_tenant_public_info(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object('logo_url', t.logo_url, 'name', t.name)
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.deleted_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_public_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_info(uuid) TO authenticated;

COMMIT;
