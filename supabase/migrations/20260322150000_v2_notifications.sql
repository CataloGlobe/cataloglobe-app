BEGIN;

-- =============================================================================
-- TABLE: v2_notifications
-- =============================================================================
--
-- Minimal persistent notification store.
-- Used to surface ownership transfers and other system events to users
-- on their next session.
--
-- Write access: service_role only (via SECURITY DEFINER RPCs).
-- Read access:  authenticated users can read their own rows.
-- Update access: authenticated users can mark their own rows as read.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_notifications (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id  uuid        REFERENCES public.tenants(id) ON DELETE CASCADE,
    event_type text        NOT NULL,
    data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    read_at    timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial index for efficient unread queries per user
CREATE INDEX IF NOT EXISTS v2_notifications_user_unread_idx
    ON public.v2_notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.v2_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
    ON public.v2_notifications
    FOR SELECT
    USING (user_id = auth.uid());

-- Users can mark their own notifications as read (update read_at only)
CREATE POLICY "Users can mark own notifications as read"
    ON public.v2_notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- No INSERT policy for authenticated: writes happen only via
-- SECURITY DEFINER RPCs running as service_role.

COMMIT;
