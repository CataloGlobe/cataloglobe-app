-- =============================================================================
-- Permessi multi-sede — Fix planner inlining bug in
-- has_permission_any_activity()
--
-- Bug (2026-05-29, post Fase 2 hardening):
--   has_permission_any_activity() è LANGUAGE sql STABLE SECURITY DEFINER.
--   Quando il query planner Postgres inline questa funzione dentro le
--   policy expression (WITH CHECK su schedules.INSERT), la prima
--   valutazione fallisce silenziosamente: l'INSERT viene rigettata con
--   SQLSTATE 42501 ("new row violates row-level security policy").
--
--   Prewarming la funzione con un SELECT diretto fa funzionare l'INSERT
--   successiva. Il bug è specifico alla function complessa che ha 3 branch
--   OR con sub-EXISTS multipli.
--
-- Fix idiomatico: cambiare LANGUAGE da `sql` a `plpgsql`. plpgsql NON
-- viene mai inline dal planner, quindi il bug non scatta. Tradeoff:
-- piccolissimo overhead di esecuzione (function call invece di inline),
-- accettabile per una helper RLS chiamata nella WITH CHECK.
--
-- Solo has_permission_any_activity è convertita. Le altre 5 helper della
-- Fase 1+2 (get_my_tenant_ids, get_my_activity_ids, has_permission,
-- can_read_schedule, can_read_schedule_target, can_write_schedule)
-- restano LANGUAGE sql: non hanno mostrato il bug e una conversione
-- preventiva avrebbe potenziale costo performance.
--
-- Logica funzionale invariata. Comportamento semantico identico.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_permission_any_activity(
  p_permission_id text,
  p_tenant_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    )
    OR
    -- activity-scoped assignment in the tenant
    EXISTS (
      SELECT 1
      FROM public.tenant_membership_activities tma
      JOIN public.tenant_memberships tm ON tm.id  = tma.tenant_membership_id
      JOIN public.tenants               t  ON t.id  = tma.tenant_id
      JOIN public.role_permissions     rp ON rp.role = tma.role
      WHERE tma.tenant_id     = p_tenant_id
        AND tm.user_id        = auth.uid()
        AND tm.status         = 'active'
        AND t.deleted_at      IS NULL
        AND rp.permission_id  = p_permission_id
    );
END;
$$;

COMMENT ON FUNCTION public.has_permission_any_activity(text, uuid) IS
  'Verifica se l''utente corrente ha un permesso atomico su QUALUNQUE '
  'activity del tenant specificato. 3 branch: (1) owner del tenant, '
  '(2) admin del tenant, (3) ruolo activity-scoped con permesso '
  'corrispondente. Tutti filtrano tenants.deleted_at IS NULL. '
  'LANGUAGE plpgsql per evitare planner inlining bug in RLS WITH CHECK.';

COMMIT;
