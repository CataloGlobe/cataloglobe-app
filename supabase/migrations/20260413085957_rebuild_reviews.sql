-- ============================================================
-- Migration: rebuild reviews table from scratch
-- ============================================================

-- 1. Drop existing table (empty, unused)
DROP TABLE IF EXISTS public.reviews CASCADE;

-- 2. Create new reviews table
CREATE TABLE public.reviews (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    activity_id       UUID        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    rating            INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
    rating_category   TEXT        NOT NULL CHECK (rating_category IN ('positive', 'neutral', 'negative')),
    comment           TEXT,
    source            TEXT        NOT NULL DEFAULT 'public_form' CHECK (source IN ('public_form', 'internal', 'google')),
    status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
    session_id        UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies — authenticated (standard V2 pattern)

CREATE POLICY "reviews_select_authenticated"
ON public.reviews
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "reviews_insert_authenticated"
ON public.reviews
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "reviews_update_authenticated"
ON public.reviews
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT get_my_tenant_ids()));

CREATE POLICY "reviews_delete_authenticated"
ON public.reviews
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- 5. RLS policies — anon (public access)

CREATE POLICY "reviews_insert_anon"
ON public.reviews
AS PERMISSIVE
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "reviews_select_anon"
ON public.reviews
AS PERMISSIVE
FOR SELECT
TO anon
USING (status = 'approved');

-- 6. Indexes
CREATE INDEX idx_reviews_activity_status_created ON public.reviews (activity_id, status, created_at DESC);
CREATE INDEX idx_reviews_tenant_id ON public.reviews (tenant_id);

-- 7. Add google_review_url to activities
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS google_review_url TEXT;
