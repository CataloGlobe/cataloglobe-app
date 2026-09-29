-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira in BEGIN … ROLLBACK, ma in produzione quegli UUID non
-- esistono o non sono dati di test.
-- =============================================================================
--
-- Test — scritture su translations: serve translations.write
--
-- Verifica:
--   - upsert_manual_translation rifiuta viewer, staff e manager con 42501 e
--     non scrive; owner e admin scrivono come prima (migration 20260929170000)
--   - insert e update diretti su translations (PostgREST): rifiutati a
--     viewer, staff e manager, ammessi a owner e admin (migration 20260929170100)
--   - restano aperti, di proposito, i percorsi che il manager usa dal client
--     (chiusure della sede, In evidenza): accodare un job su translation_jobs
--     e cancellare righe di translations. Se un giorno si chiudono, i test 11
--     e 12 vanno riscritti insieme alla RPC di accodamento.
--
-- Pattern: setup via postgres role (bypass RLS), poi authenticated. Ogni test
-- in BEGIN … ROLLBACK. Prima delle migration falliscono 1–4, 7 e 8.
-- L'entità è un id finto: nessuna riga reale di translations viene toccata.
--
-- Prerequisiti:
--   - seed_permissions_test_data.sql già eseguito
--   - lingua 'en' in supported_languages
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres). Attesi 12
-- `NOTICE … OK`; un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (staff Comasina; admin nei test 6 e 10)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina; owner del tenant scratch nel test 4)
--   entità di test           product / 00000000-0000-0000-0000-00000000e001 / description / en
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper di sessione (pg_temp: spariscono a fine sessione)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.call_upsert(p_text text)
RETURNS void
LANGUAGE sql
AS $$
  SELECT public.upsert_manual_translation(
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
    '00000000-0000-0000-0000-00000000e001', 'description', 'en',
    'Test source', 'test-hash', p_text);
$$;

CREATE OR REPLACE FUNCTION pg_temp.row_text()
RETURNS text
LANGUAGE sql
AS $$
  SELECT translated_text FROM public.translations
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_type = 'product'
    AND entity_id = '00000000-0000-0000-0000-00000000e001'
    AND field = 'description' AND language_code = 'en';
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_row()
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
    '00000000-0000-0000-0000-00000000e001', 'description', 'en',
    'Test source', 'test-hash', 'Originale', 'mock', 'auto'
  );
$$;

-- -----------------------------------------------------------------------------
-- TEST 1–3 — upsert_manual_translation: viewer, staff, manager → 42501, niente riga
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT * FROM (VALUES
      (1, 'viewer',  'd01359aa-d980-4030-bc5c-c5e84dfe3d0c'::uuid),
      (2, 'staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f'::uuid),
      (3, 'manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d'::uuid)
    ) AS t(n, label, id)
  LOOP
    PERFORM pg_temp.as_user(v_user.id);
    BEGIN
      PERFORM pg_temp.call_upsert('Scritta da ' || v_user.label);
      RAISE EXCEPTION 'Test % FAIL: % ha scritto una traduzione manuale via RPC', v_user.n, v_user.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    SET LOCAL role postgres;
    IF pg_temp.row_text() IS NOT NULL THEN
      RAISE EXCEPTION 'Test % FAIL: riga presente dopo il rifiuto', v_user.n;
    END IF;
    RAISE NOTICE 'Test % OK: % rifiutato su upsert_manual_translation (42501)', v_user.n, v_user.label;
  END LOOP;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Owner di un'altra azienda, viewer qui → 42501 sulla RPC
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c');

  PERFORM pg_temp.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  BEGIN
    PERFORM pg_temp.call_upsert('Scritta da fuori');
    RAISE EXCEPTION 'Test 4 FAIL: il permesso di un''altra azienda è bastato';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Test 4 OK: translations.write di un''altra azienda non vale qui (42501)';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Owner scrive la traduzione manuale via RPC (invariato)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  PERFORM pg_temp.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM pg_temp.call_upsert('Scritta dall''owner');
  SET LOCAL role postgres;
  IF pg_temp.row_text() IS DISTINCT FROM 'Scritta dall''owner' THEN
    RAISE EXCEPTION 'Test 5 FAIL: riga non scritta (%)', pg_temp.row_text();
  END IF;
  RAISE NOTICE 'Test 5 OK: owner scrive via upsert_manual_translation';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Admin scrive la traduzione manuale via RPC (invariato)
-- test.staff promosso admin dentro la transazione (role='admin', niente righe
-- di sede), come un admin reale. ROLLBACK lo riporta a staff.
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  SET LOCAL role postgres;
  DELETE FROM public.tenant_membership_activities tma
  USING public.tenant_memberships tm
  WHERE tma.tenant_membership_id = tm.id
    AND tm.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND tm.user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';
  UPDATE public.tenant_memberships SET role = 'admin'
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  PERFORM pg_temp.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  PERFORM pg_temp.call_upsert('Scritta dall''admin');
  SET LOCAL role postgres;
  IF pg_temp.row_text() IS DISTINCT FROM 'Scritta dall''admin' THEN
    RAISE EXCEPTION 'Test 6 FAIL: riga non scritta (%)', pg_temp.row_text();
  END IF;
  RAISE NOTICE 'Test 6 OK: admin scrive via upsert_manual_translation';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Insert diretto su translations: viewer, staff, manager → 42501 (RLS)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT * FROM (VALUES
      ('viewer',  'd01359aa-d980-4030-bc5c-c5e84dfe3d0c'::uuid),
      ('staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f'::uuid),
      ('manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d'::uuid)
    ) AS t(label, id)
  LOOP
    PERFORM pg_temp.as_user(v_user.id);
    BEGIN
      INSERT INTO public.translations (
        tenant_id, entity_type, entity_id, field, language_code,
        source_text, source_hash, translated_text, provider, status
      ) VALUES (
        '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
        '00000000-0000-0000-0000-00000000e001', 'description', 'en',
        'Test source', 'test-hash', 'Diretta', 'manual', 'manual'
      );
      RAISE EXCEPTION 'Test 7 FAIL: insert diretto riuscito per %', v_user.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    SET LOCAL role postgres;
  END LOOP;
  RAISE NOTICE 'Test 7 OK: insert diretto su translations rifiutato a viewer, staff, manager (42501)';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Update diretto su translations: viewer, staff, manager → 0 righe
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_user record;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM pg_temp.seed_row();

  FOR v_user IN
    SELECT * FROM (VALUES
      ('viewer',  'd01359aa-d980-4030-bc5c-c5e84dfe3d0c'::uuid),
      ('staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f'::uuid),
      ('manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d'::uuid)
    ) AS t(label, id)
  LOOP
    PERFORM pg_temp.as_user(v_user.id);
    UPDATE public.translations
    SET translated_text = 'Cambiata da ' || v_user.label, status = 'manual', provider = 'manual'
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
      AND entity_id = '00000000-0000-0000-0000-00000000e001';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    SET LOCAL role postgres;
    IF v_count <> 0 OR pg_temp.row_text() <> 'Originale' THEN
      RAISE EXCEPTION 'Test 8 FAIL: % ha aggiornato la riga (% righe)', v_user.label, v_count;
    END IF;
  END LOOP;
  RAISE NOTICE 'Test 8 OK: update diretto su translations senza effetto per viewer, staff, manager';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Owner: insert e update diretti ammessi (invariato)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_temp.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product',
    '00000000-0000-0000-0000-00000000e001', 'description', 'en',
    'Test source', 'test-hash', 'Diretta owner', 'manual', 'manual'
  );
  UPDATE public.translations SET translated_text = 'Aggiornata owner'
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_id = '00000000-0000-0000-0000-00000000e001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 OR pg_temp.row_text() <> 'Aggiornata owner' THEN
    RAISE EXCEPTION 'Test 9 FAIL: owner non scrive direttamente (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 9 OK: owner inserisce e aggiorna direttamente';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Admin: update diretto ammesso (invariato)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM pg_temp.seed_row();
  DELETE FROM public.tenant_membership_activities tma
  USING public.tenant_memberships tm
  WHERE tma.tenant_membership_id = tm.id
    AND tm.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND tm.user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';
  UPDATE public.tenant_memberships SET role = 'admin'
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id = '9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  PERFORM pg_temp.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  UPDATE public.translations SET translated_text = 'Aggiornata admin'
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_id = '00000000-0000-0000-0000-00000000e001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 OR pg_temp.row_text() <> 'Aggiornata admin' THEN
    RAISE EXCEPTION 'Test 10 FAIL: admin non aggiorna direttamente (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 10 OK: admin aggiorna direttamente';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — Manager accoda un job su translation_jobs (aperto di proposito:
-- chiusure della sede e In evidenza, via enqueueWithSilentError).
-- Con quota AI esaurita il trigger rifiuta il job come prima: il test lo
-- segnala e prosegue, la RLS è passata.
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_quota boolean := false;
BEGIN
  PERFORM pg_temp.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    INSERT INTO public.translation_jobs (
      tenant_id, entity_type, entity_id, field, target_language_code,
      source_text, source_hash, status, attempts
    ) VALUES (
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'closure',
      '00000000-0000-0000-0000-00000000e001', 'label', 'en',
      'Chiuso per ferie', 'test-hash', 'pending', 0
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Test 11 FAIL: il manager non accoda più i job (%)', SQLERRM;
    WHEN raise_exception THEN
      IF SQLERRM <> 'AI_QUOTA_EXHAUSTED' THEN RAISE; END IF;
      v_quota := true;
  END;
  SET LOCAL role postgres;
  IF v_quota THEN
    RAISE NOTICE 'Test 11 OK: manager passa la RLS di translation_jobs (job fermato dalla quota AI, come prima)';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.translation_jobs
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
      AND entity_id = '00000000-0000-0000-0000-00000000e001' AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Test 11 FAIL: job non accodato';
  ELSE
    RAISE NOTICE 'Test 11 OK: manager accoda il job di traduzione come prima';
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 12 — Manager cancella righe di translations (aperto di proposito:
-- pulizia dopo eliminazione di una chiusura o di un contenuto In evidenza).
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM pg_temp.seed_row();

  PERFORM pg_temp.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  DELETE FROM public.translations
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_id = '00000000-0000-0000-0000-00000000e001';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 12 FAIL: il manager non cancella più (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 12 OK: manager cancella righe di translations come prima';
END$$;
ROLLBACK;
