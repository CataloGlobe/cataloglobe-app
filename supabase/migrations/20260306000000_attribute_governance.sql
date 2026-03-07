-- Attribute Governance: platform-level attributes + governance fields
-- Step P4: schema changes
-- Step P5: RLS update

-- Allow platform-level attributes (tenant_id = NULL)
ALTER TABLE v2_product_attribute_definitions
    ALTER COLUMN tenant_id DROP NOT NULL;

-- Add governance columns
ALTER TABLE v2_product_attribute_definitions
    ADD COLUMN sort_order INT NOT NULL DEFAULT 0,
    ADD COLUMN show_in_public_channels BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN applies_to_variants BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN inherit_to_variants_by_default BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN product_type TEXT NULL;

-- Unique index: platform-level attribute codes must be globally unique
CREATE UNIQUE INDEX uq_platform_attr_code
    ON v2_product_attribute_definitions (code)
    WHERE tenant_id IS NULL;

-- Update RLS SELECT policy to include platform attributes (tenant_id IS NULL)
DROP POLICY IF EXISTS "tenant_select_attribute_definitions" ON v2_product_attribute_definitions;

CREATE POLICY "tenant_select_attribute_definitions"
    ON v2_product_attribute_definitions
    FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = auth.uid()
    );
