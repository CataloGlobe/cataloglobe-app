-- =============================================================================
-- RENAME ALL REMAINING v2_* FOREIGN KEY CONSTRAINTS  (idempotent)
--
-- After the v2_ table rename migration (20260317120000), all FK constraint
-- names still carry the old v2_ prefix.  This migration renames every one
-- of them to match the new table names (no v2_ prefix).
--
-- v2_styles_current_version_id_fkey was already handled in 20260317170000.
-- reviews_activity_id_fkey has no v2_ prefix — untouched.
--
-- Each DO block:
--   1. DROPs the old constraint only if it still exists.
--   2. ADDs the new constraint only if it does not yet exist.
-- Safe to run multiple times — repeated runs are no-ops.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper macro (inline) — checks pg_constraint by name + table relname.
-- All blocks follow the same pattern; pg_class join scopes to public schema.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_tenants_owner_user_id_fkey' AND t.relname = 'tenants'
  ) THEN
    ALTER TABLE tenants DROP CONSTRAINT v2_tenants_owner_user_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenants_owner_user_id_fkey' AND t.relname = 'tenants'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_tenants_plan_fkey' AND t.relname = 'tenants'
  ) THEN
    ALTER TABLE tenants DROP CONSTRAINT v2_tenants_plan_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenants_plan_fkey' AND t.relname = 'tenants'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_plan_fkey
      FOREIGN KEY (plan) REFERENCES plans(code);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activities_tenant_id_fkey' AND t.relname = 'activities'
  ) THEN
    ALTER TABLE activities DROP CONSTRAINT v2_activities_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activities_tenant_id_fkey' AND t.relname = 'activities'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_products_tenant_id_fkey' AND t.relname = 'products'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT v2_products_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'products_tenant_id_fkey' AND t.relname = 'products'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_products_parent_product_id_fkey' AND t.relname = 'products'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT v2_products_parent_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'products_parent_product_id_fkey' AND t.relname = 'products'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_parent_product_id_fkey
      FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalogs
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalogs_tenant_id_fkey' AND t.relname = 'catalogs'
  ) THEN
    ALTER TABLE catalogs DROP CONSTRAINT v2_catalogs_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalogs_tenant_id_fkey' AND t.relname = 'catalogs'
  ) THEN
    ALTER TABLE catalogs
      ADD CONSTRAINT catalogs_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalog_sections
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_sections_catalog_id_fkey' AND t.relname = 'catalog_sections'
  ) THEN
    ALTER TABLE catalog_sections DROP CONSTRAINT v2_catalog_sections_catalog_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_sections_catalog_id_fkey' AND t.relname = 'catalog_sections'
  ) THEN
    ALTER TABLE catalog_sections
      ADD CONSTRAINT catalog_sections_catalog_id_fkey
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalog_items
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_items_catalog_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items DROP CONSTRAINT v2_catalog_items_catalog_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_items_catalog_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_catalog_id_fkey
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_items_section_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items DROP CONSTRAINT v2_catalog_items_section_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_items_section_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES catalog_sections(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_items_product_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items DROP CONSTRAINT v2_catalog_items_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_items_product_id_fkey' AND t.relname = 'catalog_items'
  ) THEN
    ALTER TABLE catalog_items
      ADD CONSTRAINT catalog_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- activity_product_overrides
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_product_overrides_activity_id_fkey' AND t.relname = 'activity_product_overrides'
  ) THEN
    ALTER TABLE activity_product_overrides DROP CONSTRAINT v2_activity_product_overrides_activity_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_product_overrides_activity_id_fkey' AND t.relname = 'activity_product_overrides'
  ) THEN
    ALTER TABLE activity_product_overrides
      ADD CONSTRAINT activity_product_overrides_activity_id_fkey
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_product_overrides_product_id_fkey' AND t.relname = 'activity_product_overrides'
  ) THEN
    ALTER TABLE activity_product_overrides DROP CONSTRAINT v2_activity_product_overrides_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_product_overrides_product_id_fkey' AND t.relname = 'activity_product_overrides'
  ) THEN
    ALTER TABLE activity_product_overrides
      ADD CONSTRAINT activity_product_overrides_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- styles
-- (styles_current_version_id_fkey was already renamed in 20260317170000)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_styles_tenant_id_fkey' AND t.relname = 'styles'
  ) THEN
    ALTER TABLE styles DROP CONSTRAINT v2_styles_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'styles_tenant_id_fkey' AND t.relname = 'styles'
  ) THEN
    ALTER TABLE styles
      ADD CONSTRAINT styles_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- style_versions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_style_versions_tenant_id_fkey' AND t.relname = 'style_versions'
  ) THEN
    ALTER TABLE style_versions DROP CONSTRAINT v2_style_versions_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'style_versions_tenant_id_fkey' AND t.relname = 'style_versions'
  ) THEN
    ALTER TABLE style_versions
      ADD CONSTRAINT style_versions_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_style_versions_style_id_fkey' AND t.relname = 'style_versions'
  ) THEN
    ALTER TABLE style_versions DROP CONSTRAINT v2_style_versions_style_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'style_versions_style_id_fkey' AND t.relname = 'style_versions'
  ) THEN
    ALTER TABLE style_versions
      ADD CONSTRAINT style_versions_style_id_fkey
      FOREIGN KEY (style_id) REFERENCES styles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedules
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedules_tenant_id_fkey' AND t.relname = 'schedules'
  ) THEN
    ALTER TABLE schedules DROP CONSTRAINT v2_schedules_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedules_tenant_id_fkey' AND t.relname = 'schedules'
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedule_layout
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_layout_schedule_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout DROP CONSTRAINT v2_schedule_layout_schedule_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_layout_schedule_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout
      ADD CONSTRAINT schedule_layout_schedule_id_fkey
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_layout_style_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout DROP CONSTRAINT v2_schedule_layout_style_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_layout_style_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout
      ADD CONSTRAINT schedule_layout_style_id_fkey
      FOREIGN KEY (style_id) REFERENCES styles(id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_layout_catalog_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout DROP CONSTRAINT v2_schedule_layout_catalog_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_layout_catalog_id_fkey' AND t.relname = 'schedule_layout'
  ) THEN
    ALTER TABLE schedule_layout
      ADD CONSTRAINT schedule_layout_catalog_id_fkey
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedule_price_overrides
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_price_overrides_schedule_id_fkey' AND t.relname = 'schedule_price_overrides'
  ) THEN
    ALTER TABLE schedule_price_overrides DROP CONSTRAINT v2_schedule_price_overrides_schedule_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_price_overrides_schedule_id_fkey' AND t.relname = 'schedule_price_overrides'
  ) THEN
    ALTER TABLE schedule_price_overrides
      ADD CONSTRAINT schedule_price_overrides_schedule_id_fkey
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_price_overrides_product_id_fkey' AND t.relname = 'schedule_price_overrides'
  ) THEN
    ALTER TABLE schedule_price_overrides DROP CONSTRAINT v2_schedule_price_overrides_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_price_overrides_product_id_fkey' AND t.relname = 'schedule_price_overrides'
  ) THEN
    ALTER TABLE schedule_price_overrides
      ADD CONSTRAINT schedule_price_overrides_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedule_visibility_overrides
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_visibility_overrides_schedule_id_fkey' AND t.relname = 'schedule_visibility_overrides'
  ) THEN
    ALTER TABLE schedule_visibility_overrides DROP CONSTRAINT v2_schedule_visibility_overrides_schedule_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_visibility_overrides_schedule_id_fkey' AND t.relname = 'schedule_visibility_overrides'
  ) THEN
    ALTER TABLE schedule_visibility_overrides
      ADD CONSTRAINT schedule_visibility_overrides_schedule_id_fkey
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_visibility_overrides_product_id_fkey' AND t.relname = 'schedule_visibility_overrides'
  ) THEN
    ALTER TABLE schedule_visibility_overrides DROP CONSTRAINT v2_schedule_visibility_overrides_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_visibility_overrides_product_id_fkey' AND t.relname = 'schedule_visibility_overrides'
  ) THEN
    ALTER TABLE schedule_visibility_overrides
      ADD CONSTRAINT schedule_visibility_overrides_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedule_targets
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_targets_schedule_id_fkey' AND t.relname = 'schedule_targets'
  ) THEN
    ALTER TABLE schedule_targets DROP CONSTRAINT v2_schedule_targets_schedule_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_targets_schedule_id_fkey' AND t.relname = 'schedule_targets'
  ) THEN
    ALTER TABLE schedule_targets
      ADD CONSTRAINT schedule_targets_schedule_id_fkey
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- featured_contents
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_featured_contents_tenant_id_fkey' AND t.relname = 'featured_contents'
  ) THEN
    ALTER TABLE featured_contents DROP CONSTRAINT v2_featured_contents_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'featured_contents_tenant_id_fkey' AND t.relname = 'featured_contents'
  ) THEN
    ALTER TABLE featured_contents
      ADD CONSTRAINT featured_contents_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- featured_content_products
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_featured_content_products_tenant_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products DROP CONSTRAINT v2_featured_content_products_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'featured_content_products_tenant_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products
      ADD CONSTRAINT featured_content_products_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_featured_content_products_featured_content_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products DROP CONSTRAINT v2_featured_content_products_featured_content_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'featured_content_products_featured_content_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products
      ADD CONSTRAINT featured_content_products_featured_content_id_fkey
      FOREIGN KEY (featured_content_id) REFERENCES featured_contents(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_featured_content_products_product_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products DROP CONSTRAINT v2_featured_content_products_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'featured_content_products_product_id_fkey' AND t.relname = 'featured_content_products'
  ) THEN
    ALTER TABLE featured_content_products
      ADD CONSTRAINT featured_content_products_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- schedule_featured_contents
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_featured_contents_tenant_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents DROP CONSTRAINT v2_schedule_featured_contents_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_featured_contents_tenant_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents
      ADD CONSTRAINT schedule_featured_contents_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_featured_contents_schedule_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents DROP CONSTRAINT v2_schedule_featured_contents_schedule_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_featured_contents_schedule_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents
      ADD CONSTRAINT schedule_featured_contents_schedule_id_fkey
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_schedule_featured_contents_featured_content_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents DROP CONSTRAINT v2_schedule_featured_contents_featured_content_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'schedule_featured_contents_featured_content_id_fkey' AND t.relname = 'schedule_featured_contents'
  ) THEN
    ALTER TABLE schedule_featured_contents
      ADD CONSTRAINT schedule_featured_contents_featured_content_id_fkey
      FOREIGN KEY (featured_content_id) REFERENCES featured_contents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- activity_groups
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_groups_tenant_id_fkey' AND t.relname = 'activity_groups'
  ) THEN
    ALTER TABLE activity_groups DROP CONSTRAINT v2_activity_groups_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_groups_tenant_id_fkey' AND t.relname = 'activity_groups'
  ) THEN
    ALTER TABLE activity_groups
      ADD CONSTRAINT activity_groups_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- activity_group_members
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_group_members_tenant_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members DROP CONSTRAINT v2_activity_group_members_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_group_members_tenant_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members
      ADD CONSTRAINT activity_group_members_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_group_members_group_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members DROP CONSTRAINT v2_activity_group_members_group_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_group_members_group_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members
      ADD CONSTRAINT activity_group_members_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_activity_group_members_activity_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members DROP CONSTRAINT v2_activity_group_members_activity_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'activity_group_members_activity_id_fkey' AND t.relname = 'activity_group_members'
  ) THEN
    ALTER TABLE activity_group_members
      ADD CONSTRAINT activity_group_members_activity_id_fkey
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_attribute_definitions
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_attribute_definitions_tenant_id_fkey' AND t.relname = 'product_attribute_definitions'
  ) THEN
    ALTER TABLE product_attribute_definitions DROP CONSTRAINT v2_product_attribute_definitions_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_attribute_definitions_tenant_id_fkey' AND t.relname = 'product_attribute_definitions'
  ) THEN
    ALTER TABLE product_attribute_definitions
      ADD CONSTRAINT product_attribute_definitions_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_attribute_values
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_attribute_values_tenant_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values DROP CONSTRAINT v2_product_attribute_values_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_attribute_values_tenant_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values
      ADD CONSTRAINT product_attribute_values_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_attribute_values_product_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values DROP CONSTRAINT v2_product_attribute_values_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_attribute_values_product_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values
      ADD CONSTRAINT product_attribute_values_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_attribute_values_attribute_definition_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values DROP CONSTRAINT v2_product_attribute_values_attribute_definition_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_attribute_values_attribute_definition_id_fkey' AND t.relname = 'product_attribute_values'
  ) THEN
    ALTER TABLE product_attribute_values
      ADD CONSTRAINT product_attribute_values_attribute_definition_id_fkey
      FOREIGN KEY (attribute_definition_id) REFERENCES product_attribute_definitions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_allergens
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_allergens_tenant_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens DROP CONSTRAINT v2_product_allergens_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_allergens_tenant_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens
      ADD CONSTRAINT product_allergens_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_allergens_product_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens DROP CONSTRAINT v2_product_allergens_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_allergens_product_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens
      ADD CONSTRAINT product_allergens_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_allergens_allergen_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens DROP CONSTRAINT v2_product_allergens_allergen_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_allergens_allergen_id_fkey' AND t.relname = 'product_allergens'
  ) THEN
    ALTER TABLE product_allergens
      ADD CONSTRAINT product_allergens_allergen_id_fkey
      FOREIGN KEY (allergen_id) REFERENCES allergens(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalog_categories
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_categories_tenant_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories DROP CONSTRAINT v2_catalog_categories_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_categories_tenant_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories
      ADD CONSTRAINT catalog_categories_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_categories_catalog_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories DROP CONSTRAINT v2_catalog_categories_catalog_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_categories_catalog_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories
      ADD CONSTRAINT catalog_categories_catalog_id_fkey
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_categories_parent_category_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories DROP CONSTRAINT v2_catalog_categories_parent_category_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_categories_parent_category_id_fkey' AND t.relname = 'catalog_categories'
  ) THEN
    ALTER TABLE catalog_categories
      ADD CONSTRAINT catalog_categories_parent_category_id_fkey
      FOREIGN KEY (parent_category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- catalog_category_products
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_category_products_tenant_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products DROP CONSTRAINT v2_catalog_category_products_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_category_products_tenant_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products
      ADD CONSTRAINT catalog_category_products_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_category_products_catalog_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products DROP CONSTRAINT v2_catalog_category_products_catalog_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_category_products_catalog_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products
      ADD CONSTRAINT catalog_category_products_catalog_id_fkey
      FOREIGN KEY (catalog_id) REFERENCES catalogs(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_category_products_category_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products DROP CONSTRAINT v2_catalog_category_products_category_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_category_products_category_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products
      ADD CONSTRAINT catalog_category_products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_catalog_category_products_product_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products DROP CONSTRAINT v2_catalog_category_products_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'catalog_category_products_product_id_fkey' AND t.relname = 'catalog_category_products'
  ) THEN
    ALTER TABLE catalog_category_products
      ADD CONSTRAINT catalog_category_products_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ingredients
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_ingredients_tenant_id_fkey' AND t.relname = 'ingredients'
  ) THEN
    ALTER TABLE ingredients DROP CONSTRAINT v2_ingredients_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'ingredients_tenant_id_fkey' AND t.relname = 'ingredients'
  ) THEN
    ALTER TABLE ingredients
      ADD CONSTRAINT ingredients_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_ingredients
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_ingredients_tenant_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients DROP CONSTRAINT v2_product_ingredients_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_ingredients_tenant_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients
      ADD CONSTRAINT product_ingredients_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_ingredients_product_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients DROP CONSTRAINT v2_product_ingredients_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_ingredients_product_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients
      ADD CONSTRAINT product_ingredients_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_ingredients_ingredient_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients DROP CONSTRAINT v2_product_ingredients_ingredient_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_ingredients_ingredient_id_fkey' AND t.relname = 'product_ingredients'
  ) THEN
    ALTER TABLE product_ingredients
      ADD CONSTRAINT product_ingredients_ingredient_id_fkey
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_option_groups
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_option_groups_tenant_id_fkey' AND t.relname = 'product_option_groups'
  ) THEN
    ALTER TABLE product_option_groups DROP CONSTRAINT v2_product_option_groups_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_option_groups_tenant_id_fkey' AND t.relname = 'product_option_groups'
  ) THEN
    ALTER TABLE product_option_groups
      ADD CONSTRAINT product_option_groups_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_option_groups_product_id_fkey' AND t.relname = 'product_option_groups'
  ) THEN
    ALTER TABLE product_option_groups DROP CONSTRAINT v2_product_option_groups_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_option_groups_product_id_fkey' AND t.relname = 'product_option_groups'
  ) THEN
    ALTER TABLE product_option_groups
      ADD CONSTRAINT product_option_groups_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_option_values
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_option_values_tenant_id_fkey' AND t.relname = 'product_option_values'
  ) THEN
    ALTER TABLE product_option_values DROP CONSTRAINT v2_product_option_values_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_option_values_tenant_id_fkey' AND t.relname = 'product_option_values'
  ) THEN
    ALTER TABLE product_option_values
      ADD CONSTRAINT product_option_values_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_option_values_option_group_id_fkey' AND t.relname = 'product_option_values'
  ) THEN
    ALTER TABLE product_option_values DROP CONSTRAINT v2_product_option_values_option_group_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_option_values_option_group_id_fkey' AND t.relname = 'product_option_values'
  ) THEN
    ALTER TABLE product_option_values
      ADD CONSTRAINT product_option_values_option_group_id_fkey
      FOREIGN KEY (option_group_id) REFERENCES product_option_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_groups
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_groups_tenant_id_fkey' AND t.relname = 'product_groups'
  ) THEN
    ALTER TABLE product_groups DROP CONSTRAINT v2_product_groups_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_groups_tenant_id_fkey' AND t.relname = 'product_groups'
  ) THEN
    ALTER TABLE product_groups
      ADD CONSTRAINT product_groups_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_groups_parent_group_id_fkey' AND t.relname = 'product_groups'
  ) THEN
    ALTER TABLE product_groups DROP CONSTRAINT v2_product_groups_parent_group_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_groups_parent_group_id_fkey' AND t.relname = 'product_groups'
  ) THEN
    ALTER TABLE product_groups
      ADD CONSTRAINT product_groups_parent_group_id_fkey
      FOREIGN KEY (parent_group_id) REFERENCES product_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- product_group_items
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_group_items_tenant_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items DROP CONSTRAINT v2_product_group_items_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_group_items_tenant_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items
      ADD CONSTRAINT product_group_items_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_group_items_product_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items DROP CONSTRAINT v2_product_group_items_product_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_group_items_product_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items
      ADD CONSTRAINT product_group_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_product_group_items_group_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items DROP CONSTRAINT v2_product_group_items_group_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'product_group_items_group_id_fkey' AND t.relname = 'product_group_items'
  ) THEN
    ALTER TABLE product_group_items
      ADD CONSTRAINT product_group_items_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES product_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- tenant_memberships
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_tenant_memberships_tenant_id_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships DROP CONSTRAINT v2_tenant_memberships_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenant_memberships_tenant_id_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships
      ADD CONSTRAINT tenant_memberships_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_tenant_memberships_user_id_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships DROP CONSTRAINT v2_tenant_memberships_user_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenant_memberships_user_id_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships
      ADD CONSTRAINT tenant_memberships_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_tenant_memberships_invited_by_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships DROP CONSTRAINT v2_tenant_memberships_invited_by_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'tenant_memberships_invited_by_fkey' AND t.relname = 'tenant_memberships'
  ) THEN
    ALTER TABLE tenant_memberships
      ADD CONSTRAINT tenant_memberships_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_audit_logs_tenant_id_fkey' AND t.relname = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT v2_audit_logs_tenant_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'audit_logs_tenant_id_fkey' AND t.relname = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'v2_audit_logs_user_id_fkey' AND t.relname = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs DROP CONSTRAINT v2_audit_logs_user_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'audit_logs_user_id_fkey' AND t.relname = 'audit_logs'
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- VALIDATION
-- Run this after applying the migration.
-- Expected result: 0 rows (no remaining v2_* FK constraints).
-- =============================================================================
--
-- SELECT
--     conname            AS constraint_name,
--     conrelid::regclass AS table_from,
--     confrelid::regclass AS table_to
-- FROM pg_constraint
-- WHERE contype = 'f'
--   AND conname LIKE 'v2_%'
-- ORDER BY conrelid::regclass::text;
