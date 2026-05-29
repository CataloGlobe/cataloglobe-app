-- =============================================================================
-- RPC test — invite_tenant_member esteso (Fase 3 RPC #1)
--
-- Verifica firma 4-args, validazioni, permission gating, idempotenza,
-- re-invite revoked → pending, INSERT in tma per ruoli activity-scoped.
--
-- Pattern: SET LOCAL request.jwt.claims + SET LOCAL role authenticated per
-- impersonare ciascun utente. ROLLBACK alla fine di ogni blocco BEGIN per
-- evitare leak di righe e di chiamate pg_net.http_post.
--
-- Prerequisito:
--   - seed_permissions_test_data.sql già eseguito (manager/staff/viewer creati)
--   - migration 20260530100000_invite_tenant_member_extended.sql applicata
--
-- Esecuzione: psql con service_role connection string, oppure Studio SQL Editor.
-- Output: RAISE NOTICE per ogni test OK / EXCEPTION se test FAIL.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   tenant ALTRO (per FAIL)  vedi TEST 4 — fetch dinamico
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   activity Comasina        347aae51-8df1-4a15-b7f6-40862bf94005   (manager)
--   activity Baranzate       e1bdd834-4c3c-4441-8cd9-686ecefe48ae   (manager)
--   activity Garbagnate      1f62cac4-2ba9-436b-b075-057203658422   (NOT manager)
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff               9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer              d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Owner invita admin → OK, RETURN uuid, tm.role='admin', 0 righe tma
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_role text;
  v_status text;
  v_tma_count integer;
BEGIN
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test1-rpcphase3@cataloglobe.com',
    'admin',
    NULL
  ) INTO v_id;

  SELECT role, status INTO v_role, v_status
  FROM public.tenant_memberships WHERE id = v_id;
  SELECT count(*) INTO v_tma_count
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_id;

  IF v_role = 'admin' AND v_status = 'pending' AND v_tma_count = 0 THEN
    RAISE NOTICE 'Test 1 OK: owner invita admin (tm.role=admin, tma=0)';
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: role=%, status=%, tma_count=%', v_role, v_status, v_tma_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Owner invita manager su 2 activity → OK, 2 righe tma
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_role text;
  v_tma_count integer;
  v_tma_roles text;
BEGIN
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test2-rpcphase3@cataloglobe.com',
    'manager',
    ARRAY[
      '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
      'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid
    ]
  ) INTO v_id;

  SELECT role INTO v_role FROM public.tenant_memberships WHERE id = v_id;
  SELECT count(*), STRING_AGG(DISTINCT role, ',') INTO v_tma_count, v_tma_roles
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_id;

  IF v_role IS NULL AND v_tma_count = 2 AND v_tma_roles = 'manager' THEN
    RAISE NOTICE 'Test 2 OK: owner invita manager su 2 sedi (tm.role=NULL, tma=2 manager)';
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: tm.role=%, tma_count=%, tma_roles=%', v_role, v_tma_count, v_tma_roles;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Admin invita admin → OK
-- (Manca un admin reale su McDonald's, impersoniamo Lorenzo come owner-equivalente.
--  Skip se non c'è admin disponibile.)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_admin_uid uuid;
BEGIN
  SELECT user_id INTO v_admin_uid
  FROM public.tenant_memberships
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND role = 'admin'
    AND status = 'active'
  LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RAISE NOTICE 'Test 3 SKIPPED: nessun admin attivo su McDonald''s';
    RETURN;
  END IF;

  EXECUTE format(
    'SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_admin_uid, 'role', 'authenticated')::text
  );
  SET LOCAL role authenticated;

  DECLARE
    v_id uuid;
  BEGIN
    SELECT public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test3-rpcphase3@cataloglobe.com',
      'admin',
      NULL
    ) INTO v_id;
    RAISE NOTICE 'Test 3 OK: admin invita admin → id=%', v_id;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Owner invita manager con activity di altro tenant → ERROR
-- Cerca un'activity di tenant diverso (qualsiasi).
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_other_activity uuid;
BEGIN
  SELECT id INTO v_other_activity
  FROM public.activities
  WHERE tenant_id <> '5b37c952-1add-4196-aab3-9775d98a9c32'
  LIMIT 1;

  IF v_other_activity IS NULL THEN
    RAISE NOTICE 'Test 4 SKIPPED: nessuna activity di altro tenant disponibile';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test4-rpcphase3@cataloglobe.com',
      'manager',
      ARRAY[v_other_activity]
    );
    RAISE EXCEPTION 'Test 4 FAIL: RPC accettata, dovrebbe rifiutare activity cross-tenant';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 4 OK: activity cross-tenant rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 4 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — Manager invita staff sulle proprie sedi → OK
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_tma_count integer;
  v_tma_roles text;
BEGIN
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test5-rpcphase3@cataloglobe.com',
    'staff',
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]  -- Comasina (sua)
  ) INTO v_id;

  SELECT count(*), STRING_AGG(DISTINCT role, ',') INTO v_tma_count, v_tma_roles
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_id;

  IF v_tma_count = 1 AND v_tma_roles = 'staff' THEN
    RAISE NOTICE 'Test 5 OK: manager invita staff su Comasina';
  ELSE
    RAISE EXCEPTION 'Test 5 FAIL: tma_count=%, tma_roles=%', v_tma_count, v_tma_roles;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — Manager invita admin → ERROR (insufficient permission)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test6-rpcphase3@cataloglobe.com',
      'admin',
      NULL
    );
    RAISE EXCEPTION 'Test 6 FAIL: RPC accettata, manager NON deve invitare admin';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 6 OK: manager bloccato su invito admin (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 6 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — Manager invita manager su sede NON sua (Garbagnate) → ERROR
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test7-rpcphase3@cataloglobe.com',
      'manager',
      ARRAY['1f62cac4-2ba9-436b-b075-057203658422'::uuid]  -- Garbagnate (NON sua)
    );
    RAISE EXCEPTION 'Test 7 FAIL: RPC accettata, manager NON deve assegnare Garbagnate';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 7 OK: manager bloccato su sede non sua (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 7 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — Staff prova a invitare → ERROR (no team.invite)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test8-rpcphase3@cataloglobe.com',
      'viewer',
      ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]
    );
    RAISE EXCEPTION 'Test 8 FAIL: RPC accettata, staff NON ha team.invite';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 8 OK: staff bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8b — Viewer prova a invitare → ERROR
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test8b-rpcphase3@cataloglobe.com',
      'viewer',
      ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]
    );
    RAISE EXCEPTION 'Test 8b FAIL: RPC accettata, viewer NON ha team.invite';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 8b OK: viewer bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 8b FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — Invito pending duplicato → RAISE 'invite already pending'
-- (semantica preservata vs RPC vecchia)
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_id_1 uuid;
BEGIN
  -- Primo invito → OK
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test9-rpcphase3@cataloglobe.com',
    'admin',
    NULL
  ) INTO v_id_1;

  -- Secondo invito stesso email → deve RAISE
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test9-rpcphase3@cataloglobe.com',
      'admin',
      NULL
    );
    RAISE EXCEPTION 'Test 9 FAIL: secondo invito accettato (atteso RAISE)';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'invite already pending' THEN
        RAISE NOTICE 'Test 9 OK: secondo invito rifiutato con messaggio corretto';
      ELSE
        RAISE EXCEPTION 'Test 9 FAIL: messaggio inatteso "%"', SQLERRM;
      END IF;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — p_role='owner' → ERROR
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test10-rpcphase3@cataloglobe.com',
      'owner',
      NULL
    );
    RAISE EXCEPTION 'Test 10 FAIL: RPC accettata, owner NON è invitabile';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 10 OK: p_role=owner rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 10 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — p_role='manager' con p_activity_ids vuoto/NULL → ERROR
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  -- NULL
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test11a-rpcphase3@cataloglobe.com',
      'manager',
      NULL
    );
    RAISE EXCEPTION 'Test 11a FAIL: NULL activity_ids accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 11a OK: manager+NULL bloccato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 11a FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;

  -- Array vuoto
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test11b-rpcphase3@cataloglobe.com',
      'manager',
      ARRAY[]::uuid[]
    );
    RAISE EXCEPTION 'Test 11b FAIL: array vuoto accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 11b OK: manager+[] bloccato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 11b FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 12 — p_role='admin' con p_activity_ids non vuoto → ERROR esplicito
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test12-rpcphase3@cataloglobe.com',
      'admin',
      ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]
    );
    RAISE EXCEPTION 'Test 12 FAIL: admin+activity_ids accettato';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 12 OK: admin+activity_ids rifiutato (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 12 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 13 — Re-invite revoked → UPDATE in-place + tma sostituite
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_id_1 uuid;
  v_id_2 uuid;
  v_status text;
  v_tma_count integer;
BEGIN
  -- Crea invito iniziale come manager su Comasina+Baranzate
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test13-rpcphase3@cataloglobe.com',
    'manager',
    ARRAY[
      '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
      'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid
    ]
  ) INTO v_id_1;

  -- Simula revoked: UPDATE diretto bypass RLS. Siamo dentro DO block ma con
  -- SET LOCAL role authenticated, quindi RLS attiva. Usiamo SET LOCAL role postgres
  -- per il setup.
  SET LOCAL role postgres;
  UPDATE public.tenant_memberships SET status = 'revoked' WHERE id = v_id_1;
  SET LOCAL role authenticated;

  -- Re-invita come staff su Comasina only
  SELECT public.invite_tenant_member(
    '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
    'test13-rpcphase3@cataloglobe.com',
    'staff',
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid]
  ) INTO v_id_2;

  IF v_id_1 <> v_id_2 THEN
    RAISE EXCEPTION 'Test 13 FAIL: UPDATE in-place mancato, id_1=% id_2=%', v_id_1, v_id_2;
  END IF;

  SELECT status INTO v_status FROM public.tenant_memberships WHERE id = v_id_2;
  SELECT count(*) INTO v_tma_count
  FROM public.tenant_membership_activities WHERE tenant_membership_id = v_id_2;

  IF v_status = 'pending' AND v_tma_count = 1 THEN
    RAISE NOTICE 'Test 13 OK: re-invite revoked→pending, tma sostituite (2→1)';
  ELSE
    RAISE EXCEPTION 'Test 13 FAIL: status=%, tma_count=% (atteso pending, 1)', v_status, v_tma_count;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 14 — Email malformata → ERROR
-- -----------------------------------------------------------------------------
BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'not-an-email',
      'admin',
      NULL
    );
    RAISE EXCEPTION 'Test 14 FAIL: email malformata accettata';
  EXCEPTION
    WHEN sqlstate '22023' THEN
      RAISE NOTICE 'Test 14 OK: email malformata rifiutata (22023)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 14 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 15 — Owner di altro tenant prova a invitare su McDonald's → ERROR
-- (Skip se non c'è owner di altro tenant disponibile.)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_other_owner uuid;
BEGIN
  SELECT owner_user_id INTO v_other_owner
  FROM public.tenants
  WHERE id <> '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND deleted_at IS NULL
    AND owner_user_id IS NOT NULL
    AND owner_user_id <> '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'
  LIMIT 1;

  IF v_other_owner IS NULL THEN
    RAISE NOTICE 'Test 15 SKIPPED: nessun owner di altro tenant disponibile';
    RETURN;
  END IF;

  EXECUTE format(
    'SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', v_other_owner, 'role', 'authenticated')::text
  );
  SET LOCAL role authenticated;

  BEGIN
    PERFORM public.invite_tenant_member(
      '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid,
      'test15-rpcphase3@cataloglobe.com',
      'admin',
      NULL
    );
    RAISE EXCEPTION 'Test 15 FAIL: cross-tenant invite accettato';
  EXCEPTION
    WHEN sqlstate '42501' THEN
      RAISE NOTICE 'Test 15 OK: cross-tenant invite bloccato (42501)';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 15 FAIL: errore inatteso % (%)', SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST. Tutti i blocchi sono ROLLBACK → nessuna riga persistita.
-- =============================================================================
