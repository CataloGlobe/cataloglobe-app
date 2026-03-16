BEGIN;

-- =============================================================================
-- RPC: get_my_deleted_tenants()
-- =============================================================================
--
-- Returns all v2_tenants rows where:
--   - owner_user_id = auth.uid()
--   - deleted_at IS NOT NULL
--
-- Why this RPC is needed:
--   The SELECT policy on v2_tenants (migration 20260314170000) only returns rows
--   where deleted_at IS NULL for the calling owner. Soft-deleted tenants are
--   intentionally invisible to prevent accidental access. However, the restore
--   UI in the Workspace page needs to display them so the owner can act on them.
--
--   A SECURITY DEFINER function runs with elevated privileges and can bypass RLS.
--   The predicate owner_user_id = auth.uid() is the ownership guard — only the
--   tenant owner sees their own deleted tenants, no cross-tenant exposure.
--
-- Security:
--   - SECURITY DEFINER: bypasses RLS so deleted rows are readable
--   - owner_user_id = auth.uid(): restricts to the calling user's own tenants
--   - REVOKE from PUBLIC, GRANT to authenticated: anon callers cannot invoke it
--   - SET search_path = public: prevents search path injection
--
-- Execute permission:
--   REVOKE from PUBLIC (default), GRANT to authenticated only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_deleted_tenants()
RETURNS TABLE (
    id            uuid,
    name          text,
    vertical_type text,
    created_at    timestamptz,
    deleted_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
        name,
        vertical_type,
        created_at,
        deleted_at
    FROM public.v2_tenants
    WHERE owner_user_id = auth.uid()
      AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
$$;

REVOKE ALL    ON FUNCTION public.get_my_deleted_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_deleted_tenants() TO authenticated;


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    fn_security text;
BEGIN
    SELECT CASE p.prosecdef WHEN true THEN 'definer' ELSE 'invoker' END
    INTO fn_security
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_my_deleted_tenants';

    IF fn_security = 'definer' THEN
        RAISE NOTICE 'OK: get_my_deleted_tenants is SECURITY DEFINER.';
    ELSE
        RAISE EXCEPTION 'FAIL: get_my_deleted_tenants is SECURITY %. Expected DEFINER.',
            upper(fn_security);
    END IF;
END $$;


COMMIT;
