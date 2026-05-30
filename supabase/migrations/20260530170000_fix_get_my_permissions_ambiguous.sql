-- =============================================================================
-- Fix bug — get_my_permissions: column reference "role" is ambiguous
--
-- Causa: la versione precedente (20260530160000) usava riferimenti unqualified
-- a `role`, `tenant_id`, `user_id`, `status` dentro EXISTS(...) su
-- tenant_memberships. Le colonne OUT della `RETURNS TABLE(role, activity_ids,
-- permissions)` sono in scope dentro il body plpgsql, quindi `role` bare era
-- ambiguo tra colonna tabella e output column.
--
-- Fix: aggiunti alias espliciti (`tm`, `tma`) e tutte le colonne qualificate.
-- Semantica e firma INVARIATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_permissions(
  p_tenant_id uuid
)
RETURNS TABLE(
  role         text,
  activity_ids uuid[],
  permissions  text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $function$
DECLARE
  v_uid               uuid := auth.uid();
  v_caller_is_owner   boolean;
  v_caller_is_admin   boolean;
  v_resolved_role     text;
  v_activity_ids      uuid[];
  v_permissions       text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticazione richiesta'
      USING ERRCODE = '42501';
  END IF;

  -- =========================================================================
  -- 1. Resolve role
  -- =========================================================================
  v_caller_is_owner := EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.owner_user_id = v_uid
      AND t.deleted_at IS NULL
  );

  IF v_caller_is_owner THEN
    v_resolved_role := 'owner';
  ELSE
    v_caller_is_admin := EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id   = v_uid
        AND tm.status    = 'active'
        AND tm.role      = 'admin'
    );

    IF v_caller_is_admin THEN
      v_resolved_role := 'admin';
    ELSE
      -- Activity-scoped: primo distinct ruolo per priorità esplicita
      -- (manager > staff > viewer).
      SELECT tma.role INTO v_resolved_role
      FROM public.tenant_membership_activities tma
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id   = v_uid
        AND tm.status    = 'active'
      ORDER BY CASE tma.role
                 WHEN 'manager' THEN 1
                 WHEN 'staff'   THEN 2
                 WHEN 'viewer'  THEN 3
                 ELSE 99
               END
      LIMIT 1;
    END IF;
  END IF;

  IF v_resolved_role IS NULL THEN
    RAISE EXCEPTION 'Permesso negato: non appartieni a questa azienda'
      USING ERRCODE = '42501';
  END IF;

  -- =========================================================================
  -- 2. activity_ids
  -- =========================================================================
  IF v_resolved_role IN ('owner', 'admin') THEN
    v_activity_ids := ARRAY[]::uuid[];
  ELSE
    SELECT ARRAY_AGG(DISTINCT tma.activity_id ORDER BY tma.activity_id)
    INTO v_activity_ids
    FROM public.tenant_membership_activities tma
    JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_uid
      AND tm.status    = 'active'
      AND tma.role     = v_resolved_role;

    IF v_activity_ids IS NULL THEN
      v_activity_ids := ARRAY[]::uuid[];
    END IF;
  END IF;

  -- =========================================================================
  -- 3. permissions
  -- =========================================================================
  SELECT ARRAY_AGG(rp.permission_id ORDER BY rp.permission_id)
  INTO v_permissions
  FROM public.role_permissions rp
  WHERE rp.role = v_resolved_role;

  IF v_permissions IS NULL THEN
    v_permissions := ARRAY[]::text[];
  END IF;

  -- =========================================================================
  -- 4. Return
  -- =========================================================================
  RETURN QUERY SELECT v_resolved_role, v_activity_ids, v_permissions;
END;
$function$;

-- Lockdown grants (identici alla migration originale, idempotenti)
REVOKE EXECUTE ON FUNCTION public.get_my_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_permissions(uuid) TO authenticated;
