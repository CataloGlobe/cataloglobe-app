BEGIN;

-- =============================================================================
-- RPC: leave_tenant(p_tenant_id uuid)
-- =============================================================================
--
-- Allows an active member to set their own membership status to 'left'.
--
-- Why a SECURITY DEFINER function instead of an RLS UPDATE policy:
--   The existing UPDATE policies on v2_tenant_memberships grant write access
--   only to the tenant owner. Adding an UPDATE policy for members introduces
--   surface for privilege escalation (a member could set their own role,
--   change another member's status, etc.). A SECURITY DEFINER function is
--   narrower: it only updates the specific row for the calling user and only
--   sets the specific field (status = 'left'), with an explicit owner guard.
--
-- Guards:
--   1. Owner check: if auth.uid() is the owner of p_tenant_id, raise
--      'owner_cannot_leave'. Owners must transfer or delete the tenant instead.
--   2. Row existence: if no active membership row is found for (tenant_id,
--      auth.uid()), raise 'membership_not_found'. This prevents silent no-ops.
--
-- Execute permission:
--   REVOKE from PUBLIC (default open), GRANT to authenticated only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.leave_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  -- Guard 1: owners cannot leave their own tenant
  SELECT EXISTS (
    SELECT 1
    FROM public.v2_tenants
    WHERE id = p_tenant_id
      AND owner_user_id = auth.uid()
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'owner_cannot_leave: the tenant owner cannot leave their own tenant'
      USING ERRCODE = '42501';
  END IF;

  -- Update the membership row for the calling user
  UPDATE public.v2_tenant_memberships
  SET status = 'left'
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'active';

  -- Guard 2: no active membership found → no-op is not acceptable
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found: no active membership for this user in tenant %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.leave_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_tenant(uuid) TO authenticated;


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
    AND p.proname = 'leave_tenant';

  IF fn_security = 'definer' THEN
    RAISE NOTICE 'OK: leave_tenant is SECURITY DEFINER.';
  ELSE
    RAISE EXCEPTION 'FAIL: leave_tenant is SECURITY %. Expected DEFINER.', upper(fn_security);
  END IF;
END $$;


COMMIT;
