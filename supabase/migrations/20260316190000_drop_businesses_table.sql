-- ============================================================
-- Drop legacy businesses table
-- ============================================================
-- All active runtime paths have been migrated to v2_activities.
-- RLS policies on businesses are dropped automatically with the table.
-- reviews.activity_id → v2_activities.id (migration 20260316152226)
-- generate-menu-pdf uses v2_activities (no longer reads businesses)
-- ============================================================

-- Drop remaining policies explicitly before DROP TABLE for clarity
DROP POLICY IF EXISTS businesses_delete_owner ON public.businesses;
DROP POLICY IF EXISTS businesses_insert_owner ON public.businesses;
DROP POLICY IF EXISTS businesses_public_select ON public.businesses;
DROP POLICY IF EXISTS businesses_select_owner ON public.businesses;
DROP POLICY IF EXISTS businesses_update_owner ON public.businesses;

-- Drop the table (CASCADE removes dependent FKs from qr_scans)
DROP TABLE IF EXISTS public.businesses CASCADE;
