BEGIN;

-- =============================================================================
-- RPC: unlock_owned_tenants(p_user_id uuid)
-- =============================================================================
--
-- Clears locked_at on all tenants owned by p_user_id that were locked as part
-- of the delete-account flow and have not been soft-deleted.
--
-- Called by the recover-account Edge Function using service_role after the
-- Supabase Admin API has successfully reactivated the user's auth account.
-- Because the Edge Function runs with service_role, auth.uid() is NULL in
-- that context — p_user_id is passed explicitly and must be validated here.
--
-- Does not touch:
--   - tenants with deleted_at IS NOT NULL (soft-deleted via the normal flow)
--   - tenants whose ownership was transferred (owner_user_id != p_user_id)
--
-- Error codes:
--   missing_user_id   22000   p_user_id is NULL
--
-- Execute permission:
--   REVOKE from PUBLIC, GRANT to service_role only.
--   Authenticated users must not call this directly — the Edge Function
--   performs authorization before invoking it.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.unlock_owned_tenants(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN

  -- -------------------------------------------------------------------------
  -- Guard: p_user_id must be provided
  -- -------------------------------------------------------------------------
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id: p_user_id must not be NULL'
      USING ERRCODE = '22000';
  END IF;

  -- -------------------------------------------------------------------------
  -- Unlock tenants: clear locked_at for all tenants owned by this user
  -- that are currently locked and not soft-deleted.
  -- Transferred tenants are naturally excluded because their owner_user_id
  -- no longer matches p_user_id.
  -- -------------------------------------------------------------------------
  UPDATE public.tenants
  SET    locked_at = NULL
  WHERE  owner_user_id = p_user_id
    AND  locked_at     IS NOT NULL
    AND  deleted_at    IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;

END;
$$;

REVOKE ALL    ON FUNCTION public.unlock_owned_tenants(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.unlock_owned_tenants(uuid) TO service_role;


COMMIT;
