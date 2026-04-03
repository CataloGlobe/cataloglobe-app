-- Add variant_product_id column (nullable — null means the parent itself is selected)
ALTER TABLE catalog_category_products
ADD COLUMN variant_product_id UUID
  REFERENCES products(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Partial unique index: only one parent row per (category, product)
CREATE UNIQUE INDEX uq_ccp_parent
  ON catalog_category_products(catalog_id, category_id, product_id)
  WHERE variant_product_id IS NULL;

-- Partial unique index: only one variant row per (category, product, variant)
CREATE UNIQUE INDEX uq_ccp_variant
  ON catalog_category_products(catalog_id, category_id, product_id, variant_product_id)
  WHERE variant_product_id IS NOT NULL;

-- Trigger: variant_product_id must be a direct child of product_id
CREATE OR REPLACE FUNCTION validate_ccp_variant_parent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variant_product_id IS NOT NULL THEN
    IF NEW.variant_product_id = NEW.product_id THEN
      RAISE EXCEPTION 'variant_product_id cannot be equal to product_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = NEW.variant_product_id
        AND parent_product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'variant_product_id % is not a variant of product_id %',
        NEW.variant_product_id, NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ccp_variant_parent
  BEFORE INSERT OR UPDATE ON catalog_category_products
  FOR EACH ROW EXECUTE FUNCTION validate_ccp_variant_parent();
