-- =============================================================================
-- Fix trigger functions referencing v2_* table names after rename migration
--
-- Background: 20260317120000_rename_v2_tables.sql renamed all v2_* tables.
-- These two trigger functions were created via Supabase Studio and were not
-- tracked in any prior migration file. Their bodies still reference the old
-- prefixed table names and must be updated to prevent plan re-compilation
-- errors.
--
-- Functions updated (names unchanged, only table references replaced):
--   1. trg_check_v2_product_group_depth
--        v2_product_groups → product_groups
--   2. trg_check_v2_product_group_items_tenant
--        v2_products       → products
--        v2_product_groups → product_groups
-- =============================================================================

-- 1. trg_check_v2_product_group_depth
CREATE OR REPLACE FUNCTION public.trg_check_v2_product_group_depth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_tenant_id uuid;
  v_parent_parent_id uuid;
BEGIN
  IF new.parent_group_id IS NOT NULL THEN
    SELECT tenant_id, parent_group_id
    INTO v_parent_tenant_id, v_parent_parent_id
    FROM public.product_groups
    WHERE id = new.parent_group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent group % does not exist.', new.parent_group_id;
    END IF;

    IF new.tenant_id != v_parent_tenant_id THEN
      RAISE EXCEPTION 'Cross-tenant groups are not allowed.';
    END IF;

    IF v_parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Sub-sub-groups are not allowed.';
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- 2. trg_check_v2_product_group_items_tenant
CREATE OR REPLACE FUNCTION public.trg_check_v2_product_group_items_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_tenant_id uuid;
  v_group_tenant_id   uuid;
BEGIN
  SELECT tenant_id INTO v_product_tenant_id
  FROM public.products
  WHERE id = new.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product ID % does not exist.', new.product_id;
  END IF;

  SELECT tenant_id INTO v_group_tenant_id
  FROM public.product_groups
  WHERE id = new.group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group ID % does not exist.', new.group_id;
  END IF;

  IF new.tenant_id != v_product_tenant_id
     OR new.tenant_id != v_group_tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch in product-group assignment.';
  END IF;

  RETURN new;
END;
$$;
