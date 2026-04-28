-- =============================================================================
-- Stripe webhook hardening — tabelle di supporto.
-- =============================================================================
--
-- Introduce 2 tabelle interne usate da supabase/functions/stripe-webhook:
--
--   1. stripe_processed_events — idempotency log. Stripe consegna eventi
--      "at-least-once". Per evitare doppia processazione, all'inizio di ogni
--      handler il webhook fa INSERT ON CONFLICT DO NOTHING su event_id; se
--      0 righe inserite, evento già processato → ritorna early.
--
--   2. webhook_errors — audit trail per bug applicativi. Il webhook ritorna
--      sempre 200 a Stripe (per evitare retry su bug permanenti), ma scrive
--      qui l'errore con event_id, payload e stack. Permette debug post-mortem
--      quando un cliente segnala "ho pagato ma non vedo l'attivazione".
--
-- Entrambe le tabelle sono interne al sistema:
--   - RLS abilitata
--   - Nessuna policy per anon/authenticated (frontend NON le legge)
--   - service_role bypassa RLS comunque (è quello usato dal webhook)
-- =============================================================================


BEGIN;


-- =============================================================================
-- STEP 1 — stripe_processed_events
-- =============================================================================

CREATE TABLE public.stripe_processed_events (
    event_id     text        PRIMARY KEY,
    event_type   text        NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_processed_events IS
    'Idempotency log per stripe-webhook. Insert ON CONFLICT DO NOTHING all''inizio dell''handler. Cleanup retention manuale (eventi > 30 giorni eliminabili senza rischio).';

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: solo service_role accede (bypassa RLS).


-- =============================================================================
-- STEP 2 — webhook_errors
-- =============================================================================

CREATE TABLE public.webhook_errors (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    source        text        NOT NULL,           -- 'stripe-webhook' (estendibile)
    event_id      text        NULL,               -- event.id Stripe se disponibile
    event_type    text        NULL,               -- event.type Stripe se disponibile
    error_message text        NOT NULL,
    error_stack   text        NULL,
    payload       jsonb       NULL,               -- raw event JSON o body
    occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX webhook_errors_occurred_at_idx
    ON public.webhook_errors (occurred_at DESC);

CREATE INDEX webhook_errors_event_id_idx
    ON public.webhook_errors (event_id)
    WHERE event_id IS NOT NULL;

COMMENT ON TABLE public.webhook_errors IS
    'Audit trail bug applicativi nei webhook. Webhook ritorna sempre 200 a Stripe; quando catch fail scrive qui per debug post-mortem.';

ALTER TABLE public.webhook_errors ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: solo service_role accede.


-- =============================================================================
-- STEP 3 — Validation
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'stripe_processed_events'
          AND relnamespace = 'public'::regnamespace
          AND relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'stripe_processed_events missing or RLS disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'webhook_errors'
          AND relnamespace = 'public'::regnamespace
          AND relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'webhook_errors missing or RLS disabled';
    END IF;

    RAISE NOTICE 'Migration stripe_webhook_hardening applied successfully';
END $$;


COMMIT;
