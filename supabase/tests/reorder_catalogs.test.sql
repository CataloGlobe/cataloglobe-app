-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Azienda di test McDonald's e utenti test.* di staging. Ogni test fra
-- SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con ROLLBACK.
-- =============================================================================
--
-- Test — reorder_catalogs (20261017100000)
--
--   1. owner: l'ordine dato diventa sort_order 1..N.
--   2. elenco parziale, doppio, con un menù di un'altra azienda → 22023, niente cambia.
--   3. test.viewer → 42501.
--
-- Esecuzione: Studio SQL Editor di staging, il file intero, dopo la migration.
-- Attesi 3 `NOTICE … OK`.
--
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c
--   menù di un'altra azienda 051fbbf0-e184-468a-b1a3-0e6a339ce794
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS ordine_test CASCADE;
CREATE SCHEMA ordine_test;

CREATE OR REPLACE FUNCTION ordine_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

-- I menù dell'azienda dal più nuovo al più vecchio: l'opposto del riempimento.
CREATE OR REPLACE FUNCTION ordine_test.reversed()
RETURNS uuid[]
LANGUAGE sql
AS $$
  SELECT array_agg(id ORDER BY sort_order DESC, id DESC)
  FROM public.catalogs WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32';
$$;

CREATE OR REPLACE FUNCTION ordine_test.current()
RETURNS uuid[]
LANGUAGE sql
AS $$
  SELECT array_agg(id ORDER BY sort_order, id)
  FROM public.catalogs WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32';
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ordine_test FROM PUBLIC;
GRANT USAGE ON SCHEMA ordine_test TO authenticated;
GRANT EXECUTE ON FUNCTION ordine_test.as_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — owner
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_want uuid[] := ordine_test.reversed();
BEGIN
  IF cardinality(v_want) < 2 THEN
    RAISE EXCEPTION 'Test 1 FAIL: servono almeno due menù nell''azienda';
  END IF;
  PERFORM ordine_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  PERFORM public.reorder_catalogs('5b37c952-1add-4196-aab3-9775d98a9c32', v_want);
  RESET role;
  IF ordine_test.current() IS DISTINCT FROM v_want
     OR (SELECT array_agg(sort_order ORDER BY sort_order) FROM public.catalogs
         WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32')
        IS DISTINCT FROM (SELECT array_agg(i) FROM generate_series(1, cardinality(v_want)) AS i) THEN
    RAISE EXCEPTION 'Test 1 FAIL';
  END IF;
  RAISE NOTICE 'Test 1 OK';
END $$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — elenchi sbagliati
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_before uuid[] := ordine_test.current();
  v_all uuid[] := ordine_test.reversed();
  v_errors text[] := '{}';
  v_try uuid[];
  i integer;
BEGIN
  PERFORM ordine_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  -- (array di array con lunghezze diverse non si possono fare: una prova per giro)
  FOR i IN 1..3 LOOP
    v_try := CASE i
      WHEN 1 THEN v_all[2:]                                                     -- parziale
      WHEN 2 THEN v_all[1:1] || v_all[2:cardinality(v_all) - 1] || v_all[1:1]  -- doppio, stessa lunghezza
      ELSE v_all[2:] || '051fbbf0-e184-468a-b1a3-0e6a339ce794'::uuid           -- di un'altra azienda
    END;
    BEGIN
      PERFORM public.reorder_catalogs('5b37c952-1add-4196-aab3-9775d98a9c32', v_try);
    EXCEPTION WHEN invalid_parameter_value THEN v_errors := v_errors || SQLERRM;
    END;
  END LOOP;
  RESET role;
  -- il doppio lo ferma il primo controllo, parziale ed estraneo il secondo
  IF v_errors IS DISTINCT FROM ARRAY[
       'L''elenco non corrisponde ai menù dell''azienda',
       'Elenco dei menù non valido',
       'L''elenco non corrisponde ai menù dell''azienda']
     OR ordine_test.current() IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'Test 2 FAIL: %', v_errors;
  END IF;
  RAISE NOTICE 'Test 2 OK';
END $$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — viewer
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_all uuid[] := ordine_test.reversed();
  v_denied boolean := false;
BEGIN
  PERFORM ordine_test.as_user('d01359aa-d980-4030-bc5c-c5e84dfe3d0c');
  BEGIN
    PERFORM public.reorder_catalogs('5b37c952-1add-4196-aab3-9775d98a9c32', v_all);
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  RESET role;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Test 3 FAIL: il viewer ha riordinato';
  END IF;
  RAISE NOTICE 'Test 3 OK';
END $$;
ROLLBACK TO SAVEPOINT t3;

ROLLBACK;
