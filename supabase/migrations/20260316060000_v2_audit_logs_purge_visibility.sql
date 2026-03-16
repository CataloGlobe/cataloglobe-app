BEGIN;

-- =============================================================================
-- V2: Add SELECT policy for purge audit entries on v2_audit_logs
-- =============================================================================
--
-- Problem:
--   When a tenant is hard-purged (purge-tenants or purge-tenant-now edge
--   functions), the corresponding audit log entry is inserted with:
--
--     tenant_id = NULL
--
--   This is required because the tenant row is already hard-deleted at the
--   time the audit INSERT fires, and a non-null tenant_id would violate the
--   FK constraint (v2_audit_logs.tenant_id → v2_tenants.id ON DELETE CASCADE).
--
--   The existing SELECT policy:
--
--     "Tenant can read own audit logs"
--     USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
--
--   never matches NULL rows — in SQL, NULL IN (...) evaluates to NULL (falsy)
--   regardless of the set contents. As a result, every tenant_purged event is
--   permanently invisible to all users, including the owner who triggered it.
--
-- Fix:
--   Add a second SELECT policy that allows authenticated users to read audit
--   log entries where:
--
--     tenant_id IS NULL AND user_id = auth.uid()
--
--   This makes tenant_purged entries visible exclusively to the user who
--   executed the purge (recorded in user_id at insert time).
--
-- Security properties:
--   - Only the actor who triggered the purge (user_id) can read the entry.
--   - Rows with tenant_id IS NULL and a different user_id remain invisible.
--   - The existing tenant-scoped policy is completely unchanged.
--   - Anonymous users are excluded (policy is TO authenticated only).
--   - PostgreSQL RLS with multiple policies on the same operation uses OR
--     semantics: a row is visible if ANY policy matches.
--
-- Idempotency:
--   DROP POLICY IF EXISTS before CREATE POLICY makes this migration safe to
--   re-apply (staging resets, rollback/replay scenarios).
-- =============================================================================


-- =============================================================================
-- STEP 1: Add the policy
-- =============================================================================

DROP POLICY IF EXISTS "User can read own orphan audit logs" ON public.v2_audit_logs;

CREATE POLICY "User can read own orphan audit logs"
ON public.v2_audit_logs
FOR SELECT
TO authenticated
USING (
    tenant_id IS NULL
    AND user_id = auth.uid()
);


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    original_policy_exists boolean;
    new_policy_exists       boolean;
    policy_count            int;
BEGIN
    -- Original policy must still be present (we must not have touched it)
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'v2_audit_logs'
          AND policyname = 'Tenant can read own audit logs'
    ) INTO original_policy_exists;

    IF NOT original_policy_exists THEN
        RAISE EXCEPTION
            'FAIL: original policy "Tenant can read own audit logs" is missing — this migration may have clobbered it.';
    END IF;
    RAISE NOTICE 'OK: original policy "Tenant can read own audit logs" is intact.';

    -- New policy exists
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'v2_audit_logs'
          AND policyname = 'User can read own orphan audit logs'
    ) INTO new_policy_exists;

    IF NOT new_policy_exists THEN
        RAISE EXCEPTION
            'FAIL: new policy "User can read own orphan audit logs" was not created.';
    END IF;
    RAISE NOTICE 'OK: new policy "User can read own orphan audit logs" exists.';

    -- Exactly two SELECT policies exist (no unexpected extras)
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'v2_audit_logs'
      AND cmd        = 'SELECT';

    IF policy_count != 2 THEN
        RAISE EXCEPTION
            'FAIL: expected exactly 2 SELECT policies on v2_audit_logs, found %.', policy_count;
    END IF;
    RAISE NOTICE 'OK: v2_audit_logs has exactly 2 SELECT policies.';
END $$;


COMMIT;
