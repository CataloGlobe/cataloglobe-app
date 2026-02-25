-- =========================================================================
-- V2 Public Read Policies
-- Allows the public collection page to read the required data for rendering.
-- =========================================================================

-- v2_catalogs
DROP POLICY IF EXISTS "Public can read v2_catalogs" ON public.v2_catalogs;
CREATE POLICY "Public can read v2_catalogs" ON public.v2_catalogs FOR SELECT TO public USING (true);

-- v2_catalog_categories
DROP POLICY IF EXISTS "Public can read v2_catalog_categories" ON public.v2_catalog_categories;
CREATE POLICY "Public can read v2_catalog_categories" ON public.v2_catalog_categories FOR SELECT TO public USING (true);

-- v2_catalog_category_products
DROP POLICY IF EXISTS "Public can read v2_catalog_category_products" ON public.v2_catalog_category_products;
CREATE POLICY "Public can read v2_catalog_category_products" ON public.v2_catalog_category_products FOR SELECT TO public USING (true);

-- v2_products
DROP POLICY IF EXISTS "Public can read v2_products" ON public.v2_products;
CREATE POLICY "Public can read v2_products" ON public.v2_products FOR SELECT TO public USING (true);

-- v2_product_attribute_definitions
DROP POLICY IF EXISTS "Public can read v2_product_attribute_definitions" ON public.v2_product_attribute_definitions;
CREATE POLICY "Public can read v2_product_attribute_definitions" ON public.v2_product_attribute_definitions FOR SELECT TO public USING (true);

-- v2_product_attribute_values
DROP POLICY IF EXISTS "Public can read v2_product_attribute_values" ON public.v2_product_attribute_values;
CREATE POLICY "Public can read v2_product_attribute_values" ON public.v2_product_attribute_values FOR SELECT TO public USING (true);

-- v2_allergens
DROP POLICY IF EXISTS "Public can read v2_allergens" ON public.v2_allergens;
CREATE POLICY "Public can read v2_allergens" ON public.v2_allergens FOR SELECT TO public USING (true);

-- v2_product_allergens
DROP POLICY IF EXISTS "Public can read v2_product_allergens" ON public.v2_product_allergens;
CREATE POLICY "Public can read v2_product_allergens" ON public.v2_product_allergens FOR SELECT TO public USING (true);

-- v2_schedules
DROP POLICY IF EXISTS "Public can read v2_schedules" ON public.v2_schedules;
CREATE POLICY "Public can read v2_schedules" ON public.v2_schedules FOR SELECT TO public USING (true);

-- v2_schedule_layout
DROP POLICY IF EXISTS "Public can read v2_schedule_layout" ON public.v2_schedule_layout;
CREATE POLICY "Public can read v2_schedule_layout" ON public.v2_schedule_layout FOR SELECT TO public USING (true);

-- v2_featured_contents
DROP POLICY IF EXISTS "Public can read v2_featured_contents" ON public.v2_featured_contents;
CREATE POLICY "Public can read v2_featured_contents" ON public.v2_featured_contents FOR SELECT TO public USING (true);

-- v2_schedule_featured_contents
DROP POLICY IF EXISTS "Public can read v2_schedule_featured_contents" ON public.v2_schedule_featured_contents;
CREATE POLICY "Public can read v2_schedule_featured_contents" ON public.v2_schedule_featured_contents FOR SELECT TO public USING (true);

-- v2_styles
DROP POLICY IF EXISTS "Public can read v2_styles" ON public.v2_styles;
CREATE POLICY "Public can read v2_styles" ON public.v2_styles FOR SELECT TO public USING (true);

-- v2_style_versions
DROP POLICY IF EXISTS "Public can read v2_style_versions" ON public.v2_style_versions;
CREATE POLICY "Public can read v2_style_versions" ON public.v2_style_versions FOR SELECT TO public USING (true);

-- v2_schedule_price_overrides
DROP POLICY IF EXISTS "Public can read v2_schedule_price_overrides" ON public.v2_schedule_price_overrides;
CREATE POLICY "Public can read v2_schedule_price_overrides" ON public.v2_schedule_price_overrides FOR SELECT TO public USING (true);

-- v2_schedule_visibility_overrides
DROP POLICY IF EXISTS "Public can read v2_schedule_visibility_overrides" ON public.v2_schedule_visibility_overrides;
CREATE POLICY "Public can read v2_schedule_visibility_overrides" ON public.v2_schedule_visibility_overrides FOR SELECT TO public USING (true);

-- v2_activity_groups
DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.v2_activity_groups;
CREATE POLICY "Public can read v2_activity_groups" ON public.v2_activity_groups FOR SELECT TO public USING (true);

-- v2_activity_group_members
DROP POLICY IF EXISTS "Public can read v2_activity_group_members" ON public.v2_activity_group_members;
CREATE POLICY "Public can read v2_activity_group_members" ON public.v2_activity_group_members FOR SELECT TO public USING (true);
