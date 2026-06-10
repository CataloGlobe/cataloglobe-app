-- =============================================================================
-- Fix: INSERT su activities fallisce con 42501 "new row violates row-level
-- security policy" quando il client usa .insert().select() (PostgREST
-- INSERT ... RETURNING).
--
-- Causa radice: con RETURNING, Postgres applica anche la policy SELECT (USING)
-- alla riga nuova (docs CREATE POLICY, Table "Policies Applied by Command
-- Type", riga INSERT → "Check new row" sulla colonna SELECT/ALL policy).
-- La policy SELECT esistente ("Roles can read activities") è
-- `id IN (SELECT get_my_activity_ids())`: la funzione è STABLE e deriva gli id
-- leggendo public.activities con lo snapshot dello statement chiamante, quindi
-- non può mai vedere la riga inserita dallo statement stesso → check false →
-- l'INSERT abortisce per ogni ruolo.
--
-- Fix: seconda policy SELECT permissive valutata row-localmente (nessuna
-- lettura di public.activities) per i soli ruoli tenant-wide (owner + admin),
-- gli unici autorizzati a creare sedi. Manager/staff/viewer restano scoped
-- via get_my_activity_ids (questa policy per loro è sempre false).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper: caller è owner del tenant o admin membership attiva.
--    Branch identici ai primi due di has_permission_any_activity, senza il
--    check role_permissions (qui si verifica l'identità, non un permesso).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_tenant_owner_or_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN
    -- owner of the tenant
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
    )
    OR
    -- admin membership in the tenant
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id   = auth.uid()
        AND tm.status    = 'active'
        AND tm.role      = 'admin'
        AND t.deleted_at IS NULL
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_owner_or_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_tenant_owner_or_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner_or_admin(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Policy SELECT aggiuntiva (permissive, OR con "Roles can read activities").
--    Row-local: dipende solo da NEW.tenant_id, mai dallo snapshot di activities
--    → il check sul RETURNING di un INSERT passa per owner/admin.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant-wide roles can read activities" ON public.activities;

CREATE POLICY "Tenant-wide roles can read activities"
  ON public.activities FOR SELECT TO authenticated
  USING (public.is_tenant_owner_or_admin(tenant_id));
