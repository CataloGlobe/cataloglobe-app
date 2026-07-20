-- Fix: le 5 policy di activity_group_members chiamano has_permission(perm, NULL)
-- in forma bare su activity_groups.read/write (scope='tenant'). Nel ramo
-- owner/admin questo verifica "possiedo il permesso su QUALSIASI mio tenant",
-- non sul tenant della riga -> possibile escalation cross-tenant (owner del
-- tenant A ottiene TRUE anche su righe del tenant B dove non ha ruolo alto).
--
-- Fix: has_permission_any_activity('<perm>', tenant_id), keyed sulla colonna
-- tenant_id della riga stessa. Solo lo swap del check di autorizzazione: gate
-- tenant esistente (tenant_id IN get_my_tenant_ids()) invariato, nessun altro
-- comportamento toccato. Pattern gia' usato in 20260718171757, 20260720120000,
-- 20260720130000.

DROP POLICY IF EXISTS "Roles can read activity_group_members" ON public.activity_group_members;
CREATE POLICY "Roles can read activity_group_members"
  ON public.activity_group_members FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activity_groups.read', tenant_id)
  );

DROP POLICY IF EXISTS "Roles can insert activity_group_members" ON public.activity_group_members;
CREATE POLICY "Roles can insert activity_group_members"
  ON public.activity_group_members FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activity_groups.write', tenant_id)
  );

DROP POLICY IF EXISTS "Roles can update activity_group_members" ON public.activity_group_members;
CREATE POLICY "Roles can update activity_group_members"
  ON public.activity_group_members FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activity_groups.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activity_groups.write', tenant_id)
  );

DROP POLICY IF EXISTS "Roles can delete activity_group_members" ON public.activity_group_members;
CREATE POLICY "Roles can delete activity_group_members"
  ON public.activity_group_members FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activity_groups.write', tenant_id)
  );
