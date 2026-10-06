-- =============================================================================
-- Test — stories: il prodotto collegato è della stessa azienda della storia
--
-- Verifica (migration 20261005200000):
--   - una storia non si collega al prodotto di un'altra azienda, né in insert
--     né in update, né da owner né da manager
--   - owner e manager continuano a collegare i prodotti della propria azienda
--     e a modificare le storie che li hanno già collegati
--
-- Solo staging. Lo script gira in una sola transazione (Studio): ogni caso è
-- isolato da un SAVEPOINT, alla fine ROLLBACK di tutto. Setup come postgres
-- (bypass RLS), poi authenticated. Prima della migration i test 1, 2 e 6
-- falliscono.
--
-- Prerequisito: seed_permissions_test_data.sql già eseguito.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005   (manager)
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (owner del tenant scratch)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner inserisce una storia col prodotto di un'altra azienda → rifiutato
-- -----------------------------------------------------------------------------
SAVEPOINT test_1;
DO $$
DECLARE
  v_foreign_tenant uuid;
  v_foreign_product uuid := gen_random_uuid();
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c')
  RETURNING id INTO v_foreign_tenant;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_foreign_product, v_foreign_tenant, 'Prodotto altrui');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    INSERT INTO public.stories (tenant_id, product_id, title)
    VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_foreign_product, 'Test 1');
    RAISE EXCEPTION 'Test 1 FAIL: storia collegata al prodotto di un''altra azienda';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Test 1 OK: insert col prodotto di altra azienda rifiutato (42501)';
  END;
END$$;
ROLLBACK TO SAVEPOINT test_1;

-- -----------------------------------------------------------------------------
-- TEST 2 — Owner collega a una sua storia il prodotto di un'altra azienda → rifiutato
-- -----------------------------------------------------------------------------
SAVEPOINT test_2;
DO $$
DECLARE
  v_foreign_tenant uuid;
  v_foreign_product uuid := gen_random_uuid();
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c')
  RETURNING id INTO v_foreign_tenant;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_foreign_product, v_foreign_tenant, 'Prodotto altrui');
  INSERT INTO public.stories (tenant_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'Test 2')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    UPDATE public.stories SET product_id = v_foreign_product WHERE id = v_story;
    RAISE EXCEPTION 'Test 2 FAIL: prodotto di altra azienda collegato in update';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Test 2 OK: update col prodotto di altra azienda rifiutato (42501)';
  END;
END$$;
ROLLBACK TO SAVEPOINT test_2;

-- -----------------------------------------------------------------------------
-- TEST 3 — Owner inserisce una storia col prodotto della propria azienda → ammesso
-- -----------------------------------------------------------------------------
SAVEPOINT test_3;
DO $$
DECLARE
  v_product uuid := gen_random_uuid();
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_product, '5b37c952-1add-4196-aab3-9775d98a9c32', 'Prodotto proprio');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  INSERT INTO public.stories (tenant_id, product_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_product, 'Test 3')
  RETURNING id INTO v_story;

  IF v_story IS NULL THEN
    RAISE EXCEPTION 'Test 3 FAIL: insert col prodotto proprio non riuscito';
  END IF;
  RAISE NOTICE 'Test 3 OK: insert col prodotto della propria azienda ammesso';
END$$;
ROLLBACK TO SAVEPOINT test_3;

-- -----------------------------------------------------------------------------
-- TEST 4 — Owner modifica titolo e ordine di una storia col prodotto proprio → ammesso
-- -----------------------------------------------------------------------------
SAVEPOINT test_4;
DO $$
DECLARE
  v_product uuid := gen_random_uuid();
  v_story uuid;
  v_rows int;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_product, '5b37c952-1add-4196-aab3-9775d98a9c32', 'Prodotto proprio');
  INSERT INTO public.stories (tenant_id, product_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', v_product, 'Test 4')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  UPDATE public.stories SET title = 'Test 4 bis', sort_order = 99 WHERE id = v_story;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Test 4 FAIL: update di una storia col prodotto proprio, % righe', v_rows;
  END IF;
  RAISE NOTICE 'Test 4 OK: update di titolo e ordine ammesso';
END$$;
ROLLBACK TO SAVEPOINT test_4;

-- -----------------------------------------------------------------------------
-- TEST 5 — Manager inserisce una storia della sua sede col prodotto dell'azienda → ammesso
-- -----------------------------------------------------------------------------
SAVEPOINT test_5;
DO $$
DECLARE
  v_product uuid := gen_random_uuid();
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_product, '5b37c952-1add-4196-aab3-9775d98a9c32', 'Prodotto proprio');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  INSERT INTO public.stories (tenant_id, activity_id, product_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005', v_product, 'Test 5')
  RETURNING id INTO v_story;

  IF v_story IS NULL THEN
    RAISE EXCEPTION 'Test 5 FAIL: insert del manager col prodotto dell''azienda non riuscito';
  END IF;
  RAISE NOTICE 'Test 5 OK: insert del manager col prodotto dell''azienda ammesso';
END$$;
ROLLBACK TO SAVEPOINT test_5;

-- -----------------------------------------------------------------------------
-- TEST 6 — Manager collega a una storia della sua sede il prodotto di un'altra azienda → rifiutato
-- -----------------------------------------------------------------------------
SAVEPOINT test_6;
DO $$
DECLARE
  v_foreign_tenant uuid;
  v_foreign_product uuid := gen_random_uuid();
  v_story uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenants (name, owner_user_id)
  VALUES ('Scratch altra azienda', 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c')
  RETURNING id INTO v_foreign_tenant;
  INSERT INTO public.products (id, tenant_id, name)
  VALUES (v_foreign_product, v_foreign_tenant, 'Prodotto altrui');
  INSERT INTO public.stories (tenant_id, activity_id, title)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', '347aae51-8df1-4a15-b7f6-40862bf94005', 'Test 6')
  RETURNING id INTO v_story;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    UPDATE public.stories SET product_id = v_foreign_product WHERE id = v_story;
    RAISE EXCEPTION 'Test 6 FAIL: il manager ha collegato il prodotto di altra azienda';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Test 6 OK: update del manager col prodotto di altra azienda rifiutato (42501)';
  END;
END$$;
ROLLBACK TO SAVEPOINT test_6;

ROLLBACK;
