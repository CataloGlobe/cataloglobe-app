-- =========================================================================
-- Fix unique constraint on catalog_category_products
--
-- The original table was created with:
--   UNIQUE(category_id, product_id)
-- which conflicts with the new variant model that allows:
--   (P, null)  — parent row
--   (P, V1)    — variant row
-- to coexist in the same category.
--
-- The previous migration (20260330100000) created partial indexes on the
-- same table but they may not have been applied. This migration drops the
-- old constraint and recreates the correct partial indexes.
-- =========================================================================

-- 1. Drop the old broad unique constraint (no-op if already dropped)
ALTER TABLE public.catalog_category_products
  DROP CONSTRAINT IF EXISTS catalog_category_products_category_id_product_id_key;

-- 2. Drop partial indexes in case of partial previous application
DROP INDEX IF EXISTS public.uq_ccp_parent;
DROP INDEX IF EXISTS public.uq_ccp_variant;

-- 3. Recreate partial indexes on catalog_category_products
--
--    Parent row: only one (category, product) pair where variant_product_id IS NULL
CREATE UNIQUE INDEX uq_ccp_parent
  ON public.catalog_category_products(catalog_id, category_id, product_id)
  WHERE variant_product_id IS NULL;

--    Variant row: only one (category, product, variant) triplet where variant_product_id IS NOT NULL
CREATE UNIQUE INDEX uq_ccp_variant
  ON public.catalog_category_products(catalog_id, category_id, product_id, variant_product_id)
  WHERE variant_product_id IS NOT NULL;
