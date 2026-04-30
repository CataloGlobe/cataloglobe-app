-- =============================================================================
-- PR4: Drop 6 SELECT policy public-listing su storage.objects
-- =============================================================================
-- Le 6 policy avevano qual = "bucket_id = 'X'" senza scope path: chiunque
-- con anon key poteva fare client.storage.from(bucket).list() ed enumerare
-- TUTTI i file di tutti i tenant.
--
-- Le immagini pubbliche NON dipendono da queste policy: sono servite via
-- getPublicUrl (/storage/v1/object/public/<bucket>/<path>) che bypassa RLS.
-- Verificato che il frontend non chiama mai .list() su questi bucket.
-- Edge Functions admin che fanno listing usano service_role (bypass RLS).
--
-- Risolve 6 warning Security Advisor "public_bucket_allows_listing".
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "avatars read" ON storage.objects;
DROP POLICY IF EXISTS "business-covers read" ON storage.objects;
DROP POLICY IF EXISTS "Public read featured content images" ON storage.objects;
DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
DROP POLICY IF EXISTS "Style backgrounds are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "tenant_assets_select" ON storage.objects;

COMMIT;
