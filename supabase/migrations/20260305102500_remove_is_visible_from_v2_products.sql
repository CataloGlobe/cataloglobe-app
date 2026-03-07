-- =========================================
-- REMOVE is_visible FROM v2_products
-- The field is no longer used by the application code.
-- Visibility is now handled by overrides and schedules.
-- =========================================

BEGIN;

ALTER TABLE public.v2_products
DROP COLUMN IF EXISTS is_visible;

COMMIT;
