-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira fra SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con
-- ROLLBACK: nessuna riga reale resta modificata.
-- =============================================================================
--
-- Test — create_schedule_with_targets (20261007210000)
--
-- Verifica:
--   1. il manager crea una regola sulla sua sede: spenta, non apply_to_all,
--      una sede, e subito sua (can_write_schedule vero, la legge).
--   2. il manager non crea su una sede che non gestisce (Garbagnate) → 42501.
--   3. il manager non crea su un gruppo con sedi non sue → 42501.
--   4. senza sedi → 22023; sede di un'altra azienda → 22023; tipo non valido → 22023.
--   5. staff e viewer non creano → 42501.
--   6. owner crea su due sedi.
--
-- Prima della migration la funzione non esiste: falliscono tutti.
-- Provato su staging il 2026-10-07 con migration e test nella stessa
-- transazione annullata: 6/6.
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero,
-- dopo aver applicato la migration. Attesi 6 `NOTICE … OK`; un `Test N FAIL`
-- interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   sede Baranzate           e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (staff Comasina)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina)
--   regola «Menu Settimanale - Garbagnate»  7e51373c-3c0b-4316-8e83-ff8f4334c1a0 (solo Garbagnate:
--                                            da qui si legge l'id di Garbagnate)
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS create_schedule_test CASCADE;
CREATE SCHEMA create_schedule_test;

CREATE OR REPLACE FUNCTION create_schedule_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA create_schedule_test FROM PUBLIC;
GRANT USAGE ON SCHEMA create_schedule_test TO authenticated;
GRANT EXECUTE ON FUNCTION create_schedule_test.as_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — manager crea sulla sua sede, e la regola è subito sua
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_id uuid;
  v_row record;
  v_targets integer;
BEGIN
  PERFORM create_schedule_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_id := public.create_schedule_with_targets(
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'price', '  Test sicurezza manager  ',
    '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
  IF NOT public.can_write_schedule(v_id) THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 1 FAIL: la regola creata non è scrivibile dal manager';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schedules WHERE id = v_id) THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 1 FAIL: il manager non legge la regola appena creata';
  END IF;
  SET LOCAL role postgres;
  SELECT apply_to_all, enabled, name, rule_type INTO v_row FROM public.schedules WHERE id = v_id;
  SELECT count(*) INTO v_targets FROM public.schedule_targets WHERE schedule_id = v_id;
  IF v_row.apply_to_all OR v_row.enabled OR v_row.name <> 'Test sicurezza manager'
     OR v_row.rule_type <> 'price' OR v_targets <> 1 THEN
    RAISE EXCEPTION 'Test 1 FAIL: regola creata male (apply_to_all %, enabled %, nome «%», tipo %, sedi %)',
      v_row.apply_to_all, v_row.enabled, v_row.name, v_row.rule_type, v_targets;
  END IF;
  RAISE NOTICE 'Test 1 OK: manager crea una regola spenta sulla sua sede';
END$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — manager non crea su una sede che non gestisce
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_garbagnate uuid;
BEGIN
  SET LOCAL role postgres;
  SELECT target_id INTO v_garbagnate FROM public.schedule_targets
  WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0' AND target_type = 'activity'
  LIMIT 1;
  IF v_garbagnate IS NULL THEN
    RAISE EXCEPTION 'Test 2 FAIL: prerequisito — «Menu Settimanale - Garbagnate» senza sede';
  END IF;

  PERFORM create_schedule_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.create_schedule_with_targets(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'Test sicurezza',
      jsonb_build_array(
        jsonb_build_object('target_type', 'activity', 'target_id', '347aae51-8df1-4a15-b7f6-40862bf94005'),
        jsonb_build_object('target_type', 'activity', 'target_id', v_garbagnate)));
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 2 FAIL: manager ha creato una regola anche su Garbagnate';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  RAISE NOTICE 'Test 2 OK: manager non crea su una sede che non gestisce';
END$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — manager non crea su un gruppo con sedi non sue
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_group uuid;
  v_garbagnate uuid;
BEGIN
  SET LOCAL role postgres;
  -- Su staging nessun gruppo ha sedi fuori da quelle del manager: se ne crea
  -- uno qui (Comasina + Garbagnate), annullato dal ROLLBACK TO SAVEPOINT.
  SELECT target_id INTO v_garbagnate FROM public.schedule_targets
  WHERE schedule_id = '7e51373c-3c0b-4316-8e83-ff8f4334c1a0' AND target_type = 'activity'
  LIMIT 1;
  IF v_garbagnate IS NULL THEN
    RAISE EXCEPTION 'Test 3 FAIL: prerequisito — «Menu Settimanale - Garbagnate» senza sede';
  END IF;
  INSERT INTO public.activity_groups (tenant_id, name)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test sicurezza Comasina + Garbagnate')
  RETURNING id INTO v_group;
  INSERT INTO public.activity_group_members (tenant_id, group_id, activity_id)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_group, '347aae51-8df1-4a15-b7f6-40862bf94005'),
         ('5b37c952-1add-4196-aab3-9775d98a9c32', v_group, v_garbagnate);

  PERFORM create_schedule_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.create_schedule_with_targets(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'Test sicurezza',
      jsonb_build_array(jsonb_build_object('target_type', 'activity_group', 'target_id', v_group)));
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 3 FAIL: manager ha creato una regola su un gruppo con sedi non sue';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  SET LOCAL role postgres;
  RAISE NOTICE 'Test 3 OK: manager non crea su un gruppo con sedi non sue';
END$$;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- TEST 4 — input non validi: senza sedi, sede di un'altra azienda, tipo
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
DO $$
DECLARE
  v_other uuid;
BEGIN
  SET LOCAL role postgres;
  SELECT id INTO v_other FROM public.activities
  WHERE tenant_id <> '5b37c952-1add-4196-aab3-9775d98a9c32' LIMIT 1;

  PERFORM create_schedule_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.create_schedule_with_targets(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'Test sicurezza', '[]'::jsonb);
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 4 FAIL: regola creata senza sedi';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.create_schedule_with_targets(
      '5b37c952-1add-4196-aab3-9775d98a9c32', 'sconto', 'Test sicurezza',
      '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 4 FAIL: regola creata con un tipo non valido';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  IF v_other IS NOT NULL THEN
    BEGIN
      PERFORM public.create_schedule_with_targets(
        '5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'Test sicurezza',
        jsonb_build_array(jsonb_build_object('target_type', 'activity', 'target_id', v_other)));
      SET LOCAL role postgres;
      RAISE EXCEPTION 'Test 4 FAIL: regola creata su una sede di un''altra azienda';
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END IF;
  SET LOCAL role postgres;
  RAISE NOTICE 'Test 4 OK: niente regola senza sedi, con tipo non valido o su sedi di altre aziende';
END$$;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- TEST 5 — staff e viewer non creano
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
DO $$
DECLARE
  v_user uuid;
BEGIN
  FOREACH v_user IN ARRAY ARRAY['9c6580e5-80bc-4fe8-9141-0d299be38f2f',
                                'd01359aa-d980-4030-bc5c-c5e84dfe3d0c']::uuid[] LOOP
    PERFORM create_schedule_test.as_user(v_user);
    BEGIN
      PERFORM public.create_schedule_with_targets(
        '5b37c952-1add-4196-aab3-9775d98a9c32', 'layout', 'Test sicurezza',
        '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
      SET LOCAL role postgres;
      RAISE EXCEPTION 'Test 5 FAIL: % ha creato una regola', v_user;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    SET LOCAL role postgres;
  END LOOP;
  RAISE NOTICE 'Test 5 OK: staff e viewer non creano regole';
END$$;
ROLLBACK TO SAVEPOINT t5;

-- -----------------------------------------------------------------------------
-- TEST 6 — owner crea su due sedi (invariato il suo flusso, ma può usarla)
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
DECLARE
  v_id uuid;
  v_targets integer;
BEGIN
  PERFORM create_schedule_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  v_id := public.create_schedule_with_targets(
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', NULL,
    '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"},
      {"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"},
      {"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"}]'::jsonb);
  SET LOCAL role postgres;
  SELECT count(*) INTO v_targets FROM public.schedule_targets WHERE schedule_id = v_id;
  IF v_targets <> 2 THEN
    RAISE EXCEPTION 'Test 6 FAIL: owner, sedi attese 2 (doppione tolto), trovate %', v_targets;
  END IF;
  RAISE NOTICE 'Test 6 OK: owner crea su due sedi, doppioni tolti';
END$$;
ROLLBACK TO SAVEPOINT t6;

ROLLBACK;
