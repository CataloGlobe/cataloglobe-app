-- =============================================================================
-- SECURITY — Difesa in profondità: filtro tenant esplicito sulle policy RLS
-- authenticated di orders / order_groups / order_items / customer_sessions.
--
-- Complementare al fix di has_permission (20260707120000). Anche se un futuro
-- bug in has_permission riaprisse il grant cross-tenant owner/admin, queste
-- policy negherebbero comunque righe di tenant a cui il chiamante non
-- appartiene, aggiungendo il predicato:
--     tenant_id IN (SELECT public.get_my_tenant_ids())
-- (per order_items, che non ha tenant_id proprio, il filtro è propagato
--  dentro la EXISTS sull'ordine parent: o.tenant_id IN (SELECT ...)).
--
-- Ambito: SELECT / UPDATE / DELETE authenticated (come da FASE 2b). Le policy
-- INSERT (WITH CHECK) sono già coperte dal fix a monte su has_permission;
-- la loro estensione DiD è lasciata come hardening opzionale successivo.
-- Le policy anon customer-facing ("Customer select/update own ...") NON sono
-- toccate: restano scoped via get_jwt_customer_session_id().
--
-- get_my_tenant_ids() è eseguibile da authenticated (verificato) e ritorna i
-- soli tenant di cui il chiamante è owner o membro attivo → un owner legittimo
-- sulla propria sede continua a passare senza regressioni.
--
-- ⚠️ APPLICARE VIA STUDIO SQL EDITOR (non `supabase db push`):
--    `db push` invia ogni file come singolo prepared statement → QUALUNQUE
--    file multi-comando fallisce con SQLSTATE 42601, non solo quelli con
--    FUNCTION/GRANT. Questo file ha ~24 statement (DROP+CREATE × 4 tabelle).
--    Applicare via Studio SQL Editor e poi registrare la migration in
--    supabase_migrations.schema_migrations. (Alternativa: spezzare in file
--    a comando singolo per `db push` — non adottata qui.)
--    Tutti i DROP usano IF EXISTS (idempotenza cross-env). I nomi delle policy
--    sono verificati 1:1 contro pg_policies live (2026-07-07).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Roles can read orders"   ON public.orders;
CREATE POLICY "Roles can read orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.has_permission('orders.read', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can update orders" ON public.orders;
CREATE POLICY "Roles can update orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  )
  WITH CHECK (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can delete orders" ON public.orders;
CREATE POLICY "Roles can delete orders"
  ON public.orders FOR DELETE TO authenticated
  USING (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

-- -----------------------------------------------------------------------------
-- order_groups
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Roles can read order_groups"   ON public.order_groups;
CREATE POLICY "Roles can read order_groups"
  ON public.order_groups FOR SELECT TO authenticated
  USING (
    public.has_permission('orders.read', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can update order_groups" ON public.order_groups;
CREATE POLICY "Roles can update order_groups"
  ON public.order_groups FOR UPDATE TO authenticated
  USING (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  )
  WITH CHECK (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can delete order_groups" ON public.order_groups;
CREATE POLICY "Roles can delete order_groups"
  ON public.order_groups FOR DELETE TO authenticated
  USING (
    public.has_permission('orders.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

-- -----------------------------------------------------------------------------
-- order_items — no tenant_id proprio: filtro propagato sull'ordine parent.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Roles can read order_items"   ON public.order_items;
CREATE POLICY "Roles can read order_items"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.read', o.activity_id)
        AND o.tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

DROP POLICY IF EXISTS "Roles can update order_items" ON public.order_items;
CREATE POLICY "Roles can update order_items"
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
        AND o.tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
        AND o.tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

DROP POLICY IF EXISTS "Roles can delete order_items" ON public.order_items;
CREATE POLICY "Roles can delete order_items"
  ON public.order_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.has_permission('orders.manage', o.activity_id)
        AND o.tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

-- -----------------------------------------------------------------------------
-- customer_sessions — gate tables.read / tables.manage (invariato) + tenant.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Roles can read customer_sessions"   ON public.customer_sessions;
CREATE POLICY "Roles can read customer_sessions"
  ON public.customer_sessions FOR SELECT TO authenticated
  USING (
    public.has_permission('tables.read', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can update customer_sessions" ON public.customer_sessions;
CREATE POLICY "Roles can update customer_sessions"
  ON public.customer_sessions FOR UPDATE TO authenticated
  USING (
    public.has_permission('tables.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  )
  WITH CHECK (
    public.has_permission('tables.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );

DROP POLICY IF EXISTS "Roles can delete customer_sessions" ON public.customer_sessions;
CREATE POLICY "Roles can delete customer_sessions"
  ON public.customer_sessions FOR DELETE TO authenticated
  USING (
    public.has_permission('tables.manage', activity_id)
    AND tenant_id IN (SELECT public.get_my_tenant_ids())
  );
