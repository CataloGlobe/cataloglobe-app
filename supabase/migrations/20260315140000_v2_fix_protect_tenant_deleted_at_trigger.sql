BEGIN;

-- =============================================================================
-- Fix: prevent_deleted_at_client_update must be SECURITY INVOKER
-- =============================================================================
--
-- Bug (migration 20260315130000):
--   The trigger function was declared SECURITY DEFINER. In PostgreSQL, a
--   SECURITY DEFINER function always executes as its owner (e.g. 'postgres'),
--   regardless of which role called the statement that fired the trigger.
--   Inside the function, current_user therefore equals the function owner —
--   never 'service_role'. The check:
--
--     IF current_user != 'service_role' THEN RAISE EXCEPTION ...
--
--   is always true, so the trigger blocks every modification to deleted_at,
--   including the UPDATE issued by the delete-tenant edge function via its
--   service_role client. The soft-delete flow is completely broken.
--
-- Fix:
--   Recreate the function without SECURITY DEFINER (SECURITY INVOKER is the
--   PostgreSQL default for trigger functions). With SECURITY INVOKER,
--   current_user reflects the actual session role set by PostgREST:
--     - authenticated client  → current_user = 'authenticated' → blocked ✓
--     - service_role client   → current_user = 'service_role'  → allowed ✓
--
-- No other logic is changed:
--   - The guard fires only when deleted_at IS DISTINCT FROM OLD.deleted_at.
--   - The trigger name and attachment on v2_tenants are unchanged.
--   - No RLS policies, edge functions, or other migrations are touched.
-- =============================================================================


-- =============================================================================
-- STEP 1: Replace the trigger function (SECURITY INVOKER, no SECURITY DEFINER)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_deleted_at_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only act when deleted_at is actually being changed.
  -- IS DISTINCT FROM handles NULL correctly (NULL → value and value → NULL both qualify).
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    -- With SECURITY INVOKER, current_user is the PostgreSQL role of the
    -- calling session: 'authenticated' for REST clients, 'service_role' for
    -- the delete-tenant edge function.
    IF current_user != 'service_role' THEN
      RAISE EXCEPTION
        'permission_denied: deleted_at on v2_tenants can only be modified by service_role (current_user: %)',
        current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- STEP 2: Re-attach the trigger (DROP + CREATE ensures a clean state)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_protect_tenant_deleted_at ON public.v2_tenants;

CREATE TRIGGER trg_protect_tenant_deleted_at
BEFORE UPDATE ON public.v2_tenants
FOR EACH ROW
EXECUTE FUNCTION public.prevent_deleted_at_client_update();


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
  trigger_exists boolean;
  fn_security    text;
BEGIN
  -- Confirm trigger is still attached
  SELECT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'v2_tenants'
      AND t.tgname = 'trg_protect_tenant_deleted_at'
      AND NOT t.tgisinternal
  ) INTO trigger_exists;

  IF trigger_exists THEN
    RAISE NOTICE 'OK: trigger trg_protect_tenant_deleted_at exists on v2_tenants.';
  ELSE
    RAISE EXCEPTION 'FAIL: trigger trg_protect_tenant_deleted_at not found on v2_tenants.';
  END IF;

  -- Confirm function is now SECURITY INVOKER (prosecdef = false)
  SELECT CASE p.prosecdef WHEN true THEN 'definer' ELSE 'invoker' END
  INTO fn_security
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'prevent_deleted_at_client_update';

  IF fn_security = 'invoker' THEN
    RAISE NOTICE 'OK: prevent_deleted_at_client_update is SECURITY INVOKER.';
  ELSE
    RAISE EXCEPTION 'FAIL: prevent_deleted_at_client_update is SECURITY %. Expected INVOKER.', upper(fn_security);
  END IF;
END $$;


COMMIT;
