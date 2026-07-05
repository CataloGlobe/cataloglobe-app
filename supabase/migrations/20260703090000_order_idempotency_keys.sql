-- Idempotency guard for submit-order network retries. One row per
-- (customer_session_id, idempotency_key); order_id backfilled once the order
-- exists. Enforced atomically inside submit_order_atomic.
BEGIN;

CREATE TABLE public.order_idempotency_keys (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    customer_session_id uuid NOT NULL REFERENCES public.customer_sessions(id) ON DELETE CASCADE,
    idempotency_key     text NOT NULL,
    order_id            uuid NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_idempotency_keys_unique UNIQUE (customer_session_id, idempotency_key)
);

CREATE INDEX idx_order_idempotency_keys_tenant ON public.order_idempotency_keys (tenant_id);

COMMENT ON TABLE public.order_idempotency_keys IS
  'Dedup guard for submit-order retries. Written by submit_order_atomic (service_role only). No anon access.';

ALTER TABLE public.order_idempotency_keys ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: table is touched only by submit_order_atomic
-- (SECURITY DEFINER, service_role). RLS enabled + zero policies = deny-all for
-- anon/authenticated (service_role bypasses RLS).

COMMIT;
