-- =============================================================================
-- get_my_permission_activities: le sedi per permesso (D35, deciso da Lorenzo
-- il 2026-10-10).
--
-- get_my_permissions risolve un solo ruolo (il più alto tra quelli di sede) e
-- restituisce solo le sedi di quel ruolo: chi è manager di una sede e viewer
-- di un'altra, nel client, non vede la seconda nemmeno in lettura, mentre il
-- database (has_permission, ramo 4) la concede. Questa RPC dice, per ogni
-- permesso, su quali sedi lo dà almeno uno dei ruoli di sede del caller nel
-- tenant: è la stessa regola del ramo 4 di has_permission.
--
-- Solo i permessi con scope 'activity': quelli di tenant valgono su tutto il
-- tenant (ramo 3 di has_permission), non su un elenco di sedi.
-- Owner e admin: nessuna riga (valgono su tutte le sedi, il client lo sa già
-- dal ruolo). Non membro: nessuna riga.
--
-- RPC nuova invece di cambiare la forma di get_my_permissions: il client
-- funziona anche prima che questa migration sia applicata.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_permission_activities(p_tenant_id uuid)
RETURNS TABLE(permission_id text, activity_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT rp.permission_id,
         ARRAY_AGG(DISTINCT tma.activity_id ORDER BY tma.activity_id)
  FROM public.tenant_membership_activities tma
  JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
  JOIN public.tenants t             ON t.id = tm.tenant_id
  JOIN public.role_permissions rp   ON rp.role = tma.role
  JOIN public.permissions p         ON p.id = rp.permission_id AND p.scope = 'activity'
  WHERE tm.tenant_id = p_tenant_id
    AND tm.user_id   = auth.uid()
    AND tm.status    = 'active'
    AND tm.role IS DISTINCT FROM 'admin'   -- i ruoli di sede hanno tm.role NULL
    AND t.deleted_at IS NULL
    AND t.owner_user_id IS DISTINCT FROM auth.uid()
  GROUP BY rp.permission_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_permission_activities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_permission_activities(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_permission_activities(uuid) IS
  'D35: per ogni permesso, le sedi su cui lo dà almeno un ruolo di sede del caller nel tenant (come has_permission ramo 4). Owner/admin: nessuna riga.';
