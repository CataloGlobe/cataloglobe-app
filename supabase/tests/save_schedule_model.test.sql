-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira fra SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con
-- ROLLBACK: nessuna riga reale resta modificata.
-- =============================================================================
--
-- Test — save_schedule_model (20261017090000)
--
-- Verifica:
--   1. menù «insieme» con due fasce (pranzo e cena): schedule_menu, overlap_mode,
--      fasce in ordine, colonne di oggi dalla prima fascia, il ponte fermo.
--   2. fascia 19:00-02:00 (oltre mezzanotte): fascia 1140-1560; colonne di oggi
--      19:00-02:00 (per il giudice vecchio «mai»: perdita voluta).
--   3. slots [] → «Sempre»: nessuna fascia, time_mode always.
--   4. ore per sede: la fascia porta solo Comasina; una sede che non è della
--      regola → errore.
--   5. overlap_mode per sede (target_overlaps) e modo non valido per il tipo.
--   6. regola style: schedule_style e overlap_mode «keep».
--   7. menù di un'altra azienda → errore; regola price → errore.
--   8. test.viewer (senza scheduling.write) → permesso negato; test.manager su
--      una regola delle sue sedi → passa.
--   9. create_schedule_with_targets accetta rule_type menu (manager).
--  10. payload senza «slots»: le fasce restano com'erano.
--  11. fine a mezzanotte (1440) → colonna 23:59; fascia oltre 24 ore → errore
--      del check della tabella; più di 20 fasce → errore.
--  12. test.manager su una regola di una sede non sua → permesso negato.
--
-- Prima della migration falliscono tutti.
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero,
-- dopo aver applicato la migration. Attesi 12 `NOTICE … OK`; un `Test N FAIL`
-- interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   sede Baranzate           e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (viewer Comasina)
--   menù «Catalogo Completo» 6c441e29-f3ad-43e1-aa3b-cd6d7c746b48
--   menù «Menù Pasqua»       a5fad5a3-94f8-42ec-a59d-30da9755b2df
--   stile base               62521c7d-162f-44c0-91f4-d55b172be9bd
--   menù di un'altra azienda 051fbbf0-e184-468a-b1a3-0e6a339ce794
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS modello_test CASCADE;
CREATE SCHEMA modello_test;

CREATE OR REPLACE FUNCTION modello_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION modello_test.slots_of(p_schedule uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT coalesce(
    string_agg(coalesce(s.days_of_week::text, 'ogni giorno') || ' '
               || s.start_minute || '-' || s.end_minute, '; '
               ORDER BY s.sort_order),
    'nessuna')
  FROM public.schedule_slots s
  WHERE s.schedule_id = p_schedule;
$$;

-- Una regola di prova dell'owner (ruolo postgres) con le sedi date.
CREATE OR REPLACE FUNCTION modello_test.new_rule(p_type text, p_sedi uuid[])
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.schedules (tenant_id, rule_type, name, enabled, time_mode)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', p_type, 'Test modello', false, 'always')
  RETURNING id INTO v_id;
  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  SELECT v_id, 'activity', unnest(p_sedi);
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA modello_test FROM PUBLIC;
GRANT USAGE ON SCHEMA modello_test TO authenticated;
GRANT EXECUTE ON FUNCTION modello_test.as_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION modello_test.slots_of(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — menù insieme, due fasce
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_rule record;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'overlap_mode', 'together',
    'slots', jsonb_build_array(
      jsonb_build_object('days_of_week', jsonb_build_array(1, 2, 3, 4, 5), 'start_minute', 720, 'end_minute', 900),
      jsonb_build_object('days_of_week', NULL, 'start_minute', 1140, 'end_minute', 1380))));
  RESET role;
  SELECT * INTO v_rule FROM public.schedules WHERE id = v_id;
  IF modello_test.slots_of(v_id) IS DISTINCT FROM '{1,2,3,4,5} 720-900; ogni giorno 1140-1380'
     OR v_rule.overlap_mode IS DISTINCT FROM 'together'
     OR v_rule.time_mode IS DISTINCT FROM 'window' OR v_rule.days_of_week IS DISTINCT FROM '{1,2,3,4,5}'
     OR v_rule.time_from IS DISTINCT FROM '12:00' OR v_rule.time_to IS DISTINCT FROM '15:00'
     OR (SELECT catalog_id FROM public.schedule_menu WHERE schedule_id = v_id) IS DISTINCT FROM '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48' THEN
    RAISE EXCEPTION 'Test 1 FAIL: % / % % % % %', modello_test.slots_of(v_id), v_rule.overlap_mode,
      v_rule.time_mode, v_rule.days_of_week, v_rule.time_from, v_rule.time_to;
  END IF;
  RAISE NOTICE 'Test 1 OK';
END $$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — oltre mezzanotte
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_rule record;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'slots', jsonb_build_array(
      jsonb_build_object('days_of_week', jsonb_build_array(4), 'start_minute', 1140, 'end_minute', 1560))));
  RESET role;
  SELECT * INTO v_rule FROM public.schedules WHERE id = v_id;
  IF modello_test.slots_of(v_id) IS DISTINCT FROM '{4} 1140-1560'
     OR v_rule.time_from IS DISTINCT FROM '19:00' OR v_rule.time_to IS DISTINCT FROM '02:00' THEN
    RAISE EXCEPTION 'Test 2 FAIL: % % %', modello_test.slots_of(v_id), v_rule.time_from, v_rule.time_to;
  END IF;
  RAISE NOTICE 'Test 2 OK';
END $$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — «Sempre»
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'slots', jsonb_build_array(jsonb_build_object('start_minute', 600, 'end_minute', 700))));
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48', 'slots', '[]'::jsonb));
  RESET role;
  IF modello_test.slots_of(v_id) IS DISTINCT FROM 'nessuna'
     OR (SELECT time_mode FROM public.schedules WHERE id = v_id) IS DISTINCT FROM 'always'
     OR (SELECT time_from FROM public.schedules WHERE id = v_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Test 3 FAIL: %', modello_test.slots_of(v_id);
  END IF;
  RAISE NOTICE 'Test 3 OK';
END $$;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- TEST 4 — ore per sede
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
                                                    'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid]);
  v_targets text;
  v_failed boolean := false;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'slots', jsonb_build_array(jsonb_build_object('start_minute', 600, 'end_minute', 700,
      'targets', jsonb_build_array(jsonb_build_object(
        'target_type', 'activity', 'target_id', '347aae51-8df1-4a15-b7f6-40862bf94005'))))));
  SELECT string_agg(t.target_id::text, ',') INTO v_targets
  FROM public.schedule_slot_targets st
  JOIN public.schedule_targets t ON t.id = st.schedule_target_id
  WHERE st.schedule_id = v_id;
  BEGIN
    PERFORM public.save_schedule_model(v_id, jsonb_build_object(
      'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
      'slots', jsonb_build_array(jsonb_build_object('start_minute', 600, 'end_minute', 700,
        'targets', jsonb_build_array(jsonb_build_object(
          'target_type', 'activity', 'target_id', '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'))))));
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed := true;
  END;
  RESET role;
  -- La chiamata rifiutata non lascia niente a metà.
  IF modello_test.slots_of(v_id) IS DISTINCT FROM 'ogni giorno 600-700'
     OR (SELECT count(*) FROM public.schedule_slot_targets WHERE schedule_id = v_id) <> 1 THEN
    RAISE EXCEPTION 'Test 4 FAIL: stato cambiato dopo l''errore (%)', modello_test.slots_of(v_id);
  END IF;
  IF v_targets IS DISTINCT FROM '347aae51-8df1-4a15-b7f6-40862bf94005' OR NOT v_failed THEN
    RAISE EXCEPTION 'Test 4 FAIL: % %', v_targets, v_failed;
  END IF;
  RAISE NOTICE 'Test 4 OK';
END $$;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- TEST 5 — overlap_mode per sede
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
                                                    'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid]);
  v_modes text;
  v_failed boolean := false;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'overlap_mode', 'together',
    'target_overlaps', jsonb_build_array(jsonb_build_object('target_type', 'activity',
      'target_id', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae', 'overlap_mode', 'replace'))));
  SELECT string_agg(target_id::text || '=' || coalesce(overlap_mode, '-'), ',' ORDER BY target_id) INTO v_modes
  FROM public.schedule_targets WHERE schedule_id = v_id;
  BEGIN
    PERFORM public.save_schedule_model(v_id, jsonb_build_object(
      'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
      'target_overlaps', jsonb_build_array(jsonb_build_object('target_type', 'activity',
        'target_id', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae', 'overlap_mode', 'keep'))));
  EXCEPTION WHEN invalid_parameter_value THEN
    v_failed := true;
  END;
  RESET role;
  -- La chiamata rifiutata non lascia niente a metà.
  IF (SELECT string_agg(target_id::text || '=' || coalesce(overlap_mode, '-'), ',' ORDER BY target_id)
      FROM public.schedule_targets WHERE schedule_id = v_id) IS DISTINCT FROM v_modes THEN
    RAISE EXCEPTION 'Test 5 FAIL: modi cambiati dopo l''errore';
  END IF;
  IF v_modes IS DISTINCT FROM '347aae51-8df1-4a15-b7f6-40862bf94005=-,e1bdd834-4c3c-4441-8cd9-686ecefe48ae=replace' OR NOT v_failed THEN
    RAISE EXCEPTION 'Test 5 FAIL: % %', v_modes, v_failed;
  END IF;
  RAISE NOTICE 'Test 5 OK';
END $$;
ROLLBACK TO SAVEPOINT t5;

-- -----------------------------------------------------------------------------
-- TEST 6 — regola style
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('style', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'style_id', '62521c7d-162f-44c0-91f4-d55b172be9bd', 'overlap_mode', 'keep'));
  RESET role;
  IF (SELECT style_id FROM public.schedule_style WHERE schedule_id = v_id) IS DISTINCT FROM '62521c7d-162f-44c0-91f4-d55b172be9bd'
     OR (SELECT overlap_mode FROM public.schedules WHERE id = v_id) IS DISTINCT FROM 'keep' THEN
    RAISE EXCEPTION 'Test 6 FAIL';
  END IF;
  RAISE NOTICE 'Test 6 OK';
END $$;
ROLLBACK TO SAVEPOINT t6;

-- -----------------------------------------------------------------------------
-- TEST 7 — menù di un'altra azienda, regola di un altro tipo
-- -----------------------------------------------------------------------------
SAVEPOINT t7;
DO $$
DECLARE
  v_menu uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_price uuid := modello_test.new_rule('price', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_errors integer := 0;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  BEGIN
    PERFORM public.save_schedule_model(v_menu, jsonb_build_object('catalog_id', '051fbbf0-e184-468a-b1a3-0e6a339ce794'));
  EXCEPTION WHEN invalid_parameter_value THEN v_errors := v_errors + 1;
  END;
  BEGIN
    PERFORM public.save_schedule_model(v_price, jsonb_build_object('catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48'));
  EXCEPTION WHEN invalid_parameter_value THEN v_errors := v_errors + 1;
  END;
  RESET role;
  IF v_errors IS DISTINCT FROM 2 OR EXISTS (SELECT 1 FROM public.schedule_menu WHERE schedule_id IN (v_menu, v_price)) THEN
    RAISE EXCEPTION 'Test 7 FAIL: % errori', v_errors;
  END IF;
  RAISE NOTICE 'Test 7 OK';
END $$;
ROLLBACK TO SAVEPOINT t7;

-- -----------------------------------------------------------------------------
-- TEST 8 — permessi
-- -----------------------------------------------------------------------------
SAVEPOINT t8;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_denied boolean := false;
BEGIN
  PERFORM modello_test.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  BEGIN
    PERFORM public.save_schedule_model(v_id, jsonb_build_object('catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  RESET role;
  PERFORM modello_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object('catalog_id', 'a5fad5a3-94f8-42ec-a59d-30da9755b2df'));
  RESET role;
  IF NOT v_denied
     OR (SELECT catalog_id FROM public.schedule_menu WHERE schedule_id = v_id) IS DISTINCT FROM 'a5fad5a3-94f8-42ec-a59d-30da9755b2df' THEN
    RAISE EXCEPTION 'Test 8 FAIL: negato al viewer %', v_denied;
  END IF;
  RAISE NOTICE 'Test 8 OK';
END $$;
ROLLBACK TO SAVEPOINT t8;

-- -----------------------------------------------------------------------------
-- TEST 9 — create_schedule_with_targets con rule_type menu
-- -----------------------------------------------------------------------------
SAVEPOINT t9;
DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM modello_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_id := public.create_schedule_with_targets('5b37c952-1add-4196-aab3-9775d98a9c32', 'menu', 'Test bozza menù',
    jsonb_build_array(jsonb_build_object('target_type', 'activity', 'target_id', '347aae51-8df1-4a15-b7f6-40862bf94005')));
  RESET role;
  IF (SELECT rule_type FROM public.schedules WHERE id = v_id) IS DISTINCT FROM 'menu' THEN
    RAISE EXCEPTION 'Test 9 FAIL';
  END IF;
  RAISE NOTICE 'Test 9 OK';
END $$;
ROLLBACK TO SAVEPOINT t9;

-- -----------------------------------------------------------------------------
-- TEST 10 — senza «slots» le fasce restano
-- -----------------------------------------------------------------------------
SAVEPOINT t10;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'slots', jsonb_build_array(jsonb_build_object('start_minute', 600, 'end_minute', 700))));
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', 'a5fad5a3-94f8-42ec-a59d-30da9755b2df', 'overlap_mode', 'replace'));
  RESET role;
  IF modello_test.slots_of(v_id) IS DISTINCT FROM 'ogni giorno 600-700' THEN
    RAISE EXCEPTION 'Test 10 FAIL: %', modello_test.slots_of(v_id);
  END IF;
  RAISE NOTICE 'Test 10 OK';
END $$;
ROLLBACK TO SAVEPOINT t10;

-- -----------------------------------------------------------------------------
-- TEST 11 — mezzanotte, oltre 24 ore, troppe fasce
-- -----------------------------------------------------------------------------
SAVEPOINT t11;
DO $$
DECLARE
  v_id uuid := modello_test.new_rule('menu', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
  v_errors integer := 0;
BEGIN
  PERFORM modello_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.save_schedule_model(v_id, jsonb_build_object(
    'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
    'slots', jsonb_build_array(jsonb_build_object('start_minute', 1140, 'end_minute', 1440))));
  BEGIN
    PERFORM public.save_schedule_model(v_id, jsonb_build_object(
      'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
      'slots', jsonb_build_array(jsonb_build_object('start_minute', 600, 'end_minute', 2100))));
  EXCEPTION WHEN check_violation THEN v_errors := v_errors + 1;
  END;
  BEGIN
    PERFORM public.save_schedule_model(v_id, jsonb_build_object(
      'catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48',
      'slots', (SELECT jsonb_agg(jsonb_build_object('start_minute', i * 60, 'end_minute', i * 60 + 30))
                FROM generate_series(0, 20) AS i)));
  EXCEPTION WHEN invalid_parameter_value THEN v_errors := v_errors + 1;
  END;
  RESET role;
  IF (SELECT time_to FROM public.schedules WHERE id = v_id) IS DISTINCT FROM '23:59'::time
     OR modello_test.slots_of(v_id) IS DISTINCT FROM 'ogni giorno 1140-1440'
     OR v_errors <> 2 THEN
    RAISE EXCEPTION 'Test 11 FAIL: % % errori', modello_test.slots_of(v_id), v_errors;
  END IF;
  RAISE NOTICE 'Test 11 OK';
END $$;
ROLLBACK TO SAVEPOINT t11;

-- -----------------------------------------------------------------------------
-- TEST 12 — il manager e una regola di una sede non sua
-- -----------------------------------------------------------------------------
SAVEPOINT t12;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  -- «Menu Settimanale - Garbagnate»: solo Garbagnate, fuori dalle sedi del manager.
  PERFORM modello_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  BEGIN
    PERFORM public.save_schedule_model('7e51373c-3c0b-4316-8e83-ff8f4334c1a0',
      jsonb_build_object('catalog_id', '6c441e29-f3ad-43e1-aa3b-cd6d7c746b48'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  RESET role;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Test 12 FAIL: il manager ha scritto una regola non sua';
  END IF;
  RAISE NOTICE 'Test 12 OK';
END $$;
ROLLBACK TO SAVEPOINT t12;

ROLLBACK;
