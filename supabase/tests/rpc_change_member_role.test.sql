-- =============================================================================
-- RPC test — change_member_role esteso (Fase 3 RPC #2)
--
-- Verifica firma 3-args nuova (p_membership_id, p_new_role, p_activity_ids),
-- transizioni tra scope, gating manager, validazioni input.
--
-- Pattern: SET LOCAL request.jwt.claims + SET LOCAL role authenticated per
-- impersonare ciascun utente. ROLLBACK alla fine di ogni blocco per evitare
-- leak di mutazioni.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito
--   - migration 20260530120000_change_member_role.sql applicata
--
-- UUID di riferimento (vedi seed_permissions_test_data.sql):
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
-- TEST 1 — Owner cambia manager → admin → OK (tma cancellate)
-- (Variante del prompt: useremo test.manager (manager su 2 sedi) e
--  lo promuoviamo ad admin.)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_role text;
  v_tma_count integer;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='16595820-3e80-4ce2-aded-f4c5f01ab92d';

  PERFORM public.change_member_role(v_mid, 'admin', NULL);

  SELECT role INTO v_role FROM public.tenant_memberships WHERE id = v_mid;
  SELECT count(*) INTO v_tma_count
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  IF v_role = 'admin' AND v_tma_count = 0 THEN
    RAISE NOTICE 'Test 1 OK: manager → admin (tm.role=admin, tma=0)';
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: role=%, tma_count=%', v_role, v_tma_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Owner cambia staff (1 sede) → manager con 2 sedi → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_role text;
  v_tma_count integer;
  v_tma_roles text;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';  -- test.staff

  PERFORM public.change_member_role(v_mid, 'manager', ARRAY[
    '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
    'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid
  ]);

  SELECT role INTO v_role FROM public.tenant_memberships WHERE id = v_mid;
  SELECT count(*), STRING_AGG(DISTINCT role, ',') INTO v_tma_count, v_tma_roles
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  IF v_role IS NULL AND v_tma_count = 2 AND v_tma_roles = 'manager' THEN
    RAISE NOTICE 'Test 2 OK: staff (1 sede) → manager (2 sedi)';
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: tm.role=%, tma_count=%, tma_roles=%', v_role, v_tma_count, v_tma_roles;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Owner cambia staff → viewer (stessa sede) → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_tma_role text;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  PERFORM public.change_member_role(v_mid, 'viewer', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);

  SELECT role INTO v_tma_role
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid LIMIT 1;

  IF v_tma_role = 'viewer' THEN
    RAISE NOTICE 'Test 3 OK: staff → viewer (1 sede)';
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: tma_role=%', v_tma_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Owner cambia viewer → staff su sede diversa (Garbagnate) → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_tma_activity uuid;
  v_tma_role text;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='d01359aa-d980-4030-bc5c-c5e84dfe3d0c';  -- test.viewer

  PERFORM public.change_member_role(v_mid, 'staff', ARRAY['1f62cac4-2ba9-436b-b075-057203658422'::uuid]);

  SELECT activity_id, role INTO v_tma_activity, v_tma_role
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid;

  IF v_tma_role = 'staff' AND v_tma_activity = '1f62cac4-2ba9-436b-b075-057203658422' THEN
    RAISE NOTICE 'Test 4 OK: viewer (Comasina) → staff (Garbagnate)';
  ELSE
    RAISE EXCEPTION 'Test 4 FAIL: tma_activity=%, tma_role=%', v_tma_activity, v_tma_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Admin cambia viewer → staff → OK (skip se no admin)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_admin_uid uuid;
  v_mid uuid;
  v_tma_role text;
BEGIN
  SELECT user_id INTO v_admin_uid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role='admin' AND status='active' LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'Test 5 SKIPPED: nessun admin attivo su McDonald''s';
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text);
  SET LOCAL role authenticated;

  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='d01359aa-d980-4030-bc5c-c5e84dfe3d0c';

  PERFORM public.change_member_role(v_mid, 'staff', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);

  SELECT role INTO v_tma_role
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid LIMIT 1;

  IF v_tma_role = 'staff' THEN
    RAISE NOTICE 'Test 5 OK: admin cambia viewer → staff';
  ELSE
    RAISE EXCEPTION 'Test 5 FAIL: tma_role=%', v_tma_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Manager cambia staff (sua sede) → viewer (sua sede) → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_tma_role text;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';  -- staff (su Comasina)

  PERFORM public.change_member_role(v_mid, 'viewer', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);

  SELECT role INTO v_tma_role
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_mid LIMIT 1;

  IF v_tma_role = 'viewer' THEN
    RAISE NOTICE 'Test 6 OK: manager cambia staff → viewer (Comasina)';
  ELSE
    RAISE EXCEPTION 'Test 6 FAIL: tma_role=%', v_tma_role;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Manager prova a cambiare admin → ERROR 42501 (skip se no admin)
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
    RAISE NOTICE 'Test 7 SKIPPED: nessun admin attivo';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.change_member_role(v_admin_mid, 'manager', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
    RAISE EXCEPTION 'Test 7 FAIL: manager NON deve modificare admin';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 7 OK: manager bloccato su modifica admin (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 7 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Manager prova a promuovere staff → admin → ERROR 42501
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
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  BEGIN
    PERFORM public.change_member_role(v_mid, 'admin', NULL);
    RAISE EXCEPTION 'Test 8 FAIL: manager NON deve promuovere a admin';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 8 OK: manager bloccato su promozione admin (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Manager prova a cambiare staff su sede NON sua (Garbagnate) → ERROR 42501
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
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';  -- staff su Comasina (sua)

  BEGIN
    PERFORM public.change_member_role(v_mid, 'staff', ARRAY['1f62cac4-2ba9-436b-b075-057203658422'::uuid]);
    RAISE EXCEPTION 'Test 9 FAIL: manager NON deve assegnare Garbagnate';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 9 OK: manager bloccato su sede non sua (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 9 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — Staff prova change → ERROR 42501 (no team.manage_roles)
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
    PERFORM public.change_member_role(v_mid, 'staff', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
    RAISE EXCEPTION 'Test 10 FAIL: staff NON ha team.manage_roles';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 10 OK: staff bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 10 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — p_new_role='owner' → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  BEGIN
    PERFORM public.change_member_role(v_mid, 'owner', NULL);
    RAISE EXCEPTION 'Test 11 FAIL: p_new_role=owner accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 11 OK: p_new_role=owner rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 11 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 12 — manager con activity_ids vuoto → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  BEGIN
    PERFORM public.change_member_role(v_mid, 'manager', ARRAY[]::uuid[]);
    RAISE EXCEPTION 'Test 12 FAIL: manager+[] accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 12 OK: manager+[] rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 12 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 13 — admin con activity_ids non vuoto → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  BEGIN
    PERFORM public.change_member_role(v_mid, 'admin', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
    RAISE EXCEPTION 'Test 13 FAIL: admin+activity_ids accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 13 OK: admin+activity_ids rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 13 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 14 — activity_ids di altro tenant → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
  v_other_activity uuid;
BEGIN
  SELECT id INTO v_other_activity
  FROM public.activities
  WHERE tenant_id <> '5b37c952-1add-4196-aab3-9775d98a9c32'
  LIMIT 1;

  IF v_other_activity IS NULL THEN
    RAISE NOTICE 'Test 14 SKIPPED: nessuna activity di altro tenant';
    RETURN;
  END IF;

  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  BEGIN
    PERFORM public.change_member_role(v_mid, 'manager', ARRAY[v_other_activity]);
    RAISE EXCEPTION 'Test 14 FAIL: activity cross-tenant accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 14 OK: activity cross-tenant rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 14 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 15 — membership_id inesistente → ERROR 44000
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.change_member_role('00000000-0000-0000-0000-000000000000'::uuid, 'admin', NULL);
    RAISE EXCEPTION 'Test 15 FAIL: membership inesistente accettata';
  EXCEPTION
    WHEN sqlstate '44000' THEN
      RAISE NOTICE 'Test 15 OK: membership inesistente rifiutata (44000)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 15 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 16 — membership status='revoked' → ERROR 22023
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_mid uuid;
BEGIN
  SELECT id INTO v_mid
  FROM public.tenant_memberships
  WHERE tenant_id='5b37c952-1add-4196-aab3-9775d98a9c32'
    AND user_id  ='9c6580e5-80bc-4fe8-9141-0d299be38f2f';

  -- Imposta a revoked usando bypass RLS via postgres role
  SET LOCAL role postgres;
  UPDATE public.tenant_memberships SET status = 'revoked' WHERE id = v_mid;
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.change_member_role(v_mid, 'staff', ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]);
    RAISE EXCEPTION 'Test 16 FAIL: revoked membership accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 16 OK: revoked membership rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 16 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti i blocchi sono ROLLBACK → nessuna mutazione persistita.
-- =============================================================================
