-- =============================================================================
-- RPC test — get_my_permissions (Fase 4)
--
-- Verifica risoluzione role + activity_ids + permissions per i 5 ruoli + casi
-- di error.
--
-- Pattern: SET LOCAL request.jwt.claims + SET LOCAL role authenticated per
-- impersonare ciascun utente. SELECT pubblica in lettura non muta lo stato:
-- niente ROLLBACK necessario ma chiudiamo comunque per consistenza.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito
--   - migration 20260530160000_get_my_permissions.sql applicata
--
-- UUID di riferimento (vedi seed_permissions_test_data.sql):
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005
--   activity Baranzate       e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (Comasina+Baranzate)
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f   (Comasina)
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c   (Comasina)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner Lorenzo
--   Expected: role='owner', activity_ids=[], permissions = 38 (tutti)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_role text; v_act_count integer; v_perm_count integer;
BEGIN
  SELECT role, cardinality(activity_ids), cardinality(permissions)
  INTO v_role, v_act_count, v_perm_count
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='owner' AND v_act_count=0 AND v_perm_count > 30 THEN
    RAISE NOTICE 'Test 1 OK: owner (role=%, acts=%, perms=%)', v_role, v_act_count, v_perm_count;
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: role=%, acts=%, perms=%', v_role, v_act_count, v_perm_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Admin (skip se non esiste)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_admin_uid uuid;
  v_role text; v_act_count integer; v_perm_count integer;
BEGIN
  SELECT user_id INTO v_admin_uid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role='admin' AND status='active' LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'Test 2 SKIPPED: nessun admin attivo su McDonald''s';
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_admin_uid, 'role','authenticated')::text);
  SET LOCAL role authenticated;

  SELECT role, cardinality(activity_ids), cardinality(permissions)
  INTO v_role, v_act_count, v_perm_count
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='admin' AND v_act_count=0 AND v_perm_count > 0 THEN
    RAISE NOTICE 'Test 2 OK: admin (role=%, acts=%, perms=%)', v_role, v_act_count, v_perm_count;
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: role=%, acts=%, perms=%', v_role, v_act_count, v_perm_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Manager con 2 sedi (Comasina + Baranzate)
--   Expected: role='manager', activity_ids count=2, permissions seed count>0
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_role text; v_acts uuid[]; v_perm_count integer;
BEGIN
  SELECT role, activity_ids, cardinality(permissions)
  INTO v_role, v_acts, v_perm_count
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='manager' AND cardinality(v_acts)=2
     AND '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid = ANY(v_acts)
     AND 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid = ANY(v_acts)
     AND v_perm_count > 0
  THEN
    RAISE NOTICE 'Test 3 OK: manager (role=%, acts=%, perms=%)', v_role, cardinality(v_acts), v_perm_count;
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: role=%, acts=%, perms=%', v_role, v_acts, v_perm_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Manager con 1 sede (artificioso: rimuoviamo Baranzate via postgres)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_role text; v_acts uuid[];
BEGIN
  SET LOCAL role postgres;
  DELETE FROM public.tenant_membership_activities tma
  USING public.tenant_memberships tm
  WHERE tma.tenant_membership_id = tm.id
    AND tm.user_id = '16595820-3e80-4ce2-aded-f4c5f01ab92d'
    AND tma.activity_id = 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae';

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}');
  SET LOCAL role authenticated;

  SELECT role, activity_ids INTO v_role, v_acts
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='manager' AND cardinality(v_acts)=1 THEN
    RAISE NOTICE 'Test 4 OK: manager (1 sede)';
  ELSE
    RAISE EXCEPTION 'Test 4 FAIL: role=%, acts=%', v_role, v_acts;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Staff (1 sede Comasina)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
DECLARE
  v_role text; v_acts uuid[]; v_perm_count integer;
BEGIN
  SELECT role, activity_ids, cardinality(permissions)
  INTO v_role, v_acts, v_perm_count
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='staff' AND cardinality(v_acts)=1
     AND '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid = ANY(v_acts)
     AND v_perm_count > 0
  THEN
    RAISE NOTICE 'Test 5 OK: staff';
  ELSE
    RAISE EXCEPTION 'Test 5 FAIL: role=%, acts=%, perms=%', v_role, v_acts, v_perm_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Viewer (1 sede Comasina)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';

DO $$
DECLARE
  v_role text; v_acts uuid[]; v_perm_count integer;
BEGIN
  SELECT role, activity_ids, cardinality(permissions)
  INTO v_role, v_acts, v_perm_count
  FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF v_role='viewer' AND cardinality(v_acts)=1 AND v_perm_count > 0 THEN
    RAISE NOTICE 'Test 6 OK: viewer';
  ELSE
    RAISE EXCEPTION 'Test 6 FAIL: role=%, acts=%, perms=%', v_role, v_acts, v_perm_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Non-membro → 42501
-- (Generiamo un user via auth.users e gli neghiamo qualsiasi membership.)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_random_uid uuid;
BEGIN
  -- Cerca un auth.user NON membro NON owner di McDonald's
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
    RAISE NOTICE 'Test 7 SKIPPED: nessun user non-membro disponibile';
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_random_uid, 'role','authenticated')::text);
  SET LOCAL role authenticated;

  BEGIN
    PERFORM * FROM public.get_my_permissions('5b37c952-1add-4196-aab3-9775d98a9c32');
    RAISE EXCEPTION 'Test 7 FAIL: non-membro accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 7 OK: non-membro rifiutato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 7 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Tenant inesistente → 42501 (caller non appartiene)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_my_permissions('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'Test 8 FAIL: tenant inesistente accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 8 OK: tenant inesistente rifiutato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti i blocchi sono ROLLBACK → nessuna mutazione persistita.
-- =============================================================================
