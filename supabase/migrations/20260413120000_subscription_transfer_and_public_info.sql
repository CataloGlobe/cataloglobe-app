BEGIN;

-- =============================================================================
-- 1. Update transfer_ownership to reset Stripe fields after ownership transfer
-- =============================================================================
--
-- When a tenant is transferred to a new owner, the old owner's Stripe
-- subscription must not carry over. The Edge Function cancels the subscription
-- in Stripe; this RPC resets the DB fields so the new owner starts fresh
-- (with a 14-day trial to set up their own billing).
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
BEGIN

  -- Guard 1: caller must be the active owner of this tenant.
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

  PERFORM id
  FROM    public.tenants
  WHERE   id = p_tenant_id
  FOR UPDATE;

  -- Guard 2: prevent no-op transfer to self
  IF p_new_owner_user_id = v_current_owner_user_id THEN
    RAISE EXCEPTION 'already_owner: the target user is already the owner of this tenant'
      USING ERRCODE = '22000';
  END IF;

  -- Guard 3: target must have an active membership in this tenant
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

  -- Step A: downgrade current owner to admin
  UPDATE public.tenant_memberships
  SET    role = 'admin'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = v_current_owner_user_id
    AND  role      = 'owner'
    AND  status    = 'active';

  -- Step B: promote target member to owner
  UPDATE public.tenant_memberships
  SET    role = 'owner'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = p_new_owner_user_id
    AND  status    = 'active';

  -- Step C: sync tenants.owner_user_id (hybrid-model requirement)
  UPDATE public.tenants
  SET    owner_user_id = p_new_owner_user_id
  WHERE  id = p_tenant_id;

  -- Step D: reset Stripe fields — new owner must create their own subscription.
  -- The calling Edge Function is responsible for cancelling the subscription
  -- in Stripe before this RPC runs.
  UPDATE public.tenants
  SET    stripe_customer_id     = NULL,
         stripe_subscription_id = NULL,
         subscription_status    = 'trialing',
         trial_until            = (now() + interval '14 days'),
         paid_seats             = 1
  WHERE  id = p_tenant_id;

  -- Post-transfer invariant check
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

END;
$$;

REVOKE ALL    ON FUNCTION public.transfer_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) TO service_role;


-- =============================================================================
-- 2. Update get_tenant_public_info to include subscription_status
-- =============================================================================
--
-- Public pages need to know if the tenant's subscription is active.
-- Adding subscription_status allows the resolve-public-catalog Edge Function
-- to block access for canceled/suspended tenants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_public_info(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'logo_url', t.logo_url,
      'name', t.name,
      'subscription_status', t.subscription_status
    )
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.deleted_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_public_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_info(uuid) TO authenticated;

COMMIT;
