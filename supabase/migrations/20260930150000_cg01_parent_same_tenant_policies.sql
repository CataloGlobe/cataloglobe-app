-- =============================================================================
-- CG-01: una riga figlia o ponte deve puntare a parent dello stesso tenant.
-- =============================================================================
--
-- Problema: le policy INSERT/UPDATE delle tabelle figlie e ponte controllano
-- solo il tenant_id della riga nuova (tenant_id IN get_my_tenant_ids()), mai
-- il tenant del parent puntato dalla FK. Le FK non conoscono il tenant: chi è
-- membro di un'azienda può scrivere righe col proprio tenant_id agganciate a
-- catalogo, categoria, prodotto, formato, contenuto in evidenza o regola di
-- un'altra azienda. Il resolver pubblico (service_role) segue le FK e le
-- mostra nel menu dell'altra azienda; submit-order legge i formati via embed.
-- L'altra azienda non le vede né le cancella (RLS sul tenant_id della riga).
--
-- Soluzione: una policy RESTRICTIVE per INSERT e una per UPDATE su ogni
-- tabella. Le RESTRICTIVE vanno in AND con le PERMISSIVE esistenti, che
-- restano invariate (anche quelle duplicate, come su product_allergens).
-- Ogni FK verso un parent con tenant è verificata con EXISTS sul parent dello
-- stesso tenant. Forma unica "fk IS NULL OR EXISTS (...)": sulle FK NOT NULL
-- il ramo IS NULL non scatta mai, sulle nullable (parent_category_id,
-- variant_product_id, option_value_id, catalog_id del layout) lascia passare
-- l'assenza del parent.
--
-- Parent senza tenant: allergens e product_characteristics sono globali (non
-- verificati). product_attribute_definitions ha tenant_id NULL per gli
-- attributi di piattaforma: ammessi.
--
-- La subquery sul parent passa dalle policy SELECT del parent: un membro legge
-- i parent del proprio tenant (verificato su staging 2026-09-30), quindi i
-- flussi legittimi passano; un parent invisibile rende la EXISTS falsa
-- (fail-closed). Il confronto esplicito dei tenant_id resta necessario perché
-- products è leggibile oltre il tenant (CG-08).
--
-- Solo PostgREST: service_role bypassa RLS. Le RPC SECURITY DEFINER che
-- scrivono queste tabelle (replace_product_*, import_products_into_catalog)
-- verificano già il tenant dei parent (letto da pg_get_functiondef il
-- 2026-09-30).
--
-- Idempotente: DROP POLICY IF EXISTS prima di ogni CREATE.
-- Dati: 0 righe incoerenti su staging e prod (forensi batch 0).
-- =============================================================================

-- catalog_categories ---------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.catalog_categories;
CREATE POLICY "Parent same tenant on insert" ON public.catalog_categories
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (catalog_categories.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_categories.catalog_id AND p.tenant_id = catalog_categories.tenant_id))
    AND (catalog_categories.parent_category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalog_categories p
      WHERE p.id = catalog_categories.parent_category_id AND p.tenant_id = catalog_categories.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.catalog_categories;
CREATE POLICY "Parent same tenant on update" ON public.catalog_categories
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (catalog_categories.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_categories.catalog_id AND p.tenant_id = catalog_categories.tenant_id))
    AND (catalog_categories.parent_category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalog_categories p
      WHERE p.id = catalog_categories.parent_category_id AND p.tenant_id = catalog_categories.tenant_id))
  );

-- catalog_category_products --------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.catalog_category_products;
CREATE POLICY "Parent same tenant on insert" ON public.catalog_category_products
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (catalog_category_products.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_category_products.catalog_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalog_categories p
      WHERE p.id = catalog_category_products.category_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = catalog_category_products.product_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.variant_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = catalog_category_products.variant_product_id AND p.tenant_id = catalog_category_products.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.catalog_category_products;
CREATE POLICY "Parent same tenant on update" ON public.catalog_category_products
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (catalog_category_products.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_category_products.catalog_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalog_categories p
      WHERE p.id = catalog_category_products.category_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = catalog_category_products.product_id AND p.tenant_id = catalog_category_products.tenant_id))
    AND (catalog_category_products.variant_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = catalog_category_products.variant_product_id AND p.tenant_id = catalog_category_products.tenant_id))
  );

-- product_option_groups ------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_option_groups;
CREATE POLICY "Parent same tenant on insert" ON public.product_option_groups
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_option_groups.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_option_groups.product_id AND p.tenant_id = product_option_groups.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_option_groups;
CREATE POLICY "Parent same tenant on update" ON public.product_option_groups
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_option_groups.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_option_groups.product_id AND p.tenant_id = product_option_groups.tenant_id)
  );

-- product_option_values ------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_option_values;
CREATE POLICY "Parent same tenant on insert" ON public.product_option_values
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_option_values.option_group_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_option_groups p
      WHERE p.id = product_option_values.option_group_id AND p.tenant_id = product_option_values.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_option_values;
CREATE POLICY "Parent same tenant on update" ON public.product_option_values
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_option_values.option_group_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_option_groups p
      WHERE p.id = product_option_values.option_group_id AND p.tenant_id = product_option_values.tenant_id)
  );

-- product_allergens (allergens: globali) -------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_allergens;
CREATE POLICY "Parent same tenant on insert" ON public.product_allergens
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_allergens.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_allergens.product_id AND p.tenant_id = product_allergens.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_allergens;
CREATE POLICY "Parent same tenant on update" ON public.product_allergens
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_allergens.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_allergens.product_id AND p.tenant_id = product_allergens.tenant_id)
  );

-- product_ingredients --------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_ingredients;
CREATE POLICY "Parent same tenant on insert" ON public.product_ingredients
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (product_ingredients.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_ingredients.product_id AND p.tenant_id = product_ingredients.tenant_id))
    AND (product_ingredients.ingredient_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ingredients p
      WHERE p.id = product_ingredients.ingredient_id AND p.tenant_id = product_ingredients.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_ingredients;
CREATE POLICY "Parent same tenant on update" ON public.product_ingredients
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (product_ingredients.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_ingredients.product_id AND p.tenant_id = product_ingredients.tenant_id))
    AND (product_ingredients.ingredient_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ingredients p
      WHERE p.id = product_ingredients.ingredient_id AND p.tenant_id = product_ingredients.tenant_id))
  );

-- product_attribute_values (definizioni di piattaforma: tenant_id NULL) ------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_attribute_values;
CREATE POLICY "Parent same tenant on insert" ON public.product_attribute_values
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (product_attribute_values.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_attribute_values.product_id AND p.tenant_id = product_attribute_values.tenant_id))
    AND (product_attribute_values.attribute_definition_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_attribute_definitions p
      WHERE p.id = product_attribute_values.attribute_definition_id
        AND (p.tenant_id IS NULL OR p.tenant_id = product_attribute_values.tenant_id)))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_attribute_values;
CREATE POLICY "Parent same tenant on update" ON public.product_attribute_values
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (product_attribute_values.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_attribute_values.product_id AND p.tenant_id = product_attribute_values.tenant_id))
    AND (product_attribute_values.attribute_definition_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_attribute_definitions p
      WHERE p.id = product_attribute_values.attribute_definition_id
        AND (p.tenant_id IS NULL OR p.tenant_id = product_attribute_values.tenant_id)))
  );

-- product_characteristic_assignments (characteristics: globali) --------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_characteristic_assignments;
CREATE POLICY "Parent same tenant on insert" ON public.product_characteristic_assignments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_characteristic_assignments.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_characteristic_assignments.product_id
        AND p.tenant_id = product_characteristic_assignments.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_characteristic_assignments;
CREATE POLICY "Parent same tenant on update" ON public.product_characteristic_assignments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_characteristic_assignments.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_characteristic_assignments.product_id
        AND p.tenant_id = product_characteristic_assignments.tenant_id)
  );

-- featured_content_products --------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.featured_content_products;
CREATE POLICY "Parent same tenant on insert" ON public.featured_content_products
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (featured_content_products.featured_content_id IS NULL OR EXISTS (
      SELECT 1 FROM public.featured_contents p
      WHERE p.id = featured_content_products.featured_content_id AND p.tenant_id = featured_content_products.tenant_id))
    AND (featured_content_products.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = featured_content_products.product_id AND p.tenant_id = featured_content_products.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.featured_content_products;
CREATE POLICY "Parent same tenant on update" ON public.featured_content_products
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (featured_content_products.featured_content_id IS NULL OR EXISTS (
      SELECT 1 FROM public.featured_contents p
      WHERE p.id = featured_content_products.featured_content_id AND p.tenant_id = featured_content_products.tenant_id))
    AND (featured_content_products.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = featured_content_products.product_id AND p.tenant_id = featured_content_products.tenant_id))
  );

-- product_variant_assignments ------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_variant_assignments;
CREATE POLICY "Parent same tenant on insert" ON public.product_variant_assignments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (product_variant_assignments.parent_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_assignments.parent_product_id AND p.tenant_id = product_variant_assignments.tenant_id))
    AND (product_variant_assignments.variant_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_assignments.variant_product_id AND p.tenant_id = product_variant_assignments.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_variant_assignments;
CREATE POLICY "Parent same tenant on update" ON public.product_variant_assignments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (product_variant_assignments.parent_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_assignments.parent_product_id AND p.tenant_id = product_variant_assignments.tenant_id))
    AND (product_variant_assignments.variant_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_assignments.variant_product_id AND p.tenant_id = product_variant_assignments.tenant_id))
  );

-- product_variant_dimensions -------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_variant_dimensions;
CREATE POLICY "Parent same tenant on insert" ON public.product_variant_dimensions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_variant_dimensions.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_dimensions.product_id AND p.tenant_id = product_variant_dimensions.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_variant_dimensions;
CREATE POLICY "Parent same tenant on update" ON public.product_variant_dimensions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_variant_dimensions.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variant_dimensions.product_id AND p.tenant_id = product_variant_dimensions.tenant_id)
  );

-- product_variant_dimension_values -------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_variant_dimension_values;
CREATE POLICY "Parent same tenant on insert" ON public.product_variant_dimension_values
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    product_variant_dimension_values.dimension_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_variant_dimensions p
      WHERE p.id = product_variant_dimension_values.dimension_id
        AND p.tenant_id = product_variant_dimension_values.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_variant_dimension_values;
CREATE POLICY "Parent same tenant on update" ON public.product_variant_dimension_values
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    product_variant_dimension_values.dimension_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_variant_dimensions p
      WHERE p.id = product_variant_dimension_values.dimension_id
        AND p.tenant_id = product_variant_dimension_values.tenant_id)
  );

-- product_pairings -----------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.product_pairings;
CREATE POLICY "Parent same tenant on insert" ON public.product_pairings
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (product_pairings.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_pairings.product_id AND p.tenant_id = product_pairings.tenant_id))
    AND (product_pairings.paired_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_pairings.paired_product_id AND p.tenant_id = product_pairings.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.product_pairings;
CREATE POLICY "Parent same tenant on update" ON public.product_pairings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (product_pairings.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_pairings.product_id AND p.tenant_id = product_pairings.tenant_id))
    AND (product_pairings.paired_product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_pairings.paired_product_id AND p.tenant_id = product_pairings.tenant_id))
  );

-- schedule_layout ------------------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_layout;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_layout
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (schedule_layout.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_layout.schedule_id AND p.tenant_id = schedule_layout.tenant_id))
    AND (schedule_layout.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = schedule_layout.catalog_id AND p.tenant_id = schedule_layout.tenant_id))
    AND (schedule_layout.style_id IS NULL OR EXISTS (
      SELECT 1 FROM public.styles p
      WHERE p.id = schedule_layout.style_id AND p.tenant_id = schedule_layout.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_layout;
CREATE POLICY "Parent same tenant on update" ON public.schedule_layout
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (schedule_layout.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_layout.schedule_id AND p.tenant_id = schedule_layout.tenant_id))
    AND (schedule_layout.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = schedule_layout.catalog_id AND p.tenant_id = schedule_layout.tenant_id))
    AND (schedule_layout.style_id IS NULL OR EXISTS (
      SELECT 1 FROM public.styles p
      WHERE p.id = schedule_layout.style_id AND p.tenant_id = schedule_layout.tenant_id))
  );

-- schedule_price_overrides ---------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_price_overrides;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_price_overrides
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (schedule_price_overrides.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_price_overrides.schedule_id AND p.tenant_id = schedule_price_overrides.tenant_id))
    AND (schedule_price_overrides.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = schedule_price_overrides.product_id AND p.tenant_id = schedule_price_overrides.tenant_id))
    AND (schedule_price_overrides.option_value_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_option_values p
      WHERE p.id = schedule_price_overrides.option_value_id AND p.tenant_id = schedule_price_overrides.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_price_overrides;
CREATE POLICY "Parent same tenant on update" ON public.schedule_price_overrides
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (schedule_price_overrides.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_price_overrides.schedule_id AND p.tenant_id = schedule_price_overrides.tenant_id))
    AND (schedule_price_overrides.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = schedule_price_overrides.product_id AND p.tenant_id = schedule_price_overrides.tenant_id))
    AND (schedule_price_overrides.option_value_id IS NULL OR EXISTS (
      SELECT 1 FROM public.product_option_values p
      WHERE p.id = schedule_price_overrides.option_value_id AND p.tenant_id = schedule_price_overrides.tenant_id))
  );

-- schedule_visibility_overrides ----------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_visibility_overrides;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_visibility_overrides
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (schedule_visibility_overrides.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_visibility_overrides.schedule_id AND p.tenant_id = schedule_visibility_overrides.tenant_id))
    AND (schedule_visibility_overrides.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = schedule_visibility_overrides.product_id AND p.tenant_id = schedule_visibility_overrides.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_visibility_overrides;
CREATE POLICY "Parent same tenant on update" ON public.schedule_visibility_overrides
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (schedule_visibility_overrides.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_visibility_overrides.schedule_id AND p.tenant_id = schedule_visibility_overrides.tenant_id))
    AND (schedule_visibility_overrides.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = schedule_visibility_overrides.product_id AND p.tenant_id = schedule_visibility_overrides.tenant_id))
  );

-- schedule_featured_contents -------------------------------------------------
DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.schedule_featured_contents;
CREATE POLICY "Parent same tenant on insert" ON public.schedule_featured_contents
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (schedule_featured_contents.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_featured_contents.schedule_id AND p.tenant_id = schedule_featured_contents.tenant_id))
    AND (schedule_featured_contents.featured_content_id IS NULL OR EXISTS (
      SELECT 1 FROM public.featured_contents p
      WHERE p.id = schedule_featured_contents.featured_content_id AND p.tenant_id = schedule_featured_contents.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.schedule_featured_contents;
CREATE POLICY "Parent same tenant on update" ON public.schedule_featured_contents
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (schedule_featured_contents.schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.schedules p
      WHERE p.id = schedule_featured_contents.schedule_id AND p.tenant_id = schedule_featured_contents.tenant_id))
    AND (schedule_featured_contents.featured_content_id IS NULL OR EXISTS (
      SELECT 1 FROM public.featured_contents p
      WHERE p.id = schedule_featured_contents.featured_content_id AND p.tenant_id = schedule_featured_contents.tenant_id))
  );
