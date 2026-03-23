BEGIN;

-- =============================================================================
-- TABLE: v2_audit_events
-- =============================================================================
--
-- Append-only audit log for critical account and ownership operations.
-- Covered events:
--   ownership_transferred  — transfer_ownership() RPC
--   tenant_locked          — execute_account_deletion_tenant_ops() lock action
--   account_deleted        — mark_account_deleted() RPC
--   account_recovered      — recover-account Edge Function
--   account_purged         — purge-accounts Edge Function (per user)
--   tenant_purged          — purge_locked_expired_tenants() RPC (per tenant)
--
-- Write access: SECURITY DEFINER RPCs and service_role Edge Functions only.
-- Read access:  none for authenticated users (internal / admin use only).
--
-- FK note: actor_user_id, target_user_id, tenant_id are convenience joins
-- to active entities. ON DELETE SET NULL means these columns are nulled when
-- the referenced row is deleted — the event record and created_at are always
-- preserved.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_audit_events (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     text        NOT NULL,
    actor_user_id  uuid        NULL REFERENCES auth.users(id)       ON DELETE SET NULL,
    target_user_id uuid        NULL REFERENCES auth.users(id)       ON DELETE SET NULL,
    tenant_id      uuid        NULL REFERENCES public.tenants(id)   ON DELETE SET NULL,
    payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v2_audit_events_created_at_idx
    ON public.v2_audit_events (created_at DESC);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.v2_audit_events ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated users.
-- All writes happen via SECURITY DEFINER RPCs or service_role Edge Functions,
-- both of which bypass RLS. No read access is granted to end users.

COMMIT;
