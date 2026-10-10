-- =============================================================================
-- RPC test — get_my_permission_activities (D35)
--
-- Da eseguire in Studio su staging dopo la migration
-- 20261010180000_get_my_permission_activities.sql. Ogni blocco è in
-- BEGIN/ROLLBACK: non cambia nulla. UUID come in rpc_get_my_permissions.test.sql.
-- =============================================================================

-- TEST 1 — Owner: nessuna riga (vale su tutte le sedi dal ruolo)
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.get_my_permission_activities('5b37c952-1add-4196-aab3-9775d98a9c32');
  IF v_rows = 0 THEN RAISE NOTICE 'Test 1 OK: owner senza righe';
  ELSE RAISE EXCEPTION 'Test 1 FAIL: owner con % righe', v_rows; END IF;
END$$;
ROLLBACK;

-- TEST 2 — test.manager (Comasina+Baranzate): scheduling.write su 2 sedi,
-- e ogni riga coincide con has_permission sulle stesse sedi.
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';
DO $$
DECLARE v_sedi integer; v_diverse integer;
BEGIN
  SELECT cardinality(activity_ids) INTO v_sedi
  FROM public.get_my_permission_activities('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE permission_id = 'scheduling.write';

  SELECT count(*) INTO v_diverse
  FROM public.get_my_permission_activities('5b37c952-1add-4196-aab3-9775d98a9c32') g
  JOIN public.permissions p ON p.id = g.permission_id AND p.scope = 'activity'
  CROSS JOIN LATERAL unnest(g.activity_ids) a(id)
  WHERE NOT public.has_permission(g.permission_id, a.id);

  IF v_sedi = 2 AND v_diverse = 0 THEN RAISE NOTICE 'Test 2 OK: manager, 2 sedi, uguale a has_permission';
  ELSE RAISE EXCEPTION 'Test 2 FAIL: sedi=%, diverse da has_permission=%', v_sedi, v_diverse; END IF;
END$$;
ROLLBACK;

-- TEST 3 — test.viewer (Comasina): niente scheduling.write
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';
DO $$
DECLARE v_write integer; v_read integer;
BEGIN
  SELECT count(*) FILTER (WHERE permission_id = 'scheduling.write'),
         count(*) FILTER (WHERE permission_id = 'scheduling.read')
  INTO v_write, v_read
  FROM public.get_my_permission_activities('5b37c952-1add-4196-aab3-9775d98a9c32');
  IF v_write = 0 AND v_read = 1 THEN RAISE NOTICE 'Test 3 OK: viewer legge, non scrive';
  ELSE RAISE EXCEPTION 'Test 3 FAIL: write=%, read=%', v_write, v_read; END IF;
END$$;
ROLLBACK;

-- TEST 4 — anon non può chiamarla
BEGIN;
SET LOCAL role anon;
DO $$
BEGIN
  PERFORM public.get_my_permission_activities('5b37c952-1add-4196-aab3-9775d98a9c32');
  RAISE EXCEPTION 'Test 4 FAIL: anon ha eseguito la RPC';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Test 4 OK: anon respinto';
END$$;
ROLLBACK;
