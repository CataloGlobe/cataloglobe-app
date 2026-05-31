-- =============================================================================
-- RPC test — get_tenant_members v2 (Fase 5.B.2)
--
-- Verifica firma nuova, owner synthetic row, effective_role, activity_ids,
-- activity_names, ordering, gating team.read.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito
--   - migration 20260530180000_get_tenant_members_v2.sql applicata
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005
--   activity Baranzate       e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner Lorenzo: vede tutti i membri, owner first
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_count integer;
  v_first_role text;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');

  SELECT effective_role INTO v_first_role
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  LIMIT 1;

  IF v_count >= 4 AND v_first_role = 'owner' THEN
    RAISE NOTICE 'Test 1 OK: owner vede % membri, first=owner', v_count;
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: count=%, first=%', v_count, v_first_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Admin (skip se no admin)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_admin_uid uuid;
  v_count integer;
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

  SELECT count(*) INTO v_count
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_count >= 1 THEN
    RAISE NOTICE 'Test 2 OK: admin vede % membri', v_count;
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Manager (test.manager) ha team.read, vede tutti
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_count >= 4 THEN
    RAISE NOTICE 'Test 3 OK: manager vede % membri', v_count;
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Staff: 42501 (no team.read)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');
    RAISE EXCEPTION 'Test 4 FAIL: staff accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 4 OK: staff bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 4 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Viewer: 42501
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');
    RAISE EXCEPTION 'Test 5 FAIL: viewer accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 5 OK: viewer bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 5 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — effective_role corretto per manager/staff/viewer
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mgr_role text; v_staff_role text; v_viewer_role text;
BEGIN
  SELECT effective_role INTO v_mgr_role
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE user_id='16595820-3e80-4ce2-aded-f4c5f01ab92d';

  SELECT effective_role INTO v_staff_role
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE user_id='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  SELECT effective_role INTO v_viewer_role
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE user_id='d01359aa-d980-4030-bc5c-c5e84dfe3d0c';

  IF v_mgr_role='manager' AND v_staff_role='staff' AND v_viewer_role='viewer' THEN
    RAISE NOTICE 'Test 6 OK: effective_role correct (manager/staff/viewer)';
  ELSE
    RAISE EXCEPTION 'Test 6 FAIL: mgr=%, staff=%, viewer=%', v_mgr_role, v_staff_role, v_viewer_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — activity_ids + activity_names popolati per scoped
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_acts uuid[]; v_names text[];
BEGIN
  SELECT activity_ids, activity_names INTO v_acts, v_names
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE user_id='16595820-3e80-4ce2-aded-f4c5f01ab92d';  -- manager

  IF cardinality(v_acts) = 2 AND cardinality(v_names) = 2 THEN
    RAISE NOTICE 'Test 7 OK: manager activity_ids=2, names=2 (%)', array_to_string(v_names, ',');
  ELSE
    RAISE EXCEPTION 'Test 7 FAIL: acts=%, names=%', v_acts, v_names;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — activity_ids=[] per owner
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_acts uuid[]; v_status text;
BEGIN
  SELECT activity_ids, status INTO v_acts, v_status
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE effective_role='owner';

  IF cardinality(v_acts) = 0 AND v_status IS NULL THEN
    RAISE NOTICE 'Test 8 OK: owner activity_ids=[], status=NULL';
  ELSE
    RAISE EXCEPTION 'Test 8 FAIL: acts=%, status=%', v_acts, v_status;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Owner synthetic membership_id sentinel
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT membership_id INTO v_mid
  FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32')
  WHERE effective_role='owner';

  IF v_mid = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE NOTICE 'Test 9 OK: owner membership_id = sentinel';
  ELSE
    RAISE EXCEPTION 'Test 9 FAIL: mid=%', v_mid;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Non-membro → 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_random_uid uuid;
BEGIN
  SELECT u.id INTO v_random_uid
  FROM auth.users u
  WHERE u.id <> '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'
    AND NOT EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
        AND tm.user_id=u.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id='5b37c952-1add-4196-aab3-9775d98a9c32'
        AND t.owner_user_id=u.id
    )
  LIMIT 1;

  IF v_random_uid IS NULL THEN
    RAISE NOTICE 'Test 10 SKIPPED: nessun non-membro disponibile';
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_random_uid, 'role','authenticated')::text);
  SET LOCAL role authenticated;

  BEGIN
    PERFORM * FROM public.get_tenant_members('5b37c952-1add-4196-aab3-9775d98a9c32');
    RAISE EXCEPTION 'Test 10 FAIL: non-membro accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 10 OK: non-membro bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 10 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — Tenant inesistente → 42501 (caller non appartiene)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_tenant_members('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'Test 11 FAIL: tenant inesistente accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 11 OK: tenant inesistente bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 11 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti i blocchi sono ROLLBACK.
-- =============================================================================
