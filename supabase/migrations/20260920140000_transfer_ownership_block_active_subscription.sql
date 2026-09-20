BEGIN;

-- =============================================================================
-- RPC: transfer_ownership — blocca il trasferimento su tenant con
-- subscription Stripe collegata.
-- =============================================================================
--
-- Perché: transfer_ownership sposta SOLO tenant_memberships/owner_user_id,
-- MAI le colonne abbonamento (stripe_customer_id, stripe_subscription_id).
-- Su un tenant con sub attiva/trialing il nuovo owner erediterebbe un
-- abbonamento ancora addebitato sul metodo di pagamento del vecchio owner
-- (desync di attribuzione billing). Nessun blocco esisteva prima su questo
-- caso: la RPC richiedeva solo owner attivo + target membro attivo.
--
-- Guard aggiunta (Guard 3.5, dopo il controllo membro target): se
-- tenants.stripe_subscription_id IS NOT NULL, la funzione rifiuta con
-- 42501 prima di toccare qualunque riga. Nessuna migrazione automatica
-- del customer Stripe: quella resta un lavoro futuro separato (opzione C
-- discussa col punto 5 del giro produzione 2026-09-20).
--
-- Corpo invariato per il resto rispetto a
-- 20260322160000_transfer_ownership_add_notification.sql.
--
-- NON APPLICATA: proposta 2026-09-20, in attesa di revisione esplicita
-- prima di apply_migration / db push.
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
  v_current_owner_user_id     uuid;
  v_owner_count                int;
  v_stripe_subscription_id     text;
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

  -- Lock the tenants row to serialize concurrent transfer attempts.
  SELECT stripe_subscription_id
  INTO   v_stripe_subscription_id
  FROM   public.tenants
  WHERE  id = p_tenant_id
  FOR UPDATE;

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
  -- Guard 3.5 (nuova): blocca se il tenant ha una subscription Stripe
  -- collegata. Trasferire ownership su un tenant pagante sposterebbe
  -- il controllo del tenant senza spostare il billing sottostante.
  -- ------------------------------------------------------------------
  IF v_stripe_subscription_id IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_has_active_subscription: cannot transfer ownership of a tenant with a linked Stripe subscription'
      USING ERRCODE = '42501';
  END IF;

  -- ------------------------------------------------------------------
  -- Step A: downgrade current owner to admin.
  --
  -- Scoped to the specific owner row identified in Guard 1.
  -- MUST run before Step B. The partial unique index on (tenant_id)
  -- WHERE role = 'owner' allows only one owner row per tenant at any
  -- point in time. Removing the existing owner row first makes room
  -- for the new one without a transient uniqueness violation.
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
  --
  -- Kept in sync with the membership change for the duration of the
  -- transitional phase. Remove this UPDATE once owner_user_id is
  -- dropped from the tenants table.
  -- ------------------------------------------------------------------
  UPDATE public.tenants
  SET    owner_user_id = p_new_owner_user_id
  WHERE  id = p_tenant_id;

  -- ------------------------------------------------------------------
  -- Post-transfer invariant check
  --
  -- Exactly one active owner membership must exist after the transfer.
  -- A mismatch here indicates a race condition or data corruption;
  -- the exception aborts the transaction and rolls back all three UPDATEs.
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
  --
  -- Inserted after the invariant check so the notification is only
  -- written if the transfer fully succeeded.
  -- SECURITY DEFINER context allows the INSERT without a client-facing
  -- INSERT policy on v2_notifications.
  -- ------------------------------------------------------------------
  INSERT INTO public.v2_notifications (user_id, tenant_id, event_type, data)
  SELECT
    p_new_owner_user_id,
    t.id,
    'ownership_received',
    jsonb_build_object('tenant_name', t.name)
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

END;
$$;

REVOKE ALL    ON FUNCTION public.transfer_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO service_role;

COMMIT;
