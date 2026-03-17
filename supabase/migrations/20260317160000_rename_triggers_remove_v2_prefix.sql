-- =============================================================================
-- Rename triggers: remove v2_ prefix from trigger names
--
-- Scope: public schema only. System triggers (RI_ConstraintTrigger_*) and
-- any triggers in other schemas are not touched.
--
-- These triggers were created via Supabase Studio and are not tracked in
-- prior migration files. Table assignments are inferred from the function
-- bodies each trigger calls (confirmed in migrations 20260317130000 and
-- 20260317140000).
--
-- Each rename is wrapped in a DO block so the migration is idempotent:
-- if the old name no longer exists (already renamed) the step is skipped.
--
-- Triggers renamed:
--   check_v2_product_variant_trigger            ON products
--       → check_product_variant_trigger
--   set_v2_product_groups_updated_at            ON product_groups
--       → set_product_groups_updated_at
--   check_v2_product_group_depth_trigger        ON product_groups
--       → check_product_group_depth_trigger
--   check_v2_product_group_items_tenant_trigger ON product_group_items
--       → check_product_group_items_tenant_trigger
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'check_v2_product_variant_trigger'
          AND c.relname = 'products'
          AND n.nspname = 'public'
    ) THEN
        ALTER TRIGGER check_v2_product_variant_trigger
            ON public.products
            RENAME TO check_product_variant_trigger;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'set_v2_product_groups_updated_at'
          AND c.relname = 'product_groups'
          AND n.nspname = 'public'
    ) THEN
        ALTER TRIGGER set_v2_product_groups_updated_at
            ON public.product_groups
            RENAME TO set_product_groups_updated_at;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'check_v2_product_group_depth_trigger'
          AND c.relname = 'product_groups'
          AND n.nspname = 'public'
    ) THEN
        ALTER TRIGGER check_v2_product_group_depth_trigger
            ON public.product_groups
            RENAME TO check_product_group_depth_trigger;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'check_v2_product_group_items_tenant_trigger'
          AND c.relname = 'product_group_items'
          AND n.nspname = 'public'
    ) THEN
        ALTER TRIGGER check_v2_product_group_items_tenant_trigger
            ON public.product_group_items
            RENAME TO check_product_group_items_tenant_trigger;
    END IF;
END $$;
