-- =============================================================================
-- Public read access for product attribute tables
-- =============================================================================
--
-- product_attribute_definitions and product_attribute_values had their public
-- SELECT policies dropped by 20260227203000 (tighten public reads). They were
-- never re-added, so anon callers (public catalog visitors) get empty arrays
-- for all attribute data.
--
-- Fix: add public SELECT policies following the same pattern used for other
-- catalog tables (get_public_tenant_ids() SECURITY DEFINER function).
-- product_attribute_definitions also allows NULL tenant_id (platform attrs).
-- =============================================================================

BEGIN;

-- product_attribute_definitions
DROP POLICY IF EXISTS "Public can read product_attribute_definitions"
  ON public.product_attribute_definitions;

CREATE POLICY "Public can read product_attribute_definitions"
  ON public.product_attribute_definitions
  FOR SELECT
  TO public
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT public.get_public_tenant_ids())
  );

-- product_attribute_values
DROP POLICY IF EXISTS "Public can read product_attribute_values"
  ON public.product_attribute_values;

CREATE POLICY "Public can read product_attribute_values"
  ON public.product_attribute_values
  FOR SELECT
  TO public
  USING (
    tenant_id IN (SELECT public.get_public_tenant_ids())
  );

COMMIT;
