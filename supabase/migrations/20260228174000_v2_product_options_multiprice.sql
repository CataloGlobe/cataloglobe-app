-- =========================================
-- V2 Product Options: Multiprezzo extension
-- Adds group_kind (PRIMARY_PRICE | ADDON) and pricing_mode (ABSOLUTE | DELTA)
-- to v2_product_option_groups, and absolute_price to v2_product_option_values.
-- Existing data: all rows default to group_kind='ADDON', pricing_mode='DELTA' — non-breaking.
-- =========================================

BEGIN;

-- 1) Extend option groups
ALTER TABLE public.v2_product_option_groups
  ADD COLUMN IF NOT EXISTS group_kind text NOT NULL DEFAULT 'ADDON'
    CHECK (group_kind IN ('PRIMARY_PRICE', 'ADDON')),
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'DELTA'
    CHECK (pricing_mode IN ('ABSOLUTE', 'DELTA'));

-- 2) Extend option values with absolute price
ALTER TABLE public.v2_product_option_values
  ADD COLUMN IF NOT EXISTS absolute_price numeric(10,2) NULL;

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_v2_option_groups_tenant_product_kind
  ON public.v2_product_option_groups (tenant_id, product_id, group_kind);

CREATE INDEX IF NOT EXISTS idx_v2_option_values_tenant_group
  ON public.v2_product_option_values (tenant_id, option_group_id);

COMMIT;
