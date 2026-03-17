-- =============================================================================
-- Rename trigger functions: remove v2_ prefix from function names
--
-- Scope: public schema only. storage.search_v2 and any other non-public
-- functions are NOT touched.
--
-- PostgreSQL resolves trigger → function bindings by OID, so renaming a
-- function does not break any trigger that calls it. No trigger definitions
-- need to be updated.
--
-- Functions renamed:
--   trg_check_v2_product_group_depth       → trg_check_product_group_depth
--   trg_check_v2_product_group_items_tenant → trg_check_product_group_items_tenant
--   trg_check_v2_product_variant           → trg_check_product_variant
--   trg_v2_product_groups_updated_at       → trg_product_groups_updated_at
-- =============================================================================

ALTER FUNCTION public.trg_check_v2_product_group_depth()
    RENAME TO trg_check_product_group_depth;

ALTER FUNCTION public.trg_check_v2_product_group_items_tenant()
    RENAME TO trg_check_product_group_items_tenant;

ALTER FUNCTION public.trg_check_v2_product_variant()
    RENAME TO trg_check_product_variant;

ALTER FUNCTION public.trg_v2_product_groups_updated_at()
    RENAME TO trg_product_groups_updated_at;
