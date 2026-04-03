-- =============================================================================
-- Pricing model cleanup — enforce single source of truth
--
-- Rules applied:
--   SIMPLE      → base_price only, no formats, no variants
--   FORMATS     → PRIMARY_PRICE group only, no base_price (formats are authoritative)
--   CONFIGURABLE→ variants only, no base_price (PRIMARY_PRICE groups on configurable
--                 products are intentionally kept — see note in 1c)
--   VARIANT     → always SIMPLE, no formats
--
-- Environment: staging — destructive cleanup is approved.
-- =============================================================================

DO $$
DECLARE
  affected INT;
BEGIN

  -- 1a. Remove PRIMARY_PRICE groups from variant products.
  -- Variants (parent_product_id IS NOT NULL) must always be SIMPLE.
  -- They can only carry base_price; format pricing on variants is never valid.
  DELETE FROM product_option_groups
  WHERE group_kind = 'PRIMARY_PRICE'
    AND product_id IN (
      SELECT id FROM products WHERE parent_product_id IS NOT NULL
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[cleanup] % PRIMARY_PRICE groups removed from variant products', affected;

  -- 1b. Nullify base_price on products that have PRIMARY_PRICE groups.
  -- STAGING ASSUMPTION: formats are considered authoritative over base_price.
  -- When both exist, base_price is ambiguous noise — the PRIMARY_PRICE group
  -- defines the real pricing structure for this product.
  UPDATE products p
  SET base_price = NULL, updated_at = NOW()
  WHERE base_price IS NOT NULL
    AND parent_product_id IS NULL
    AND EXISTS (
      SELECT 1 FROM product_option_groups g
      WHERE g.product_id = p.id AND g.group_kind = 'PRIMARY_PRICE'
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[cleanup] % base_prices nullified on format products (formats authoritative)', affected;

  -- 1c. PRIMARY_PRICE groups on configurable products are intentionally NOT removed.
  -- In staging we cannot guarantee that all variants carry valid prices.
  -- Keeping the formats on a configurable parent ensures the product retains
  -- visible pricing. The resolver handles this case correctly: when a configurable
  -- product has own PRIMARY_PRICE formats, from_price is derived from those formats
  -- rather than from variant prices (hasOwnFormats guard in resolveActivityCatalogs).

  -- 1d. Nullify base_price on configurable products (products that have child variants).
  -- Pricing for configurable products comes from variants (or their own formats per 1c),
  -- never from a direct base_price.
  UPDATE products p
  SET base_price = NULL, updated_at = NOW()
  WHERE base_price IS NOT NULL
    AND parent_product_id IS NULL
    AND EXISTS (
      SELECT 1 FROM products c WHERE c.parent_product_id = p.id
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[cleanup] % base_prices nullified on configurable products', affected;

  -- 1e. Recompute product_type for all base products based on actual data.
  -- Priority: configurable > formats > simple
  UPDATE products p
  SET product_type = (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM products c WHERE c.parent_product_id = p.id
      ) THEN 'configurable'
      WHEN EXISTS (
        SELECT 1 FROM product_option_groups g
        WHERE g.product_id = p.id AND g.group_kind = 'PRIMARY_PRICE'
      ) THEN 'formats'
      ELSE 'simple'
    END
  )
  WHERE parent_product_id IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[cleanup] product_type recomputed for % base products', affected;

  -- 1f. Force all variant products to product_type = 'simple'.
  -- Variants can only be simple; they have no sub-variants and no formats.
  UPDATE products
  SET product_type = 'simple'
  WHERE parent_product_id IS NOT NULL AND product_type != 'simple';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RAISE NOTICE '[cleanup] % variants reset to product_type=simple', affected;

END $$;

-- =============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- Run these after applying the migration — all three should return 0.
--
-- SELECT COUNT(*) FROM product_option_groups g
-- JOIN products p ON p.id = g.product_id
-- WHERE g.group_kind = 'PRIMARY_PRICE' AND p.parent_product_id IS NOT NULL;
--
-- SELECT COUNT(*) FROM products p
-- WHERE p.base_price IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM product_option_groups g
--     WHERE g.product_id = p.id AND g.group_kind = 'PRIMARY_PRICE'
--   );
--
-- SELECT COUNT(*) FROM products p
-- WHERE p.parent_product_id IS NULL
--   AND p.product_type != (
--     CASE
--       WHEN EXISTS (SELECT 1 FROM products c WHERE c.parent_product_id = p.id) THEN 'configurable'
--       WHEN EXISTS (SELECT 1 FROM product_option_groups g WHERE g.product_id = p.id AND g.group_kind = 'PRIMARY_PRICE') THEN 'formats'
--       ELSE 'simple'
--     END
--   );
-- =============================================================================
