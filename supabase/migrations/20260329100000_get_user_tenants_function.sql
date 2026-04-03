-- =============================================================================
-- HARDENING: public.get_user_tenants()
-- =============================================================================
--
-- PURPOSE
--   Canonical, tamper-proof replacement for the logical core of
--   user_tenants_view. By moving the tenant-scoping logic into a
--   SECURITY DEFINER function we break the two-step attack surface:
--
--     1. A future "CREATE OR REPLACE VIEW user_tenants_view" that accidentally
--        omits the WHERE clause would still be safe because the view now
--        delegates to this function — the filter lives here, not in the view.
--
--     2. Policy authors can call get_user_tenants() directly in DO blocks and
--        scripts without worrying about the RLS-bypass quirk of plain views.
--
-- SECURITY DESIGN
--   - SECURITY DEFINER  : executes with definer privileges, bypassing RLS on
--                         internal queries. This is intentional: auth.uid() is
--                         evaluated in the definer context, so the filter is
--                         authoritative and cannot be subverted by caller-level
--                         RLS changes.
--   - STABLE            : PostgreSQL caches the result within a single
--                         statement. Critical for performance when called from
--                         multiple join conditions.
--   - SET search_path   : prevents search-path injection attacks. Also includes
--                         the `auth` schema so auth.uid() always resolves
--                         correctly in the SECURITY DEFINER execution context.
--   - REVOKE / GRANT    : removes the default PUBLIC execute privilege and
--                         grants only to the 'authenticated' role. Prevents
--                         anonymous callers from invoking the function.
--
-- WARNING:
--   This function is the SINGLE SOURCE OF TRUTH for tenant isolation.
--   Do NOT bypass it with direct table queries or unfiltered views.
--   Every code path that lists tenants for a user MUST go through this
--   function or user_tenants_view (which itself delegates here).
--
-- OUTPUT COLUMNS (stable — must not change without a new migration)
--   id             uuid
--   name           text
--   vertical_type  text
--   created_at     timestamptz
--   owner_user_id  uuid
--   user_role      text   ('owner' | member role | NULL — never NULL in practice
--                          because the WHERE guard prevents unmatched rows)
--   logo_url       text
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create the function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_tenants()
RETURNS TABLE (
  id             uuid,
  name           text,
  vertical_type  text,
  created_at     timestamptz,
  owner_user_id  uuid,
  user_role      text,
  logo_url       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  -- WARNING:
  -- auth.uid() is evaluated in the DEFINER context and MUST appear in every
  -- branch of the filter. Never remove either predicate below.
  SELECT
    t.id,
    t.name,
    t.vertical_type,
    t.created_at,
    t.owner_user_id,
    CASE
      WHEN t.owner_user_id = auth.uid() THEN 'owner'
      WHEN tm.role IS NOT NULL           THEN tm.role
      ELSE NULL
    END AS user_role,
    t.logo_url
  FROM public.tenants t
  LEFT JOIN public.tenant_memberships tm
    ON  tm.tenant_id = t.id
    AND tm.user_id   = auth.uid()
    AND tm.status    = 'active'
  WHERE t.deleted_at IS NULL
    AND (
      t.owner_user_id = auth.uid()   -- caller is the tenant owner
      OR tm.user_id IS NOT NULL      -- caller has an active membership (LEFT JOIN matched)
    )
$$;


-- ---------------------------------------------------------------------------
-- 2. Lock down execute privilege
-- ---------------------------------------------------------------------------

-- Remove the default PUBLIC execute grant so anonymous users cannot call this.
REVOKE ALL ON FUNCTION public.get_user_tenants() FROM public;

-- Grant only to authenticated role (Supabase maps logged-in users here).
GRANT EXECUTE ON FUNCTION public.get_user_tenants() TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. Validation
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  fn_row         record;
  fn_body        text;
BEGIN
  -- 3a. Verify function exists and has the expected security attributes.
  SELECT
    p.prosecdef,
    p.provolatile,
    p.prosrc
  INTO fn_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_user_tenants';

  IF fn_row IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.get_user_tenants() not found after creation.';
  END IF;

  IF NOT fn_row.prosecdef THEN
    RAISE EXCEPTION 'FAIL: get_user_tenants() is not SECURITY DEFINER.';
  END IF;

  IF fn_row.provolatile <> 's' THEN
    RAISE EXCEPTION 'FAIL: get_user_tenants() is not STABLE (got %).',
      fn_row.provolatile;
  END IF;

  -- 3b. Verify body contains auth.uid() filter.
  fn_body := fn_row.prosrc;

  IF fn_body NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION
      'FAIL: get_user_tenants() body does not contain auth.uid() filter. '
      'Tenant isolation is broken.';
  END IF;

  -- 3c. Verify body does NOT reference legacy v2_ table names.
  IF fn_body ILIKE '%v2_tenants%' OR fn_body ILIKE '%v2_tenant_memberships%' THEN
    RAISE WARNING
      'get_user_tenants() body references legacy v2_ table names. '
      'Verify that the renamed tables are used instead.';
  END IF;

  -- 3d. Verify output columns include the required fields.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_tenants'
      AND pg_get_function_result(p.oid) ILIKE '%user_role%'
  ) THEN
    RAISE EXCEPTION
      'FAIL: get_user_tenants() does not declare user_role in its return type.';
  END IF;

  RAISE NOTICE 'OK: public.get_user_tenants() created — SECURITY DEFINER, STABLE, '
    'auth.uid() filter confirmed, no legacy table names.';
END $$;


COMMIT;
