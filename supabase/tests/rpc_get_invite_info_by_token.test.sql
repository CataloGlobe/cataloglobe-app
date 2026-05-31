-- =============================================================================
-- RPC test — get_invite_info_by_token v2 (Fase 5.B.3)
--
-- Verifica firma nuova con effective_role + activity_ids + activity_names.
--
-- Prerequisito: migration 20260530230000_get_invite_info_by_token_v2.sql applicata
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TEST 1 — Token admin pending: effective_role='admin', activities=[]
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_token uuid;
  v_role text;
  v_acts uuid[];
BEGIN
  -- Crea invito admin scratch
  SET LOCAL role postgres;
  v_token := gen_random_uuid();
  INSERT INTO public.tenant_memberships (tenant_id, invited_email, role, status, invite_token, invite_sent_at, invite_expires_at)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32',
          'test-invite-admin@test.com', 'admin', 'pending',
          v_token, now(), now() + interval '7 days');

  SELECT effective_role, activity_ids INTO v_role, v_acts
  FROM public.get_invite_info_by_token(v_token);

  IF v_role = 'admin' AND cardinality(v_acts) = 0 THEN
    RAISE NOTICE 'Test 1 OK: admin token (role=admin, acts=0)';
  ELSE
    RAISE EXCEPTION 'Test 1 FAIL: role=%, acts=%', v_role, v_acts;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — Token manager con 2 sedi
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_token uuid;
  v_mid uuid;
  v_role text;
  v_acts uuid[];
  v_names text[];
BEGIN
  SET LOCAL role postgres;
  v_token := gen_random_uuid();
  INSERT INTO public.tenant_memberships (tenant_id, invited_email, role, status, invite_token, invite_sent_at, invite_expires_at)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32',
          'test-invite-mgr@test.com', NULL, 'pending',
          v_token, now(), now() + interval '7 days')
  RETURNING id INTO v_mid;
  INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role) VALUES
    (v_mid, '347aae51-8df1-4a15-b7f6-40862bf94005', '5b37c952-1add-4196-aab3-9775d98a9c32', 'manager'),
    (v_mid, 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae', '5b37c952-1add-4196-aab3-9775d98a9c32', 'manager');

  SELECT effective_role, activity_ids, activity_names INTO v_role, v_acts, v_names
  FROM public.get_invite_info_by_token(v_token);

  IF v_role = 'manager' AND cardinality(v_acts) = 2 AND cardinality(v_names) = 2 THEN
    RAISE NOTICE 'Test 2 OK: manager token (acts=2, names=2: %)', array_to_string(v_names, ',');
  ELSE
    RAISE EXCEPTION 'Test 2 FAIL: role=%, acts=%, names=%', v_role, v_acts, v_names;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — Token staff 1 sede
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_token uuid;
  v_mid uuid;
  v_role text;
  v_acts uuid[];
BEGIN
  SET LOCAL role postgres;
  v_token := gen_random_uuid();
  INSERT INTO public.tenant_memberships (tenant_id, invited_email, role, status, invite_token, invite_sent_at, invite_expires_at)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32',
          'test-invite-staff@test.com', NULL, 'pending',
          v_token, now(), now() + interval '7 days')
  RETURNING id INTO v_mid;
  INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role) VALUES
    (v_mid, '347aae51-8df1-4a15-b7f6-40862bf94005', '5b37c952-1add-4196-aab3-9775d98a9c32', 'staff');

  SELECT effective_role, activity_ids INTO v_role, v_acts
  FROM public.get_invite_info_by_token(v_token);

  IF v_role = 'staff' AND cardinality(v_acts) = 1 THEN
    RAISE NOTICE 'Test 3 OK: staff token (acts=1)';
  ELSE
    RAISE EXCEPTION 'Test 3 FAIL: role=%, acts=%', v_role, v_acts;
  END IF;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — Token inesistente → 0 righe
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.get_invite_info_by_token('00000000-0000-0000-0000-000000000000'::uuid);

  IF v_count = 0 THEN
    RAISE NOTICE 'Test 4 OK: token inesistente → 0 righe';
  ELSE
    RAISE EXCEPTION 'Test 4 FAIL: count=%', v_count;
  END IF;
END$$;
ROLLBACK;

-- =============================================================================
-- FINE TEST.
-- =============================================================================
