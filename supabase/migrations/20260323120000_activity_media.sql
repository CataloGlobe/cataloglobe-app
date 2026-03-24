-- =============================================================================
-- ACTIVITY MEDIA — Gallery images per activity
--
-- Depends on:
--   public.activities         (created 20260223151000, renamed 20260317120000)
--   public.get_my_tenant_ids()  (updated to query public.tenants in 20260317120000)
--
-- Note: all v2_* tables were renamed to unprefixed names in
--   20260317120000_rename_v2_tables.sql.
--   This migration uses post-rename names throughout.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_media (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id uuid        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    url         text        NOT NULL,
    type        text        NOT NULL DEFAULT 'image',
    is_cover    boolean     NOT NULL DEFAULT false,
    sort_order  integer     NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup by activity
CREATE INDEX IF NOT EXISTS activity_media_activity_id_idx
    ON public.activity_media (activity_id);

-- Ordered gallery fetch (sort_order ASC, created_at DESC)
CREATE INDEX IF NOT EXISTS activity_media_sort_idx
    ON public.activity_media (activity_id, sort_order, created_at DESC);

-- Enforce at most one cover per activity at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS activity_media_single_cover
    ON public.activity_media (activity_id)
    WHERE is_cover = true;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.activity_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_media_tenant_select"
    ON public.activity_media FOR SELECT
    USING (
        activity_id IN (
            SELECT id FROM public.activities
            WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
        )
    );

CREATE POLICY "activity_media_tenant_insert"
    ON public.activity_media FOR INSERT
    WITH CHECK (
        activity_id IN (
            SELECT id FROM public.activities
            WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
        )
    );

CREATE POLICY "activity_media_tenant_update"
    ON public.activity_media FOR UPDATE
    USING (
        activity_id IN (
            SELECT id FROM public.activities
            WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
        )
    )
    WITH CHECK (
        activity_id IN (
            SELECT id FROM public.activities
            WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
        )
    );

CREATE POLICY "activity_media_tenant_delete"
    ON public.activity_media FOR DELETE
    USING (
        activity_id IN (
            SELECT id FROM public.activities
            WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
        )
    );

COMMIT;
