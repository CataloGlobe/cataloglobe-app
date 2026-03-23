BEGIN;

-- =============================================================================
-- Fix: mark_account_deleted / clear_account_deleted — wrong column name
-- =============================================================================
--
-- profiles.id is the PK and FK referencing auth.users(id).
-- There is no profiles.user_id column. The previous implementation used
-- WHERE user_id = p_user_id which caused a runtime column-not-found error,
-- surfaced by the Edge Function as mark_account_deleted_failed (500).
--
-- Fix: replace WHERE user_id with WHERE id in both functions.
-- All other logic is unchanged.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- RPC: mark_account_deleted(p_user_id)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_account_deleted(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = now()
  WHERE  id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'profile_not_found: no profile row found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

END;
$$;

REVOKE ALL    ON FUNCTION public.mark_account_deleted(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_account_deleted(uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- RPC: clear_account_deleted(p_user_id)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_account_deleted(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = NULL
  WHERE  id = p_user_id;

  -- No ROW_COUNT check: idempotent. A NULL → NULL update or a missing row
  -- are both safe outcomes — the column is clear either way.

END;
$$;

REVOKE ALL    ON FUNCTION public.clear_account_deleted(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clear_account_deleted(uuid) TO service_role;


COMMIT;
