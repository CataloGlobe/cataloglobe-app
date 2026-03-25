BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- SELECT: pubblica — necessario per le pagine catalogo pubbliche
CREATE POLICY "product_images_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- INSERT: solo se il tenant_id nel path appartiene al caller
CREATE POLICY "product_images_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

-- UPDATE: stesso controllo
CREATE POLICY "product_images_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

-- DELETE: stesso controllo
CREATE POLICY "product_images_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1]::uuid = ANY(SELECT public.get_my_tenant_ids())
  );

COMMIT;
