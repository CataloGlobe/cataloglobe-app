BEGIN;

-- =============================================================================
-- RPC: mark_account_deleted — add account_deleted audit event
-- =============================================================================
--
-- Adds a v2_audit_events INSERT after the profile UPDATE succeeds.
-- actor_user_id = target_user_id = p_user_id: the user initiated their own
-- deletion; auth.uid() is NULL in this context (called via service_role).
--
-- No other logic is changed.
-- =============================================================================

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

  -- Audit
  INSERT INTO public.v2_audit_events (event_type, actor_user_id, target_user_id, payload)
  VALUES (
    'account_deleted',
    p_user_id,
    p_user_id,
    jsonb_build_object()
  );

END;
$$;

REVOKE ALL    ON FUNCTION public.mark_account_deleted(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_account_deleted(uuid) TO service_role;


COMMIT;
