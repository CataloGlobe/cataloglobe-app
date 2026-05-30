-- =============================================================================
-- Fase 4 RPC — get_my_permissions
--
-- Restituisce ruolo effettivo, sedi accessibili e set di permission_id che il
-- caller può esercitare nel tenant indicato. Source of truth per la libreria
-- permission frontend (sostituisce user_tenants_view.user_role che ritorna
-- NULL per i ruoli activity-scoped manager/staff/viewer).
--
-- Logica:
--   - Auth caller deve esistere
--   - Caller deve appartenere a p_tenant_id (owner OR active membership)
--   - role = 'owner' se tenants.owner_user_id = auth.uid()
--     ELSE 'admin' se tenant_memberships.role='admin'
--     ELSE primo distinct tma.role (manager/staff/viewer) — un user ha un solo
--          ruolo activity-scoped per tenant (modello permissions)
--   - activity_ids: vuoto per owner/admin (tutte le sedi implicite),
--                   array delle activity assegnate per manager/staff/viewer
--   - permissions: tutti i permission_id grantati al role tramite role_permissions
--
-- Pattern caller frontend:
--   const { data } = await supabase.rpc('get_my_permissions', {
--     p_tenant_id: '<tenant-uuid>'
--   });
--   // data = [{ role, activity_ids, permissions }]
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
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id
      AND owner_user_id = v_uid
      AND deleted_at IS NULL
  );

  IF v_caller_is_owner THEN
    v_resolved_role := 'owner';
  ELSE
    v_caller_is_admin := EXISTS (
      SELECT 1 FROM public.tenant_memberships
      WHERE tenant_id = p_tenant_id
        AND user_id   = v_uid
        AND status    = 'active'
        AND role      = 'admin'
    );

    IF v_caller_is_admin THEN
      v_resolved_role := 'admin';
    ELSE
      -- Activity-scoped: primo distinct ruolo (un user ha sempre un solo ruolo
      -- per tenant nel modello). Se diversi tma role esistono (anomalia), si
      -- prende il più "alto" via order by ('manager' < 'staff' < 'viewer'
      -- alfabeticamente NON è giusto → usiamo case explicit).
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

-- =============================================================================
-- Lockdown grants
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.get_my_permissions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_permissions(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_permissions(uuid) IS
'Source of truth lato client per ruolo + sedi accessibili + permission set. '
'Restituisce single row TABLE(role, activity_ids, permissions). '
'owner/admin: activity_ids vuoto (tutte le sedi implicite). '
'manager/staff/viewer: activity_ids popolato dalle assegnazioni tma. '
'RAISE 42501 se caller non appartiene al tenant.';
