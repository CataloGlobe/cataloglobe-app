-- Fix: products INSERT/UPDATE/DELETE policies gate solo su
-- tenant_id IN get_my_tenant_ids() — qualsiasi membro del tenant (viewer
-- incluso) puo' scrivere prodotti via PostgREST diretto, bypassando il gate
-- UI (Products.tsx usa canDoOnTenant(perms, 'products.write')).
--
-- products.write e' scope='tenant', seedato solo per owner+admin in
-- role_permissions. Fix: AND has_permission_any_activity('products.write',
-- tenant_id) al gate esistente (pura restrizione, gate tenant non toccato).
-- Forma bare has_permission(perm, NULL) NON usata: riaprirebbe l'escalation
-- cross-tenant (owner di un tenant A otterrebbe TRUE anche su un tenant B
-- dove non ha ruolo alto). Pattern gia' usato in 20260718171757 (storage
-- write-gate) e 20260720120000 (tenant.manage RPC).
--
-- SELECT non toccata.

DROP POLICY IF EXISTS "Tenant insert own products" ON public.products;
CREATE POLICY "Tenant insert own products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

DROP POLICY IF EXISTS "Tenant update own products" ON public.products;
CREATE POLICY "Tenant update own products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

DROP POLICY IF EXISTS "Tenant delete own products" ON public.products;
CREATE POLICY "Tenant delete own products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
