BEGIN;

-- =============================================================================
-- RPC: purge_locked_expired_tenants — add tenant_purged audit events
-- =============================================================================
--
-- Inserts one v2_audit_events row per tenant BEFORE the DELETE, while the FK
-- reference is still valid. After the DELETE commits, ON DELETE SET NULL will
-- null tenant_id on those rows — the event_type and created_at are preserved.
--
-- Why insert before delete:
--   v2_audit_events.tenant_id has FK → tenants(id) ON DELETE SET NULL.
--   If the INSERT and DELETE were in the same statement (CTE), the FK check
--   would see the tenant as deleted and fail. By collecting IDs first, then
--   inserting, then deleting, each step runs as a separate statement within
--   the same transaction — FK is valid at INSERT time.
--
-- No other logic is changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_locked_expired_tenants()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_ids  uuid[];
  v_count       integer;
BEGIN

  -- Collect the IDs of tenants to be purged.
  SELECT ARRAY(
    SELECT id
    FROM   public.tenants
    WHERE  locked_at IS NOT NULL
      AND  locked_at < now() - interval '30 days'
  ) INTO v_tenant_ids;

  v_count := coalesce(array_length(v_tenant_ids, 1), 0);

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Audit: insert one event per tenant while FK is still valid.
  INSERT INTO public.v2_audit_events (event_type, tenant_id, payload)
  SELECT 'tenant_purged', unnest(v_tenant_ids), jsonb_build_object();

  -- Delete expired locked tenants.
  -- CASCADE handles all child data — no manual child-table cleanup needed.
  -- ON DELETE SET NULL will null tenant_id on the audit rows just inserted.
  DELETE FROM public.tenants
  WHERE  id = ANY(v_tenant_ids);

  RETURN v_count;

END;
$$;

REVOKE ALL    ON FUNCTION public.purge_locked_expired_tenants() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.purge_locked_expired_tenants() TO service_role;


COMMIT;
