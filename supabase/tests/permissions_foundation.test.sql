-- =============================================================================
-- Permissions multi-sede — Fase 1: smoke tests (manuali)
--
-- Eseguire dopo `supabase db push` della migration 20260526170000.
-- Tutti i test sono SELECT only. Risultato atteso indicato accanto.
--
-- Esecuzione consigliata: incollare in Studio SQL Editor sezione per sezione,
-- oppure `psql -f supabase/tests/permissions_foundation.test.sql`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Test 1 — Tabelle create
-- Expected: 3 righe (permissions, role_permissions, tenant_membership_activities)
-- -----------------------------------------------------------------------------

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('permissions', 'role_permissions', 'tenant_membership_activities')
ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- Test 2 — Constraint role su tenant_memberships
-- Expected: ERRORE "tenant_memberships_role_check" (SQLSTATE 23514)
-- Uses an existing membership row to avoid FK noise.
-- -----------------------------------------------------------------------------

BEGIN;
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tenant_memberships LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'Test 2 SKIPPED: no existing tenant_memberships row to mutate';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.tenant_memberships SET role = 'invalid_role' WHERE id = v_id;
    RAISE EXCEPTION 'Test 2 FAIL: UPDATE succeeded but should have been rejected';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'Test 2 OK: CHECK constraint correctly rejected invalid role';
  END;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- Test 3 — Seed permissions completo
-- Expected: 35
-- -----------------------------------------------------------------------------

SELECT COUNT(*) AS permissions_count
FROM public.permissions;

-- -----------------------------------------------------------------------------
-- Test 4 — Seed role_permissions per ogni ruolo
-- Expected:
--   owner   → 35
--   admin   → 32
--   manager → 23
--   staff   → 13
--   viewer  → 11
--   TOTAL   → 114
-- -----------------------------------------------------------------------------

SELECT role, COUNT(*) AS perm_count
FROM public.role_permissions
GROUP BY role
ORDER BY role;

SELECT COUNT(*) AS total_role_permissions
FROM public.role_permissions;

-- Specific spot-checks: admin must NOT have the 3 owner-only permissions
SELECT permission_id
FROM public.role_permissions
WHERE role = 'admin'
  AND permission_id IN ('tenant.delete', 'tenant.transfer_ownership', 'billing.cancel');
-- Expected: 0 rows

-- manager must NOT have write content permissions
SELECT permission_id
FROM public.role_permissions
WHERE role = 'manager'
  AND permission_id IN ('products.write', 'catalogs.write', 'styles.write', 'attributes.write');
-- Expected: 0 rows

-- staff must NOT have scheduling.* or analytics.read
SELECT permission_id
FROM public.role_permissions
WHERE role = 'staff'
  AND permission_id IN ('scheduling.read', 'scheduling.write', 'analytics.read');
-- Expected: 0 rows

-- viewer must NOT have any *.write nor *.manage / *.respond
SELECT permission_id
FROM public.role_permissions
WHERE role = 'viewer'
  AND (
    permission_id LIKE '%.write'
    OR permission_id LIKE '%.manage'
    OR permission_id LIKE '%.respond'
    OR permission_id IN ('team.invite', 'team.remove', 'activities.create',
                         'activities.delete', 'billing.cancel', 'billing.manage')
  );
-- Expected: 0 rows

-- -----------------------------------------------------------------------------
-- Test 5 — get_my_activity_ids() exists and returns SETOF uuid
-- Expected: function metadata shows SETOF uuid, call returns 0+ rows.
-- -----------------------------------------------------------------------------

SELECT p.proname,
       pg_catalog.format_type(p.prorettype, NULL) AS return_type,
       p.proretset                                AS returns_set
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_my_activity_ids';
-- Expected: return_type = 'uuid', returns_set = true

SELECT * FROM public.get_my_activity_ids() LIMIT 1;
-- Expected: 0 or more rows, no error

-- -----------------------------------------------------------------------------
-- Test 6 — has_permission() exists and returns boolean
-- Expected: signature has_permission(text, uuid) → boolean.
-- -----------------------------------------------------------------------------

SELECT p.proname,
       pg_catalog.format_type(p.prorettype, NULL) AS return_type,
       pg_catalog.pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'has_permission';
-- Expected: return_type = 'boolean', arguments = 'p_permission_id text, p_activity_id uuid DEFAULT NULL'

SELECT public.has_permission('tenant.read', NULL)  AS tenant_read_tenant_scoped,
       public.has_permission('orders.read',
                             '00000000-0000-0000-0000-000000000000') AS orders_read_with_dummy_activity;
-- Expected: returns true/false without error

-- Sanity: unknown permission_id returns false (no CTE row → no match)
SELECT public.has_permission('does.not.exist', NULL) AS unknown_perm;
-- Expected: false

-- -----------------------------------------------------------------------------
-- Test 7 — Cleanup legacy `member` rows
-- Expected: 0
-- -----------------------------------------------------------------------------

SELECT COUNT(*) AS legacy_member_rows
FROM public.tenant_memberships
WHERE role = 'member';

-- Sanity: the 3 staging rows should now have role IS NULL
SELECT role, status, COUNT(*) AS row_count
FROM public.tenant_memberships
GROUP BY role, status
ORDER BY role NULLS LAST, status;
-- Expected: legacy `member` rows now show role = NULL with status expired/revoked

-- -----------------------------------------------------------------------------
-- Test 8 — RLS policies present
-- Expected: at least the policies created by this migration
-- -----------------------------------------------------------------------------

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('permissions', 'role_permissions', 'tenant_membership_activities')
ORDER BY tablename, cmd, policyname;
-- Expected:
--   permissions                    | Authenticated can read permissions       | SELECT
--   role_permissions               | Authenticated can read role_permissions  | SELECT
--   tenant_membership_activities   | Members can read own assignments         | SELECT
--   tenant_membership_activities   | No direct writes                         | ALL

-- -----------------------------------------------------------------------------
-- Test 9 — Function security configuration
-- Expected: both helpers are SECURITY DEFINER, search_path='', EXECUTE
-- granted to authenticated, NOT granted to anon / public.
-- -----------------------------------------------------------------------------

SELECT p.proname,
       p.prosecdef AS security_definer,
       p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_activity_ids', 'has_permission')
ORDER BY p.proname;
-- Expected: security_definer = true, config contains 'search_path='

SELECT
  has_function_privilege('authenticated', 'public.get_my_activity_ids()',         'execute') AS auth_get_activity,
  has_function_privilege('anon',          'public.get_my_activity_ids()',         'execute') AS anon_get_activity,
  has_function_privilege('authenticated', 'public.has_permission(text, uuid)',    'execute') AS auth_has_permission,
  has_function_privilege('anon',          'public.has_permission(text, uuid)',    'execute') AS anon_has_permission;
-- Expected:
--   auth_get_activity     = true
--   anon_get_activity     = false
--   auth_has_permission   = true
--   anon_has_permission   = false

-- =============================================================================
-- Test 10 — has_permission() 4-branch matrix: MANAGER on McDonald's
--
-- Verifies after fix 20260528150000:
--   - Branch 3: activity-scoped role grants a tenant-scoped permission
--     (e.g. manager has team.invite via role_permissions)
--   - Branch 4: activity-scoped role grants an activity-scoped permission
--     on the specific p_activity_id (e.g. manager has orders.manage on Comasina)
--   - Negative cases: permissions not in role_permissions for manager
--   - Cross-activity: manager has no perms on Garbagnate (not assigned)
--
-- Prereq: seed_permissions_test_data.sql executed.
-- UUIDs:
--   manager (test.manager.mcdonalds) : 16595820-3e80-4ce2-aded-f4c5f01ab92d
--   Comasina                         : 347aae51-8df1-4a15-b7f6-40862bf94005
--   Baranzate                        : e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   Garbagnate                       : 1f62cac4-2ba9-436b-b075-057203658422
-- -----------------------------------------------------------------------------

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"16595820-3e80-4ce2-aded-f4c5f01ab92d","role":"authenticated"}';

DO $$
BEGIN
  -- Branch 3: tenant-scoped perm via activity-scoped role (manager)
  IF NOT public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Test 10.1 FAIL: manager should have team.invite (branch 3)';
  END IF;
  IF NOT public.has_permission('products.read', NULL) THEN
    RAISE EXCEPTION 'Test 10.2 FAIL: manager should have products.read (branch 3)';
  END IF;
  IF NOT public.has_permission('tenant.read', NULL) THEN
    RAISE EXCEPTION 'Test 10.3 FAIL: manager should have tenant.read (branch 3)';
  END IF;
  IF NOT public.has_permission('activity_groups.read', NULL) THEN
    RAISE EXCEPTION 'Test 10.4 FAIL: manager should have activity_groups.read (branch 3)';
  END IF;

  -- Negative: tenant-scoped perm NOT in manager's role_permissions
  IF public.has_permission('tenant.delete', NULL) THEN
    RAISE EXCEPTION 'Test 10.5 FAIL: manager should NOT have tenant.delete';
  END IF;
  IF public.has_permission('billing.cancel', NULL) THEN
    RAISE EXCEPTION 'Test 10.6 FAIL: manager should NOT have billing.cancel';
  END IF;
  IF public.has_permission('products.write', NULL) THEN
    RAISE EXCEPTION 'Test 10.7 FAIL: manager should NOT have products.write';
  END IF;
  IF public.has_permission('activity_groups.write', NULL) THEN
    RAISE EXCEPTION 'Test 10.8 FAIL: manager should NOT have activity_groups.write';
  END IF;

  -- Branch 4: activity-scoped perm on assigned activity
  IF NOT public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 10.9 FAIL: manager should have orders.manage on Comasina (branch 4)';
  END IF;
  IF NOT public.has_permission('scheduling.write', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid) THEN
    RAISE EXCEPTION 'Test 10.10 FAIL: manager should have scheduling.write on Baranzate (branch 4)';
  END IF;

  -- Cross-activity: NOT assigned → reject
  IF public.has_permission('orders.manage', '1f62cac4-2ba9-436b-b075-057203658422'::uuid) THEN
    RAISE EXCEPTION 'Test 10.11 FAIL: manager should NOT have orders.manage on Garbagnate (not assigned)';
  END IF;
  IF public.has_permission('orders.read', '1f62cac4-2ba9-436b-b075-057203658422'::uuid) THEN
    RAISE EXCEPTION 'Test 10.12 FAIL: manager should NOT have orders.read on Garbagnate (not assigned)';
  END IF;

  RAISE NOTICE 'Test 10 OK: manager 4-branch matrix verified';
END$$;
ROLLBACK;

-- =============================================================================
-- Test 11 — has_permission() 4-branch matrix: STAFF on Comasina
--
-- Staff holds a subset of tenant-scoped perms (tenant.read, products.read,
-- catalogs.read, styles.read) and a subset of activity-scoped perms
-- (orders.read, orders.manage, tables.read, tables.manage, reviews.read,
-- reviews.respond, notifications.receive, featured.read, activity.read).
-- Staff does NOT have team.invite, scheduling.read, analytics.read,
-- activity.manage, activity_hours.write.
--
-- UUIDs:
--   staff (test.staff.mcdonalds)     : 9c6580e5-80bc-4fe8-9141-0d299be38f2f
-- -----------------------------------------------------------------------------

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"9c6580e5-80bc-4fe8-9141-0d299be38f2f","role":"authenticated"}';

DO $$
BEGIN
  -- Branch 3: staff holds tenant-scoped perms
  IF NOT public.has_permission('tenant.read', NULL) THEN
    RAISE EXCEPTION 'Test 11.1 FAIL: staff should have tenant.read (branch 3)';
  END IF;
  IF NOT public.has_permission('products.read', NULL) THEN
    RAISE EXCEPTION 'Test 11.2 FAIL: staff should have products.read (branch 3)';
  END IF;

  -- Negative: tenant-scoped perms staff does NOT have
  IF public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Test 11.3 FAIL: staff should NOT have team.invite';
  END IF;
  IF public.has_permission('team.read', NULL) THEN
    RAISE EXCEPTION 'Test 11.4 FAIL: staff should NOT have team.read';
  END IF;
  IF public.has_permission('activity_groups.read', NULL) THEN
    RAISE EXCEPTION 'Test 11.5 FAIL: staff should NOT have activity_groups.read';
  END IF;

  -- Branch 4: staff has orders.manage on Comasina
  IF NOT public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 11.6 FAIL: staff should have orders.manage on Comasina (branch 4)';
  END IF;
  IF NOT public.has_permission('tables.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 11.7 FAIL: staff should have tables.manage on Comasina (branch 4)';
  END IF;

  -- Negative: activity-scoped perms staff does NOT have
  IF public.has_permission('activity.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 11.8 FAIL: staff should NOT have activity.manage';
  END IF;
  IF public.has_permission('scheduling.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 11.9 FAIL: staff should NOT have scheduling.read';
  END IF;
  IF public.has_permission('analytics.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 11.10 FAIL: staff should NOT have analytics.read';
  END IF;

  -- Cross-activity: staff NOT assigned to Baranzate
  IF public.has_permission('orders.read', 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid) THEN
    RAISE EXCEPTION 'Test 11.11 FAIL: staff should NOT have orders.read on Baranzate (not assigned)';
  END IF;

  RAISE NOTICE 'Test 11 OK: staff 4-branch matrix verified';
END$$;
ROLLBACK;

-- =============================================================================
-- Test 12 — has_permission() 4-branch matrix: VIEWER on Comasina (CRITICAL)
--
-- The critical test: viewer reads but never writes. Branch 4 must reject all
-- write permissions on the assigned activity. This is the defense-in-depth
-- guarantee that Modo B (Fase 2 RLS rewrite) relies on.
--
-- UUIDs:
--   viewer (test.viewer.mcdonalds)   : d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- -----------------------------------------------------------------------------

BEGIN;
SET LOCAL role authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"d01359aa-d980-4030-bc5c-c5e84dfe3d0c","role":"authenticated"}';

DO $$
BEGIN
  -- Branch 3: viewer holds tenant-scoped read perms
  IF NOT public.has_permission('tenant.read', NULL) THEN
    RAISE EXCEPTION 'Test 12.1 FAIL: viewer should have tenant.read (branch 3)';
  END IF;
  IF NOT public.has_permission('products.read', NULL) THEN
    RAISE EXCEPTION 'Test 12.2 FAIL: viewer should have products.read (branch 3)';
  END IF;

  -- Branch 4: viewer holds activity-scoped read perms on Comasina
  IF NOT public.has_permission('orders.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.3 FAIL: viewer should have orders.read on Comasina (branch 4)';
  END IF;
  IF NOT public.has_permission('reviews.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.4 FAIL: viewer should have reviews.read on Comasina (branch 4)';
  END IF;
  IF NOT public.has_permission('analytics.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.5 FAIL: viewer should have analytics.read on Comasina (branch 4)';
  END IF;
  IF NOT public.has_permission('scheduling.read', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.6 FAIL: viewer should have scheduling.read on Comasina (branch 4)';
  END IF;

  -- CRITICAL: viewer must NOT have any write permission
  IF public.has_permission('orders.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.7 CRITICAL FAIL: viewer should NOT have orders.manage on Comasina';
  END IF;
  IF public.has_permission('reviews.respond', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.8 CRITICAL FAIL: viewer should NOT have reviews.respond on Comasina';
  END IF;
  IF public.has_permission('tables.manage', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.9 CRITICAL FAIL: viewer should NOT have tables.manage on Comasina';
  END IF;
  IF public.has_permission('scheduling.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.10 CRITICAL FAIL: viewer should NOT have scheduling.write on Comasina';
  END IF;
  IF public.has_permission('activity_hours.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.11 CRITICAL FAIL: viewer should NOT have activity_hours.write on Comasina';
  END IF;
  IF public.has_permission('product_availability.write', '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid) THEN
    RAISE EXCEPTION 'Test 12.12 CRITICAL FAIL: viewer should NOT have product_availability.write on Comasina';
  END IF;

  -- Negative tenant-scoped perms
  IF public.has_permission('team.invite', NULL) THEN
    RAISE EXCEPTION 'Test 12.13 FAIL: viewer should NOT have team.invite';
  END IF;
  IF public.has_permission('products.write', NULL) THEN
    RAISE EXCEPTION 'Test 12.14 FAIL: viewer should NOT have products.write';
  END IF;

  RAISE NOTICE 'Test 12 OK: viewer 4-branch matrix verified (defense in depth confirmed)';
END$$;
ROLLBACK;

-- =============================================================================
-- End of file
-- =============================================================================
