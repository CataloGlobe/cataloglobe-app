-- =============================================================================
-- RPC test — remove_tenant_member v2 (Fase 5.B.3)
--
-- Verifica firma nuova (p_membership_id), self-removal guard, owner guard,
-- manager scope, tma cleanup.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito
--   - migration 20260530220000_remove_tenant_member_v2.sql applicata
--
-- UUID riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   Comasina                 347aae51-8df1-4a15-b7f6-40862bf94005
--   Garbagnate               1f62cac4-2ba9-436b-b075-057203658422
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d  (Comasina+Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f  (Comasina)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c  (Comasina)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner rimuove manager → OK + tma cancellate
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_status text;
  v_tma_count integer;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='16595820-3e80-4ce2-aded-f4c5f01ab92d';

  PERFORM public.remove_tenant_member(v_mid);

  SELECT status INTO v_status FROM public.tenant_memberships WHERE id = v_mid;
  SELECT count(*) INTO v_tma_count
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  IF v_status = 'left' AND v_tma_count = 0 THEN
    RAISE NOTICE 'Test 1 OK: owner rimuove manager (status=left, tma=0)';
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: status=%, tma=%', v_status, v_tma_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Admin rimuove manager → OK (skip se no admin)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_admin_uid uuid;
  v_mid uuid;
  v_status text;
BEGIN
  SELECT user_id INTO v_admin_uid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role='admin' AND status='active' LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'Test 2 SKIPPED: nessun admin attivo';
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_admin_uid, 'role','authenticated')::text);
  SET LOCAL role authenticated;

  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='16595820-3e80-4ce2-aded-f4c5f01ab92d';

  PERFORM public.remove_tenant_member(v_mid);
  SELECT status INTO v_status FROM public.tenant_memberships WHERE id = v_mid;

  IF v_status = 'left' THEN
    RAISE NOTICE 'Test 2 OK: admin rimuove manager';
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: status=%', v_status;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Manager rimuove staff (sua sede Comasina) → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_status text;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  PERFORM public.remove_tenant_member(v_mid);
  SELECT status INTO v_status FROM public.tenant_memberships WHERE id = v_mid;

  IF v_status = 'left' THEN
    RAISE NOTICE 'Test 3 OK: manager rimuove staff (Comasina)';
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: status=%', v_status;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Manager prova rimuovere staff su sede NON sua → ERROR 42501
-- Crea staff scratch su Garbagnate (manager non lo gestisce)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_mid uuid;
BEGIN
  SET LOCAL role postgres;
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_email)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32',
          NULL, NULL, 'active', 'temp-staff-garbagnate@test.com')
  RETURNING id INTO v_mid;
  INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role)
  VALUES (v_mid, '1f62cac4-2ba9-436b-b075-057203658422',
          '5b37c952-1add-4196-aab3-9775d98a9c32', 'staff');

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.remove_tenant_member(v_mid);
    RAISE EXCEPTION 'Test 4 FAIL: manager NON deve rimuovere staff Garbagnate';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 4 OK: manager bloccato su sede non sua (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 4 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Manager prova rimuovere admin → ERROR 42501 (skip se no admin)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_admin_mid uuid;
BEGIN
  SELECT id INTO v_admin_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role='admin' AND status='active' LIMIT 1;

  IF v_admin_mid IS NULL THEN
    RAISE NOTICE 'Test 5 SKIPPED: nessun admin attivo';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.remove_tenant_member(v_admin_mid);
    RAISE EXCEPTION 'Test 5 FAIL: manager NON deve rimuovere admin';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 5 OK: manager bloccato su admin (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 5 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Self-removal → ERROR 42501
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='16595820-3e80-4ce2-aded-f4c5f01ab92d';

  BEGIN
    PERFORM public.remove_tenant_member(v_mid);
    RAISE EXCEPTION 'Test 6 FAIL: self-removal accettata';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 6 OK: self-removal bloccata (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 6 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Staff prova rimuovere → ERROR 42501 (no team.remove)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='d01359aa-d980-4030-bc5c-c5e84dfe3d0c';

  BEGIN
    PERFORM public.remove_tenant_member(v_mid);
    RAISE EXCEPTION 'Test 7 FAIL: staff NON ha team.remove';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 7 OK: staff bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 7 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Membership inesistente → ERROR 44000
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.remove_tenant_member('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'Test 8 FAIL: membership inesistente accettata';
  EXCEPTION
    WHEN sqlstate '44000' THEN
      RAISE NOTICE 'Test 8 OK: membership inesistente rifiutata (44000)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Membership già 'left' → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  SET LOCAL role postgres;
  UPDATE public.tenant_memberships SET status = 'left' WHERE id = v_mid;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.remove_tenant_member(v_mid);
    RAISE EXCEPTION 'Test 9 FAIL: membership left accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 9 OK: membership left rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 9 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Tma cleanup verificato dopo remove (count = 0)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_tma_before integer;
  v_tma_after integer;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  SELECT count(*) INTO v_tma_before
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  PERFORM public.remove_tenant_member(v_mid);

  SELECT count(*) INTO v_tma_after
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  IF v_tma_before > 0 AND v_tma_after = 0 THEN
    RAISE NOTICE 'Test 10 OK: tma cleanup (% → 0)', v_tma_before;
  ELSE
    RAISE EXCEPTION 'Test 10 FAIL: before=%, after=%', v_tma_before, v_tma_after;
  END IF;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti ROLLBACK.
-- =============================================================================
