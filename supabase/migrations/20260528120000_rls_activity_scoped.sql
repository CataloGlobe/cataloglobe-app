-- =============================================================================
-- Permessi multi-sede — Fase 2: RLS Rewrite Activity-Scoped
--
-- Riscrive le policy RLS di tutte le tabelle activity-scoped per implementare
-- il modello permessi atomici introdotto in Fase 1 (20260526170000).
--
-- Principio Modo B (defense in depth): le policy di WRITE non si limitano a
-- controllare l'assegnazione alla sede ma controllano il permesso specifico
-- via public.has_permission(<perm_id>, activity_id). Un viewer assegnato
-- a una sede NON può modificare i suoi ordini perché la RLS rifiuta,
-- non solo perché il frontend lo nasconde.
--
-- owner/admin passano sempre i check tenant-scoped via has_permission()
-- (branch tenant_role_match). manager/staff/viewer passano solo se hanno
-- il permesso sulla activity specifica.
--
-- Customer-side policies (epic ordering) e public-read policies sono
-- preservate verbatim.
--
-- Vedi: docs/permissions-audit.md (§2, §2.4, §6), 20260526170000_permissions_foundation.sql
--
-- Sezioni:
--   A.  Seed 3 nuovi permessi atomici
--   A2. Seed role_permissions delta
--   B.  Nuovo helper has_permission_any_activity()
--   C.  Policy rewrites:
--        C1.  activities                       (activity.read / activity.manage)
--        C2.  activity_hours                   (activity.read / activity_hours.write)
--        C3.  activity_closures                (activity.read / activity_hours.write)
--        C4.  activity_media                   (activity.read / activity.manage, via subquery)
--        C5.  activity_product_overrides       (activity.read / activity.manage, via EXISTS)
--        C6.  activity_slug_aliases            (activity.read / activity.manage, via subquery)
--        C7.  activity_group_members           (activity_groups.read / activity_groups.write)
--        C8.  analytics_events                 (analytics.read / write=false → service_role)
--        C9.  product_availability_overrides   (activity_id visibility / product_availability.write)
--        C10. tables                           (tables.read / tables.manage)
--        C11. customer_sessions                (tables.read / tables.manage, preserve customer)
--        C12. orders                           (orders.read / orders.manage, preserve customer)
--        C13. order_groups                     (orders.read / orders.manage)
--        C14. order_items                      (orders.read / orders.manage via JOIN, preserve customer)
--        C15. reviews                          (reviews.read / reviews.respond, preserve anon)
--        C16. featured_contents                (tenant-scoped read, featured.write via any_activity)
--        C17. schedule_featured_contents       (scheduling.read/.write via any_activity)
--        C18. schedules                        (per-target read filter, scheduling.write via any_activity)
--        C19. schedule_targets                 (per-target read, WRITE=false → RPC Fase 3)
-- =============================================================================

BEGIN;

-- =============================================================================
-- Section A — 3 new atomic permissions
-- =============================================================================

INSERT INTO public.permissions (id, scope, category, description) VALUES
  ('activity_groups.read',       'tenant',   'activities', 'Vedere gruppi di sedi'),
  ('activity_groups.write',      'tenant',   'activities', 'Modificare gruppi di sedi'),
  ('product_availability.write', 'activity', 'content',    'Modificare disponibilità prodotti per sede')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Section A2 — role_permissions delta
-- =============================================================================

INSERT INTO public.role_permissions (role, permission_id) VALUES
  -- owner: all 3
  ('owner',   'activity_groups.read'),
  ('owner',   'activity_groups.write'),
  ('owner',   'product_availability.write'),
  -- admin: all 3
  ('admin',   'activity_groups.read'),
  ('admin',   'activity_groups.write'),
  ('admin',   'product_availability.write'),
  -- manager: activity_groups.read + product_availability.write
  ('manager', 'activity_groups.read'),
  ('manager', 'product_availability.write')
  -- staff, viewer: none
ON CONFLICT (role, permission_id) DO NOTHING;

-- =============================================================================
-- Section B — has_permission_any_activity helper
--
-- Returns true if the current user holds the given permission on ANY activity
-- of the given tenant (or via owner/admin role on the tenant). Used by tables
-- that are tenant-scoped at the DDL level but whose write semantics depend on
-- the activity-scoped permission catalog (featured_contents, schedules,
-- schedule_featured_contents).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_permission_any_activity(
  p_permission_id text,
  p_tenant_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
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
    )
    OR
    -- activity-scoped assignment in the tenant whose role holds the permission
    EXISTS (
      SELECT 1
      FROM public.tenant_membership_activities tma
      JOIN public.tenant_memberships tm ON tm.id = tma.tenant_membership_id
      JOIN public.role_permissions     rp ON rp.role = tma.role
      WHERE tma.tenant_id  = p_tenant_id
        AND tm.user_id     = auth.uid()
        AND tm.status      = 'active'
        AND rp.permission_id = p_permission_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission_any_activity(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_permission_any_activity(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.has_permission_any_activity(text, uuid) IS
  'Verifica se l''utente corrente possiede un permesso atomico tramite '
  'una qualsiasi delle assegnazioni nel tenant (owner/admin/activity-scoped). '
  'Usata dalle policy su tabelle tenant-scoped la cui semantica di write '
  'dipende dai permessi activity-scoped (featured_contents, schedules, '
  'schedule_featured_contents).';

-- =============================================================================
-- Section C — Policy rewrites
--
-- For each table, drop existing tenant-only policies and create new ones.
-- Customer-side and public-read policies are preserved (NOT dropped).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- C1. activities — read=activity.read, write=activity.manage. Preserve public.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.activities;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.activities;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.activities;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.activities;

CREATE POLICY "Roles can read activities"
  ON public.activities FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_my_activity_ids()));

CREATE POLICY "Roles can insert activities"
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activities.create', tenant_id)
  );

CREATE POLICY "Roles can update activities"
  ON public.activities FOR UPDATE TO authenticated
  USING       (public.has_permission('activity.manage', id))
  WITH CHECK  (public.has_permission('activity.manage', id));

CREATE POLICY "Roles can delete activities"
  ON public.activities FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('activities.delete', tenant_id)
  );

-- -----------------------------------------------------------------------------
-- C2. activity_hours — read=activity.read, write=activity_hours.write
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "select_activity_hours" ON public.activity_hours;
DROP POLICY IF EXISTS "insert_activity_hours" ON public.activity_hours;
DROP POLICY IF EXISTS "update_activity_hours" ON public.activity_hours;
DROP POLICY IF EXISTS "delete_activity_hours" ON public.activity_hours;

CREATE POLICY "Roles can read activity_hours"
  ON public.activity_hours FOR SELECT TO authenticated
  USING (public.has_permission('activity.read', activity_id));

CREATE POLICY "Roles can insert activity_hours"
  ON public.activity_hours FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('activity_hours.write', activity_id));

CREATE POLICY "Roles can update activity_hours"
  ON public.activity_hours FOR UPDATE TO authenticated
  USING       (public.has_permission('activity_hours.write', activity_id))
  WITH CHECK  (public.has_permission('activity_hours.write', activity_id));

CREATE POLICY "Roles can delete activity_hours"
  ON public.activity_hours FOR DELETE TO authenticated
  USING (public.has_permission('activity_hours.write', activity_id));

-- -----------------------------------------------------------------------------
-- C3. activity_closures — read=activity.read, write=activity_hours.write
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "select_own" ON public.activity_closures;
DROP POLICY IF EXISTS "insert_own" ON public.activity_closures;
DROP POLICY IF EXISTS "update_own" ON public.activity_closures;
DROP POLICY IF EXISTS "delete_own" ON public.activity_closures;

CREATE POLICY "Roles can read activity_closures"
  ON public.activity_closures FOR SELECT TO authenticated
  USING (public.has_permission('activity.read', activity_id));

CREATE POLICY "Roles can insert activity_closures"
  ON public.activity_closures FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('activity_hours.write', activity_id));

CREATE POLICY "Roles can update activity_closures"
  ON public.activity_closures FOR UPDATE TO authenticated
  USING       (public.has_permission('activity_hours.write', activity_id))
  WITH CHECK  (public.has_permission('activity_hours.write', activity_id));

CREATE POLICY "Roles can delete activity_closures"
  ON public.activity_closures FOR DELETE TO authenticated
  USING (public.has_permission('activity_hours.write', activity_id));

-- -----------------------------------------------------------------------------
-- C4. activity_media — no tenant_id column. Via direct activity_id check.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "activity_media_tenant_select" ON public.activity_media;
DROP POLICY IF EXISTS "activity_media_tenant_insert" ON public.activity_media;
DROP POLICY IF EXISTS "activity_media_tenant_update" ON public.activity_media;
DROP POLICY IF EXISTS "activity_media_tenant_delete" ON public.activity_media;

CREATE POLICY "Roles can read activity_media"
  ON public.activity_media FOR SELECT TO authenticated
  USING (public.has_permission('activity.read', activity_id));

CREATE POLICY "Roles can insert activity_media"
  ON public.activity_media FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('activity.manage', activity_id));

CREATE POLICY "Roles can update activity_media"
  ON public.activity_media FOR UPDATE TO authenticated
  USING       (public.has_permission('activity.manage', activity_id))
  WITH CHECK  (public.has_permission('activity.manage', activity_id));

CREATE POLICY "Roles can delete activity_media"
  ON public.activity_media FOR DELETE TO authenticated
  USING (public.has_permission('activity.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C5. activity_product_overrides — has activity_id directly
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "policy_activity_product_overrides_select" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "policy_activity_product_overrides_insert" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "policy_activity_product_overrides_update" ON public.activity_product_overrides;
DROP POLICY IF EXISTS "policy_activity_product_overrides_delete" ON public.activity_product_overrides;

CREATE POLICY "Roles can read activity_product_overrides"
  ON public.activity_product_overrides FOR SELECT TO authenticated
  USING (public.has_permission('activity.read', activity_id));

CREATE POLICY "Roles can insert activity_product_overrides"
  ON public.activity_product_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('activity.manage', activity_id));

CREATE POLICY "Roles can update activity_product_overrides"
  ON public.activity_product_overrides FOR UPDATE TO authenticated
  USING       (public.has_permission('activity.manage', activity_id))
  WITH CHECK  (public.has_permission('activity.manage', activity_id));

CREATE POLICY "Roles can delete activity_product_overrides"
  ON public.activity_product_overrides FOR DELETE TO authenticated
  USING (public.has_permission('activity.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C6. activity_slug_aliases — no tenant_id, no UPDATE policy (immutable)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant members can view own aliases"   ON public.activity_slug_aliases;
DROP POLICY IF EXISTS "Tenant members can insert own aliases" ON public.activity_slug_aliases;
DROP POLICY IF EXISTS "Tenant members can delete own aliases" ON public.activity_slug_aliases;

CREATE POLICY "Roles can read activity_slug_aliases"
  ON public.activity_slug_aliases FOR SELECT TO authenticated
  USING (public.has_permission('activity.read', activity_id));

CREATE POLICY "Roles can insert activity_slug_aliases"
  ON public.activity_slug_aliases FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('activity.manage', activity_id));

CREATE POLICY "Roles can delete activity_slug_aliases"
  ON public.activity_slug_aliases FOR DELETE TO authenticated
  USING (public.has_permission('activity.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C7. activity_group_members — tenant-wide groups. Preserve public read policy.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.activity_group_members;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.activity_group_members;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.activity_group_members;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.activity_group_members;

CREATE POLICY "Roles can read activity_group_members"
  ON public.activity_group_members FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission('activity_groups.read', NULL)
  );

CREATE POLICY "Roles can insert activity_group_members"
  ON public.activity_group_members FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission('activity_groups.write', NULL)
  );

CREATE POLICY "Roles can update activity_group_members"
  ON public.activity_group_members FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission('activity_groups.write', NULL)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission('activity_groups.write', NULL)
  );

CREATE POLICY "Roles can delete activity_group_members"
  ON public.activity_group_members FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission('activity_groups.write', NULL)
  );

-- -----------------------------------------------------------------------------
-- C8. analytics_events — read=analytics.read, write=service_role only
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.analytics_events;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.analytics_events;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.analytics_events;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.analytics_events;

CREATE POLICY "Roles can read analytics_events"
  ON public.analytics_events FOR SELECT TO authenticated
  USING (public.has_permission('analytics.read', activity_id));

-- Writes only via service_role (edge function log-analytics-event)
CREATE POLICY "No direct writes to analytics_events"
  ON public.analytics_events FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- C9. product_availability_overrides — visibility by activity, write by perm
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_availability_overrides;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_availability_overrides;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_availability_overrides;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_availability_overrides;

CREATE POLICY "Roles can read product_availability_overrides"
  ON public.product_availability_overrides FOR SELECT TO authenticated
  USING (activity_id IN (SELECT public.get_my_activity_ids()));

CREATE POLICY "Roles can insert product_availability_overrides"
  ON public.product_availability_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('product_availability.write', activity_id));

CREATE POLICY "Roles can update product_availability_overrides"
  ON public.product_availability_overrides FOR UPDATE TO authenticated
  USING       (public.has_permission('product_availability.write', activity_id))
  WITH CHECK  (public.has_permission('product_availability.write', activity_id));

CREATE POLICY "Roles can delete product_availability_overrides"
  ON public.product_availability_overrides FOR DELETE TO authenticated
  USING (public.has_permission('product_availability.write', activity_id));

-- -----------------------------------------------------------------------------
-- C10. tables — read=tables.read, write=tables.manage
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.tables;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.tables;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.tables;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.tables;

CREATE POLICY "Roles can read tables"
  ON public.tables FOR SELECT TO authenticated
  USING (public.has_permission('tables.read', activity_id));

CREATE POLICY "Roles can insert tables"
  ON public.tables FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('tables.manage', activity_id));

CREATE POLICY "Roles can update tables"
  ON public.tables FOR UPDATE TO authenticated
  USING       (public.has_permission('tables.manage', activity_id))
  WITH CHECK  (public.has_permission('tables.manage', activity_id));

CREATE POLICY "Roles can delete tables"
  ON public.tables FOR DELETE TO authenticated
  USING (public.has_permission('tables.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C11. customer_sessions — read=tables.read, write=tables.manage.
--      Preserve "Customer select own session" + "Customer update own session".
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.customer_sessions;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.customer_sessions;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.customer_sessions;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.customer_sessions;

CREATE POLICY "Roles can read customer_sessions"
  ON public.customer_sessions FOR SELECT TO authenticated
  USING (public.has_permission('tables.read', activity_id));

CREATE POLICY "Roles can insert customer_sessions"
  ON public.customer_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('tables.manage', activity_id));

CREATE POLICY "Roles can update customer_sessions"
  ON public.customer_sessions FOR UPDATE TO authenticated
  USING       (public.has_permission('tables.manage', activity_id))
  WITH CHECK  (public.has_permission('tables.manage', activity_id));

CREATE POLICY "Roles can delete customer_sessions"
  ON public.customer_sessions FOR DELETE TO authenticated
  USING (public.has_permission('tables.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C12. orders — read=orders.read, write=orders.manage.
--      Preserve "Customer select own orders".
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.orders;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.orders;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.orders;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.orders;

CREATE POLICY "Roles can read orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.has_permission('orders.read', activity_id));

CREATE POLICY "Roles can insert orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('orders.manage', activity_id));

CREATE POLICY "Roles can update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING       (public.has_permission('orders.manage', activity_id))
  WITH CHECK  (public.has_permission('orders.manage', activity_id));

CREATE POLICY "Roles can delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (public.has_permission('orders.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C13. order_groups — read=orders.read, write=orders.manage
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.order_groups;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.order_groups;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.order_groups;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.order_groups;

CREATE POLICY "Roles can read order_groups"
  ON public.order_groups FOR SELECT TO authenticated
  USING (public.has_permission('orders.read', activity_id));

CREATE POLICY "Roles can insert order_groups"
  ON public.order_groups FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('orders.manage', activity_id));

CREATE POLICY "Roles can update order_groups"
  ON public.order_groups FOR UPDATE TO authenticated
  USING       (public.has_permission('orders.manage', activity_id))
  WITH CHECK  (public.has_permission('orders.manage', activity_id));

CREATE POLICY "Roles can delete order_groups"
  ON public.order_groups FOR DELETE TO authenticated
  USING (public.has_permission('orders.manage', activity_id));

-- -----------------------------------------------------------------------------
-- C14. order_items — no activity_id. Chain via orders.activity_id.
--      Preserve "Customer select own order items".
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.order_items;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.order_items;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.order_items;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.order_items;

CREATE POLICY "Roles can read order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.read', o.activity_id)
    )
  );

CREATE POLICY "Roles can insert order_items"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
    )
  );

CREATE POLICY "Roles can update order_items"
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
    )
  );

CREATE POLICY "Roles can delete order_items"
  ON public.order_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
    )
  );

-- -----------------------------------------------------------------------------
-- C15. reviews — read=reviews.read, write=reviews.respond. Preserve anon select.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "reviews_select_authenticated" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_authenticated" ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_authenticated" ON public.reviews;

CREATE POLICY "Roles can read reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (public.has_permission('reviews.read', activity_id));

CREATE POLICY "Roles can insert reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('reviews.respond', activity_id));

CREATE POLICY "Roles can update reviews"
  ON public.reviews FOR UPDATE TO authenticated
  USING       (public.has_permission('reviews.respond', activity_id))
  WITH CHECK  (public.has_permission('reviews.respond', activity_id));

CREATE POLICY "Roles can delete reviews"
  ON public.reviews FOR DELETE TO authenticated
  USING (public.has_permission('reviews.respond', activity_id));

-- -----------------------------------------------------------------------------
-- C16. featured_contents — tenant-only column.
--      Read = anyone in tenant (all 5 roles hold featured.read).
--      Write = featured.write held via any role in tenant.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.featured_contents;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.featured_contents;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.featured_contents;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.featured_contents;

CREATE POLICY "Roles can read featured_contents"
  ON public.featured_contents FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Roles can insert featured_contents"
  ON public.featured_contents FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('featured.write', tenant_id)
  );

CREATE POLICY "Roles can update featured_contents"
  ON public.featured_contents FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('featured.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('featured.write', tenant_id)
  );

CREATE POLICY "Roles can delete featured_contents"
  ON public.featured_contents FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('featured.write', tenant_id)
  );

-- -----------------------------------------------------------------------------
-- C17. schedule_featured_contents — tenant-only column.
--      Read = scheduling.read via any role. Write = scheduling.write via any role.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.schedule_featured_contents;

CREATE POLICY "Roles can read schedule_featured_contents"
  ON public.schedule_featured_contents FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.read', tenant_id)
  );

CREATE POLICY "Roles can insert schedule_featured_contents"
  ON public.schedule_featured_contents FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

CREATE POLICY "Roles can update schedule_featured_contents"
  ON public.schedule_featured_contents FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

CREATE POLICY "Roles can delete schedule_featured_contents"
  ON public.schedule_featured_contents FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

-- -----------------------------------------------------------------------------
-- C18. schedules — tenant-only column. Read filtered per-target for
--      activity-scoped roles; write gated by scheduling.write any-activity.
--      Granular "all targets are mine" enforcement on write delegated to
--      RPC update_schedule_with_targets() in Fase 3.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own rows" ON public.schedules;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.schedules;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.schedules;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.schedules;

CREATE POLICY "Roles can read schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND (
      -- Owner/admin see all schedules of their tenant
      public.has_permission('scheduling.read', NULL)
      OR (
        -- Activity-scoped: must hold scheduling.read in tenant AND
        -- the schedule must either apply_to_all or touch one of their activities
        public.has_permission_any_activity('scheduling.read', schedules.tenant_id)
        AND (
          schedules.apply_to_all = true
          OR EXISTS (
            SELECT 1
            FROM public.schedule_targets st
            WHERE st.schedule_id = schedules.id
              AND (
                (st.target_type = 'activity'
                  AND public.has_permission('scheduling.read', st.target_id))
                OR (st.target_type = 'activity_group' AND EXISTS (
                  SELECT 1 FROM public.activity_group_members agm
                  WHERE agm.group_id = st.target_id
                    AND public.has_permission('scheduling.read', agm.activity_id)
                ))
              )
          )
        )
      )
    )
  );

CREATE POLICY "Roles can insert schedules"
  ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

-- NOTE: row-level "all targets are mine" enforcement on UPDATE/DELETE belongs
-- to RPC update_schedule_with_targets() in Fase 3. Here we gate by
-- scheduling.write held anywhere in the tenant (defense in depth at table
-- level; finer granularity at RPC).
CREATE POLICY "Roles can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

CREATE POLICY "Roles can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('scheduling.write', tenant_id)
  );

-- -----------------------------------------------------------------------------
-- C19. schedule_targets — no tenant_id. Per-target read; write blocked.
--      WRITE delegated to RPC update_schedule_with_targets() in Fase 3:
--      that RPC enforces "all resolved activity targets are mine" which is
--      too complex for a pure RLS policy.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Tenant select own schedule targets" ON public.schedule_targets;
DROP POLICY IF EXISTS "Tenant insert own schedule targets" ON public.schedule_targets;
DROP POLICY IF EXISTS "Tenant update own schedule targets" ON public.schedule_targets;
DROP POLICY IF EXISTS "Tenant delete own schedule targets" ON public.schedule_targets;

CREATE POLICY "Roles can read schedule_targets"
  ON public.schedule_targets FOR SELECT TO authenticated
  USING (
    -- Owner/admin in the schedule's tenant see all targets
    EXISTS (
      SELECT 1 FROM public.schedules s
      WHERE s.id = schedule_targets.schedule_id
        AND s.tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission('scheduling.read', NULL)
    )
    OR
    -- Activity-scoped roles see a target if it resolves to one of their activities
    (
      schedule_targets.target_type = 'activity'
      AND public.has_permission('scheduling.read', schedule_targets.target_id)
    )
    OR (
      schedule_targets.target_type = 'activity_group'
      AND EXISTS (
        SELECT 1 FROM public.activity_group_members agm
        WHERE agm.group_id = schedule_targets.target_id
          AND public.has_permission('scheduling.read', agm.activity_id)
      )
    )
  );

CREATE POLICY "No direct writes to schedule_targets"
  ON public.schedule_targets FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON POLICY "No direct writes to schedule_targets" ON public.schedule_targets IS
  'Direct INSERT/UPDATE/DELETE are blocked. Use RPC '
  'update_schedule_with_targets() (Fase 3) which enforces the business '
  'rule that all resolved activity targets must belong to the caller.';

COMMIT;
