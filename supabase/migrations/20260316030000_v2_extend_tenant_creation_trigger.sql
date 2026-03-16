BEGIN;

-- =============================================================================
-- V2: Extend handle_new_tenant_system_group() for billing + audit
-- =============================================================================
--
-- Extends the existing AFTER INSERT trigger function on v2_tenants to perform
-- three atomic actions on every new tenant creation:
--
--   1. Insert the "Tutte le sedi" system activity group  (existing behaviour)
--   2. Set trial_until = now() + 30 days                (new)
--   3. Write a tenant_created audit log entry            (new)
--
-- Prerequisites (must already be applied):
--   20260314000000_v2_system_activity_group.sql   — original function + trigger
--   20260316010000_v2_audit_logs.sql              — v2_audit_logs table
--   20260316020000_v2_tenant_billing_fields.sql   — trial_until column on v2_tenants
--
-- The trigger name, timing (AFTER INSERT), and SECURITY DEFINER are unchanged.
-- SECURITY DEFINER is required for:
--   - the UPDATE on v2_tenants (owner cannot UPDATE their own deleted_at-protected
--     row directly; SECURITY DEFINER elevates to the function owner's role)
--   - the INSERT into v2_audit_logs (no client INSERT policy exists on that table)
--
-- Idempotency:
--   - Activity group insert uses ON CONFLICT DO NOTHING (unchanged).
--   - trial_until UPDATE is unconditional; re-running the trigger on the same row
--     (not possible in normal flow — triggers fire once per INSERT) would simply
--     reset the trial window, which is safe.
--   - Audit log INSERT has no uniqueness constraint; a duplicate entry would be
--     written if somehow triggered twice, but this cannot happen via normal INSERT.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_tenant_system_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Create the default system activity group (original behaviour)
  -- -------------------------------------------------------------------------
  INSERT INTO public.v2_activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- -------------------------------------------------------------------------
  -- 2. Initialise the 30-day trial window on the tenant row.
  --    Runs SECURITY DEFINER so trg_protect_tenant_deleted_at does not fire
  --    (that trigger guards deleted_at only; trial_until is unrelated).
  --    The UPDATE targets only the newly created row (NEW.id).
  -- -------------------------------------------------------------------------
  UPDATE public.v2_tenants
  SET trial_until = now() + interval '30 days'
  WHERE id = NEW.id;

  -- -------------------------------------------------------------------------
  -- 3. Write an immutable audit log entry for the creation event.
  --    user_id = NEW.owner_user_id captures the creating user.
  --    No metadata needed for this event — the tenant row itself is the record.
  -- -------------------------------------------------------------------------
  INSERT INTO public.v2_audit_logs (tenant_id, user_id, event_type)
  VALUES (NEW.id, NEW.owner_user_id, 'tenant_created');

  RETURN NEW;
END;
$$;


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    fn_security    text;
    trigger_exists boolean;
BEGIN
    -- Function is still SECURITY DEFINER
    SELECT CASE p.prosecdef WHEN true THEN 'definer' ELSE 'invoker' END
    INTO fn_security
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_tenant_system_group';

    IF fn_security = 'definer' THEN
        RAISE NOTICE 'OK: handle_new_tenant_system_group is SECURITY DEFINER.';
    ELSE
        RAISE EXCEPTION 'FAIL: handle_new_tenant_system_group is SECURITY %. Expected DEFINER.',
            upper(fn_security);
    END IF;

    -- Trigger still exists with original name and timing
    SELECT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c  ON c.oid  = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname  = 'public'
          AND c.relname  = 'v2_tenants'
          AND t.tgname   = 'on_v2_tenant_created_system_group'
          AND NOT t.tgisinternal
    ) INTO trigger_exists;

    IF trigger_exists THEN
        RAISE NOTICE 'OK: trigger on_v2_tenant_created_system_group exists on v2_tenants.';
    ELSE
        RAISE EXCEPTION 'FAIL: trigger on_v2_tenant_created_system_group not found on v2_tenants.';
    END IF;
END $$;


COMMIT;
