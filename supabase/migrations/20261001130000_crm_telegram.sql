-- =============================================================================
-- CRM interno (Fase 0): notifiche Telegram
-- =============================================================================
-- `crm_telegram_messages`: ogni messaggio mandato dal bot, uno per lead e per
-- destinatario. Serve a riscrivere i messaggi di tutti dopo un passaggio
-- («Preso da <nome>», pulsanti invertiti) e a non mandare due volte lo stesso
-- messaggio quando un invio fallisce a metà e il job riprova.
--
-- `crm_settings.telegram_bot_username`: il nome del bot (senza @), per il
-- link «Collega Telegram» in /admin. Non è un segreto: il token del bot sta
-- solo nell'env delle edge (TELEGRAM_BOT_TOKEN).
--
-- Solo tabelle e colonne del CRM: nessun oggetto esistente cambia.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_telegram_messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    lead_id     uuid        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    venue_id    uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    user_id     uuid        NOT NULL REFERENCES public.crm_team_members(user_id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN ('new_lead', 'returned', 'escalation')),
    chat_id     bigint      NOT NULL,
    message_id  bigint      NOT NULL,
    CONSTRAINT crm_telegram_messages_once UNIQUE (lead_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS crm_telegram_messages_venue_idx
    ON public.crm_telegram_messages (venue_id);
CREATE INDEX IF NOT EXISTS crm_telegram_messages_chat_msg_idx
    ON public.crm_telegram_messages (chat_id, message_id);

REVOKE ALL ON TABLE public.crm_telegram_messages FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.crm_telegram_messages TO authenticated;

ALTER TABLE public.crm_telegram_messages ENABLE ROW LEVEL SECURITY;

-- Solo lettura per gli admin: scrivono le edge col service role.
DROP POLICY IF EXISTS "crm_telegram_messages select" ON public.crm_telegram_messages;
CREATE POLICY "crm_telegram_messages select" ON public.crm_telegram_messages
    FOR SELECT TO authenticated USING (public.is_platform_admin());

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS telegram_bot_username text
        CHECK (telegram_bot_username IS NULL OR telegram_bot_username ~ '^[A-Za-z0-9_]{5,32}$');

COMMIT;
