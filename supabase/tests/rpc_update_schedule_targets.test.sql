-- =============================================================================
-- RPC test — update_schedule_targets (Fase 3 RPC #3)
--
-- Verifica firma, validazione targets, gating manager, mutazione atomica.
--
-- Pattern: ogni test crea uno schedule "scratch" tramite postgres role (bypass
-- RLS), poi impersona authenticated e chiama la RPC. ROLLBACK al termine.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito
--   - migration 20260530140000_update_schedule_targets.sql applicata
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005   (manager)
--   activity Baranzate       e1bdd834-4c3c-4441-8cd9-686ecefe48ae   (manager)
--   activity Garbagnate      1f62cac4-2ba9-436b-b075-057203658422   (NOT manager)
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner imposta 2 activity target su schedule fresh → OK
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_count integer;
BEGIN
  -- Setup: schedule scratch via postgres role
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  -- Switch to authenticated as owner Lorenzo
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"},
    {"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"}
  ]'::jsonb) INTO v_count;

  IF v_count = 2 THEN
    RAISE NOTICE 'Test 1 OK: owner imposta 2 activity target';
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Owner imposta 1 activity_group target → OK
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_gid uuid;
  v_count integer;
BEGIN
  -- Setup: gruppo scratch + schedule scratch
  SET LOCAL role postgres;

  INSERT INTO public.activity_groups (tenant_id, name)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test group RPC')
  RETURNING id INTO v_gid;

  INSERT INTO public.activity_group_members (tenant_id, group_id, activity_id)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_gid, '347aae51-8df1-4a15-b7f6-40862bf94005');

  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity_group', v_gid, false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, jsonb_build_array(
    jsonb_build_object('target_type','activity_group','target_id', v_gid::text)
  )) INTO v_count;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 2 OK: owner imposta 1 activity_group target';
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Aggiungi target (set finale=2)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  VALUES (v_sid, 'activity', '347aae51-8df1-4a15-b7f6-40862bf94005');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"},
    {"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"}
  ]'::jsonb) INTO v_count;

  IF v_count = 2 THEN
    RAISE NOTICE 'Test 3 OK: aggiunta target (1 → 2)';
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Rimuovi target (2 → 1)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  VALUES (v_sid, 'activity', '347aae51-8df1-4a15-b7f6-40862bf94005'),
         (v_sid, 'activity', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
  ]'::jsonb) INTO v_count;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 4 OK: rimossa target (2 → 1)';
  ELSE
    RAISE EXCEPTION 'Test 4 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Sostituzione totale target
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_count integer;
  v_target_id uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  VALUES (v_sid, 'activity', '347aae51-8df1-4a15-b7f6-40862bf94005');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  PERFORM public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"e1bdd834-4c3c-4441-8cd9-686ecefe48ae"}
  ]'::jsonb);

  SELECT count(*) INTO v_count
  FROM public.schedule_targets WHERE schedule_id = v_sid;

  SELECT target_id INTO v_target_id
  FROM public.schedule_targets WHERE schedule_id = v_sid LIMIT 1;

  IF v_count = 1 AND v_target_id = 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae' THEN
    RAISE NOTICE 'Test 5 OK: sostituzione totale (Comasina → Baranzate)';
  ELSE
    RAISE EXCEPTION 'Test 5 FAIL: count=%, target_id=%', v_count, v_target_id;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Admin imposta target → OK (skip se no admin)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_admin_uid uuid;
  v_count integer;
BEGIN
  SELECT user_id INTO v_admin_uid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role='admin' AND status='active' LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'Test 6 SKIPPED: nessun admin attivo';
    RETURN;
  END IF;

  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_admin_uid, 'role','authenticated')::text);
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
  ]'::jsonb) INTO v_count;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 6 OK: admin imposta target';
  ELSE
    RAISE EXCEPTION 'Test 6 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Manager imposta target su sua sede (Comasina) → OK
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT public.update_schedule_targets(v_sid, '[
    {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
  ]'::jsonb) INTO v_count;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 7 OK: manager imposta target su Comasina (sua)';
  ELSE
    RAISE EXCEPTION 'Test 7 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Manager prova target su Garbagnate (NON sua) → ERROR 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[
      {"target_type":"activity","target_id":"1f62cac4-2ba9-436b-b075-057203658422"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 8 FAIL: Garbagnate accettata';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 8 OK: manager bloccato su Garbagnate (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Manager prova activity_group con sede mista → ERROR 42501
-- (Gruppo con Comasina + Garbagnate; manager ha solo Comasina+Baranzate)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_gid uuid;
BEGIN
  SET LOCAL role postgres;

  INSERT INTO public.activity_groups (tenant_id, name)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Mixed group RPC')
  RETURNING id INTO v_gid;

  INSERT INTO public.activity_group_members (tenant_id, group_id, activity_id) VALUES
    ('5b37c952-1add-4196-aab3-9775d98a9c32', v_gid, '347aae51-8df1-4a15-b7f6-40862bf94005'),
    ('5b37c952-1add-4196-aab3-9775d98a9c32', v_gid, '1f62cac4-2ba9-436b-b075-057203658422');

  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity_group', v_gid, false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, jsonb_build_array(
      jsonb_build_object('target_type','activity_group','target_id', v_gid::text)
    ));
    RAISE EXCEPTION 'Test 9 FAIL: gruppo misto accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 9 OK: manager bloccato su gruppo misto (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 9 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Staff prova update → ERROR 42501 (no scheduling.write)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[
      {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 10 FAIL: staff NON ha scheduling.write';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 10 OK: staff bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 10 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — schedule_id inesistente → ERROR 44000
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.update_schedule_targets('00000000-0000-0000-0000-000000000000'::uuid, '[
      {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 11 FAIL: schedule inesistente accettata';
  EXCEPTION
    WHEN sqlstate '44000' THEN
      RAISE NOTICE 'Test 11 OK: schedule inesistente rifiutata (44000)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 11 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 12 — schedule.apply_to_all=true → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'catalog', NULL, true)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[
      {"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 12 FAIL: apply_to_all schedule accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 12 OK: apply_to_all schedule rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 12 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 13 — p_targets vuoto [] → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[]'::jsonb);
    RAISE EXCEPTION 'Test 13 FAIL: array vuoto accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 13 OK: array vuoto rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 13 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 14 — target_type invalido → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[
      {"target_type":"product","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 14 FAIL: target_type=product accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 14 OK: target_type invalido rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 14 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 15 — activity_id di altro tenant → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
  v_other_activity uuid;
BEGIN
  SELECT id INTO v_other_activity
  FROM public.activities
  WHERE tenant_id <> '5b37c952-1add-4196-aab3-9775d98a9c32'
  LIMIT 1;

  IF v_other_activity IS NULL THEN
    RAISE NOTICE 'Test 15 SKIPPED: nessuna activity di altro tenant';
    RETURN;
  END IF;

  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, jsonb_build_array(
      jsonb_build_object('target_type','activity','target_id', v_other_activity::text)
    ));
    RAISE EXCEPTION 'Test 15 FAIL: activity cross-tenant accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 15 OK: activity cross-tenant rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 15 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 16 — activity_id inesistente → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_sid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, target_type, target_id, apply_to_all)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'visibility', 'always',
          'activity', '347aae51-8df1-4a15-b7f6-40862bf94005', false)
  RETURNING id INTO v_sid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.update_schedule_targets(v_sid, '[
      {"target_type":"activity","target_id":"00000000-0000-0000-0000-000000000000"}
    ]'::jsonb);
    RAISE EXCEPTION 'Test 16 FAIL: activity inesistente accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 16 OK: activity inesistente rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 16 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti i blocchi sono ROLLBACK → nessuna mutazione persistita.
-- =============================================================================
