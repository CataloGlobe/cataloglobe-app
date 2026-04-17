-- 20260416140000_activity_closures.sql
-- Extraordinary closures: per-date overrides (full-day closed or special hours)

BEGIN;

CREATE TABLE activity_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    closure_date DATE NOT NULL,
    label TEXT,
    is_closed BOOLEAN NOT NULL DEFAULT true,
    opens_at TIME,
    closes_at TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activity_id, closure_date)
);

-- Time coherence: if fully closed, no times; if special hours, times required and coherent
ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_time_coherence CHECK (
        (is_closed = true AND opens_at IS NULL AND closes_at IS NULL)
        OR
        (is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
    );

-- RLS
ALTER TABLE activity_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON activity_closures
    FOR SELECT USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "insert_own" ON activity_closures
    FOR INSERT WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "update_own" ON activity_closures
    FOR UPDATE USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "delete_own" ON activity_closures
    FOR DELETE USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- Index for range queries (upcoming closures)
CREATE INDEX activity_closures_activity_date_idx
    ON activity_closures (activity_id, closure_date);

COMMIT;
