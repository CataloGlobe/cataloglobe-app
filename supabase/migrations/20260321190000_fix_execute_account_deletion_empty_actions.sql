BEGIN;

-- =============================================================================
-- Fix: execute_account_deletion_tenant_ops — tighten empty p_actions validation
-- =============================================================================
--
-- Bug (introduced in 20260320050000):
--   The guard
--       IF p_actions IS NULL OR ... OR jsonb_array_length(p_actions) = 0 THEN RETURN;
--   fired unconditionally, allowing a user who owns active tenants to send
--   actions: [] and bypass the coverage check entirely. The function returned
--   silently, leaving owned tenants unhandled while mark_account_deleted and
--   the ban still proceeded.
--
-- Fix:
--   After loading v_active_ids, branch on whether the caller owns tenants:
--
--   - No active tenants → RETURN immediately (idempotent, no coverage needed).
--     Empty p_actions is valid here.
--
--   - Active tenants exist → p_actions MUST be a non-empty array.
--     Empty / null / non-array → RAISE 'incomplete_actions'.
--     The existing element-level validation and coverage check then run as before.
--
-- No other logic is changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.execute_account_deletion_tenant_ops(p_actions jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id     uuid;
  v_active_ids    uuid[];
  v_action_ids    uuid[];
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
  -- -------------------------------------------------------------------------
  SELECT ARRAY(
    SELECT id
    FROM   public.tenants
    WHERE  owner_user_id = v_caller_id
      AND  locked_at     IS NULL
      AND  deleted_at    IS NULL
  ) INTO v_active_ids;

  -- *** CHANGED BLOCK — was a single unconditional early-return for empty
  -- p_actions; now branches on whether active tenants exist. ***
  --
  -- Case A: caller owns no active tenants.
  -- Every tenant was already transferred or locked (idempotent path), or the
  -- user never owned any. p_actions may be empty — return safely.
  IF array_length(v_active_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Case B: caller owns active tenants.
  -- p_actions must be a non-empty array. An empty / null / non-array payload
  -- here means the caller failed to cover all tenants — this is an error.
  IF p_actions IS NULL
     OR jsonb_typeof(p_actions) != 'array'
     OR jsonb_array_length(p_actions) = 0
  THEN
    RAISE EXCEPTION 'incomplete_actions: p_actions must cover all active owned tenants but was empty or missing'
      USING ERRCODE = 'P0001';
  END IF;
  -- *** END CHANGED BLOCK ***

  -- -------------------------------------------------------------------------
  -- Validate each element in p_actions.
  -- Collect tenant_ids for the coverage check that follows.
  -- -------------------------------------------------------------------------
  v_action_ids := ARRAY[]::uuid[];

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
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

    IF v_tenant_id = ANY(v_action_ids) THEN
      RAISE EXCEPTION 'duplicate_tenant_action: tenant_id % appears more than once in p_actions', v_tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_action_type := v_elem->>'action';

    IF v_action_type NOT IN ('transfer', 'lock') THEN
      RAISE EXCEPTION 'invalid_action: action must be "transfer" or "lock", got "%"', v_action_type
        USING ERRCODE = '22000';
    END IF;

    IF v_action_type = 'transfer' AND (v_elem->>'new_owner_user_id') IS NULL THEN
      RAISE EXCEPTION 'missing_new_owner: action "transfer" for tenant % requires new_owner_user_id', v_tenant_id
        USING ERRCODE = '22000';
    END IF;

    IF NOT (v_tenant_id = ANY(v_active_ids)) THEN
      RAISE EXCEPTION 'not_owner_of_tenant: tenant % is not an active owned tenant of this user', v_tenant_id
        USING ERRCODE = '42501';
    END IF;

    v_action_ids := array_append(v_action_ids, v_tenant_id);
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Coverage check: every active tenant must appear in p_actions.
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
  -- Step 1: execute all transfers (before locks).
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
  -- Step 2: lock remaining tenants.
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
