-- =============================================================================
-- Seed test data — Permessi multi-sede (Fase 2 verification)
--
-- Crea 3 membership di test su tenant McDonald's:
--   - test.manager.mcdonalds  → manager su Comasina + Baranzate
--   - test.staff.mcdonalds    → staff su Comasina
--   - test.viewer.mcdonalds   → viewer su Comasina
--
-- Idempotente: ON CONFLICT DO NOTHING / DO UPDATE su entrambe le tabelle.
-- Eseguibile più volte senza effetti collaterali.
--
-- Esecuzione: deve girare come service_role (Studio SQL Editor o psql con
-- service_role connection string). Le RLS bloccano INSERT diretti
-- authenticated su tenant_memberships e tenant_membership_activities.
--
-- Prerequisito: i 3 utenti auth.users devono già esistere (creati dall'utente
-- via Supabase Studio Auth).
--
-- =============================================================================
-- COSTANTI (modifica qui se cambi i test user o il tenant target)
-- =============================================================================
--   tenant McDonald's        : 5b37c952-1add-4196-aab3-9775d98a9c32
--   owner (Lorenzo)          : 9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--
--   activity Comasina        : 347aae51-8df1-4a15-b7f6-40862bf94005
--   activity Baranzate       : e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   activity Garbagnate      : 1f62cac4-2ba9-436b-b075-057203658422  (NOT assigned)
--
--   test.manager.mcdonalds   : 16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff.mcdonalds     : 9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer.mcdonalds    : d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- MANAGER → Comasina + Baranzate
-- -----------------------------------------------------------------------------

WITH m AS (
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_email, invited_by)
  VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32',
    '16595820-3e80-4ce2-aded-f4c5f01ab92d',
    NULL,
    'active',
    'test.manager.mcdonalds@cataloglobe.com',
    '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'active',
        role   = NULL
  RETURNING id
)
INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role)
SELECT m.id, a.activity_id, '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid, 'manager'
FROM m, (VALUES
  ('347aae51-8df1-4a15-b7f6-40862bf94005'::uuid),  -- Comasina
  ('e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid)   -- Baranzate
) AS a(activity_id)
ON CONFLICT (tenant_membership_id, activity_id) DO UPDATE
  SET role = 'manager';

-- -----------------------------------------------------------------------------
-- STAFF → Comasina only
-- -----------------------------------------------------------------------------

WITH m AS (
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_email, invited_by)
  VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32',
    '9c6580e5-80bc-4fe8-9141-0d299be38f2f',
    NULL,
    'active',
    'test.staff.mcdonalds@cataloglobe.com',
    '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'active',
        role   = NULL
  RETURNING id
)
INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role)
SELECT m.id, '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid, '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid, 'staff'
FROM m
ON CONFLICT (tenant_membership_id, activity_id) DO UPDATE
  SET role = 'staff';

-- -----------------------------------------------------------------------------
-- VIEWER → Comasina only
-- -----------------------------------------------------------------------------

WITH m AS (
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_email, invited_by)
  VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32',
    'd01359aa-d980-4030-bc5c-c5e84dfe3d0c',
    NULL,
    'active',
    'test.viewer.mcdonalds@cataloglobe.com',
    '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = 'active',
        role   = NULL
  RETURNING id
)
INSERT INTO public.tenant_membership_activities (tenant_membership_id, activity_id, tenant_id, role)
SELECT m.id, '347aae51-8df1-4a15-b7f6-40862bf94005'::uuid, '5b37c952-1add-4196-aab3-9775d98a9c32'::uuid, 'viewer'
FROM m
ON CONFLICT (tenant_membership_id, activity_id) DO UPDATE
  SET role = 'viewer';

COMMIT;

-- =============================================================================
-- Verification print-out
-- =============================================================================

SELECT
  u.email,
  tm.role                                       AS membership_role,
  tm.status                                     AS membership_status,
  COALESCE(STRING_AGG(tma.role, ',' ORDER BY tma.role), '<none>')    AS activity_roles,
  COUNT(tma.activity_id)                        AS assigned_activities
FROM auth.users u
JOIN public.tenant_memberships tm ON tm.user_id = u.id
LEFT JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
WHERE u.id IN (
  '16595820-3e80-4ce2-aded-f4c5f01ab92d',
  '9c6580e5-80bc-4fe8-9141-0d299be38f2f',
  'd01359aa-d980-4030-bc5c-c5e84dfe3d0c'
)
GROUP BY u.email, tm.role, tm.status
ORDER BY u.email;

-- Expected:
--   test.manager.mcdonalds@cataloglobe.com | (null) | active | manager,manager | 2
--   test.staff.mcdonalds@cataloglobe.com   | (null) | active | staff           | 1
--   test.viewer.mcdonalds@cataloglobe.com  | (null) | active | viewer          | 1
