-- =============================================================================
-- PR-F: Canonicalizzazione naming policy storage.objects + fix bug upsert
-- =============================================================================
-- 3 stili di naming coesistevano nel filesystem (snake_case, sentence-case,
-- hyphen+space). Staging e prod erano divergenti per questa storia.
--
-- Bug noto risolto: 6 UPDATE policy avevano WITH CHECK = NULL, causando
-- fallimento upsert (INSERT ON CONFLICT DO UPDATE) con HTTP 400 + messaggio
-- fuorviante "row violates row-level security policy".
--
-- Bug noto risolto: SELECT policy mancanti per avatars/business-covers/
-- style-backgrounds su prod, e SELECT policy public residue per featured-
-- contents/product-images/tenant-assets su prod (warning
-- public_bucket_allows_listing).
--
-- Fix:
-- 1. DROP IF EXISTS di TUTTI i nomi alternativi noti (idempotente)
-- 2. CREATE 24 policy con naming canonico "<bucket> <op>"
--    - Tutte TO authenticated (no public listing)
--    - UPDATE policy con USING + WITH CHECK populate
--
-- Migration consolidata che sostituisce parzialmente PR-D + PR-E (non rimuove
-- le storiche, ma le rimpiazza con nomi canonici). Idempotente: rieseguibile
-- senza danni.
-- =============================================================================

BEGIN;

-- =============================================================================
-- avatars
-- =============================================================================

DROP POLICY IF EXISTS "avatars select" ON storage.objects;
DROP POLICY IF EXISTS "avatars insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars update" ON storage.objects;
DROP POLICY IF EXISTS "avatars delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars read" ON storage.objects;

CREATE POLICY "avatars select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

CREATE POLICY "avatars insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

CREATE POLICY "avatars update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  )
  WITH CHECK (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

CREATE POLICY "avatars delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))
  );

-- =============================================================================
-- business-covers
-- =============================================================================

DROP POLICY IF EXISTS "business-covers select" ON storage.objects;
DROP POLICY IF EXISTS "business-covers insert" ON storage.objects;
DROP POLICY IF EXISTS "business-covers update" ON storage.objects;
DROP POLICY IF EXISTS "business-covers delete" ON storage.objects;
DROP POLICY IF EXISTS "business-covers read" ON storage.objects;

CREATE POLICY "business-covers select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "business-covers insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "business-covers update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "business-covers delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'business-covers'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- =============================================================================
-- featured-contents
-- =============================================================================

DROP POLICY IF EXISTS "featured-contents select" ON storage.objects;
DROP POLICY IF EXISTS "featured-contents insert" ON storage.objects;
DROP POLICY IF EXISTS "featured-contents update" ON storage.objects;
DROP POLICY IF EXISTS "featured-contents delete" ON storage.objects;
DROP POLICY IF EXISTS "featured-contents read" ON storage.objects;
DROP POLICY IF EXISTS "Tenant select featured content images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant upload featured content images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant update featured content images" ON storage.objects;
DROP POLICY IF EXISTS "Tenant delete featured content images" ON storage.objects;
DROP POLICY IF EXISTS "Public read featured content images" ON storage.objects;

CREATE POLICY "featured-contents select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "featured-contents insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "featured-contents update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "featured-contents delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'featured-contents'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- =============================================================================
-- product-images
-- =============================================================================

DROP POLICY IF EXISTS "product-images select" ON storage.objects;
DROP POLICY IF EXISTS "product-images insert" ON storage.objects;
DROP POLICY IF EXISTS "product-images update" ON storage.objects;
DROP POLICY IF EXISTS "product-images delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

CREATE POLICY "product-images select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "product-images insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "product-images update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "product-images delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'product-images'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

-- =============================================================================
-- style-backgrounds
-- =============================================================================

DROP POLICY IF EXISTS "style-backgrounds select" ON storage.objects;
DROP POLICY IF EXISTS "style-backgrounds insert" ON storage.objects;
DROP POLICY IF EXISTS "style-backgrounds update" ON storage.objects;
DROP POLICY IF EXISTS "style-backgrounds delete" ON storage.objects;
DROP POLICY IF EXISTS "Tenant members can select style backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Tenant members can upload style backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Tenant members can update style backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Tenant members can delete style backgrounds" ON storage.objects;
DROP POLICY IF EXISTS "Style backgrounds are publicly readable" ON storage.objects;

CREATE POLICY "style-backgrounds select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  );

CREATE POLICY "style-backgrounds insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  );

CREATE POLICY "style-backgrounds update" ON storage.objects
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

CREATE POLICY "style-backgrounds delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'style-backgrounds'::text) AND ((storage.foldername(name))[1] IN ( SELECT (tenants.id)::text AS id
   FROM tenants
  WHERE (tenants.id IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))))
  );

-- =============================================================================
-- tenant-assets
-- =============================================================================

DROP POLICY IF EXISTS "tenant-assets select" ON storage.objects;
DROP POLICY IF EXISTS "tenant-assets insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant-assets update" ON storage.objects;
DROP POLICY IF EXISTS "tenant-assets delete" ON storage.objects;
DROP POLICY IF EXISTS "tenant-assets read" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_select" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_delete" ON storage.objects;

CREATE POLICY "tenant-assets select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "tenant-assets insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "tenant-assets update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  )
  WITH CHECK (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

CREATE POLICY "tenant-assets delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    ((bucket_id = 'tenant-assets'::text) AND (((storage.foldername(name))[1])::uuid IN ( SELECT get_my_tenant_ids() AS get_my_tenant_ids)))
  );

COMMIT;
