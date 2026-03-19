BEGIN;

-- =============================================================================
-- DROP Redundant 'tenant_id' from 'activity_product_overrides'
-- =============================================================================
-- The previous migration successfully refactored the RLS policies on this table
-- to dynamically resolve authorization via the parent `activities` table.
-- The explicit `tenant_id` column is redundant, not sent by the frontend during 
-- UPSERTs, and its NOT NULL constraint triggers a '23502' error.
--
-- This migration safely removes the column, its indexes, and constraints (if any
-- were manually added), restoring successful inserts and cleanup.
-- =============================================================================

-- 1. Drop index (checking both the old v2_ prefix and potential renamed version)
DROP INDEX IF EXISTS public.idx_v2_activity_product_overrides_tenant_id;
DROP INDEX IF EXISTS public.idx_activity_product_overrides_tenant_id;

-- 2. Drop foreign key (just in case it was explicitly created out of band)
ALTER TABLE public.activity_product_overrides 
  DROP CONSTRAINT IF EXISTS v2_activity_product_overrides_tenant_id_fkey,
  DROP CONSTRAINT IF EXISTS activity_product_overrides_tenant_id_fkey;

-- 3. Drop the column safely
ALTER TABLE public.activity_product_overrides 
  DROP COLUMN IF EXISTS tenant_id;

COMMIT;
