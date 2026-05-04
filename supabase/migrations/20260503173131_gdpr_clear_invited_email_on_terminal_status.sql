-- =============================================================================
-- GDPR fix: azzera invited_email su tutte le transizioni a status terminale
--           + backfill righe storiche.
--
-- Status terminali: revoked, declined, expired, left.
-- Solo accept_invite_by_token già azzerava invited_email; le altre RPC
-- trattenevano PII residua sulle righe in stato terminale.
--
-- Vincolo CHECK constraint v2_tenant_memberships_has_user_or_email impone
-- che almeno uno tra user_id e invited_email sia non NULL. Per righe
-- email-only (user_id IS NULL) in stato terminale, l'unica opzione GDPR
-- compliant è DELETE: la riga rappresenta un invito mai accettato verso un
-- indirizzo, senza alcuna membership tracciata.
--
-- Forward (CREATE OR REPLACE FUNCTION — preserva GRANT/REVOKE esistenti):
--   1. revoke_invite              (status=revoked)
--   2. decline_invite_by_token    (status=declined)
--   3. expire_old_invites         (status=expired)
--   4. remove_tenant_member       (status=left, admin removes member)
--   5. leave_tenant               (status=left, user leaves voluntarily)
--
--   RPC 1-3 operano su righe pending: pattern condizionale
--     - email-only (user_id IS NULL) → DELETE
--     - with user_id                 → UPDATE status + invited_email=NULL
--   RPC 4-5 operano su righe con user_id valorizzato (parametro / auth.uid):
--     - sempre UPDATE con invited_email=NULL (CHECK soddisfatto da user_id)
--
-- Backward:
--   6. Backfill DELETE su righe storiche email-only in stato terminale
--      + UPDATE su righe con user_id in stato terminale.
--
-- Sanity check finale: la migration fallisce se rimane anche una sola riga
-- terminale con invited_email residuo.
--
-- NB: i grant/revoke EXECUTE delle migration 20260429150000 e 20260429170000
-- NON vengono toccati. CREATE OR REPLACE FUNCTION mantiene i permessi esistenti.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. revoke_invite
--    Ground truth: 20260317120000_rename_v2_tables.sql lines 657-694
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id     uuid;
  v_is_email_only boolean;
  v_revoked_id    uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT user_id IS NULL INTO v_is_email_only
  FROM public.tenant_memberships
  WHERE id = p_membership_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_is_email_only THEN
    DELETE FROM public.tenant_memberships
    WHERE id = p_membership_id
      AND status = 'pending'
    RETURNING id INTO v_revoked_id;
  ELSE
    UPDATE public.tenant_memberships
    SET
      status        = 'revoked',
      invite_token  = NULL,
      invited_email = NULL
    WHERE id = p_membership_id
      AND status = 'pending'
    RETURNING id INTO v_revoked_id;
  END IF;

  RETURN v_revoked_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. decline_invite_by_token
--    Ground truth: 20260317120000_rename_v2_tables.sql lines 701-720
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decline_invite_by_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_email_only boolean;
  v_declined_id   uuid;
BEGIN
  SELECT user_id IS NULL INTO v_is_email_only
  FROM public.tenant_memberships
  WHERE invite_token = p_token
    AND status       = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_is_email_only THEN
    DELETE FROM public.tenant_memberships
    WHERE invite_token = p_token
      AND status       = 'pending'
    RETURNING id INTO v_declined_id;
  ELSE
    UPDATE public.tenant_memberships
    SET
      status        = 'declined',
      invite_token  = NULL,
      invited_email = NULL
    WHERE invite_token = p_token
      AND status       = 'pending'
    RETURNING id INTO v_declined_id;
  END IF;

  RETURN v_declined_id IS NOT NULL;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. expire_old_invites
--    Ground truth: 20260317130000_fix_v2_trigger_functions.sql lines 21-39
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_old_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count integer;
    v_updated_count integer;
BEGIN
    -- Step 1: DELETE righe email-only (no PII residua)
    DELETE FROM public.tenant_memberships
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now()
      AND user_id IS NULL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Step 2: UPDATE righe con user_id (azzera invited_email residua)
    UPDATE public.tenant_memberships
    SET status        = 'expired',
        invited_email = NULL
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now()
      AND user_id IS NOT NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN v_deleted_count + v_updated_count;
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. remove_tenant_member
--    Ground truth: 20260317250000_fix_remove_tenant_member_rpc.sql
--    Opera sempre su righe con user_id valorizzato (parametro p_user_id):
--    UPDATE puro, CHECK soddisfatto da user_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
  v_updated_count integer;
BEGIN
  -- Guard: caller cannot remove themselves (use leave_tenant instead)
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself: use leave_tenant instead';
  END IF;

  -- Guard: caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Resolve target member's role
  SELECT role
  INTO v_target_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: cannot remove the tenant owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot remove owner';
  END IF;

  -- Soft-delete: mark as 'left' (consistent with leave_tenant)
  UPDATE public.tenant_memberships
  SET
    status        = 'left',
    invited_email = NULL,
    updated_at    = now()
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'member not found';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. leave_tenant
--    Ground truth: 20260317120000_rename_v2_tables.sql lines 909-941
--    Opera sempre su righe con user_id = auth.uid(): UPDATE puro,
--    CHECK soddisfatto da user_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id              = p_tenant_id
      AND owner_user_id   = auth.uid()
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'owner_cannot_leave: the tenant owner cannot leave their own tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships
  SET status        = 'left',
      invited_email = NULL
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found: no active membership for this user in tenant %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. Backfill righe storiche
-- ---------------------------------------------------------------------------

-- 6a. DELETE righe email-only in stato terminale (PII pulita + righe senza valore)
DELETE FROM public.tenant_memberships
WHERE status IN ('revoked', 'declined', 'expired', 'left')
  AND user_id IS NULL;

-- 6b. UPDATE righe con user_id in stato terminale (azzera invited_email residua)
UPDATE public.tenant_memberships
SET invited_email = NULL
WHERE status IN ('revoked', 'declined', 'expired', 'left')
  AND user_id IS NOT NULL
  AND invited_email IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 7. Sanity check pre-commit migration
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_residual integer;
BEGIN
  SELECT COUNT(*) INTO v_residual
  FROM public.tenant_memberships
  WHERE status IN ('revoked', 'declined', 'expired', 'left')
    AND invited_email IS NOT NULL;

  IF v_residual > 0 THEN
    RAISE EXCEPTION 'GDPR fix incomplete: % terminal rows still have invited_email', v_residual;
  END IF;
END $$;
