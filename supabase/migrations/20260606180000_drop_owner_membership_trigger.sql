BEGIN;

-- =============================================================================
-- Drop dead trigger: owner-row bootstrap on tenant_memberships
-- =============================================================================
--
-- Post-Fase 5.B.2 (owner cleanup), the constraint tenant_memberships_role_check
-- accepts only NULL or 'admin'. Owner identity now lives exclusively in
-- tenants.owner_user_id; get_my_tenant_ids() branch A handles owners directly.
--
-- Trigger on_tenant_created → handle_new_tenant_membership() still attempts to
-- INSERT a row with role='owner' on every new tenant, violating the CHECK and
-- breaking the create-business flow with SQLSTATE 23514.
--
-- This migration drops both the trigger and its now-unused function. No other
-- callers exist (validated via grep across migrations + edge functions + src).
-- Legacy owner-rows count = 0 on staging at migration time, so no data cleanup
-- needed; if production carries legacy rows they remain harmless (read-only
-- artifact, ignored by get_my_tenant_ids branch B because role='owner' is not
-- in the membership-role contract anymore).
-- =============================================================================

DROP TRIGGER IF EXISTS on_tenant_created ON public.tenants;
DROP FUNCTION IF EXISTS public.handle_new_tenant_membership();

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'tenants'
          AND t.tgname  = 'on_tenant_created'
          AND NOT t.tgisinternal
    ) THEN
        RAISE EXCEPTION 'FAIL: on_tenant_created still present on tenants.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'handle_new_tenant_membership'
    ) THEN
        RAISE EXCEPTION 'FAIL: handle_new_tenant_membership still present.';
    END IF;

    RAISE NOTICE 'OK: owner-bootstrap trigger + function removed.';
END $$;

COMMIT;
