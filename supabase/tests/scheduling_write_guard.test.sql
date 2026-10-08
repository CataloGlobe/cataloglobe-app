-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira fra SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con
-- ROLLBACK: nessuna riga reale resta modificata.
-- =============================================================================
--
-- Test — Programmazione: chi non può scrivere una regola non ne tocca i pezzi
--
-- Verifica:
--   - tabelle figlie (schedule_layout, schedule_price_overrides,
--     schedule_visibility_overrides, schedule_featured_contents): si scrive
--     solo se si può scrivere la regola (can_write_schedule), mig
--     20261007170000. Prima bastava essere membri (o scheduling.write su una
--     sede qualunque per schedule_featured_contents).
--   - schedules.apply_to_all = true solo owner/admin, in INSERT e in UPDATE
--     (20261007170100). Prima un manager creava una regola su tutte le sedi
--     e accendeva apply_to_all su una sua regola.
--   - update_schedule_targets: un ruolo scoped deve poter scrivere la regola
--     com'è adesso, non solo le sedi nuove (20261007170200). Prima un manager
--     portava sulla sua sede una regola di Garbagnate e poi la modificava.
--   - invariati: il manager scrive le sue regole, l'owner scrive tutto.
--
-- Prima delle tre migration falliscono 1, 2, 3, 5, 6, 7, 8.
--
-- Helper nello schema scheduling_guard_test, creato in testa e annullato dal
-- ROLLBACK finale (vedi reviews_anon_and_moderation_guard.test.sql).
--
-- Esito RLS: INSERT o WITH CHECK rifiutati → 42501; UPDATE/DELETE con USING
-- falso → 0 righe, nessun errore.
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero.
-- Attesi 10 `NOTICE … OK`; un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   sede Baranzate           e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (staff Comasina)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina)
--   regola «Menu Settimanale - Garbagnate»  7e51373c-3c0b-4316-8e83-ff8f4334c1a0 (solo Garbagnate)
--   regola «Test - Baranzate»               7a993c30-2c70-43f2-99b8-cd13d24814b1 (solo Baranzate)
--   regola «Promo sede Garbagnate»          d4c6fe23-d2c8-4286-9927-3aef922eeeea (featured, solo Garbagnate)
--   regola «Prodotti Stagionali»            106254c2-7790-46e6-847b-34ed766e83fd (visibility, tutte le sedi)
--   regola «Sconto del venerdì»             67829940-05af-47b3-a2b2-e2f392ffaf4c (price, tutte le sedi)
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS scheduling_guard_test CASCADE;
CREATE SCHEMA scheduling_guard_test;

CREATE OR REPLACE FUNCTION scheduling_guard_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA scheduling_guard_test FROM PUBLIC;
GRANT USAGE ON SCHEMA scheduling_guard_test TO authenticated;
GRANT EXECUTE ON FUNCTION scheduling_guard_test.as_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — staff non cancella i prodotti nascosti di una regola (0 righe)
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_visibility_overrides
    WHERE schedule_id = '106254c2-7790-46e6-847b-34ed766e83fd'
  ) THEN
    RAISE EXCEPTION 'Test 1 FAIL: prerequisito — «Prodotti Stagionali» senza prodotti';
  END IF;

  PERFORM scheduling_guard_test.as_user('9c6580e5-80bc-4fe8-9141-0d299be38f2f');
  DELETE FROM public.schedule_visibility_overrides
  WHERE schedule_id = '106254c2-7790-46e6-847b-34ed766e83fd';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 1 FAIL: staff ha cancellato % righe di schedule_visibility_overrides', v_count;
  END IF;
  RAISE NOTICE 'Test 1 OK: staff non cancella schedule_visibility_overrides';
END$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — viewer non cancella menù e prezzi di una regola (0 righe)
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM scheduling_guard_test.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  DELETE FROM public.schedule_layout
  WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 2 FAIL: viewer ha cancellato % righe di schedule_layout', v_count;
  END IF;
  DELETE FROM public.schedule_price_overrides
  WHERE schedule_id = '67829940-05af-47b3-a2b2-e2f392ffaf4c';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 2 FAIL: viewer ha cancellato % righe di schedule_price_overrides', v_count;
  END IF;
  RAISE NOTICE 'Test 2 OK: viewer non cancella schedule_layout né schedule_price_overrides';
END$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — manager non tocca i pezzi di una regola di altre sedi
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_count integer;
  v_style uuid;
BEGIN
  SET LOCAL role postgres;
  SELECT style_id INTO v_style FROM public.schedule_layout
  WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0';
  IF v_style IS NULL THEN
    RAISE EXCEPTION 'Test 3 FAIL: prerequisito — «Menu Settimanale - Garbagnate» senza layout';
  END IF;
  -- Toglie il layout come postgres, così l'INSERT del manager non urta
  -- un eventuale vincolo di unicità: l'unico rifiuto atteso è l'RLS.
  DELETE FROM public.schedule_layout WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0';

  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    INSERT INTO public.schedule_layout (schedule_id, style_id, tenant_id)
    VALUES ('7e51373c-3c0b-4316-8e83-ff8f4334c1a0', v_style, '5b37c952-1add-4196-aab3-9775d98a9c32');
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 3 FAIL: manager ha inserito il layout di una regola di Garbagnate';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  DELETE FROM public.schedule_featured_contents
  WHERE schedule_id = 'd4c6fe23-d2c8-4286-9927-3aef922eeeea';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 3 FAIL: manager ha cancellato % righe di schedule_featured_contents di Garbagnate', v_count;
  END IF;
  RAISE NOTICE 'Test 3 OK: manager non scrive layout né contenuti in evidenza di Garbagnate';
END$$;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- TEST 4 — manager scrive i pezzi della sua regola (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  UPDATE public.schedule_layout SET style_id = style_id
  WHERE schedule_id = '7a993c30-2c70-43f2-99b8-cd13d24814b1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 4 FAIL: manager non aggiorna il layout di «Test - Baranzate» (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 4 OK: manager aggiorna il layout della sua regola';
END$$;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- TEST 5 — manager non crea una regola su tutte le sedi (42501)
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
DO $$
BEGIN
  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    INSERT INTO public.schedules (tenant_id, rule_type, time_mode, enabled, apply_to_all, name)
    VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'always', false, true, 'Test sicurezza');
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 5 FAIL: manager ha creato una regola apply_to_all';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  RAISE NOTICE 'Test 5 OK: manager non crea regole su tutte le sedi';
END$$;
ROLLBACK TO SAVEPOINT t5;

-- -----------------------------------------------------------------------------
-- TEST 6 — manager non accende apply_to_all su una sua regola (42501)
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
BEGIN
  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    UPDATE public.schedules SET apply_to_all = true
    WHERE id = '7a993c30-2c70-43f2-99b8-cd13d24814b1';
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 6 FAIL: manager ha acceso apply_to_all su «Test - Baranzate»';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  IF (SELECT apply_to_all FROM public.schedules WHERE id = '7a993c30-2c70-43f2-99b8-cd13d24814b1') THEN
    RAISE EXCEPTION 'Test 6 FAIL: apply_to_all cambiato';
  END IF;
  RAISE NOTICE 'Test 6 OK: manager non estende una regola a tutte le sedi';
END$$;
ROLLBACK TO SAVEPOINT t6;

-- -----------------------------------------------------------------------------
-- TEST 7 — manager non porta sulla sua sede una regola di Garbagnate (42501)
-- -----------------------------------------------------------------------------
SAVEPOINT t7;
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.update_schedule_targets(
      '7e51373c-3c0b-4316-8e83-ff8f4334c1a0',
      '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 7 FAIL: manager ha spostato su Comasina la regola di Garbagnate';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  SELECT count(*) INTO v_count FROM public.schedule_targets
  WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0'
    AND target_id = '1f62cac4-2ba9-436b-b075-057203658422';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 7 FAIL: i target di Garbagnate sono cambiati';
  END IF;
  RAISE NOTICE 'Test 7 OK: manager non si prende una regola di altre sedi';
END$$;
ROLLBACK TO SAVEPOINT t7;

-- -----------------------------------------------------------------------------
-- TEST 8 — manager non modifica una regola su tutte le sedi via RPC (22023)
--           e non tocca una regola senza sedi (42501)
-- -----------------------------------------------------------------------------
SAVEPOINT t8;
DO $$
DECLARE
  v_orphan uuid;
BEGIN
  SET LOCAL role postgres;
  -- Regola anomala senza sedi e non apply_to_all (l'owner la crea così
  -- quando toglie tutte le sedi da una bozza): un manager non deve poterla
  -- reclamare.
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, enabled, apply_to_all, name)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'always', false, false, 'Test sicurezza senza sedi')
  RETURNING id INTO v_orphan;

  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.update_schedule_targets(
      v_orphan,
      '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 8 FAIL: manager ha reclamato una regola senza sedi';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  RAISE NOTICE 'Test 8 OK: manager non reclama una regola senza sedi';
END$$;
ROLLBACK TO SAVEPOINT t8;

-- -----------------------------------------------------------------------------
-- TEST 9 — manager cambia le sedi e il nome della sua regola (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t9;
DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM scheduling_guard_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_count := public.update_schedule_targets(
    '7a993c30-2c70-43f2-99b8-cd13d24814b1',
    '[{"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"},
      {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
  IF v_count <> 2 THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 9 FAIL: update_schedule_targets ha restituito %', v_count;
  END IF;
  UPDATE public.schedules SET name = name || ' (prova)'
  WHERE id = '7a993c30-2c70-43f2-99b8-cd13d24814b1';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 9 FAIL: manager non rinomina la sua regola (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 9 OK: manager cambia sedi e nome della sua regola';
END$$;
ROLLBACK TO SAVEPOINT t9;

-- -----------------------------------------------------------------------------
-- TEST 10 — owner scrive tutto (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t10;
DO $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  PERFORM scheduling_guard_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, enabled, name)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'always', false, 'Test sicurezza owner')
  RETURNING id INTO v_id;
  UPDATE public.schedules SET apply_to_all = true WHERE id = v_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 10 FAIL: owner non accende apply_to_all';
  END IF;
  v_count := public.update_schedule_targets(
    '7e51373c-3c0b-4316-8e83-ff8f4334c1a0',
    '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
  DELETE FROM public.schedule_featured_contents
  WHERE schedule_id = 'd4c6fe23-d2c8-4286-9927-3aef922eeeea';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Test 10 FAIL: owner non cancella i contenuti in evidenza di Garbagnate';
  END IF;
  RAISE NOTICE 'Test 10 OK: owner crea, estende, sposta e svuota le regole';
END$$;
ROLLBACK TO SAVEPOINT t10;

ROLLBACK;
