-- =============================================================================
-- CRM interno (Fase 1, F1-2): connettore WhatsApp Web, tabelle
-- =============================================================================
-- Il numero dell'agente vive in una sessione di WhatsApp Web sul Mac di casa
-- (decisione di Alex del 2026-10-01). Sul Mac gira Claude in Chrome, che
-- legge le chat e invia; tutto il resto (coda, regole, storia) sta qui. Il
-- Mac parla solo con l'edge `crm-wa-worker`, con un segreto: nessun accesso
-- diretto al database.
--
--   * crm_messages: ogni messaggio della chat, in entrata e in uscita. Le
--     uscite dell'agente passano dalla coda (status); quelle scritte a mano
--     da una persona sul numero dell'agente le riconosce l'istantanea della
--     chat (author = 'person') e fermano l'agente su quel lead.
--   * crm_wa_channel (una riga): salute del canale. Battito del Mac, stato
--     di WhatsApp Web, invii falliti di fila, prossimo invio possibile.
--   * crm_settings: testo del primo messaggio automatico (NULL = spento,
--     finché Alex non lo approva), «solo numeri di prova» (acceso di
--     default: su staging si scrive solo alla lista) e la lista.
--   * crm_venues: «La prendo io» (agent_hold_*): l'agente non scrive più a
--     quel locale finché una persona non lo ridà all'agente.
--   * crm_events: tipi agent_hold / agent_released.
--
-- Tabelle di piattaforma come le altre crm_*: niente tenant_id, RLS su
-- is_platform_admin(). Funzioni in 20261002220100, GRANT in 220200.
-- =============================================================================

BEGIN;

-- Lista di numeri E.164 (CHECK non ammette sottoquery: serve una funzione).
CREATE OR REPLACE FUNCTION public.crm_e164_list_ok(p_numbers text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT coalesce(bool_and(n ~ '^\+[1-9][0-9]{6,14}$'), true) FROM unnest(p_numbers) AS n;
$$;

-- -----------------------------------------------------------------------------
-- crm_settings
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_settings
    -- Segnaposto {nome} e {locale}, come il testo della Fase 0. NULL = nessun
    -- primo messaggio automatico (si accoda solo con un testo approvato).
    ADD COLUMN IF NOT EXISTS wa_first_message text
        CHECK (wa_first_message IS NULL OR char_length(btrim(wa_first_message)) BETWEEN 1 AND 1000),
    ADD COLUMN IF NOT EXISTS wa_test_only boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS wa_test_numbers text[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(wa_test_numbers) <= 20 AND public.crm_e164_list_ok(wa_test_numbers));

-- -----------------------------------------------------------------------------
-- crm_venues: «La prendo io»
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_venues
    ADD COLUMN IF NOT EXISTS agent_hold_at timestamptz,
    ADD COLUMN IF NOT EXISTS agent_hold_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.crm_events DROP CONSTRAINT IF EXISTS crm_events_type_check;
ALTER TABLE public.crm_events ADD CONSTRAINT crm_events_type_check CHECK (type IN (
    'lead_in', 'lead_returned', 'assigned', 'stage_changed',
    'whatsapp_opened', 'note', 'account_linked', 'escalated',
    'stage_locked', 'stage_unlocked', 'subscription_changed',
    'venue_renamed', 'venue_name_confirmed', 'venue_name_deferred',
    'agent_hold', 'agent_released'
));

-- -----------------------------------------------------------------------------
-- crm_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    venue_id        uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    contact_id      uuid        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    lead_id         uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    direction       text        NOT NULL CHECK (direction IN ('in', 'out')),
    -- lead = il ristoratore; agent = dalla coda; person = scritto a mano sul
    -- numero dell'agente (chi, non si sa: WhatsApp Web non lo dice).
    author          text        NOT NULL CHECK (author IN ('lead', 'agent', 'person')),
    kind            text        NOT NULL DEFAULT 'text'
                                CHECK (kind IN ('text', 'voice', 'image', 'video', 'document', 'sticker', 'other')),
    -- NULL per vocali e foto senza didascalia, e per il primo messaggio in
    -- coda: il testo si scrive al momento dell'invio, con le impostazioni di quel momento.
    body            text        CHECK (body IS NULL OR char_length(body) <= 4000),
    -- Solo per l'agente: perché scrive e a che punto è.
    purpose         text        CHECK (purpose IN ('first_message', 'reply', 'follow_up')),
    status          text        CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'cancelled')),
    status_reason   text        CHECK (status_reason IS NULL OR char_length(status_reason) <= 300),
    claimed_at      timestamptz,
    attempts        smallint    NOT NULL DEFAULT 0,
    -- Quando è partito o arrivato (per le entrate, l'ora letta in WhatsApp Web).
    sent_at         timestamptz,
    -- data-id del messaggio in WhatsApp Web: la stessa istantanea mandata due
    -- volte non duplica nulla.
    wa_message_id   text        UNIQUE CHECK (wa_message_id IS NULL OR char_length(wa_message_id) <= 200),
    decision_id     uuid        REFERENCES public.crm_agent_decisions(id) ON DELETE SET NULL,
    -- Avviso Telegram per i messaggi del lead: NULL = da mandare.
    notified_at     timestamptz,
    CONSTRAINT crm_messages_author_direction CHECK (
        (direction = 'in' AND author = 'lead')
        OR (direction = 'out' AND author IN ('agent', 'person'))
    ),
    CONSTRAINT crm_messages_agent_fields CHECK (
        (author = 'agent' AND purpose IS NOT NULL AND status IS NOT NULL)
        OR (author <> 'agent' AND purpose IS NULL AND status IS NULL)
    ),
    CONSTRAINT crm_messages_sent_has_body CHECK (status IS DISTINCT FROM 'sent' OR (body IS NOT NULL AND sent_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS crm_messages_venue_idx ON public.crm_messages (venue_id, created_at);
CREATE INDEX IF NOT EXISTS crm_messages_queue_idx
    ON public.crm_messages (status, created_at) WHERE status IN ('queued', 'sending');
CREATE INDEX IF NOT EXISTS crm_messages_to_notify_idx
    ON public.crm_messages (created_at) WHERE direction = 'in' AND notified_at IS NULL;
-- Un solo primo messaggio per locale (gli annullati non contano).
CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_one_first_message_idx
    ON public.crm_messages (venue_id) WHERE purpose = 'first_message' AND status <> 'cancelled';

-- -----------------------------------------------------------------------------
-- crm_wa_channel (una riga)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_wa_channel (
    id                 boolean     PRIMARY KEY DEFAULT true CHECK (id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    last_heartbeat_at  timestamptz,
    -- Cosa vede il Mac in WhatsApp Web: ok, da ricollegare (QR), un avviso.
    wa_state           text        NOT NULL DEFAULT 'unknown'
                                   CHECK (wa_state IN ('unknown', 'ok', 'needs_relink', 'warning')),
    wa_state_detail    text        CHECK (wa_state_detail IS NULL OR char_length(wa_state_detail) <= 300),
    wa_state_at        timestamptz,
    worker_version     text        CHECK (worker_version IS NULL OR char_length(worker_version) <= 40),
    failures_in_row    integer     NOT NULL DEFAULT 0 CHECK (failures_in_row >= 0),
    -- Pausa casuale di 2-4 minuti dopo ogni invio.
    next_send_at       timestamptz,
    -- Mac muto: avviso già dato per questo silenzio (si azzera al battito).
    silent_alerted_at  timestamptz,
    -- Avviso di pausa che Telegram non ha consegnato: l'edge lo ritenta a ogni
    -- controllo del watchdog finché non arriva, o finché una persona riattiva.
    alert_pending      text        CHECK (alert_pending IS NULL
                                          OR alert_pending IN ('failures', 'needs_relink', 'warning', 'silent'))
);

INSERT INTO public.crm_wa_channel (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS crm_wa_channel_set_updated_at ON public.crm_wa_channel;
CREATE TRIGGER crm_wa_channel_set_updated_at
    BEFORE UPDATE ON public.crm_wa_channel
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privilegi e RLS
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_messages, public.crm_wa_channel FROM PUBLIC, anon, authenticated;
-- Messaggi: le persone leggono e annullano un messaggio in coda (solo le due
-- colonne, e la guardia di 220100 ammette solo in coda → annullato). Scrive
-- tutto il resto l'edge col service role.
GRANT SELECT ON TABLE public.crm_messages TO authenticated;
GRANT UPDATE (status, status_reason) ON TABLE public.crm_messages TO authenticated;
GRANT SELECT ON TABLE public.crm_wa_channel TO authenticated;

ALTER TABLE public.crm_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_wa_channel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_messages select" ON public.crm_messages;
CREATE POLICY "crm_messages select" ON public.crm_messages
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_messages update" ON public.crm_messages;
CREATE POLICY "crm_messages update" ON public.crm_messages
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_wa_channel select" ON public.crm_wa_channel;
CREATE POLICY "crm_wa_channel select" ON public.crm_wa_channel
    FOR SELECT TO authenticated USING (public.is_platform_admin());

COMMIT;
