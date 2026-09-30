-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira in BEGIN … ROLLBACK, ma in produzione quegli UUID non
-- esistono o non sono dati di test.
-- =============================================================================
--
-- Test — revert_manual_translation richiede translations.write
--
-- Verifica (migration 20260929160000):
--   - viewer, staff e manager della sede ricevono 42501 e la traduzione
--     manuale resta com'è (translations.write: solo owner e admin)
--   - chi ha translations.write in un'altra azienda non passa su questa
--     (il controllo è correlato a p_tenant_id)
--   - owner e admin continuano a riportare la traduzione ad automatica:
--     riga manuale cancellata, job 'pending' accodato
--   - invariati: P0002 senza riga manuale, 42501 'tenant mismatch' per chi
--     non è membro
--
-- Pattern: setup via postgres role (bypass RLS), poi authenticated. Ogni test
-- in BEGIN … ROLLBACK. Prima della migration i test 1–4 falliscono.
--
-- Prerequisiti:
--   - seed_permissions_test_data.sql già eseguito
--   - almeno un prodotto di McDonald's con description e description_hash
--   - lingua 'en' in supported_languages
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres). Attesi 8
-- `NOTICE … OK`; un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (staff Comasina; admin nel test 6)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina; owner del tenant scratch nel test 4)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper di sessione: prepara una traduzione manuale 'en' sulla descrizione di
-- un prodotto McDonald's e ne restituisce l'id prodotto. Vive in pg_temp: sparisce
-- a fine sessione, nessun oggetto lasciato nello schema public.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.seed_manual_translation()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_product uuid;
BEGIN
  SELECT p.id INTO v_product
  FROM public.products p
  WHERE p.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND p.description IS NOT NULL
    AND btrim(p.description) <> ''
    AND p.description_hash IS NOT NULL
  ORDER BY p.id
  LIMIT 1;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Prerequisito mancante: nessun prodotto McDonald''s con descrizione';
  END IF;

  INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_product::text, 'description', 'en',
    'Test source', 'test-hash', 'Manual test translation', 'manual', 'manual'
  )
  ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
  DO UPDATE SET status = 'manual', provider = 'manual', translated_text = EXCLUDED.translated_text;

  RETURN v_product::text;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.manual_row_exists(p_entity_id text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.translations
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
      AND entity_type = 'product' AND entity_id = p_entity_id
      AND field = 'description' AND language_code = 'en'
      AND status IN ('manual', 'overridden')
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.pending_job_exists(p_entity_id text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.translation_jobs
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
      AND entity_type = 'product' AND entity_id = p_entity_id
      AND field = 'description' AND target_language_code = 'en'
      AND status = 'pending'
  );
$$;

-- -----------------------------------------------------------------------------
-- TEST 1 — Viewer → 42501, la traduzione manuale resta
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
    RAISE EXCEPTION 'Test 1 FAIL: il viewer ha riportato la traduzione ad automatica';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL role postgres;
  IF NOT pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 1 FAIL: riga manuale sparita dopo il rifiuto';
  END IF;
  RAISE NOTICE 'Test 1 OK: viewer rifiutato (42501), traduzione manuale intatta';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Staff → 42501, la traduzione manuale resta
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
    RAISE EXCEPTION 'Test 2 FAIL: lo staff ha riportato la traduzione ad automatica';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL role postgres;
  IF NOT pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 2 FAIL: riga manuale sparita dopo il rifiuto';
  END IF;
  RAISE NOTICE 'Test 2 OK: staff rifiutato (42501), traduzione manuale intatta';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Manager → 42501 (translations.write non è nel ruolo manager)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
    RAISE EXCEPTION 'Test 3 FAIL: il manager ha riportato la traduzione ad automatica';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL role postgres;
  IF NOT pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 3 FAIL: riga manuale sparita dopo il rifiuto';
  END IF;
  RAISE NOTICE 'Test 3 OK: manager rifiutato (42501), traduzione manuale intatta';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Owner di un'altra azienda (translations.write lì), viewer qui → 42501
-- Con has_permission('translations.write') senza sede passerebbe: il ramo
-- owner non guarda quale tenant.
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
    RAISE EXCEPTION 'Test 4 FAIL: il permesso di un''altra azienda è bastato';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SET LOCAL role postgres;
  IF NOT pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 4 FAIL: riga manuale sparita dopo il rifiuto';
  END IF;
  RAISE NOTICE 'Test 4 OK: translations.write di un''altra azienda non vale qui (42501)';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Owner → riga manuale cancellata, job 'pending' accodato
-- Se la quota AI di McDonald's è esaurita, il trigger su translation_jobs
-- rifiuta il job (AI_QUOTA_EXHAUSTED) come prima della migration: il
-- permesso è passato, il test lo segnala e prosegue.
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
  v_quota boolean := false;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Test 5 FAIL: owner rifiutato (%)', SQLERRM;
    WHEN raise_exception THEN
      IF SQLERRM <> 'AI_QUOTA_EXHAUSTED' THEN RAISE; END IF;
      v_quota := true;
  END;

  SET LOCAL role postgres;
  IF v_quota THEN
    RAISE NOTICE 'Test 5 OK: owner autorizzato (job fermato dalla quota AI, come prima)';
  ELSIF pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 5 FAIL: riga manuale ancora presente';
  ELSIF NOT pg_temp.pending_job_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 5 FAIL: nessun job pending accodato';
  ELSE
    RAISE NOTICE 'Test 5 OK: owner riporta ad automatica (riga cancellata, job pending)';
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Admin → come l'owner
-- test.staff promosso admin dentro la transazione (role='admin', niente righe
-- di sede), come un admin reale. ROLLBACK lo riporta a staff.
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_entity text;
  v_quota boolean := false;
BEGIN
  SET LOCAL role postgres;
  v_entity := pg_temp.seed_manual_translation();
  DELETE FROM public.tenant_membership_activities tma
  USING public.tenant_memberships tm
  WHERE tma.tenant_membership_id = tm.id
    AND tm.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND tm.user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';
  UPDATE public.tenant_memberships SET role = 'admin'
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_entity, 'description', 'en');
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Test 6 FAIL: admin rifiutato (%)', SQLERRM;
    WHEN raise_exception THEN
      IF SQLERRM <> 'AI_QUOTA_EXHAUSTED' THEN RAISE; END IF;
      v_quota := true;
  END;

  SET LOCAL role postgres;
  IF v_quota THEN
    RAISE NOTICE 'Test 6 OK: admin autorizzato (job fermato dalla quota AI, come prima)';
  ELSIF pg_temp.manual_row_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 6 FAIL: riga manuale ancora presente';
  ELSIF NOT pg_temp.pending_job_exists(v_entity) THEN
    RAISE EXCEPTION 'Test 6 FAIL: nessun job pending accodato';
  ELSE
    RAISE NOTICE 'Test 6 OK: admin riporta ad automatica (riga cancellata, job pending)';
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Owner senza riga manuale → P0002 (invariato)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
      '00000000-0000-0000-0000-000000000000', 'description', 'en');
    RAISE EXCEPTION 'Test 7 FAIL: nessun errore senza riga manuale';
  EXCEPTION WHEN no_data_found THEN
    RAISE NOTICE 'Test 7 OK: senza riga manuale resta P0002';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Non membro → 42501 'tenant mismatch' (invariato)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.revert_manual_translation(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
      '00000000-0000-0000-0000-000000000000', 'description', 'en');
    RAISE EXCEPTION 'Test 8 FAIL: un non membro è passato';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Forbidden: tenant mismatch' THEN
      RAISE EXCEPTION 'Test 8 FAIL: messaggio cambiato (%)', SQLERRM;
    END IF;
    RAISE NOTICE 'Test 8 OK: non membro rifiutato con tenant mismatch';
  END;
END$$;
ROLLBACK;
