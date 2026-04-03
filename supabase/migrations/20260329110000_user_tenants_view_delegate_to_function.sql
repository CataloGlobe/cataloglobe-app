-- =============================================================================
-- HARDENING: user_tenants_view — delegate to get_user_tenants()
-- =============================================================================
--
-- PURPOSE
--   Replace the inline SQL in user_tenants_view with a delegation to the
--   canonical get_user_tenants() SECURITY DEFINER function (migration
--   20260329100000). This provides two structural guarantees:
--
--     1. IMMUTABLE FILTER: the tenant-scoping logic lives in one place
--        (get_user_tenants). A future CREATE OR REPLACE VIEW cannot silently
--        drop the WHERE guard because the guard is inside the function body.
--
--     2. EXPLICIT COLUMN LIST: instead of SELECT * we enumerate every column.
--        This freezes the view schema — if get_user_tenants() ever gains or
--        loses a column the view contract stays stable and the migration that
--        changes the function must also update this view explicitly.
--
-- WARNING:
--   PostgreSQL views execute as their owner (postgres in Supabase), bypassing
--   RLS on the underlying tables. This view is safe ONLY because it delegates
--   entirely to get_user_tenants(), which enforces auth.uid() internally.
--   Never query tenants or tenant_memberships directly from a view without an
--   explicit auth.uid() / auth.email() filter in the WHERE clause.
--
-- COMPATIBILITY
--   Column names and order are unchanged from the previous definition.
--   All existing frontend queries (.select("id, name, …")) continue to work.
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Redefine the view as a thin, explicit wrapper over the function
-- ---------------------------------------------------------------------------
--
-- NOTE: we use DROP + CREATE instead of CREATE OR REPLACE because PostgreSQL
-- does not allow CREATE OR REPLACE VIEW to change column order or rename
-- columns. The existing user_tenants_view may have a different column order
-- depending on which prior migration last defined it. DROP IF EXISTS is safe
-- here: no other database objects (functions, policies, triggers, other views)
-- depend on this view directly — all consumers query it by name at runtime.
-- The frontend queries are unaffected because column names are preserved.

-- Drop any existing definition (safe — no dependents)
DROP VIEW IF EXISTS public.user_tenants_view;

-- Recreate with the canonical column list in the correct order
CREATE VIEW public.user_tenants_view AS
SELECT
  id,
  name,
  vertical_type,
  created_at,
  owner_user_id,
  user_role,
  logo_url
FROM public.get_user_tenants();


-- ---------------------------------------------------------------------------
-- 2. Validation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  view_def      text;
  col_count     int;
  required_cols text[] := ARRAY[
    'id', 'name', 'vertical_type', 'created_at',
    'owner_user_id', 'user_role', 'logo_url'
  ];
  col           text;
BEGIN
  -- 2a. View must exist.
  SELECT pg_get_viewdef('public.user_tenants_view'::regclass, true)
  INTO view_def;

  IF view_def IS NULL THEN
    RAISE EXCEPTION 'FAIL: user_tenants_view not found after redefinition.';
  END IF;

  -- 2b. View definition must reference get_user_tenants().
  IF view_def NOT ILIKE '%get_user_tenants%' THEN
    RAISE EXCEPTION
      'FAIL: user_tenants_view does not delegate to get_user_tenants(). '
      'The tenant isolation guarantee is missing.';
  END IF;

  -- 2c. View definition must NOT contain a direct table reference to tenants
  --     (it must delegate entirely to the function).
  IF view_def ILIKE '%FROM public.tenants%'
  OR view_def ILIKE '%JOIN public.tenants%' THEN
    RAISE WARNING
      'user_tenants_view definition references public.tenants directly. '
      'Verify that the view is delegating to get_user_tenants() only.';
  END IF;

  -- 2c-bis. View must NOT use SELECT * — wildcard selects unfreeze the schema
  --         and can silently expose new columns added to get_user_tenants().
  IF view_def ILIKE '%SELECT *%' THEN
    RAISE WARNING
      'user_tenants_view uses SELECT *. This is not allowed. '
      'Enumerate columns explicitly to keep the schema frozen.';
  END IF;

  -- 2d. Verify expected columns exist in the view.
  FOREACH col IN ARRAY required_cols LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'user_tenants_view'
        AND column_name  = col
    ) THEN
      RAISE EXCEPTION
        'FAIL: user_tenants_view is missing expected column "%". '
        'Frontend queries will break.', col;
    END IF;
  END LOOP;

  -- 2e. Count columns — must be exactly 7 (the frozen schema).
  SELECT COUNT(*)
  INTO col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'user_tenants_view';

  IF col_count <> 7 THEN
    RAISE WARNING
      'user_tenants_view has % columns, expected 7. '
      'If a new column was intentionally added, update this check.', col_count;
  END IF;

  RAISE NOTICE
    'OK: user_tenants_view correctly delegates to get_user_tenants(). '
    '% columns verified.', col_count;
END $$;


COMMIT;
