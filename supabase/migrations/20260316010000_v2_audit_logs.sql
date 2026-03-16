BEGIN;

-- =============================================================================
-- V2: Audit log table
-- =============================================================================
--
-- Stores immutable event records scoped to a tenant.
--
-- Write path:
--   Inserts are performed exclusively by service_role via edge functions.
--   No INSERT/UPDATE/DELETE RLS policies exist — authenticated clients cannot
--   write to this table directly regardless of RLS being enabled.
--
-- Read path:
--   Authenticated users can read logs for any tenant they belong to, resolved
--   via get_my_tenant_ids() (owners + active members).
--
-- Retention:
--   tenant_id has ON DELETE CASCADE — when a tenant is hard-deleted by the
--   purge-tenants edge function, all its audit logs are removed automatically.
--   No manual cleanup needed in the purge sequence.
--
-- user_id references auth.users ON DELETE SET NULL so log rows are preserved
-- if a user account is deleted, with user_id nulled out.
-- =============================================================================


-- =============================================================================
-- Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_audit_logs (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id  uuid        REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    user_id    uuid        REFERENCES auth.users(id)        ON DELETE SET NULL,

    event_type text        NOT NULL,
    metadata   jsonb,

    created_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS v2_audit_logs_tenant_idx
    ON public.v2_audit_logs (tenant_id);

CREATE INDEX IF NOT EXISTS v2_audit_logs_user_idx
    ON public.v2_audit_logs (user_id);

-- DESC so the most recent events are cheapest to retrieve
CREATE INDEX IF NOT EXISTS v2_audit_logs_created_idx
    ON public.v2_audit_logs (created_at DESC);


-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.v2_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: any member of the tenant (owner or active member) may read its logs.
-- get_my_tenant_ids() already excludes soft-deleted tenants and inactive
-- memberships, so no extra filter is needed here.
CREATE POLICY "Tenant can read own audit logs"
ON public.v2_audit_logs
FOR SELECT
TO authenticated
USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
);

-- No INSERT / UPDATE / DELETE policies.
-- service_role bypasses RLS entirely and is the only allowed write path.


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    tbl_exists    boolean;
    rls_enabled   boolean;
    policy_exists boolean;
    idx_count     int;
BEGIN
    -- Table exists
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'v2_audit_logs'
    ) INTO tbl_exists;

    IF NOT tbl_exists THEN
        RAISE EXCEPTION 'FAIL: table v2_audit_logs does not exist.';
    END IF;
    RAISE NOTICE 'OK: table v2_audit_logs exists.';

    -- RLS enabled
    SELECT relrowsecurity
    INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'v2_audit_logs';

    IF NOT rls_enabled THEN
        RAISE EXCEPTION 'FAIL: RLS is not enabled on v2_audit_logs.';
    END IF;
    RAISE NOTICE 'OK: RLS is enabled on v2_audit_logs.';

    -- Read policy exists
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename  = 'v2_audit_logs'
          AND policyname = 'Tenant can read own audit logs'
    ) INTO policy_exists;

    IF NOT policy_exists THEN
        RAISE EXCEPTION 'FAIL: policy "Tenant can read own audit logs" not found.';
    END IF;
    RAISE NOTICE 'OK: read policy exists on v2_audit_logs.';

    -- No write policies exist
    SELECT COUNT(*) INTO idx_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'v2_audit_logs'
      AND policyname != 'Tenant can read own audit logs';

    IF idx_count > 0 THEN
        RAISE EXCEPTION
            'FAIL: unexpected write policies found on v2_audit_logs (count: %).', idx_count;
    END IF;
    RAISE NOTICE 'OK: no write policies on v2_audit_logs.';

    -- All three indexes exist
    SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'v2_audit_logs'
      AND indexname  IN (
          'v2_audit_logs_tenant_idx',
          'v2_audit_logs_user_idx',
          'v2_audit_logs_created_idx'
      );

    IF idx_count < 3 THEN
        RAISE EXCEPTION
            'FAIL: only %/3 expected indexes found on v2_audit_logs.', idx_count;
    END IF;
    RAISE NOTICE 'OK: all 3 indexes present on v2_audit_logs.';
END $$;


COMMIT;
