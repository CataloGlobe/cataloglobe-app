-- =============================================================================
-- Drop view orfane sostituite dalle RPC introdotte in
-- 20260427100000_security_advisor_fixes.sql.
-- =============================================================================
--
-- Le view tenant_members_view e my_pending_invites_view erano segnalate dal
-- Supabase Security Advisor con 4 errori complessivi:
--   - 2× security_definer_view (entrambe le view)
--   - 2× auth_users_exposed (entrambe le view fanno LEFT JOIN su auth.users)
--
-- Il frontend ora consuma le RPC equivalenti:
--   - tenant_members_view      → public.get_tenant_members(uuid)
--   - my_pending_invites_view  → public.get_my_pending_invites()
--
-- Verifica pre-applicazione: grep su src/ ha confermato zero call site residui.
-- Dopo questa migration il Security Advisor mostra 0 errori.
-- =============================================================================


BEGIN;


-- =============================================================================
-- STEP 1 — Drop view
-- =============================================================================

DROP VIEW IF EXISTS public.tenant_members_view;
DROP VIEW IF EXISTS public.my_pending_invites_view;


-- =============================================================================
-- STEP 2 — Validation
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname      = 'tenant_members_view'
          AND relnamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'tenant_members_view still exists after drop';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname      = 'my_pending_invites_view'
          AND relnamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'my_pending_invites_view still exists after drop';
    END IF;

    -- Verifica che le RPC sostitutive siano ancora presenti
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname      = 'get_tenant_members'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'replacement RPC get_tenant_members(uuid) missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname      = 'get_my_pending_invites'
          AND pronamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'replacement RPC get_my_pending_invites() missing';
    END IF;

    RAISE NOTICE 'Migration drop_orphan_member_views applied successfully';
END $$;


COMMIT;
