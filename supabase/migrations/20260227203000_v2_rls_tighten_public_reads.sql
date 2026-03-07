-- =========================================
-- V2: Tighten public reads + fix tenant policies roles
-- - Remove dangerous public SELECT policies on tenant-owned tables
-- - Keep v2_allergens public read (system)
-- - Ensure tenant manage policies target authenticated (not public)
-- =========================================

BEGIN;

-- 0) v2_allergens: keep ONLY ONE public-read policy (remove duplicates)
DROP POLICY IF EXISTS "System allergens are readable by everyone" ON public.v2_allergens;
-- (We keep "Public can read v2_allergens" created in Step 15)

-- 1) Drop "Public can read ..." policies that expose tenant data
--    (We'll replace public access with a dedicated RPC in Step 18)
DROP POLICY IF EXISTS "Public can read v2_activity_group_members" ON public.v2_activity_group_members;
DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.v2_activity_groups;

DROP POLICY IF EXISTS "Public can read v2_catalog_categories" ON public.v2_catalog_categories;
DROP POLICY IF EXISTS "Public can read v2_catalog_category_products" ON public.v2_catalog_category_products;
DROP POLICY IF EXISTS "Public can read v2_catalogs" ON public.v2_catalogs;

DROP POLICY IF EXISTS "Public can read v2_featured_contents" ON public.v2_featured_contents;

DROP POLICY IF EXISTS "Public can read v2_product_allergens" ON public.v2_product_allergens;
DROP POLICY IF EXISTS "Public can read v2_product_attribute_definitions" ON public.v2_product_attribute_definitions;
DROP POLICY IF EXISTS "Public can read v2_product_attribute_values" ON public.v2_product_attribute_values;

DROP POLICY IF EXISTS "Public can read v2_products" ON public.v2_products;

DROP POLICY IF EXISTS "Public can read v2_schedule_featured_contents" ON public.v2_schedule_featured_contents;
DROP POLICY IF EXISTS "Public can read v2_schedule_layout" ON public.v2_schedule_layout;
DROP POLICY IF EXISTS "Public can read v2_schedule_price_overrides" ON public.v2_schedule_price_overrides;
DROP POLICY IF EXISTS "Public can read v2_schedule_visibility_overrides" ON public.v2_schedule_visibility_overrides;
DROP POLICY IF EXISTS "Public can read v2_schedules" ON public.v2_schedules;

DROP POLICY IF EXISTS "Public can read v2_style_versions" ON public.v2_style_versions;
DROP POLICY IF EXISTS "Public can read v2_styles" ON public.v2_styles;

-- 2) Fix legacy tenant manage policies that were mistakenly TO public
--    We drop them and rely on the standardized policies created in Step 15 ("Tenant * own rows" to authenticated).
--    This prevents duplicate/overlapping policies and tightens role scope.

-- catalog_categories
DROP POLICY IF EXISTS "Tenants can manage their own catalog categories" ON public.v2_catalog_categories;

-- catalog_category_products
DROP POLICY IF EXISTS "Tenants can manage their own catalog category products" ON public.v2_catalog_category_products;

-- catalogs
DROP POLICY IF EXISTS "Tenants can manage their own catalogs" ON public.v2_catalogs;

-- product_allergens
DROP POLICY IF EXISTS "Tenants can manage their own product allergens" ON public.v2_product_allergens;

-- product_attribute_definitions
DROP POLICY IF EXISTS "Tenants can manage their own attribute definitions" ON public.v2_product_attribute_definitions;

-- product_attribute_values
DROP POLICY IF EXISTS "Tenants can manage their own product attribute values" ON public.v2_product_attribute_values;

-- product_groups / items / options (ALL policies)
DROP POLICY IF EXISTS "Tenants can manage their own product group items" ON public.v2_product_group_items;
DROP POLICY IF EXISTS "Tenants can manage their own product groups" ON public.v2_product_groups;
DROP POLICY IF EXISTS "Tenants can manage their own product option groups" ON public.v2_product_option_groups;
DROP POLICY IF EXISTS "Tenants can manage their own product option values" ON public.v2_product_option_values;

-- 3) ingredients/product_ingredients: you had fine-grained policies TO public; drop them and rely on standard authenticated policies
DROP POLICY IF EXISTS "Tenant can delete own ingredients" ON public.v2_ingredients;
DROP POLICY IF EXISTS "Tenant can insert own ingredients" ON public.v2_ingredients;
DROP POLICY IF EXISTS "Tenant can read own ingredients" ON public.v2_ingredients;
DROP POLICY IF EXISTS "Tenant can update own ingredients" ON public.v2_ingredients;

DROP POLICY IF EXISTS "Tenant can delete own product ingredients" ON public.v2_product_ingredients;
DROP POLICY IF EXISTS "Tenant can insert own product ingredients" ON public.v2_product_ingredients;
DROP POLICY IF EXISTS "Tenant can read own product ingredients" ON public.v2_product_ingredients;
DROP POLICY IF EXISTS "Tenant can update own product ingredients" ON public.v2_product_ingredients;

COMMIT;