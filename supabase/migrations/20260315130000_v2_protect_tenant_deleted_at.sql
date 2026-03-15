BEGIN;

-- =============================================================================
-- Protect v2_tenants.deleted_at from client-side modification
-- =============================================================================
--
-- Problem: the UPDATE policy on v2_tenants does not restrict which columns an
-- owner can change. An authenticated owner can send:
--
--   PATCH /rest/v1/v2_tenants?id=eq.<id>  { "deleted_at": null }
--
-- via the REST API, effectively reversing a soft-delete without going through
-- the delete-tenant edge function. No application check prevents this.
--
-- Fix: a BEFORE UPDATE trigger that raises an exception if deleted_at is
-- modified by any caller that is not service_role.
--
-- Why a trigger instead of a policy:
--   - PostgreSQL RLS WITH CHECK only validates the final row state, not which
--     columns changed. It cannot express "column X must not be modified".
--   - A generated/default column cannot be used here (deleted_at must be
--     nullable and writable by service_role).
--   - A trigger runs before the write, is enforced at the DB layer regardless
--     of the access path (REST, SDK, direct connection), and adds no overhead
--     to reads.
--
-- Why current_user = 'service_role':
--   - In Supabase, requests made with the service_role key run as the
--     'service_role' PostgreSQL role (current_user = 'service_role').
--   - The delete-tenant edge function creates its admin client with
--     SUPABASE_SERVICE_ROLE_KEY, so its UPDATE lands as service_role.
--   - Authenticated client requests run as 'authenticated' — they are blocked.
--   - anon requests run as 'anon' — they are also blocked (and already blocked
--     by the UPDATE policy which requires owner_user_id = auth.uid()).
--
-- Scope:
--   - Only fires when deleted_at changes (IS DISTINCT FROM handles NULL).
--   - Does not affect any other column update — normal settings saves are
--     unaffected.
-- =============================================================================


-- =============================================================================
-- STEP 1: Trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_deleted_at_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when deleted_at is actually being changed
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
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
-- STEP 2: Attach trigger to v2_tenants
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
  -- Check trigger is attached
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

  -- Check function is SECURITY DEFINER
  SELECT CASE p.prosecdef WHEN true THEN 'definer' ELSE 'invoker' END
  INTO fn_security
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'prevent_deleted_at_client_update';

  IF fn_security = 'definer' THEN
    RAISE NOTICE 'OK: prevent_deleted_at_client_update is SECURITY DEFINER.';
  ELSE
    RAISE EXCEPTION 'FAIL: prevent_deleted_at_client_update is SECURITY %. Expected DEFINER.', upper(fn_security);
  END IF;
END $$;


COMMIT;
