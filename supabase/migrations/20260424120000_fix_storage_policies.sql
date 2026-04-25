-- SECURITY FIX: storage policy hardening per business-items e avatars
--
-- Problemi corretti:
--   1. business-items INSERT era aperta a "public" (utenti anonimi potevano caricare file).
--      Non risulta alcun utilizzo attivo nel frontend — bucket probabilmente orfano.
--      Fix: richiede autenticazione + folder[0] = tenantId dell'utente.
--      NOTA: se esistono file con path non-UUID come primo segmento, la policy INSERT
--      bloccherà nuovi upload su quei path (file esistenti non vengono toccati).
--
--   2. avatars INSERT/UPDATE/DELETE non vincolava il folder al uid() dell'utente:
--      qualsiasi utente autenticato poteva sovrascrivere avatar altrui.
--      Fix: folder[0] = auth.uid()::text.
--
-- Non modificato: policy SELECT di entrambi i bucket (lettura pubblica invariata).
-- Non modificato: nessun altro bucket.

-- ============================================================
-- 1. business-items
-- ============================================================

DROP POLICY IF EXISTS "business-items insert" ON storage.objects;

CREATE POLICY "business-items insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'business-items'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_my_tenant_ids()
    )
  );

-- DELETE era assente — aggiunta per consentire cleanup file propri
CREATE POLICY "business-items delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'business-items'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT public.get_my_tenant_ids()
    )
  );

-- ============================================================
-- 2. avatars
-- ============================================================

DROP POLICY IF EXISTS "avatars insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars update" ON storage.objects;
DROP POLICY IF EXISTS "avatars delete" ON storage.objects;

CREATE POLICY "avatars insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT (lettura pubblica) già presente da remote_schema — non ricreata.
-- Se assente, eseguire manualmente:
--   CREATE POLICY "avatars select" ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'avatars');
