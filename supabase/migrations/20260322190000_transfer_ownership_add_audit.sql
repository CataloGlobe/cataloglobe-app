BEGIN;

-- =============================================================================
-- RPC: transfer_ownership — add ownership_transferred audit event
-- =============================================================================
--
-- Adds a single INSERT into v2_audit_events after the post-transfer invariant
-- check, alongside the existing v2_notifications insert.
-- The audit event is only written if the entire transfer succeeded.
--
-- No other logic is changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_tenant_id          uuid,
  p_new_owner_user_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_owner_user_id  uuid;
  v_owner_count            int;
  v_locked_at              timestamptz;
  v_deleted_at             timestamptz;
BEGIN

  -- ------------------------------------------------------------------
  -- Guard 1: caller must be the active owner of this tenant.
  -- FOR UPDATE locks the membership row to prevent concurrent transfers.
  -- ------------------------------------------------------------------
  SELECT user_id
  INTO   v_current_owner_user_id
  FROM   public.tenant_memberships
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = auth.uid()
    AND  role      = 'owner'
    AND  status    = 'active'
  FOR UPDATE;

  IF v_current_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized: caller is not the active owner of this tenant'
      USING ERRCODE = '42501';
  END IF;

  -- ------------------------------------------------------------------
  -- Lock the tenants row to serialize concurrent operations and read
  -- authoritative state.
  -- ------------------------------------------------------------------
  SELECT locked_at, deleted_at
  INTO   v_locked_at, v_deleted_at
  FROM   public.tenants
  WHERE  id = p_tenant_id
  FOR UPDATE;

  -- ------------------------------------------------------------------
  -- Guard 4a: reject transfer if tenant is locked (pending deletion).
  -- ------------------------------------------------------------------
  IF v_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_locked: cannot transfer ownership of a locked tenant'
      USING ERRCODE = '55000';
  END IF;

  -- ------------------------------------------------------------------
  -- Guard 4b: reject transfer if tenant is soft-deleted.
  -- ------------------------------------------------------------------
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_deleted: cannot transfer ownership of a deleted tenant'
      USING ERRCODE = '55000';
  END IF;

  -- ------------------------------------------------------------------
  -- Guard 2: prevent no-op transfer to self
  -- ------------------------------------------------------------------
  IF p_new_owner_user_id = v_current_owner_user_id THEN
    RAISE EXCEPTION 'already_owner: the target user is already the owner of this tenant'
      USING ERRCODE = '22000';
  END IF;

  -- ------------------------------------------------------------------
  -- Guard 3: target must have an active membership in this tenant
  -- ------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM   public.tenant_memberships
    WHERE  tenant_id = p_tenant_id
      AND  user_id   = p_new_owner_user_id
      AND  status    = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_target_user: target user is not an active member of this tenant'
      USING ERRCODE = 'P0002';
  END IF;

  -- ------------------------------------------------------------------
  -- Step A: downgrade current owner to admin.
  --
  -- MUST run before Step B (partial unique index on tenant_id WHERE
  -- role = 'owner' allows only one owner row per tenant at any time).
  -- ------------------------------------------------------------------
  UPDATE public.tenant_memberships
  SET    role = 'admin'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = v_current_owner_user_id
    AND  role      = 'owner'
    AND  status    = 'active';

  -- ------------------------------------------------------------------
  -- Step B: promote target member to owner
  -- ------------------------------------------------------------------
  UPDATE public.tenant_memberships
  SET    role = 'owner'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = p_new_owner_user_id
    AND  status    = 'active';

  -- ------------------------------------------------------------------
  -- Step C: sync tenants.owner_user_id (hybrid-model requirement)
  -- ------------------------------------------------------------------
  UPDATE public.tenants
  SET    owner_user_id = p_new_owner_user_id
  WHERE  id = p_tenant_id;

  -- ------------------------------------------------------------------
  -- Post-transfer invariant check
  -- ------------------------------------------------------------------
  SELECT COUNT(*)
  INTO   v_owner_count
  FROM   public.tenant_memberships
  WHERE  tenant_id = p_tenant_id
    AND  role      = 'owner'
    AND  status    = 'active';

  IF v_owner_count != 1 THEN
    RAISE EXCEPTION 'ownership_invariant_violation: expected 1 active owner after transfer, found %', v_owner_count
      USING ERRCODE = 'P0001';
  END IF;

  -- ------------------------------------------------------------------
  -- Notify new owner
  -- ------------------------------------------------------------------
  INSERT INTO public.v2_notifications (user_id, tenant_id, event_type, data)
  SELECT
    p_new_owner_user_id,
    t.id,
    'ownership_received',
    jsonb_build_object('tenant_name', t.name)
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  -- ------------------------------------------------------------------
  -- Audit
  -- ------------------------------------------------------------------
  INSERT INTO public.v2_audit_events (event_type, actor_user_id, target_user_id, tenant_id, payload)
  VALUES (
    'ownership_transferred',
    auth.uid(),
    p_new_owner_user_id,
    p_tenant_id,
    jsonb_build_object()
  );

END;
$$;

REVOKE ALL    ON FUNCTION public.transfer_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO service_role;


COMMIT;
