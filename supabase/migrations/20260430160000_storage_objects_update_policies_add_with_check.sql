-- =============================================================================
-- PR-D: Fix UPDATE policy storage.objects — aggiungi WITH CHECK
-- =============================================================================
-- 4 policy UPDATE su storage.objects hanno WITH CHECK = NULL:
--   avatars update, business-covers update,
--   Tenant update featured content images,
--   Tenant members can update style backgrounds
--
-- Quando il client SDK invoca .upload() con upsert: true, Supabase Storage
-- esegue INSERT ... ON CONFLICT DO UPDATE. La fase UPDATE inner controlla
-- WITH CHECK; senza clausola esplicita l'upsert fallisce con HTTP 400 e
-- messaggio fuorviante "row violates row-level security policy".
--
-- Audit empirico ha confermato il root cause via 8 curl test su staging
-- (Test 5 senza upsert OK 200 vs Test 1 con upsert KO 400, identica request
-- altrimenti).
--
-- Fix: DROP + CREATE delle 4 policy aggiungendo WITH CHECK identico al USING.
-- Pattern di riferimento: product_images_update e tenant_assets_update
-- (gia' corrette).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. avatars update
-- -----------------------------------------------------------------------------
DROP POLICY "avatars update" ON storage.objects;
CREATE POLICY "avatars update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  )
  WITH CHECK (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

-- -----------------------------------------------------------------------------
-- 2. business-covers update
-- -----------------------------------------------------------------------------
DROP POLICY "business-covers update" ON storage.objects;
CREATE POLICY "business-covers update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- -----------------------------------------------------------------------------
-- 3. Tenant update featured content images
-- -----------------------------------------------------------------------------
DROP POLICY "Tenant update featured content images" ON storage.objects;
CREATE POLICY "Tenant update featured content images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- -----------------------------------------------------------------------------
-- 4. Tenant members can update style backgrounds
-- -----------------------------------------------------------------------------
DROP POLICY "Tenant members can update style backgrounds" ON storage.objects;
CREATE POLICY "Tenant members can update style backgrounds" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  )
  WITH CHECK (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  );

COMMIT;
