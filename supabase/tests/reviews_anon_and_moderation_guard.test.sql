-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira in BEGIN … ROLLBACK, ma in produzione quegli UUID non
-- esistono o non sono dati di test.
-- =============================================================================
--
-- Test — reviews: anon non legge, chi modera cambia solo lo stato
--
-- Verifica:
--   - anon non legge nessuna recensione, nemmeno le approvate (e quindi né
--     request_ip né session_id) (migration 20260930120000)
--   - nessun membro inserisce recensioni, owner compreso (20260930120100,
--     20260930120200); il service role della Edge submit-review sì
--   - chi ha reviews.moderate cambia status e nient'altro: rating e comment
--     rifiutati con 42501 a staff, manager e owner (20260930120200/120300)
--   - invariati: viewer non cambia lo stato (0 righe, RLS), staff non
--     cancella (0 righe), owner cancella
--
-- Helper nello schema reviews_guard_test, creato in testa e droppato in
-- coda: non pg_temp, che nello SQL Editor di Studio non sopravviveva fra uno
-- statement e l'altro (3F000).
--
-- Pattern: setup via postgres role (bypass RLS), poi anon o authenticated.
-- Una transazione sola per tutto il file, ogni test fra SAVEPOINT t<N> e
-- ROLLBACK TO SAVEPOINT t<N>: schema e helper restano vivi per tutto il giro.
-- Prima delle migration falliscono 1, 2, 4, 5 e 6. La recensione di test è
-- inserita dentro ogni savepoint: nessuna riga reale viene toccata.
--
-- Transazione: il file apre la sua (BEGIN) e chiude con ROLLBACK, così non
-- resta niente nemmeno se un test scrivesse fuori dal suo savepoint. Lo SQL
-- Editor di Studio esegue già tutto in una transazione: lì il BEGIN è solo
-- un WARNING («there is already a transaction in progress») e il ROLLBACK
-- finale chiude la sua. Un FAIL annulla l'intera transazione, schema
-- compreso: non c'è niente da pulire a mano.
--
-- Prerequisiti:
--   - seed_permissions_test_data.sql già eseguito
--   - almeno una recensione approvata di McDonald's (16 al 30/09/2026)
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero.
-- Attesi 10 `NOTICE … OK`; un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (staff Comasina)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina)
--   recensione di test       00000000-0000-0000-0000-00000000ae01 (inserita e annullata in ogni test)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper (schema di test: droppato in coda)
-- -----------------------------------------------------------------------------
BEGIN;

DROP SCHEMA IF EXISTS reviews_guard_test CASCADE;
CREATE SCHEMA reviews_guard_test;

CREATE OR REPLACE FUNCTION reviews_guard_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION reviews_guard_test.as_anon()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('role', 'anon')::text, true);
  SET LOCAL role anon;
END;
$$;

-- Recensione in attesa su Comasina, commento noto. Da chiamare come postgres.
CREATE OR REPLACE FUNCTION reviews_guard_test.seed_review()
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.reviews (
    id, tenant_id, activity_id, rating, rating_category, comment, source, status, request_ip
  ) VALUES (
    '00000000-0000-0000-0000-00000000ae01',
    '5b37c952-1add-4196-aab3-9775d98a9c32',
    '347aae51-8df1-4a15-b7f6-40862bf94005',
    2, 'negative', 'Scritta dal cliente', 'public_form', 'pending', '203.0.113.7'
  );
$$;

CREATE OR REPLACE FUNCTION reviews_guard_test.review()
RETURNS public.reviews
LANGUAGE sql
AS $$
  SELECT * FROM public.reviews WHERE id = '00000000-0000-0000-0000-00000000ae01';
$$;

-- Il test 10 inserisce come service_role: gli servono schema e funzione.
-- Nessun altro ruolo tocca lo schema (un CREATE SCHEMA non dà USAGE a PUBLIC).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA reviews_guard_test FROM PUBLIC;
GRANT USAGE ON SCHEMA reviews_guard_test TO service_role;
GRANT EXECUTE ON FUNCTION reviews_guard_test.seed_review() TO service_role;

-- -----------------------------------------------------------------------------
-- TEST 1 — anon non legge le recensioni approvate
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  IF NOT EXISTS (
    SELECT 1 FROM public.reviews
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Test 1 FAIL: prerequisito — nessuna recensione approvata di McDonald''s';
  END IF;

  PERFORM reviews_guard_test.as_anon();
  SELECT count(*) INTO v_count FROM public.reviews;
  SET LOCAL role postgres;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 1 FAIL: anon legge % recensioni', v_count;
  END IF;
  RAISE NOTICE 'Test 1 OK: anon non legge recensioni, nemmeno le approvate';
END$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — anon non legge request_ip di una recensione appena approvata
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_ip text;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();
  UPDATE public.reviews SET status = 'approved'
  WHERE id = '00000000-0000-0000-0000-00000000ae01';

  PERFORM reviews_guard_test.as_anon();
  SELECT request_ip INTO v_ip FROM public.reviews
  WHERE id = '00000000-0000-0000-0000-00000000ae01';
  SET LOCAL role postgres;
  IF v_ip IS NOT NULL THEN
    RAISE EXCEPTION 'Test 2 FAIL: anon legge request_ip (%)', v_ip;
  END IF;
  RAISE NOTICE 'Test 2 OK: request_ip della recensione pubblicata non leggibile da anon';
END$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — authenticated con reviews.read legge ancora tutti gli stati
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  PERFORM reviews_guard_test.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  SELECT count(*) INTO v_count FROM public.reviews
  WHERE id = '00000000-0000-0000-0000-00000000ae01';
  SET LOCAL role postgres;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 3 FAIL: il viewer non legge la recensione in attesa';
  END IF;
  RAISE NOTICE 'Test 3 OK: viewer legge la recensione in attesa come prima';
END$$;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- TEST 4 — Nessun membro inserisce recensioni: staff, manager, owner → 42501
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT * FROM (VALUES
      ('staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f'::uuid),
      ('manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d'::uuid),
      ('owner',   '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'::uuid)
    ) AS t(label, id)
  LOOP
    PERFORM reviews_guard_test.as_user(v_user.id);
    BEGIN
      INSERT INTO public.reviews (tenant_id, activity_id, rating, rating_category, comment, status)
      VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005',
              5, 'positive', 'Finta', 'approved');
      RAISE EXCEPTION 'Test 4 FAIL: % ha inserito una recensione', v_user.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    SET LOCAL role postgres;
  END LOOP;
  RAISE NOTICE 'Test 4 OK: staff, manager e owner non inseriscono recensioni (42501)';
END$$;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- TEST 5 — Chi modera non riscrive voto né commento: staff, manager, owner → 42501
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
DO $$
DECLARE
  v_user record;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  FOR v_user IN
    SELECT * FROM (VALUES
      ('staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f'::uuid),
      ('manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d'::uuid),
      ('owner',   '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'::uuid)
    ) AS t(label, id)
  LOOP
    PERFORM reviews_guard_test.as_user(v_user.id);
    BEGIN
      UPDATE public.reviews SET comment = 'Riscritta'
      WHERE id = '00000000-0000-0000-0000-00000000ae01';
      RAISE EXCEPTION 'Test 5 FAIL: % ha riscritto il commento', v_user.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    BEGIN
      UPDATE public.reviews SET rating = 5, rating_category = 'positive'
      WHERE id = '00000000-0000-0000-0000-00000000ae01';
      RAISE EXCEPTION 'Test 5 FAIL: % ha cambiato il voto', v_user.label;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    SET LOCAL role postgres;
  END LOOP;

  IF (reviews_guard_test.review()).comment IS DISTINCT FROM 'Scritta dal cliente'
     OR (reviews_guard_test.review()).rating <> 2 THEN
    RAISE EXCEPTION 'Test 5 FAIL: la recensione è cambiata';
  END IF;
  RAISE NOTICE 'Test 5 OK: voto e commento intoccabili per staff, manager e owner (42501)';
END$$;
ROLLBACK TO SAVEPOINT t5;

-- -----------------------------------------------------------------------------
-- TEST 6 — Stato insieme a un'altra colonna: rifiutato anche lo stato
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  PERFORM reviews_guard_test.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  BEGIN
    UPDATE public.reviews SET status = 'approved', comment = 'Riscritta'
    WHERE id = '00000000-0000-0000-0000-00000000ae01';
    RAISE EXCEPTION 'Test 6 FAIL: lo staff ha scritto stato e commento';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  IF (reviews_guard_test.review()).status <> 'pending' THEN
    RAISE EXCEPTION 'Test 6 FAIL: stato cambiato (%)', (reviews_guard_test.review()).status;
  END IF;
  RAISE NOTICE 'Test 6 OK: UPDATE misto rifiutato per intero (42501)';
END$$;
ROLLBACK TO SAVEPOINT t6;

-- -----------------------------------------------------------------------------
-- TEST 7 — Staff pubblica, poi nasconde (solo status)
-- -----------------------------------------------------------------------------
SAVEPOINT t7;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  PERFORM reviews_guard_test.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  UPDATE public.reviews SET status = 'approved'
  WHERE id = '00000000-0000-0000-0000-00000000ae01'
    AND tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 7 FAIL: pubblica ha toccato % righe', v_count;
  END IF;
  UPDATE public.reviews SET status = 'hidden'
  WHERE id = '00000000-0000-0000-0000-00000000ae01'
    AND tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32';
  SET LOCAL role postgres;
  IF (reviews_guard_test.review()).status <> 'hidden' THEN
    RAISE EXCEPTION 'Test 7 FAIL: stato finale %', (reviews_guard_test.review()).status;
  END IF;
  RAISE NOTICE 'Test 7 OK: staff pubblica e nasconde';
END$$;
ROLLBACK TO SAVEPOINT t7;

-- -----------------------------------------------------------------------------
-- TEST 8 — Viewer non cambia lo stato (0 righe, RLS: niente reviews.moderate)
-- -----------------------------------------------------------------------------
SAVEPOINT t8;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  PERFORM reviews_guard_test.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  UPDATE public.reviews SET status = 'approved'
  WHERE id = '00000000-0000-0000-0000-00000000ae01';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 0 OR (reviews_guard_test.review()).status <> 'pending' THEN
    RAISE EXCEPTION 'Test 8 FAIL: il viewer ha cambiato lo stato';
  END IF;
  RAISE NOTICE 'Test 8 OK: viewer non modera (0 righe)';
END$$;
ROLLBACK TO SAVEPOINT t8;

-- -----------------------------------------------------------------------------
-- TEST 9 — Eliminazione invariata: staff 0 righe, owner 1
-- -----------------------------------------------------------------------------
SAVEPOINT t9;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  PERFORM reviews_guard_test.seed_review();

  PERFORM reviews_guard_test.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  DELETE FROM public.reviews WHERE id = '00000000-0000-0000-0000-00000000ae01';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 9 FAIL: lo staff ha cancellato';
  END IF;

  SET LOCAL role postgres;
  PERFORM reviews_guard_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  DELETE FROM public.reviews WHERE id = '00000000-0000-0000-0000-00000000ae01';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 9 FAIL: l''owner non cancella più (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 9 OK: staff non cancella, owner sì';
END$$;
ROLLBACK TO SAVEPOINT t9;

-- -----------------------------------------------------------------------------
-- TEST 10 — Il service role (Edge submit-review) inserisce come prima
-- -----------------------------------------------------------------------------
SAVEPOINT t10;
DO $$
BEGIN
  SET LOCAL role service_role;
  PERFORM reviews_guard_test.seed_review();
  SET LOCAL role postgres;
  IF (reviews_guard_test.review()).id IS NULL THEN
    RAISE EXCEPTION 'Test 10 FAIL: il service role non ha inserito';
  END IF;
  RAISE NOTICE 'Test 10 OK: service role inserisce come prima';
END$$;
ROLLBACK TO SAVEPOINT t10;

-- -----------------------------------------------------------------------------
-- Pulizia
-- -----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS reviews_guard_test CASCADE;
ROLLBACK;
