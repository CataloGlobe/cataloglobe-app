-- =============================================================================
-- RPC: transfer_ownership — riscrittura sul modello owner di Fase 5.B.2.
-- =============================================================================
--
-- Sostituisce 20260920140000_transfer_ownership_block_active_subscription.sql
-- (già applicata in staging, MAI applicata in produzione — schema_migrations
-- prod si ferma a 20260920120000). NON cancellare/modificare quel file:
-- resta nella storia delle migration così com'è.
--
-- STORIA DEL CORPO (per capire da dove partono i due ambienti):
--   20260322190000  aggiunge l'audit 'ownership_transferred' (su
--                   v2_audit_events, rinominata audit_events da
--                   20260429130000).
--   20260413120000  riscrive la funzione da zero: introduce lo Step D
--                   (reset colonne Stripe + trial 14 giorni + paid_seats=1)
--                   e perde sia l'audit sia la notifica. Ultimo corpo del
--                   repo prima di settembre.
--   PRODUZIONE      riflette esattamente 20260413120000: NON è in drift.
--   20260920140000  riscrive partendo da 20260322160000 (base vecchia):
--                   perde lo Step D, ripristina la notifica verso
--                   public.v2_notifications (ormai rinominata, la tabella
--                   reale è public.notifications) e ri-GRANTa authenticated
--                   annullando 20260429150000. È STAGING a essere in drift:
--                   ogni transfer arrivato all'INSERT finale andrebbe in
--                   errore.
--
-- PERCHÉ LA RISCRITTURA: tutti i corpi precedenti (repo, staging live,
-- produzione live) modellano l'owner come riga tenant_memberships.role=
-- 'owner'. Dopo Fase 5.B.2 non è più possibile:
--   - tenant_memberships_role_check ammette solo role IS NULL OR 'admin';
--   - nessuna riga role='owner' esiste (staging e produzione verificati);
--   - l'owner vive SOLO in tenants.owner_user_id, senza membership.
-- Il vecchio Guard 1 (lookup role='owner') falliva sempre con 42501, quindi
-- il ramo action="transfer" di delete-account (esposto in
-- DeleteAccountDrawer) era rotto in entrambi gli ambienti. L'indice parziale
-- tenant_memberships_unique_owner_per_tenant (WHERE role='owner') è inerte
-- per lo stesso motivo; non viene toccato qui.
--
-- Nuovo flusso:
--   Guard 1  caller = tenants.owner_user_id (FOR UPDATE: serializza i
--            transfer concorrenti sullo stesso tenant).
--   Guard 2  no self-transfer (22000).
--   Guard 3  target ha membership attiva nel tenant (P0002).
--   Step A   vecchio owner → membership admin attiva (upsert su
--            UNIQUE (tenant_id, user_id)).
--   Step B   nuovo owner → DELETE della sua membership; il FK
--            tenant_membership_activities.tenant_membership_id ON DELETE
--            CASCADE rimuove i suoi scope per sede.
--   Step C   tenants.owner_user_id = nuovo owner.
--   Invariante: owner_user_id aggiornato E nessuna membership per il nuovo
--            owner; mismatch → P0001 (rollback).
--   Audit    audit_events 'ownership_transferred' (actor = vecchio owner,
--            target = nuovo owner). C'era dal 20260322190000 ed è stato
--            perso da 20260413120000; questa migration lo ripristina.
--   Notifica su public.notifications, type='ownership'.
--
-- Esclusioni volute:
--   - NIENTE Guard 3.5 (blocco su stripe_subscription_id, introdotto da
--     20260920140000): rompeva il ramo "transfer" di delete-account, che
--     trasferisce di proposito tenant con subscription attiva.
--   - NIENTE Step D di 20260413120000, in nessuna forma (né il refresh
--     trial né l'azzeramento di stripe_customer_id/subscription_id): nel
--     ramo "transfer" la subscription resta viva sul customer esistente,
--     azzerarne gli id la orfana e rompe stripe-portal/stripe-webhook.
--     transfer_ownership tocca SOLO l'ownership, mai colonne di billing: la
--     decisione su Stripe è del chiamante (lock vs transfer).
--
-- ACL: invariata qui; REVOKE da authenticated in 20260920160100 (file
-- separato: CREATE FUNCTION + REVOKE/GRANT insieme → db push 42601).
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
  v_owner_after            uuid;
BEGIN

  -- ------------------------------------------------------------------
  -- Guard 1: caller must be the owner of this tenant.
  -- Post Fase 5.B.2 the owner lives only in tenants.owner_user_id.
  -- FOR UPDATE locks the tenant row to serialize concurrent transfers.
  -- ------------------------------------------------------------------
  SELECT owner_user_id
  INTO   v_current_owner_user_id
  FROM   public.tenants
  WHERE  id            = p_tenant_id
    AND  owner_user_id = auth.uid()
  FOR UPDATE;

  IF v_current_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized: caller is not the owner of this tenant'
      USING ERRCODE = '42501';
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
  -- Step A: current owner becomes a tenant-wide admin member.
  -- The owner normally has no membership row; a stale one (e.g. an old
  -- revoked invite) is reactivated as admin via UNIQUE (tenant_id, user_id).
  -- status is NOT NULL without default: always explicit.
  -- ------------------------------------------------------------------
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
  VALUES (p_tenant_id, v_current_owner_user_id, 'admin', 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role       = 'admin',
        status     = 'active',
        updated_at = now();

  -- ------------------------------------------------------------------
  -- Step B: new owner loses the membership row (owners have none).
  -- ON DELETE CASCADE on tenant_membership_activities removes their
  -- per-activity scopes.
  -- ------------------------------------------------------------------
  DELETE FROM public.tenant_memberships
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = p_new_owner_user_id;

  -- ------------------------------------------------------------------
  -- Step C: tenants.owner_user_id is the single source of ownership.
  -- ------------------------------------------------------------------
  UPDATE public.tenants
  SET    owner_user_id = p_new_owner_user_id
  WHERE  id = p_tenant_id;

  -- ------------------------------------------------------------------
  -- Post-transfer invariant check
  --
  -- The new owner must be tenants.owner_user_id and must NOT have a
  -- membership row. A mismatch aborts the transaction and rolls back
  -- all prior writes.
  -- ------------------------------------------------------------------
  SELECT owner_user_id
  INTO   v_owner_after
  FROM   public.tenants
  WHERE  id = p_tenant_id;

  IF v_owner_after IS DISTINCT FROM p_new_owner_user_id
     OR EXISTS (
       SELECT 1
       FROM   public.tenant_memberships
       WHERE  tenant_id = p_tenant_id
         AND  user_id   = p_new_owner_user_id
     )
  THEN
    RAISE EXCEPTION 'ownership_invariant_violation: tenant % owner_user_id=% (expected %) or new owner still has a membership row',
      p_tenant_id, v_owner_after, p_new_owner_user_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ------------------------------------------------------------------
  -- Audit: after the invariant check, so only completed transfers are
  -- recorded.
  -- ------------------------------------------------------------------
  INSERT INTO public.audit_events (event_type, actor_user_id, target_user_id,
                                   tenant_id, payload)
  VALUES ('ownership_transferred', v_current_owner_user_id,
          p_new_owner_user_id, p_tenant_id, jsonb_build_object());

  -- ------------------------------------------------------------------
  -- Notify new owner
  --
  -- After the invariant check: written only if the transfer fully
  -- succeeded. SECURITY DEFINER allows the INSERT without a client-facing
  -- INSERT policy on notifications.
  -- ------------------------------------------------------------------
  INSERT INTO public.notifications (user_id, tenant_id, event_type, type, data)
  SELECT
    p_new_owner_user_id,
    t.id,
    'ownership_received',
    'ownership',
    jsonb_build_object('tenant_name', t.name)
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

END;
$$;
