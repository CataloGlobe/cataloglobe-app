-- =============================================================================
-- RPC: execute_account_deletion_tenant_ops — owner guard on the early return.
-- =============================================================================
--
-- Body taken from pg_get_functiondef on the staging live function
-- (2026-09-27, md5(prosrc) c09f69e669fb9259448b20fdfa38326c), NOT from an
-- earlier migration. Single change: Case A (caller owns no active tenant) no
-- longer returns without looking at p_actions.
--
-- Why: until now Case A returned success with the payload unchecked. The
-- delete-account edge function trusted that success and used the payload
-- tenant ids for its Stripe steps: any account could cancel another tenant's
-- subscription (IDOR fixed in the edge on 2026-09-24, commit 32bdd8dc). This
-- is the defense in depth on the database side: every tenant_id in the payload
-- must belong, or have belonged, to the caller, otherwise not_owner_of_tenant
-- (42501), the same error Case B raises.
--
-- Retry preserved: a second call after a failure downstream of the RPC
-- (mark_account_deleted, ban) finds the tenants already handled, so Case A:
--   (i)  locked (or soft-deleted) tenants are still owned by the caller;
--   (ii) transferred tenants have an ownership_transferred audit event whose
--        actor is the caller (written by transfer_ownership, 20260920160000).
-- Case A still performs no writes. Elements without a valid tenant_id UUID
-- are skipped here, as they have no effect.
--
-- Unchanged: signature, SECURITY DEFINER, search_path 'public', Case B,
-- transfers, locks and audit. ACL re-asserted in 20260927230100.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.execute_account_deletion_tenant_ops(p_actions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id     uuid;
  v_active_ids    uuid[];
  v_action_ids    uuid[];
  v_elem          jsonb;
  v_tenant_id     uuid;
  v_action_type   text;
  v_new_owner_id  uuid;
  v_uncovered_id  uuid;
  v_rows          integer;
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

  -- Case A: caller owns no active tenants — idempotent early return.
  IF array_length(v_active_ids, 1) IS NULL THEN
    -- Owner guard (defense in depth, see header): every tenant in the payload
    -- must be owned by the caller in any state (i), or have been transferred
    -- by the caller (ii). Keeps the retry after a partial failure working.
    IF p_actions IS NOT NULL
       AND jsonb_typeof(p_actions) = 'array'
       AND jsonb_array_length(p_actions) > 0
    THEN
      FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
      LOOP
        BEGIN
          v_tenant_id := (v_elem->>'tenant_id')::uuid;
        EXCEPTION WHEN others THEN
          v_tenant_id := NULL;
        END;

        IF v_tenant_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM   public.tenants t
             WHERE  t.id            = v_tenant_id
               AND  t.owner_user_id = v_caller_id
           )
           AND NOT EXISTS (
             SELECT 1
             FROM   public.audit_events ae
             WHERE  ae.event_type    = 'ownership_transferred'
               AND  ae.tenant_id     = v_tenant_id
               AND  ae.actor_user_id = v_caller_id
           )
        THEN
          RAISE EXCEPTION 'not_owner_of_tenant: tenant % is not owned by this user', v_tenant_id
            USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END IF;

    RETURN;
  END IF;

  -- Case B: active tenants exist — p_actions must be a non-empty array.
  IF p_actions IS NULL
     OR jsonb_typeof(p_actions) != 'array'
     OR jsonb_array_length(p_actions) = 0
  THEN
    RAISE EXCEPTION 'incomplete_actions: p_actions must cover all active owned tenants but was empty or missing'
      USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------------------
  -- Validate each element in p_actions.
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
  -- transfer_ownership() writes the ownership_transferred audit event
  -- itself (since 20260920160000).
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

      -- transfer_ownership() keeps the previous owner as an active admin:
      -- right for a voluntary transfer, wrong when the previous owner is
      -- deleting their account. Drop the caller's membership on the tenant
      -- just handed over (ON DELETE CASCADE clears tenant_membership_activities).
      DELETE FROM public.tenant_memberships
      WHERE  tenant_id = v_tenant_id
        AND  user_id   = v_caller_id;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Step 2: lock remaining tenants + audit.
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

      GET DIAGNOSTICS v_rows = ROW_COUNT;

      -- Only audit when the lock actually applied (not a no-op retry).
      IF v_rows > 0 THEN
        INSERT INTO public.audit_events (event_type, actor_user_id, tenant_id, payload)
        VALUES ('tenant_locked', v_caller_id, v_tenant_id, jsonb_build_object());
      END IF;

    END IF;
  END LOOP;

END;
$function$;
