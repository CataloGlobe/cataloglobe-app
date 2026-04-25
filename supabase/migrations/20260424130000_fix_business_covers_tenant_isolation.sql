-- SECURITY FIX: business-covers — aggiunge tenant isolation al path e alle policy
--
-- Problema: le policy INSERT/UPDATE/DELETE richiedono solo autenticazione,
-- senza verificare che il folder appartenga al tenant dell'utente.
-- Qualsiasi utente autenticato può sovrascrivere/eliminare file altrui.
--
-- Soluzione in 3 parti:
--   3a. Sostituisce le policy write con controllo foldername()[1]::uuid in get_my_tenant_ids()
--   3b. Rinomina i file esistenti da {slug}__{id}/... a {tenantId}/{slug}__{id}/...
--   3c. Aggiorna activities.cover_image e activity_media.url con il nuovo path
--
-- Idempotente: le condizioni NOT LIKE evitano doppia applicazione.
-- La policy SELECT (lettura pubblica) NON viene modificata.
--
-- NOTA su 3b: UPDATE su storage.objects.name aggiorna i metadati nel DB.
-- In Supabase, 'name' è il path logico usato per costruire gli URL pubblici
-- e per le API storage. I 14 file esistenti nel bucket verranno rinominati.

-- ============================================================
-- 3a. Policy write con tenant isolation
-- ============================================================

DROP POLICY IF EXISTS "business-covers insert" ON storage.objects;
DROP POLICY IF EXISTS "business-covers update" ON storage.objects;
DROP POLICY IF EXISTS "business-covers delete" ON storage.objects;

CREATE POLICY "business-covers insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-covers'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_my_tenant_ids()
    )
  );

CREATE POLICY "business-covers update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'business-covers'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_my_tenant_ids()
    )
  );

CREATE POLICY "business-covers delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-covers'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_my_tenant_ids()
    )
  );

-- ============================================================
-- 3b. Rinomina file esistenti: {slug}__{id}/... → {tenantId}/{slug}__{id}/...
--
-- Logica:
--   - split_part(name, '/', 1)       → primo segmento = "{slug}__{activityId}"
--   - split_part(..., '__', 2)        → activityId UUID
--   - JOIN activities ON id = activityId → ottiene tenant_id
--   - Condizione NOT LIKE '^UUID/...' → idempotente
-- ============================================================

UPDATE storage.objects
SET name = a.tenant_id::text || '/' || storage.objects.name
FROM activities a
WHERE storage.objects.bucket_id = 'business-covers'
  AND a.id::text = split_part(split_part(storage.objects.name, '/', 1), '__', 2)
  AND storage.objects.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/';

-- ============================================================
-- 3c. Aggiorna URL in activities.cover_image
--
-- L'URL salvato è il full public URL:
--   .../storage/v1/object/public/business-covers/{slug}__{id}/cover.ext
-- Deve diventare:
--   .../storage/v1/object/public/business-covers/{tenantId}/{slug}__{id}/cover.ext
--
-- Inserisce tenant_id dopo "business-covers/".
-- Idempotente: salta righe già migrate (NOT LIKE con tenant_id).
-- ============================================================

UPDATE activities
SET cover_image = replace(
  cover_image,
  '/business-covers/',
  '/business-covers/' || tenant_id::text || '/'
)
WHERE cover_image IS NOT NULL
  AND cover_image LIKE '%/business-covers/%'
  AND cover_image NOT LIKE '%/business-covers/' || tenant_id::text || '/%';

-- ============================================================
-- 3d. Aggiorna URL in activity_media.url
--
-- Stessa logica di 3c, per le immagini gallery.
-- ============================================================

UPDATE activity_media am
SET url = replace(
  url,
  '/business-covers/',
  '/business-covers/' || a.tenant_id::text || '/'
)
FROM activities a
WHERE am.activity_id = a.id
  AND am.url IS NOT NULL
  AND am.url LIKE '%/business-covers/%'
  AND am.url NOT LIKE '%/business-covers/' || a.tenant_id::text || '/%';
