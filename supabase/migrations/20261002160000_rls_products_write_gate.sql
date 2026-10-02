-- Prodotti: le scritture dirette chiedono products.write (PR di sicurezza 1/5).
--
-- Fino a qui INSERT/UPDATE/DELETE su queste tabelle controllavano solo
-- tenant_id IN get_my_tenant_ids(): ogni membro dell'azienda, viewer di una
-- sede compreso, poteva scriverle via PostgREST scavalcando il gate della UI
-- (Products.tsx / ProductPage.tsx: canDoOnTenant(perms, 'products.write')).
-- Stesso modello di products (20260720130000): AND
-- has_permission_any_activity('products.write', tenant_id). products.write è
-- scope tenant, seminato per owner e admin.
--
-- Policy tolte per nome:
--   - base "Tenant insert/update/delete own rows" (ciclo di 20260309100000;
--     product_pairings 20260704120000)
--   - product_allergens: i doppioni "Tenants can insert/update/delete their
--     own product allergens" (20260410130000)
--   - product_characteristic_assignments: "Tenant insert/update/delete own
--     characteristic assignments" (20260430150000)
-- e ricreate con i nomi base. SELECT, policy di service_role e policy
-- RESTRICTIVE ("Parent same tenant on …") non toccate.

-- ingredients
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.ingredients;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.ingredients;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.ingredients;
CREATE POLICY "Tenant insert own rows"
  ON public.ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.ingredients
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
CREATE POLICY "Tenant delete own rows"
  ON public.ingredients
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_ingredients
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_ingredients;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_ingredients;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_ingredients;
CREATE POLICY "Tenant insert own rows"
  ON public.product_ingredients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_ingredients
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_ingredients
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_allergens
DROP POLICY IF EXISTS "Tenants can insert their own product allergens" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can update their own product allergens" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenants can delete their own product allergens" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_allergens;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_allergens;
CREATE POLICY "Tenant insert own rows"
  ON public.product_allergens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_allergens
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_allergens
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_characteristic_assignments
DROP POLICY IF EXISTS "Tenant insert own characteristic assignments" ON public.product_characteristic_assignments;
DROP POLICY IF EXISTS "Tenant update own characteristic assignments" ON public.product_characteristic_assignments;
DROP POLICY IF EXISTS "Tenant delete own characteristic assignments" ON public.product_characteristic_assignments;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_characteristic_assignments;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_characteristic_assignments;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_characteristic_assignments;
CREATE POLICY "Tenant insert own rows"
  ON public.product_characteristic_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_characteristic_assignments
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_characteristic_assignments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_pairings
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_pairings;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_pairings;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_pairings;
CREATE POLICY "Tenant insert own rows"
  ON public.product_pairings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_pairings
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_pairings
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_groups
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_groups;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_groups;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_groups;
CREATE POLICY "Tenant insert own rows"
  ON public.product_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_groups
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_groups
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_group_items
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_group_items;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_group_items;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_group_items;
CREATE POLICY "Tenant insert own rows"
  ON public.product_group_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_group_items
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_group_items
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_option_groups
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_option_groups;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_option_groups;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_option_groups;
CREATE POLICY "Tenant insert own rows"
  ON public.product_option_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_option_groups
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_option_groups
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_option_values
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_option_values;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_option_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_option_values;
CREATE POLICY "Tenant insert own rows"
  ON public.product_option_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_option_values
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_option_values
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );

-- product_attribute_values
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_attribute_values;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_attribute_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_attribute_values;
CREATE POLICY "Tenant insert own rows"
  ON public.product_attribute_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
  );
CREATE POLICY "Tenant update own rows"
  ON public.product_attribute_values
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
CREATE POLICY "Tenant delete own rows"
  ON public.product_attribute_values
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT public.get_my_tenant_ids())
    AND public.has_permission_any_activity('products.write', tenant_id)
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
    AND p.tablename = ANY (ARRAY['ingredients', 'product_ingredients', 'product_allergens', 'product_characteristic_assignments', 'product_pairings', 'product_groups', 'product_group_items', 'product_option_groups', 'product_option_values', 'product_attribute_values'])
    AND p.permissive = 'PERMISSIVE'
    AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (p.roles && ARRAY['authenticated', 'public']::name[])
    AND p.policyname NOT IN ('Tenant insert own rows', 'Tenant update own rows', 'Tenant delete own rows');
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Policy di scrittura residue: %', v_leftover;
  END IF;
END $$;
