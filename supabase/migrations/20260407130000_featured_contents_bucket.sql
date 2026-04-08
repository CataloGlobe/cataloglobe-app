BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('featured-contents', 'featured-contents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tenant upload featured content images" ON storage.objects;
CREATE POLICY "Tenant upload featured content images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'featured-contents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Tenant update featured content images" ON storage.objects;
CREATE POLICY "Tenant update featured content images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'featured-contents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Tenant delete featured content images" ON storage.objects;
CREATE POLICY "Tenant delete featured content images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'featured-contents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Public read featured content images" ON storage.objects;
CREATE POLICY "Public read featured content images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'featured-contents');

COMMIT;
