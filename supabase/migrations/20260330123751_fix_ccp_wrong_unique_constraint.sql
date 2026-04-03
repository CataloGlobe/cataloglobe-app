-- =========================================================================
-- Drop wrong unique constraint blocking parent + variant coexistence
-- =========================================================================

ALTER TABLE public.catalog_category_products
DROP CONSTRAINT IF EXISTS v2_catalog_category_products_category_id_product_id_key;