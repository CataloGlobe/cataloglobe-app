-- customer_sessions: aggiunta colonna waiter_called_at.
-- Analogo a bill_requested_at (20260526160859_add_bill_request.sql).
-- Semantica: timestamp dell'ultima chiamata cameriere da parte della sessione.
-- Ripetibile (aggiornabile N volte), non one-shot come bill_requested_at.
-- Resettata a NULL alla chiusura tavolo (pattern: close_table RPC, migration 20260604100000).

ALTER TABLE public.customer_sessions
    ADD COLUMN waiter_called_at timestamptz;

COMMENT ON COLUMN public.customer_sessions.waiter_called_at IS
    'Timestamp ultima richiesta cameriere per questa sessione. NULL se mai richiesto o resettato alla chiusura tavolo.';
