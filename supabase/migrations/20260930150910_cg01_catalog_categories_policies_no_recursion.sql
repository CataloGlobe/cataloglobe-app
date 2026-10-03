-- =============================================================================
-- CG-01: policy RESTRICTIVE di catalog_categories senza ricorsione (42P17).
-- =============================================================================
--
-- Ricrea le due policy "Parent same tenant on insert/update" di
-- catalog_categories (20260930150000): il controllo su parent_category_id
-- passa da public.catalog_category_in_tenant (20260930150900) invece che da un
-- EXISTS sulla tabella stessa. Il controllo su catalog_id resta un EXISTS su
-- catalogs, che non ha policy SELECT con sottoquery.
--
-- Le altre tabelle che puntano a catalog_categories (catalog_category_products)
-- restano come sono: la loro policy interroga catalog_categories, le cui
-- policy SELECT non interrogano catalog_category_products, quindi nessun ciclo.
--
-- Grant: la funzione serve ad authenticated (le policy sono TO authenticated
-- e girano coi privilegi del chiamante). Supabase dà EXECUTE di default a
-- PUBLIC, anon, authenticated e service_role: si toglie a PUBLIC e anon.
--
-- Idempotente: REVOKE/GRANT ripetibili, DROP POLICY IF EXISTS prima di ogni
-- CREATE.
-- =============================================================================

REVOKE ALL ON FUNCTION public.catalog_category_in_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_category_in_tenant(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.catalog_categories;
CREATE POLICY "Parent same tenant on insert" ON public.catalog_categories
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    (catalog_categories.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_categories.catalog_id AND p.tenant_id = catalog_categories.tenant_id))
    AND (catalog_categories.parent_category_id IS NULL
      OR public.catalog_category_in_tenant(catalog_categories.parent_category_id,
                                           catalog_categories.tenant_id))
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.catalog_categories;
CREATE POLICY "Parent same tenant on update" ON public.catalog_categories
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    (catalog_categories.catalog_id IS NULL OR EXISTS (
      SELECT 1 FROM public.catalogs p
      WHERE p.id = catalog_categories.catalog_id AND p.tenant_id = catalog_categories.tenant_id))
    AND (catalog_categories.parent_category_id IS NULL
      OR public.catalog_category_in_tenant(catalog_categories.parent_category_id,
                                           catalog_categories.tenant_id))
  );
