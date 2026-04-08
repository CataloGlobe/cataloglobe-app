-- =============================================================================
-- Drop the 13 anon SELECT policies added by 20260408220000
-- =============================================================================
--
-- These policies were added to allow the public catalog page to query tables
-- via the anon Supabase client. Now that the page uses the Edge Function
-- resolve-public-catalog (which runs with service_role), these policies are
-- no longer needed and represent unnecessary attack surface.
--
-- ONLY the 13 policies created in 20260408220000 are dropped here.
-- Pre-existing anon policies on other tables (activities, products, etc.)
-- are NOT affected.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Public can read catalogs" ON public.catalogs;
DROP POLICY IF EXISTS "Public can read catalog_categories" ON public.catalog_categories;
DROP POLICY IF EXISTS "Public can read catalog_category_products" ON public.catalog_category_products;
DROP POLICY IF EXISTS "Public can read product_option_groups" ON public.product_option_groups;
DROP POLICY IF EXISTS "Public can read product_option_values" ON public.product_option_values;
DROP POLICY IF EXISTS "Public can read schedules" ON public.schedules;
DROP POLICY IF EXISTS "Public can read schedule_layout" ON public.schedule_layout;
DROP POLICY IF EXISTS "Public can read schedule_price_overrides" ON public.schedule_price_overrides;
DROP POLICY IF EXISTS "Public can read styles" ON public.styles;
DROP POLICY IF EXISTS "Public can read style_versions" ON public.style_versions;
DROP POLICY IF EXISTS "Public can read featured_contents" ON public.featured_contents;
DROP POLICY IF EXISTS "Public can read schedule_targets" ON public.schedule_targets;
DROP POLICY IF EXISTS "Public can read activity_product_overrides" ON public.activity_product_overrides;

-- ---------------------------------------------------------------------------
-- Validation: confirm all 13 policies are gone
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  remaining text;
BEGIN
  SELECT string_agg(t || '.' || p, ', ')
  INTO remaining
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
  WHERE EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = t
      AND policyname = p
  );

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: policies still exist: %', remaining;
  END IF;

  RAISE NOTICE 'OK: all 13 anon SELECT policies successfully dropped.';
END $$;

COMMIT;
