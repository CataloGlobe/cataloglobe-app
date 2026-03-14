-- =========================================================================
-- Fix: add public read policy for v2_activities (re-applied with new ts).
-- Previous migration 20260314100000 was recorded but policy was not created.
-- =========================================================================

DROP POLICY IF EXISTS "Public can read v2_activities" ON public.v2_activities;
CREATE POLICY "Public can read v2_activities" ON public.v2_activities FOR SELECT TO public USING (true);
