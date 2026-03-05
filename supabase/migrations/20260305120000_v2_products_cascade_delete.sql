BEGIN;

-- =========================================
-- Convert FK constraints on v2_products to ON DELETE CASCADE
-- Enables full cascade delete of products and all dependencies
-- =========================================

-- 1. v2_featured_content_products.product_id: RESTRICT → CASCADE
ALTER TABLE public.v2_featured_content_products
  DROP CONSTRAINT v2_featured_content_products_product_id_fkey,
  ADD CONSTRAINT v2_featured_content_products_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES public.v2_products(id)
    ON DELETE CASCADE;

-- 2. v2_products.parent_product_id: RESTRICT → CASCADE
--    Deleting a parent product now cascades to all its variants.
ALTER TABLE public.v2_products
  DROP CONSTRAINT v2_products_parent_product_id_fkey,
  ADD CONSTRAINT v2_products_parent_product_id_fkey
    FOREIGN KEY (parent_product_id)
    REFERENCES public.v2_products(id)
    ON DELETE CASCADE;

COMMIT;
