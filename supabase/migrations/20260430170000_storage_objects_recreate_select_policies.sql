-- =============================================================================
-- PR-E: Ricreare SELECT policy storage.objects per authenticated tenant scope
-- =============================================================================
-- PR4 (20260430120000) ha droppato 6 SELECT policy "public read..." per chiudere
-- il warning "public_bucket_allows_listing".
--
-- Effetto collaterale scoperto: SDK Supabase con .upload(..., {upsert: true})
-- esegue INSERT ... ON CONFLICT DO UPDATE. Il ramo UPDATE necessita di leggere
-- la riga esistente; senza policy SELECT per authenticated, l'upsert fallisce
-- con HTTP 400 + messaggio fuorviante "row violates row-level security policy".
--
-- Audit empirico (curl test 30/04/2026):
-- - POST senza x-upsert su path nuovo: HTTP 200 OK
-- - POST con x-upsert: true su path esistente: HTTP 400 RLS violation
-- - Differenza unica: 0 policy SELECT su storage.objects
--
-- Fix: ricreare 6 policy SELECT con scope authenticated tenant-based
-- (identico a INSERT/UPDATE policy). Risolve l'upsert mantenendo chiuso
-- il warning "public_bucket_allows_listing" (anon non ha policy SELECT,
-- listing pubblico resta bloccato).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. avatars select
-- -----------------------------------------------------------------------------
CREATE POLICY "avatars select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

-- -----------------------------------------------------------------------------
-- 2. business-covers select
-- -----------------------------------------------------------------------------
CREATE POLICY "business-covers select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- -----------------------------------------------------------------------------
-- 3. Tenant select featured content images
-- -----------------------------------------------------------------------------
CREATE POLICY "Tenant select featured content images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- -----------------------------------------------------------------------------
-- 4. product_images_select
-- -----------------------------------------------------------------------------
CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- -----------------------------------------------------------------------------
-- 5. Tenant members can select style backgrounds
-- -----------------------------------------------------------------------------
CREATE POLICY "Tenant members can select style backgrounds" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  );

-- -----------------------------------------------------------------------------
-- 6. tenant_assets_select
-- -----------------------------------------------------------------------------
CREATE POLICY "tenant_assets_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

COMMIT;
