BEGIN;

-- =============================================================================
-- RPC: purge_locked_expired_tenants()
-- =============================================================================
--
-- Hard-deletes all tenants whose locked_at timestamp is older than 30 days.
-- These are tenants whose owner deleted their account without transferring
-- ownership, and whose 30-day recovery window has now expired.
--
-- CASCADE on the tenants FK removes all associated data automatically:
-- tenant_memberships, products, catalogs, categories, styles, schedules,
-- featured contents, and audit logs (via ON DELETE CASCADE / SET NULL).
--
-- Called by the purge-accounts Edge Function using service_role.
-- Intended to run before auth.admin.deleteUser() so that the FK RESTRICT
-- on tenants.owner_user_id does not block the user hard-delete.
--
-- Idempotency:
--   Selecting only rows where locked_at < now() - 30 days means repeated
--   runs are safe — already-purged tenants are simply not found again.
--
-- Execute permission:
--   REVOKE from PUBLIC, GRANT to service_role only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_locked_expired_tenants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN

  -- -------------------------------------------------------------------------
  -- Delete expired locked tenants.
  -- CASCADE handles all child data — no manual child-table cleanup needed.
  -- -------------------------------------------------------------------------
  DELETE FROM public.tenants
  WHERE  locked_at IS NOT NULL
    AND  locked_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;

END;
$$;

REVOKE ALL    ON FUNCTION public.purge_locked_expired_tenants() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.purge_locked_expired_tenants() TO service_role;


COMMIT;
