-- =============================================================================
-- Phase 1: Multi-Tenant Schema Preparation
-- =============================================================================
--
-- Goal: decouple v2_tenants.id from auth.uid() so a single user can own
--       multiple tenants. No RLS policies are changed in this migration.
--
-- Changes:
--   1. Add owner_user_id to v2_tenants (backfill = id, then NOT NULL + FK)
--   2. Set DEFAULT gen_random_uuid() on v2_tenants.id for new inserts
--   3. Remove DEFAULT auth.uid() from all tenant-scoped child table tenant_id
--      columns (callers must now pass tenant_id explicitly)
--
-- Safety:
--   - Additive only: no tenant_id values are changed, no FKs are altered
--   - Existing single-tenant users are unaffected (their tenant.id = user.id
--     remains valid; owner_user_id is backfilled to the same value)
--   - Orphan check aborts the migration if any tenant.id is not a valid user
--   - DROP DEFAULT is a no-op in PostgreSQL if no default exists (safe)
--
-- Does NOT change:
--   - Any RLS policies (Phase 2)
--   - Any tenant_id values in child tables
--   - Any existing FK constraints on child tables
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Extend v2_tenants
-- =============================================================================

-- 1a. Add owner_user_id column (nullable initially to allow safe backfill)
ALTER TABLE public.v2_tenants
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- 1b. Backfill: existing tenants were inserted with id = auth.uid(),
--     so owner_user_id = id is the correct and complete backfill.
UPDATE public.v2_tenants
SET owner_user_id = id
WHERE owner_user_id IS NULL;

-- 1c. Pre-constraint safety check: every backfilled owner_user_id must
--     resolve to a real auth.users row before we add the FK.
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.v2_tenants t
  LEFT JOIN auth.users u ON u.id = t.owner_user_id
  WHERE u.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Phase 1 aborted: % tenant row(s) have an owner_user_id value that does '
      'not exist in auth.users. Resolve orphaned tenant rows before re-running.',
      orphan_count;
  END IF;

  RAISE NOTICE 'Orphan check passed: all % tenant rows have a valid owner_user_id.',
    (SELECT COUNT(*) FROM public.v2_tenants);
END $$;

-- 1d. Enforce NOT NULL now that backfill is verified
ALTER TABLE public.v2_tenants
  ALTER COLUMN owner_user_id SET NOT NULL;

-- 1e. Add FK → auth.users with ON DELETE CASCADE (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'v2_tenants_owner_user_id_fkey'
      AND conrelid = 'public.v2_tenants'::regclass
  ) THEN
    ALTER TABLE public.v2_tenants
      ADD CONSTRAINT v2_tenants_owner_user_id_fkey
        FOREIGN KEY (owner_user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;
    RAISE NOTICE 'Added FK constraint v2_tenants_owner_user_id_fkey.';
  ELSE
    RAISE NOTICE 'FK constraint v2_tenants_owner_user_id_fkey already exists, skipped.';
  END IF;
END $$;

-- 1f. Index for Phase 2 RLS performance: get_my_tenant_ids() will query
--     v2_tenants WHERE owner_user_id = auth.uid() on every RLS evaluation.
CREATE INDEX IF NOT EXISTS idx_v2_tenants_owner_user_id
  ON public.v2_tenants (owner_user_id);

-- 1g. Set DEFAULT gen_random_uuid() on v2_tenants.id for new tenant inserts.
--     Existing rows and all child table FK references are unaffected.
ALTER TABLE public.v2_tenants
  ALTER COLUMN id SET DEFAULT gen_random_uuid();


-- =============================================================================
-- STEP 2: Remove DEFAULT auth.uid() from all tenant_id columns
-- =============================================================================
--
-- Background: migration 20260227200000_v2_rls_base.sql ran a dynamic DO block
-- that SET DEFAULT auth.uid() on every v2_* table that had a tenant_id column.
-- This assumption is no longer valid: tenant_id must be provided explicitly
-- by the caller (it comes from the selected tenant, not the JWT identity).
--
-- In PostgreSQL, DROP DEFAULT on a column that has no default is a safe no-op.
--
-- Tables NOT included:
--   - v2_activity_schedules: DROPPED in 20260302130000_remove_legacy_activity_v2.sql
--   - v2_allergens: system table, no tenant_id column
--   - v2_schedule_targets: join table, no tenant_id column
--   - v2_tenants itself: uses owner_user_id, not tenant_id
-- =============================================================================


-- ---- 2a. Primary tenant-scoped tables (confirmed by explicit CREATE TABLE) --

-- Created in 20260223151000_v2_activities.sql
ALTER TABLE public.v2_activities
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223152000_v2_products.sql
ALTER TABLE public.v2_products
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223153000_v2_catalogs.sql (tenant_id from creation)
ALTER TABLE public.v2_catalogs
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260225121000_v2_catalog_engine.sql
ALTER TABLE public.v2_catalog_categories
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_catalog_category_products
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223155100_v2_styles.sql
ALTER TABLE public.v2_styles
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260224152000_v2_style_versions.sql
ALTER TABLE public.v2_style_versions
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223160000_v2_schedules.sql
ALTER TABLE public.v2_schedules
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260224144431_v2_schedule_featured_contents.sql
ALTER TABLE public.v2_schedule_featured_contents
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223162000_v2_activity_groups.sql
ALTER TABLE public.v2_activity_groups
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_activity_group_members
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260224140000_v2_featured_contents.sql
ALTER TABLE public.v2_featured_contents
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_featured_content_products
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260225214842_v2_ingredients.sql
ALTER TABLE public.v2_ingredients
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_product_ingredients
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260225115200_v2_allergens.sql
ALTER TABLE public.v2_product_allergens
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260224173200_v2_product_attributes.sql
-- Note: tenant_id is NULLABLE here after 20260306000000_attribute_governance.sql
-- (platform-level attribute definitions use tenant_id = NULL explicitly).
-- Removing the auth.uid() default is still correct: inserts must be explicit.
ALTER TABLE public.v2_product_attribute_definitions
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_product_attribute_values
  ALTER COLUMN tenant_id DROP DEFAULT;


-- ---- 2b. Child tables (tenant_id added in 20260227190000) ------------------

-- Originally created without tenant_id in 20260223153000_v2_catalogs.sql
ALTER TABLE public.v2_catalog_sections
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_catalog_items
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Originally created without tenant_id in 20260223160000_v2_schedules.sql
ALTER TABLE public.v2_schedule_layout
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223163000 / 20260223164000 (tenant_id added 20260227190000)
ALTER TABLE public.v2_schedule_price_overrides
  ALTER COLUMN tenant_id DROP DEFAULT;

ALTER TABLE public.v2_schedule_visibility_overrides
  ALTER COLUMN tenant_id DROP DEFAULT;

-- Created in 20260223154000 (tenant_id added 20260227190000)
ALTER TABLE public.v2_activity_product_overrides
  ALTER COLUMN tenant_id DROP DEFAULT;


-- ---- 2c. Tables confirmed via ALTER/policy references -----------------------
--
-- The following tables exist in the live database (confirmed by ALTER TABLE
-- statements in 20260228174000_v2_product_options_multiprice.sql and DROP POLICY
-- statements in 20260227203000_v2_rls_tighten_public_reads.sql), but their
-- CREATE TABLE is not present in any migration file (likely applied via Studio).
--
-- Using a conditional DO block to avoid failure if table structure ever changes.
--
DO $$
DECLARE
  tbl text;
  uncertain_tables text[] := ARRAY[
    'v2_product_option_groups',
    'v2_product_option_values',
    'v2_product_groups',
    'v2_product_group_items'
  ];
BEGIN
  FOREACH tbl IN ARRAY uncertain_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = tbl
        AND column_name  = 'tenant_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT;',
        tbl
      );
      RAISE NOTICE 'Removed DEFAULT from public.%.tenant_id', tbl;
    ELSE
      RAISE NOTICE 'Skipped % (tenant_id column not found — table may not exist)', tbl;
    END IF;
  END LOOP;
END $$;


-- =============================================================================
-- STEP 3: Validation
-- =============================================================================

-- 3a. Verify owner_user_id backfill is complete
DO $$
DECLARE
  null_count int;
  total_count int;
BEGIN
  SELECT COUNT(*) INTO null_count  FROM public.v2_tenants WHERE owner_user_id IS NULL;
  SELECT COUNT(*) INTO total_count FROM public.v2_tenants;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Validation failed: % tenant(s) still have NULL owner_user_id.', null_count;
  END IF;

  RAISE NOTICE 'Validation passed: all % tenants have a non-null owner_user_id.', total_count;
END $$;

-- 3b. Verify no v2_* tenant_id column still has DEFAULT auth.uid()
--     Any remaining entries are logged as WARNINGs (not exceptions) so the
--     migration still commits, but they must be investigated.
DO $$
DECLARE
  r record;
  remaining_count int := 0;
BEGIN
  FOR r IN
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema  = 'public'
      AND column_name   = 'tenant_id'
      AND table_name LIKE 'v2_%'
      AND column_default LIKE '%auth.uid%'
    ORDER BY table_name
  LOOP
    RAISE WARNING
      'DEFAULT auth.uid() still present on public.%.tenant_id (current default: %). '
      'This table was not covered by Phase 1 — investigate and add to migration.',
      r.table_name, r.column_default;
    remaining_count := remaining_count + 1;
  END LOOP;

  IF remaining_count = 0 THEN
    RAISE NOTICE 'Validation passed: no v2_* table has DEFAULT auth.uid() on tenant_id.';
  ELSE
    RAISE WARNING '% table(s) still have DEFAULT auth.uid() on tenant_id. See warnings above.', remaining_count;
  END IF;
END $$;

-- 3c. Confirm v2_tenants.id now has gen_random_uuid() default
DO $$
DECLARE
  current_default text;
BEGIN
  SELECT column_default INTO current_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'v2_tenants'
    AND column_name  = 'id';

  IF current_default LIKE '%gen_random_uuid%' THEN
    RAISE NOTICE 'Validation passed: v2_tenants.id DEFAULT is gen_random_uuid().';
  ELSE
    RAISE EXCEPTION
      'Validation failed: v2_tenants.id DEFAULT is "%" — expected gen_random_uuid().',
      current_default;
  END IF;
END $$;

COMMIT;
