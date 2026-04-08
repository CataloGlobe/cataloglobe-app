-- =============================================================================
-- Public read policies for all tables queried by the public catalog resolver
-- =============================================================================
--
-- The TypeScript resolver (resolveActivityCatalogs + scheduleResolver) uses the
-- anon Supabase client for direct table queries — not SECURITY DEFINER RPCs.
-- This migration adds the missing public SELECT policies so the public catalog
-- page (/:slug) works for unauthenticated visitors.
--
-- Pattern (tables with tenant_id):
--   TO public USING (tenant_id IN (SELECT public.get_public_tenant_ids()))
--   get_public_tenant_ids() is SECURITY DEFINER → safe for anon, no auth.uid()
--   dependency. Returns only non-deleted tenant IDs.
--
-- Pattern (tables without tenant_id):
--   TO public USING (EXISTS (SELECT 1 FROM parent WHERE ...))
--
-- NOT modified: any existing policy on any table.
-- NOT added:    insert / update / delete policies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. catalogs
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql
-- Never re-added after 20260317120000_rename_v2_tables.sql

DROP POLICY IF EXISTS "Public can read catalogs" ON public.catalogs;

CREATE POLICY "Public can read catalogs"
  ON public.catalogs
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 2. catalog_categories
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read catalog_categories" ON public.catalog_categories;

CREATE POLICY "Public can read catalog_categories"
  ON public.catalog_categories
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 3. catalog_category_products
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read catalog_category_products" ON public.catalog_category_products;

CREATE POLICY "Public can read catalog_category_products"
  ON public.catalog_category_products
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 4. product_option_groups
-- ---------------------------------------------------------------------------
-- Never had a public read policy (created after the original public_read_policies
-- migration; only authenticated policies were added via the phase2 dynamic block).

DROP POLICY IF EXISTS "Public can read product_option_groups" ON public.product_option_groups;

CREATE POLICY "Public can read product_option_groups"
  ON public.product_option_groups
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 5. product_option_values
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public can read product_option_values" ON public.product_option_values;

CREATE POLICY "Public can read product_option_values"
  ON public.product_option_values
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 6. schedules
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql

DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;

CREATE POLICY "Public can read schedules"
  ON public.schedules
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 7. schedule_layout
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql (as "Public can read v2_schedule_layout")

DROP POLICY IF EXISTS "Public can read schedule_layout" ON public.schedule_layout;

CREATE POLICY "Public can read schedule_layout"
  ON public.schedule_layout
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 8. schedule_price_overrides
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql

DROP POLICY IF EXISTS "Public can read schedule_price_overrides" ON public.schedule_price_overrides;

CREATE POLICY "Public can read schedule_price_overrides"
  ON public.schedule_price_overrides
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 9. styles
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql

DROP POLICY IF EXISTS "Public can read styles" ON public.styles;

CREATE POLICY "Public can read styles"
  ON public.styles
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 10. style_versions
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql

DROP POLICY IF EXISTS "Public can read style_versions" ON public.style_versions;

CREATE POLICY "Public can read style_versions"
  ON public.style_versions
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 11. featured_contents
-- ---------------------------------------------------------------------------
-- Dropped by: 20260227203000_v2_rls_tighten_public_reads.sql
-- Queried as a nested join from schedule_featured_contents (which already has
-- its own public read policy via 20260407150000_schedule_featured_contents_rls).

DROP POLICY IF EXISTS "Public can read featured_contents" ON public.featured_contents;

CREATE POLICY "Public can read featured_contents"
  ON public.featured_contents
  FOR SELECT TO public
  USING (tenant_id IN (SELECT public.get_public_tenant_ids()));


-- ---------------------------------------------------------------------------
-- 12. schedule_targets  (no tenant_id — derive via parent schedule)
-- ---------------------------------------------------------------------------
-- RLS was enabled and authenticated-only policies were added by
-- 20260309100000_v2_phase2_rls_multi_tenant.sql. No public read was ever added.

DROP POLICY IF EXISTS "Public can read schedule_targets" ON public.schedule_targets;

CREATE POLICY "Public can read schedule_targets"
  ON public.schedule_targets
  FOR SELECT TO public
  USING (
    schedule_id IN (
      SELECT id FROM public.schedules
      WHERE tenant_id IN (SELECT public.get_public_tenant_ids())
    )
  );


-- ---------------------------------------------------------------------------
-- 13. activity_product_overrides  (no tenant_id — derive via parent activity)
-- ---------------------------------------------------------------------------
-- tenant_id was dropped by 20260318010000_drop_activity_product_overrides_tenant_id.sql.
-- Only authenticated EXISTS-based policies remain (20260318000000).

DROP POLICY IF EXISTS "Public can read activity_product_overrides" ON public.activity_product_overrides;

CREATE POLICY "Public can read activity_product_overrides"
  ON public.activity_product_overrides
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_product_overrides.activity_id
        AND a.tenant_id IN (SELECT public.get_public_tenant_ids())
    )
  );


-- ---------------------------------------------------------------------------
-- Validation: confirm all 13 policies now exist
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ')
  INTO missing
  FROM (VALUES
    ('catalogs',                    'Public can read catalogs'),
    ('catalog_categories',          'Public can read catalog_categories'),
    ('catalog_category_products',   'Public can read catalog_category_products'),
    ('product_option_groups',       'Public can read product_option_groups'),
    ('product_option_values',       'Public can read product_option_values'),
    ('schedules',                   'Public can read schedules'),
    ('schedule_layout',             'Public can read schedule_layout'),
    ('schedule_price_overrides',    'Public can read schedule_price_overrides'),
    ('styles',                      'Public can read styles'),
    ('style_versions',              'Public can read style_versions'),
    ('featured_contents',           'Public can read featured_contents'),
    ('schedule_targets',            'Public can read schedule_targets'),
    ('activity_product_overrides',  'Public can read activity_product_overrides')
  ) AS expected(t, p)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = t
      AND policyname = p
      AND cmd        = 'SELECT'
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: policies not found for: %', missing;
  END IF;

  RAISE NOTICE 'OK: all 13 public read policies confirmed.';
END $$;


COMMIT;
