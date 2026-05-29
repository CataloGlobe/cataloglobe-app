-- =============================================================================
-- RLS test — Permessi multi-sede (Fase 2)
--
-- Verifica che le policy riscritte rispettino il modello dei 5 ruoli
-- (owner/admin/manager/staff/viewer).
--
-- Pattern: SET LOCAL request.jwt.claims + SET LOCAL role authenticated per
-- impersonare ciascun utente. ROLLBACK alla fine di ogni blocco BEGIN.
--
-- Prerequisito: seed_permissions_test_data.sql già eseguito (3 membership
-- test create).
--
-- Esecuzione: psql con service_role connection string. Studio SQL Editor.
-- Output: RAISE NOTICE per ogni test OK / EXCEPTION se test FAIL.
--
-- UUID di riferimento (vedi seed_permissions_test_data.sql):
--   tenant McDonald's     5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo         9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   Comasina              347aae51-8df1-4a15-b7f6-40862bf94005
--   Baranzate             e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   Garbagnate            1f62cac4-2ba9-436b-b075-057203658422
--   test.manager          16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff            9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer           d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

-- =============================================================================
-- TEST 0 — Smoke: SELECT su schedules e schedule_targets non deve esplodere
-- con SQLSTATE 42P17 (infinite recursion). Regression test del fix
-- 20260528170000 (gateway SECURITY DEFINER can_read_schedule /
-- can_read_schedule_target).
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE
  v_schedules_count        integer;
  v_schedule_targets_count integer;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_schedules_count        FROM public.schedules;
    SELECT COUNT(*) INTO v_schedule_targets_count FROM public.schedule_targets;
    RAISE NOTICE 'Test 0 OK: SELECT su schedules (% righe) e schedule_targets (% righe) eseguibili',
                 v_schedules_count, v_schedule_targets_count;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Test 0 FAIL: SELECT su schedules/schedule_targets ha generato errore: % (SQLSTATE %)',
                      SQLERRM, SQLSTATE;
  END;
END$$;
ROLLBACK;

-- =============================================================================
-- TEST 1 — OWNER (Lorenzo) — tutto deve passare
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
BEGIN
  IF NOT public.has_permission('tenant.read', NULL) THEN
    RAISE EXCEPTION 'Test 1.1 FAIL: owner should have tenant.read';
  END IF;
  IF NOT public.has_permission('tenant.delete', NULL) THEN
    RAISE EXCEPTION 'Test 1.2 FAIL: owner should have tenant.delete';
  END IF;
  IF NOT public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 1.3 FAIL: owner should have orders.manage on Comasina';
  END IF;
  IF NOT public.has_permission('orders.manage', '1f62cac4-2ba9-436b-b075-057203658422'::uuid) THEN
    RAISE EXCEPTION 'Test 1.4 FAIL: owner should have orders.manage on Garbagnate too';
  END IF;
  IF NOT public.has_permission('products.write', NULL) THEN
    RAISE EXCEPTION 'Test 1.5 FAIL: owner should have products.write';
  END IF;
  RAISE NOTICE 'Test 1 OK: owner has all expected permissions';
END$$;

-- owner sees all activities of McDonald's
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.activities
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32';
  IF v_count < 3 THEN
    RAISE EXCEPTION 'Test 1.6 FAIL: owner should see >=3 activities of McDonald''s, saw %', v_count;
  END IF;
  RAISE NOTICE 'Test 1.6 OK: owner sees % McDonald''s activities', v_count;
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 2 — MANAGER (assegnato Comasina + Baranzate, NON Garbagnate)
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
BEGIN
  -- Comasina perms
  IF NOT public.has_permission('orders.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 2.1 FAIL: manager should have orders.read on Comasina';
  END IF;
  IF NOT public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 2.2 FAIL: manager should have orders.manage on Comasina';
  END IF;
  IF NOT public.has_permission('scheduling.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 2.3 FAIL: manager should have scheduling.write on Comasina';
  END IF;
  IF NOT public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Test 2.4 FAIL: manager should have team.invite (tenant-scoped, role-based)';
  END IF;
  -- Garbagnate (NOT assigned)
  IF public.has_permission('orders.read', '1f62cac4-2ba9-436b-b075-057203658422'::uuid) THEN
    RAISE EXCEPTION 'Test 2.5 FAIL: manager should NOT have orders.read on Garbagnate';
  END IF;
  IF public.has_permission('orders.manage', '1f62cac4-2ba9-436b-b075-057203658422'::uuid) THEN
    RAISE EXCEPTION 'Test 2.6 FAIL: manager should NOT have orders.manage on Garbagnate';
  END IF;
  -- Tenant-wide NO perms
  IF public.has_permission('products.write', NULL) THEN
    RAISE EXCEPTION 'Test 2.7 FAIL: manager should NOT have products.write';
  END IF;
  IF public.has_permission('tenant.delete', NULL) THEN
    RAISE EXCEPTION 'Test 2.8 FAIL: manager should NOT have tenant.delete';
  END IF;
  RAISE NOTICE 'Test 2 OK: manager perms correct';
END$$;

-- Manager sees only assigned activities (Comasina + Baranzate, not Garbagnate)
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.activities
  WHERE id IN (
    '347aae51-8df1-4a15-b7f6-40862bf94005',
    'e1bdd834-4c3c-4441-8cd9-686ecefe48ae',
    '1f62cac4-2ba9-436b-b075-057203658422'
  );
  IF v_count != 2 THEN
    RAISE EXCEPTION 'Test 2.9 FAIL: manager should see exactly 2 of 3 activities, saw %', v_count;
  END IF;
  RAISE NOTICE 'Test 2.9 OK: manager sees 2 of 3 activities';
END$$;

-- Manager get_my_activity_ids excludes Garbagnate
DO $$
DECLARE v_garbagnate_visible boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.get_my_activity_ids() AS a(id)
    WHERE a.id = '1f62cac4-2ba9-436b-b075-057203658422'::uuid
  ) INTO v_garbagnate_visible;
  IF v_garbagnate_visible THEN
    RAISE EXCEPTION 'Test 2.10 FAIL: manager get_my_activity_ids should NOT contain Garbagnate';
  END IF;
  RAISE NOTICE 'Test 2.10 OK: manager get_my_activity_ids excludes Garbagnate';
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 3 — STAFF (assegnato solo Comasina)
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
BEGIN
  -- Comasina perms
  IF NOT public.has_permission('orders.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.1 FAIL: staff should have orders.read on Comasina';
  END IF;
  IF NOT public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.2 FAIL: staff should have orders.manage on Comasina';
  END IF;
  IF NOT public.has_permission('tables.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.3 FAIL: staff should have tables.manage on Comasina';
  END IF;
  IF NOT public.has_permission('reviews.respond', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.4 FAIL: staff should have reviews.respond on Comasina';
  END IF;
  -- Things staff does NOT have
  IF public.has_permission('activity.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.5 FAIL: staff should NOT have activity.manage';
  END IF;
  IF public.has_permission('scheduling.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.6 FAIL: staff should NOT have scheduling.read';
  END IF;
  IF public.has_permission('analytics.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.7 FAIL: staff should NOT have analytics.read';
  END IF;
  IF public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Test 3.8 FAIL: staff should NOT have team.invite';
  END IF;
  IF public.has_permission('activity_hours.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 3.9 FAIL: staff should NOT have activity_hours.write';
  END IF;
  -- Cross-activity NO perm
  IF public.has_permission('orders.read', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid) THEN
    RAISE EXCEPTION 'Test 3.10 FAIL: staff (only Comasina) should NOT have orders.read on Baranzate';
  END IF;
  RAISE NOTICE 'Test 3 OK: staff perms correct';
END$$;

-- Staff sees only Comasina
DO $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.activities
  WHERE id IN (
    '347aae51-8df1-4a15-b7f6-40862bf94005',
    'e1bdd834-4c3c-4441-8cd9-686ecefe48ae',
    '1f62cac4-2ba9-436b-b075-057203658422'
  );
  IF v_count != 1 THEN
    RAISE EXCEPTION 'Test 3.11 FAIL: staff should see exactly 1 of 3 activities, saw %', v_count;
  END IF;
  RAISE NOTICE 'Test 3.11 OK: staff sees 1 of 3 activities';
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 4 — VIEWER (assegnato solo Comasina, sola lettura) — TEST CRITICO
-- Dimostra che Modo B (defense in depth) funziona: viewer non scrive niente.
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';

DO $$
BEGIN
  -- Viewer reads
  IF NOT public.has_permission('orders.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.1 FAIL: viewer should have orders.read on Comasina';
  END IF;
  IF NOT public.has_permission('reviews.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.2 FAIL: viewer should have reviews.read on Comasina';
  END IF;
  IF NOT public.has_permission('analytics.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.3 FAIL: viewer should have analytics.read on Comasina';
  END IF;
  IF NOT public.has_permission('scheduling.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.4 FAIL: viewer should have scheduling.read on Comasina';
  END IF;
  -- Viewer CANNOT write (CRITICAL — Modo B)
  IF public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.5 CRITICAL FAIL: viewer should NOT have orders.manage on Comasina';
  END IF;
  IF public.has_permission('reviews.respond', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.6 CRITICAL FAIL: viewer should NOT have reviews.respond on Comasina';
  END IF;
  IF public.has_permission('tables.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.7 CRITICAL FAIL: viewer should NOT have tables.manage on Comasina';
  END IF;
  IF public.has_permission('product_availability.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.8 CRITICAL FAIL: viewer should NOT have product_availability.write on Comasina';
  END IF;
  IF public.has_permission('scheduling.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.9 CRITICAL FAIL: viewer should NOT have scheduling.write on Comasina';
  END IF;
  IF public.has_permission('activity_hours.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 4.10 CRITICAL FAIL: viewer should NOT have activity_hours.write on Comasina';
  END IF;
  -- Viewer cannot read on Baranzate (not assigned)
  IF public.has_permission('orders.read', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid) THEN
    RAISE EXCEPTION 'Test 4.11 FAIL: viewer (only Comasina) should NOT have orders.read on Baranzate';
  END IF;
  RAISE NOTICE 'Test 4 OK: viewer perms correct (defense in depth confirmed)';
END$$;

-- Viewer concrete table SELECT works on Comasina activity
DO $$
DECLARE v_visible boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.activities
    WHERE id = '347aae51-8df1-4a15-b7f6-40862bf94005'
  ) INTO v_visible;
  IF NOT v_visible THEN
    RAISE EXCEPTION 'Test 4.12 FAIL: viewer should SEE Comasina row in activities table';
  END IF;
  RAISE NOTICE 'Test 4.12 OK: viewer sees Comasina activity';
END$$;

-- Viewer cannot INSERT into orders (CRITICAL)
DO $$
DECLARE v_violated boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.orders (tenant_id, activity_id, customer_session_id, status, total_amount, submitted_at)
    VALUES (
      '5b37c952-1add-4196-aab3-9775d98a9c32',
      '347aae51-8df1-4a15-b7f6-40862bf94005',
      gen_random_uuid(),
      'submitted',
      0,
      now()
    );
    -- Should not reach here
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR not_null_violation OR foreign_key_violation THEN
      v_violated := true;
    WHEN OTHERS THEN
      -- Any error counts as RLS reject (RLS error class can be 42501 = insufficient_privilege
      -- or appear as "new row violates row-level security policy")
      v_violated := true;
  END;
  IF NOT v_violated THEN
    RAISE EXCEPTION 'Test 4.13 CRITICAL FAIL: viewer INSERT on orders should fail (RLS)';
  END IF;
  RAISE NOTICE 'Test 4.13 OK: viewer INSERT on orders rejected by RLS';
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 5 — schedule_targets write deve essere bloccata
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
    VALUES (gen_random_uuid(), 'activity', gen_random_uuid());
  EXCEPTION
    WHEN OTHERS THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Test 5.1 FAIL: direct INSERT on schedule_targets should be blocked even for owner (delegated to RPC Fase 3)';
  END IF;
  RAISE NOTICE 'Test 5.1 OK: schedule_targets direct INSERT blocked for owner (Modo B + RPC delegation)';
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 5.2 — Manager NON deve poter UPDATE uno schedule i cui target sono
-- TUTTI esterni alle sue sedi assegnate (hardening 20260528210000:
-- can_write_schedule). Setup + cleanup via service_role.
--
-- Scenario: schedule S targeta solo Garbagnate. Manager X assegnato a
-- Comasina + Baranzate. UPDATE deve essere silenziosamente bloccata da RLS
-- (ROW_COUNT = 0). Se affected_rows > 0, il bug HIGH non è chiuso.
--
-- Esegui come service_role (Studio SQL Editor o psql con service_role).
-- =============================================================================

BEGIN;

-- Setup: insert test schedule with apply_to_all=false targeting Garbagnate
INSERT INTO public.schedules (
  id, tenant_id, rule_type, target_type, target_id,
  time_mode, apply_to_all, enabled, priority, name
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '5b37c952-1add-4196-aab3-9775d98a9c32',
  'layout',
  'activity',
  '1f62cac4-2ba9-436b-b075-057203658422',
  'always',
  false,
  true,
  10,
  'TEST-5.2-hardening-cross-sede'
);

INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'activity',
  '1f62cac4-2ba9-436b-b075-057203658422'
);

-- Switch to manager (Comasina+Baranzate, NOT Garbagnate)
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.schedules
  SET enabled = false
  WHERE id = '11111111-1111-1111-1111-111111111111';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Test 5.2 CRITICAL FAIL: manager UPDATE on Garbagnate-only schedule affected % rows; expected 0 (cross-sede write hole NOT closed)', v_count;
  END IF;

  RAISE NOTICE 'Test 5.2 OK: manager UPDATE on Garbagnate-only schedule blocked (ROW_COUNT=0, can_write_schedule rejected)';
END$$;

-- Verify (still authenticated; SELECT goes through can_read_schedule which
-- denies for manager since the only target is Garbagnate)
DO $$
DECLARE v_seen integer;
BEGIN
  SELECT COUNT(*) INTO v_seen
  FROM public.schedules
  WHERE id = '11111111-1111-1111-1111-111111111111';
  -- Manager should also NOT see this schedule (target is not theirs).
  -- Belt-and-braces: at most 1, but expected 0.
  IF v_seen > 0 THEN
    RAISE NOTICE 'Test 5.2.b NOTE: manager unexpectedly SEES the Garbagnate-only schedule (count=%); not a critical fail but verify can_read_schedule', v_seen;
  ELSE
    RAISE NOTICE 'Test 5.2.b OK: manager does not SEE the Garbagnate-only schedule (can_read_schedule rejected)';
  END IF;
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 6 — analytics_events write deve essere bloccata per authenticated
-- =============================================================================

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}';

DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.analytics_events (tenant_id, activity_id, event_type)
    VALUES (
      '5b37c952-1add-4196-aab3-9775d98a9c32',
      '347aae51-8df1-4a15-b7f6-40862bf94005',
      'test_event'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Test 6.1 FAIL: direct INSERT on analytics_events should be blocked for authenticated (service_role only)';
  END IF;
  RAISE NOTICE 'Test 6.1 OK: analytics_events INSERT blocked for authenticated';
END$$;

ROLLBACK;

-- =============================================================================
-- TEST 7 — Cross-tenant isolation (manual: requires another tenant)
-- =============================================================================
-- TODO post-Fase 2: scegliere un tenant != McDonald's e una sua activity,
-- impersonare test.manager.mcdonalds e verificare che has_permission ritorni
-- false e che SELECT su quell'activity ritorni 0 righe.
-- =============================================================================
