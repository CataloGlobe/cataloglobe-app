BEGIN;

-- =============================================================================
-- Fix: execute_account_deletion_tenant_ops — allow empty p_actions array
-- =============================================================================
--
-- Previously, an empty p_actions array raised 'incomplete_actions'.
-- This broke the flow for users with no owned tenants, who correctly
-- send actions: [] from the frontend.
--
-- The idempotency check above (array_length(v_active_ids, 1) IS NULL)
-- already handles the case where the caller owns no active tenants.
-- This guard now returns early for NULL / non-array / empty array,
-- matching the same silent-no-op contract.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.execute_account_deletion_tenant_ops(p_actions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_active_ids    uuid[];   -- tenant ids currently owned, unlocked, not deleted
  v_action_ids    uuid[];   -- tenant ids present in p_actions (for coverage check)
  v_elem          jsonb;
  v_tenant_id     uuid;
  v_action_type   text;
  v_new_owner_id  uuid;
  v_uncovered_id  uuid;
BEGIN

  -- -------------------------------------------------------------------------
  -- Guard: caller must be authenticated
  -- -------------------------------------------------------------------------
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------------------------
  -- Load active tenants: owned by caller, not locked, not soft-deleted.
  -- These are the tenants the caller must account for in p_actions.
  -- -------------------------------------------------------------------------
  SELECT ARRAY(
    SELECT id
    FROM   public.tenants
    WHERE  owner_user_id = v_caller_id
      AND  locked_at     IS NULL
      AND  deleted_at    IS NULL
  ) INTO v_active_ids;

  -- Idempotent no-op: active list is empty means every tenant was already
  -- handled in a previous call (transferred or locked). Return immediately.
  IF array_length(v_active_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- Validate p_actions: must be a JSON array.
  -- Empty array is valid when caller has no owned tenants — return early.
  -- -------------------------------------------------------------------------
  IF p_actions IS NULL
     OR jsonb_typeof(p_actions) != 'array'
     OR jsonb_array_length(p_actions) = 0
  THEN
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- Validate each element in p_actions.
  -- Collect tenant_ids for the coverage check that follows.
  -- -------------------------------------------------------------------------
  v_action_ids := ARRAY[]::uuid[];

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    -- tenant_id is required in every element
    IF (v_elem->>'tenant_id') IS NULL THEN
      RAISE EXCEPTION 'incomplete_actions: every action must include tenant_id'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      v_tenant_id := (v_elem->>'tenant_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
        USING ERRCODE = '22000';
    END;

    -- Reject duplicate tenant_ids within p_actions
    IF v_tenant_id = ANY(v_action_ids) THEN
      RAISE EXCEPTION 'duplicate_tenant_action: tenant_id % appears more than once in p_actions', v_tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    -- action must be 'transfer' or 'lock'
    v_action_type := v_elem->>'action';

    IF v_action_type NOT IN ('transfer', 'lock') THEN
      RAISE EXCEPTION 'invalid_action: action must be "transfer" or "lock", got "%"', v_action_type
        USING ERRCODE = '22000';
    END IF;

    -- transfer requires new_owner_user_id
    IF v_action_type = 'transfer' AND (v_elem->>'new_owner_user_id') IS NULL THEN
      RAISE EXCEPTION 'missing_new_owner: action "transfer" for tenant % requires new_owner_user_id', v_tenant_id
        USING ERRCODE = '22000';
    END IF;

    -- Ownership check: tenant_id must be an active owned tenant of this caller
    IF NOT (v_tenant_id = ANY(v_active_ids)) THEN
      RAISE EXCEPTION 'not_owner_of_tenant: tenant % is not an active owned tenant of this user', v_tenant_id
        USING ERRCODE = '42501';
    END IF;

    v_action_ids := array_append(v_action_ids, v_tenant_id);
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Coverage check: every active tenant must be present in p_actions.
  -- No tenant may be silently left unspecified.
  -- -------------------------------------------------------------------------
  SELECT t_id
  INTO   v_uncovered_id
  FROM   unnest(v_active_ids) AS t_id
  WHERE  NOT (t_id = ANY(v_action_ids))
  LIMIT  1;

  IF FOUND THEN
    RAISE EXCEPTION 'incomplete_actions: active tenant % is not covered by p_actions', v_uncovered_id
      USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 1: execute all transfers.
  -- -------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    IF v_elem->>'action' = 'transfer' THEN
      BEGIN
        v_tenant_id := (v_elem->>'tenant_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
          USING ERRCODE = '22000';
      END;

      BEGIN
        v_new_owner_id := (v_elem->>'new_owner_user_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_new_owner: invalid UUID for new_owner_user_id'
          USING ERRCODE = '22000';
      END;

      PERFORM public.transfer_ownership(v_tenant_id, v_new_owner_id);
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Step 2: lock the remaining tenants.
  -- -------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    IF v_elem->>'action' = 'lock' THEN
      BEGIN
        v_tenant_id := (v_elem->>'tenant_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
          USING ERRCODE = '22000';
      END;

      UPDATE public.tenants
      SET    locked_at = now()
      WHERE  id            = v_tenant_id
        AND  owner_user_id = v_caller_id
        AND  locked_at     IS NULL;
    END IF;
  END LOOP;

END;
$$;

REVOKE ALL     ON FUNCTION public.execute_account_deletion_tenant_ops(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.execute_account_deletion_tenant_ops(jsonb) TO authenticated;

COMMIT;
