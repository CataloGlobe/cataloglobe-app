-- =============================================================================
-- RPC: execute_account_deletion_tenant_ops — rimuove la membership del
-- chiamante dai tenant che cede durante la cancellazione account.
-- =============================================================================
--
-- Corpo identico al live (letto via pg_get_functiondef su staging,
-- 2026-09-23) con due sole modifiche:
--
--   1. Nel loop dei transfer, dopo PERFORM public.transfer_ownership(...):
--      DELETE della membership del chiamante sul tenant ceduto.
--      transfer_ownership (20260920160000, Step A) lascia il vecchio owner
--      come admin attivo: corretto per un trasferimento volontario, sbagliato
--      quando il vecchio owner sta cancellando l'account. Nessun altro lo
--      ripulisce (mark_account_deleted scrive solo profiles.account_deleted_at
--      + audit), e via recover-account l'utente rientrerebbe come admin di
--      un'azienda che non è più sua. Il FK ON DELETE CASCADE su
--      tenant_membership_activities rimuove anche eventuali scope per sede.
--
--   2. Commento di Step 1 corretto: l'audit 'ownership_transferred' ora lo
--      scrive davvero transfer_ownership (20260920160000).
--
-- Fuori scope (decisione separata): le membership del chiamante su tenant
-- che NON sta cedendo (tenant altrui dove è admin/manager/staff/viewer)
-- restano invariate.
--
-- ACL invariata da CREATE OR REPLACE; grant ad authenticated in
-- 20260920160200.
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
