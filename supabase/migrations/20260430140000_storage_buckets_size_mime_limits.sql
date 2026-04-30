-- =============================================================================
-- PR-C: Storage bucket policy hardening
-- =============================================================================
-- Defense-in-depth lato server: oggi i 6 bucket hanno file_size_limit = NULL
-- e allowed_mime_types = NULL. Un client malevolo può caricare file di
-- qualsiasi MIME/size fino al default Supabase (50MB).
--
-- Imposta:
--  - file_size_limit calibrato 2-4x sopra il blob compresso atteso (vedi
--    COMPRESS_PROFILES in src/utils/compressImage.ts)
--  - allowed_mime_types whitelist: image/jpeg, image/png, image/webp
--
-- I 2 file .emptyFolderPlaceholder esistenti (0 byte, MIME
-- application/octet-stream) non vengono toccati: il check
-- allowed_mime_types agisce solo all'upload, non sui file pre-esistenti.
-- Restano nello storage finché non vengono rimossi manualmente via
-- Storage API (Supabase blocca i DELETE diretti su storage.objects da SQL).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Aggiorna file_size_limit + allowed_mime_types sui 6 bucket
-- -----------------------------------------------------------------------------
-- file_size_limit: 2-4x sopra il blob compresso atteso
--  - logo (400px q0.90)      → ~150-300 KB → cap 2 MB (avatars, tenant-assets)
--  - product (800px q0.82)   → ~250-500 KB → cap 4 MB (product-images)
--  - featured (1200px q0.85) → ~400-800 KB → cap 6 MB (featured-contents)
--  - cover (1920px q0.82)    → ~800-1500 KB → cap 8 MB (business-covers, style-backgrounds)

UPDATE storage.buckets
SET
  file_size_limit = 2 * 1024 * 1024,  -- 2 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'avatars';

UPDATE storage.buckets
SET
  file_size_limit = 2 * 1024 * 1024,  -- 2 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'tenant-assets';

UPDATE storage.buckets
SET
  file_size_limit = 4 * 1024 * 1024,  -- 4 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'product-images';

UPDATE storage.buckets
SET
  file_size_limit = 6 * 1024 * 1024,  -- 6 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'featured-contents';

UPDATE storage.buckets
SET
  file_size_limit = 8 * 1024 * 1024,  -- 8 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'business-covers';

UPDATE storage.buckets
SET
  file_size_limit = 8 * 1024 * 1024,  -- 8 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'style-backgrounds';

COMMIT;
