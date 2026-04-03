-- =============================================================================
-- Public read access for product variant dimension tables
-- =============================================================================
--
-- The variant dimension tables (product_variant_dimensions, etc.) were created
-- with only authenticated-role policies (20260328100000). The public catalog
-- renderer uses the anon key, so dimension data was inaccessible to public
-- catalog visitors.
--
-- This migration adds public SELECT policies following the same pattern as
-- 20260317290000_fix_public_read_policies_activities.sql:
--   - USING (tenant_id IN (SELECT public.get_public_tenant_ids()))
--   - product_variant_assignment_values has no tenant_id → joins via assignments
-- =============================================================================

BEGIN;

-- product_variant_dimensions
DROP POLICY IF EXISTS "Public can read product_variant_dimensions"
  ON public.product_variant_dimensions;

CREATE POLICY "Public can read product_variant_dimensions"
  ON public.product_variant_dimensions
  FOR SELECT
  TO public
  USING (
    tenant_id IN (SELECT public.get_public_tenant_ids())
  );

-- product_variant_dimension_values
DROP POLICY IF EXISTS "Public can read product_variant_dimension_values"
  ON public.product_variant_dimension_values;

CREATE POLICY "Public can read product_variant_dimension_values"
  ON public.product_variant_dimension_values
  FOR SELECT
  TO public
  USING (
    tenant_id IN (SELECT public.get_public_tenant_ids())
  );

-- product_variant_assignments
DROP POLICY IF EXISTS "Public can read product_variant_assignments"
  ON public.product_variant_assignments;

CREATE POLICY "Public can read product_variant_assignments"
  ON public.product_variant_assignments
  FOR SELECT
  TO public
  USING (
    tenant_id IN (SELECT public.get_public_tenant_ids())
  );

-- product_variant_assignment_values (no tenant_id — join via assignments)
DROP POLICY IF EXISTS "Public can read product_variant_assignment_values"
  ON public.product_variant_assignment_values;

CREATE POLICY "Public can read product_variant_assignment_values"
  ON public.product_variant_assignment_values
  FOR SELECT
  TO public
  USING (
    assignment_id IN (
      SELECT id
      FROM public.product_variant_assignments
      WHERE tenant_id IN (SELECT public.get_public_tenant_ids())
    )
  );

COMMIT;
