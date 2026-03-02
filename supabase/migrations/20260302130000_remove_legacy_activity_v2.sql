-- =========================================================================
-- Step 6: Cleanup legacy Activity V2
-- Removes unused legacy tables and functions.
-- =========================================================================

-- 1. Remove legacy table
DROP TABLE IF EXISTS public.v2_activity_schedules CASCADE;

-- 2. Remove legacy functions
DROP FUNCTION IF EXISTS public.get_public_catalog(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.is_schedule_active(jsonb, timestamptz);
