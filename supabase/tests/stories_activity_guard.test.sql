-- =============================================================================
-- Test — stories: sede della stessa azienda + scope del manager in insert/update/delete
--
-- Verifica:
--   - una storia non si lega alla sede di un'altra azienda, né in insert né
--     in update (FK composta, migration 20260928120000)
--   - il manager aggiorna solo le storie delle sue sedi e non ne sposta una
--     su una sede fuori scope (policy update, migration 20260928120100)
--   - il manager crea ed elimina solo storie delle sue sedi (policy insert e
--     delete, migration 20260928120200)
--   - owner e manager continuano a fare quello che facevano prima
--
-- Pattern: setup via postgres role (bypass RLS), poi authenticated. Ogni test
-- in BEGIN … ROLLBACK. Prima delle migration i test 1–4 e 8–9 falliscono.
--
-- Prerequisito: seed_permissions_test_data.sql già eseguito.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005   (manager)
--   activity Garbagnate      1f62cac4-2ba9-436b-b075-057203658422   (NOT manager)
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (owner del tenant scratch)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner inserisce una storia legata alla sede di un'altra azienda → rifiutato
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_foreign_tenant uuid;
  v_foreign_activity uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c')
  RETURNING id INTO v_foreign_tenant;
  INSERT INTO public.activities (id, tenant_id, name, slug)
  VALUES (gen_random_uuid(), v_foreign_tenant, 'Scratch sede', 'scratch-' || gen_random_uuid())
  RETURNING id INTO v_foreign_activity;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    INSERT INTO public.stories (tenant_id, activity_id, title)
    VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_foreign_activity, 'Test 1');
    RAISE EXCEPTION 'Test 1 FAIL: storia legata a una sede di un''altra azienda';
  -- Con la policy di insert (20260928120200) il 42501 arriva prima della FK
  -- (23503); con la sola FK resta il 23503. Qualunque dei due va bene.
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'Test 1 OK: insert con sede di altra azienda rifiutato (23503)';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Test 1 OK: insert con sede di altra azienda rifiutato (42501)';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Owner sposta una sua storia sulla sede di un'altra azienda → rifiutato
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_foreign_tenant uuid;
  v_foreign_activity uuid;
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c')
  RETURNING id INTO v_foreign_tenant;
  INSERT INTO public.activities (id, tenant_id, name, slug)
  VALUES (gen_random_uuid(), v_foreign_tenant, 'Scratch sede', 'scratch-' || gen_random_uuid())
  RETURNING id INTO v_foreign_activity;
  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 2')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    UPDATE public.stories SET activity_id = v_foreign_activity WHERE id = v_story;
    RAISE EXCEPTION 'Test 2 FAIL: storia spostata su una sede di un''altra azienda';
  -- Con la policy di update (20260928120100) il 42501 arriva prima della FK
  -- (23503); con la sola FK resta il 23503. Qualunque dei due va bene.
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'Test 2 OK: update con sede di altra azienda rifiutato (23503)';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Test 2 OK: update con sede di altra azienda rifiutato (42501)';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Manager aggiorna una storia di una sede fuori scope → 0 righe
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '1f62cac4-2ba9-436b-b075-057203658422', 'Test 3')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  UPDATE public.stories SET title = 'Modificata' WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE NOTICE 'Test 3 OK: manager non aggiorna storia di sede fuori scope';
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: manager ha aggiornato % righe fuori scope', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Manager sposta una storia di brand su una sede fuori scope → 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 4')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    UPDATE public.stories
    SET activity_id = '1f62cac4-2ba9-436b-b075-057203658422'
    WHERE id = v_story;
    RAISE EXCEPTION 'Test 4 FAIL: manager ha spostato la storia su sede fuori scope';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Test 4 OK: spostamento su sede fuori scope rifiutato (42501)';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Manager aggiorna una storia di una sua sede → 1 riga
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005', 'Test 5')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  UPDATE public.stories SET title = 'Modificata' WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 5 OK: manager aggiorna storia della sua sede';
  ELSE
    RAISE EXCEPTION 'Test 5 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Manager aggiorna una storia di brand (activity_id NULL) → 1 riga
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 6')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  UPDATE public.stories SET title = 'Modificata' WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 6 OK: manager aggiorna storia di brand';
  ELSE
    RAISE EXCEPTION 'Test 6 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Owner lega una storia a una sede della sua azienda → 1 riga
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 7')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  UPDATE public.stories
  SET activity_id = '1f62cac4-2ba9-436b-b075-057203658422'
  WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 7 OK: owner lega storia a sede della sua azienda';
  ELSE
    RAISE EXCEPTION 'Test 7 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Manager inserisce una storia su una sede fuori scope → 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    INSERT INTO public.stories (tenant_id, activity_id, title)
    VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '1f62cac4-2ba9-436b-b075-057203658422', 'Test 8');
    RAISE EXCEPTION 'Test 8 FAIL: manager ha creato storia su sede fuori scope';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Test 8 OK: insert su sede fuori scope rifiutato (42501)';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Manager elimina una storia di una sede fuori scope → 0 righe
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '1f62cac4-2ba9-436b-b075-057203658422', 'Test 9')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  DELETE FROM public.stories WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE NOTICE 'Test 9 OK: manager non elimina storia di sede fuori scope';
  ELSE
    RAISE EXCEPTION 'Test 9 FAIL: manager ha eliminato % righe fuori scope', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Manager inserisce una storia su una sua sede → OK
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005', 'Test 10');
  RAISE NOTICE 'Test 10 OK: manager crea storia sulla sua sede';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — Manager inserisce una storia di brand (activity_id NULL) → OK
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 11');
  RAISE NOTICE 'Test 11 OK: manager crea storia di brand';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 12 — Manager elimina una storia di una sua sede → 1 riga
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_story uuid;
  v_count integer;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005', 'Test 12')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  DELETE FROM public.stories WHERE id = v_story;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 1 THEN
    RAISE NOTICE 'Test 12 OK: manager elimina storia della sua sede';
  ELSE
    RAISE EXCEPTION 'Test 12 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;
