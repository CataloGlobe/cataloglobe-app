-- Migration: product_type column on products (corrective, idempotent)
--
-- The previous migration (20260327100000) used legacy table names (v2_products,
-- v2_product_option_groups). This migration targets the live table names and is
-- safe to run regardless of current database state.

-- 1. Add column (no-op if already exists)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'simple';

-- 2. Add check constraint (no-op if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_product_type_check'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_product_type_check
      CHECK (product_type IN ('simple', 'formats', 'configurable'));
  END IF;
END;
$$;

-- 3. Back-fill: only touches rows still set to the default 'simple'
--    so re-running this on an already-migrated DB is safe.
--    PRIMARY_PRICE takes priority over ADDON when both exist.
UPDATE products p
SET product_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM product_option_groups og
    WHERE og.product_id = p.id AND og.group_kind = 'PRIMARY_PRICE'
  ) THEN 'formats'
  WHEN EXISTS (
    SELECT 1 FROM product_option_groups og
    WHERE og.product_id = p.id AND og.group_kind = 'ADDON'
  ) THEN 'configurable'
  ELSE 'simple'
END
WHERE p.product_type = 'simple';
