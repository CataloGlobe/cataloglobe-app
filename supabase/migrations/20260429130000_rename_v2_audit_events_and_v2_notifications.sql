-- =============================================================================
-- Rinomina v2_notifications -> notifications e v2_audit_events -> audit_events
-- =============================================================================
-- Allinea le due tabelle alla convenzione di naming senza prefisso v2_,
-- coerente con tenants, activities, schedules, ecc.
--
-- Big Bang strategy: nessuna VIEW alias. Codice TS (frontend + edge functions)
-- deployato in lockstep con questa migration.
-- =============================================================================

BEGIN;

-- 1. Rinomina tabelle
ALTER TABLE public.v2_notifications RENAME TO notifications;
ALTER TABLE public.v2_audit_events RENAME TO audit_events;

-- 2. Rinomina indici (cosmetico)
ALTER INDEX public.v2_notifications_pkey RENAME TO notifications_pkey;
ALTER INDEX public.v2_notifications_user_unread_idx RENAME TO notifications_user_unread_idx;
ALTER INDEX public.v2_notifications_user_type_idx RENAME TO notifications_user_type_idx;
ALTER INDEX public.v2_audit_events_pkey RENAME TO audit_events_pkey;
ALTER INDEX public.v2_audit_events_created_at_idx RENAME TO audit_events_created_at_idx;

-- 3. Rinomina constraint FK (cosmetico)
ALTER TABLE public.notifications RENAME CONSTRAINT v2_notifications_user_id_fkey TO notifications_user_id_fkey;
ALTER TABLE public.notifications RENAME CONSTRAINT v2_notifications_tenant_id_fkey TO notifications_tenant_id_fkey;
ALTER TABLE public.audit_events RENAME CONSTRAINT v2_audit_events_actor_user_id_fkey TO audit_events_actor_user_id_fkey;
ALTER TABLE public.audit_events RENAME CONSTRAINT v2_audit_events_target_user_id_fkey TO audit_events_target_user_id_fkey;
ALTER TABLE public.audit_events RENAME CONSTRAINT v2_audit_events_tenant_id_fkey TO audit_events_tenant_id_fkey;

-- 4. CREATE OR REPLACE delle 3 funzioni SQL che referenziano v2_audit_events.
--    Body recuperato via pg_get_functiondef e riscritto sostituendo
--    v2_audit_events con audit_events.

CREATE OR REPLACE FUNCTION public.mark_account_deleted(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.audit_events (event_type, actor_user_id, target_user_id, payload)
  VALUES (
    'account_deleted',
    p_user_id,
    p_user_id,
    jsonb_build_object()
  );

END;
$function$;

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
  -- transfer_ownership() inserts its own ownership_transferred audit event.
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

CREATE OR REPLACE FUNCTION public.purge_locked_expired_tenants()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.audit_events (event_type, tenant_id, payload)
  SELECT 'tenant_purged', unnest(v_tenant_ids), jsonb_build_object();

  -- Delete expired locked tenants.
  -- CASCADE handles all child data — no manual child-table cleanup needed.
  -- ON DELETE SET NULL will null tenant_id on the audit rows just inserted.
  DELETE FROM public.tenants
  WHERE  id = ANY(v_tenant_ids);

  RETURN v_count;

END;
$function$;

COMMIT;
