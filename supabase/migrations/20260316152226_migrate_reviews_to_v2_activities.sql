-- ============================================================
-- Migration: reviews.business_id → reviews.activity_id
-- ============================================================

-- 1. Rename column
ALTER TABLE public.reviews
RENAME COLUMN business_id TO activity_id;

-- 2. Drop old FKs
--    The original constraint is named reviews_restaurant_id_fkey (points to businesses.id).
--    A secondary name may exist after interim migrations; drop both defensively.
ALTER TABLE public.reviews
DROP CONSTRAINT IF EXISTS reviews_restaurant_id_fkey;

ALTER TABLE public.reviews
DROP CONSTRAINT IF EXISTS reviews_business_id_fkey;

-- 3. Add new FK → v2_activities
ALTER TABLE public.reviews
ADD CONSTRAINT reviews_activity_id_fkey
FOREIGN KEY (activity_id)
REFERENCES public.v2_activities(id)
ON DELETE CASCADE;

-- 4. Drop legacy RLS policies that still reference businesses
DROP POLICY IF EXISTS "Users can read reviews of their restaurants" ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_business_owner" ON public.reviews;

-- 5. Recreate equivalent policies using v2_activities + v2_tenants

CREATE POLICY "reviews_select_activity_owner"
ON public.reviews
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
    activity_id IN (
        SELECT a.id
        FROM public.v2_activities a
        JOIN public.v2_tenants t ON t.id = a.tenant_id
        WHERE t.owner_user_id = auth.uid()
    )
);

CREATE POLICY "reviews_delete_activity_owner"
ON public.reviews
AS PERMISSIVE
FOR DELETE
TO public
USING (
    EXISTS (
        SELECT 1
        FROM public.v2_activities a
        JOIN public.v2_tenants t ON t.id = a.tenant_id
        WHERE a.id = reviews.activity_id
          AND t.owner_user_id = auth.uid()
    )
);
