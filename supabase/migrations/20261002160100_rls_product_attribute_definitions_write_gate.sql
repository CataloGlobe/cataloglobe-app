-- product_attribute_definitions: le scritture chiedono attributes.write
-- (PR di sicurezza 1/5).
--
-- Come le altre tabelle di Prodotti (20261002160000), ma col permesso degli
-- attributi: la UI che le scrive è gated da attributes.write
-- (ProductsAttributesTab) o da products.write (ProductAttributesDrawer in
-- ProductPage); entrambi sono di owner e admin.
--
-- Righe di piattaforma (tenant_id NULL): restano non scrivibili da
-- authenticated. tenant_id IN (…) con tenant_id NULL non è mai vero, quindi
-- tutte e tre le policy le escludono, come prima (20260309100000, step 5).
-- La SELECT ("Tenant select own rows", con tenant_id IS NULL) e la policy di
-- service_role non si toccano.

-- product_attribute_definitions
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_attribute_definitions;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_attribute_definitions;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_attribute_definitions;
CREATE POLICY "Tenant insert own rows"
  ON public.product_attribute_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('attributes.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_attribute_definitions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('attributes.write', tenant_id)
  )
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('attributes.write', tenant_id)
  );
CREATE POLICY "Tenant delete own rows"
  ON public.product_attribute_definitions
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('attributes.write', tenant_id)
  );

-- Guardia: nessun'altra policy PERMISSIVE di scrittura per authenticated o
-- PUBLIC deve restare su queste tabelle (policy create a mano nello Studio con
-- un nome diverso terrebbero aperta la scrittura). Se ne trova, la migration
-- fallisce e la transazione torna indietro.
DO $$
DECLARE
  v_leftover text;
BEGIN
  SELECT string_agg(format('%s.%s (%s)', p.tablename, p.policyname, p.cmd), ', ')
  INTO v_leftover
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY (ARRAY['product_attribute_definitions'])
    AND p.permissive = 'PERMISSIVE'
    AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (p.roles && ARRAY['authenticated', 'public']::name[])
    AND p.policyname NOT IN ('Tenant insert own rows', 'Tenant update own rows', 'Tenant delete own rows');
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Policy di scrittura residue: %', v_leftover;
  END IF;
END $$;
