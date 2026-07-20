-- Nuovo helper: has_permission_owner_admin(perm, tenant_id).
--
-- Le funzioni gateway RLS scheduling (can_read_schedule, can_read_schedule_target,
-- can_write_schedule) usano has_permission(perm, NULL) per il ramo "owner/admin:
-- full access", NON keyed sul tenant dello schedule -> possibile escalation
-- cross-tenant (owner del tenant A ottiene TRUE anche su schedule del tenant B
-- dove non ha ruolo alto, purche' membro qualsiasi via get_my_tenant_ids()).
--
-- has_permission_any_activity(perm, tenant_id) non e' sostituibile 1:1 qui:
-- include anche il branch "ruolo activity-scoped con questo permesso su
-- QUALSIASI attivita' del tenant", che nel ramo "full access, nessun filtro
-- target" darebbe a uno staff/manager accesso pieno non filtrato per target
-- (bug diverso, peggiore di quello attuale sul ramo activity-scoped, che oggi
-- correttamente filtra via schedule_targets).
--
-- Questo helper isola SOLO i branch owner+admin (identici a branch 1+2 di
-- has_permission_any_activity), keyed sul tenant passato: nessun impatto sul
-- ramo activity-scoped esistente.

CREATE OR REPLACE FUNCTION public.has_permission_owner_admin(
  p_permission_id text,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    -- owner of the tenant
    EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = p_tenant_id
        AND t.owner_user_id = auth.uid()
        AND t.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'owner' AND rp.permission_id = p_permission_id
        )
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
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = 'admin' AND rp.permission_id = p_permission_id
        )
    );
$function$;
