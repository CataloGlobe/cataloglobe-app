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
-- `crm_import_runs`: un import CSV dal Centro lead di Meta, coi conteggi.
-- I lead arrivati da più di 24 ore non hanno una notifica ciascuno: crm-notify
-- manda un solo messaggio di riepilogo per import (decisione di Alex del
-- 2026-10-01). La riga la scrive /admin a fine import; `notified_at` nullo =
-- riepilogo da mandare.
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

CREATE TABLE IF NOT EXISTS public.crm_import_runs (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    source           text        NOT NULL CHECK (source IN ('meta_csv')),
    created_count    integer     NOT NULL CHECK (created_count >= 0),
    returned_count   integer     NOT NULL CHECK (returned_count >= 0),
    duplicate_count  integer     NOT NULL CHECK (duplicate_count >= 0),
    suppressed_count integer     NOT NULL CHECK (suppressed_count >= 0),
    failed_count     integer     NOT NULL CHECK (failed_count >= 0),
    -- Outbox Telegram del riepilogo: NULL = da mandare.
    notified_at      timestamptz
);

CREATE INDEX IF NOT EXISTS crm_import_runs_to_notify_idx
    ON public.crm_import_runs (created_at) WHERE notified_at IS NULL;

REVOKE ALL ON TABLE public.crm_import_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.crm_import_runs TO authenticated;
ALTER TABLE public.crm_import_runs ENABLE ROW LEVEL SECURITY;

-- Gli admin registrano i propri import; notified_at lo scrive solo crm-notify.
DROP POLICY IF EXISTS "crm_import_runs select" ON public.crm_import_runs;
CREATE POLICY "crm_import_runs select" ON public.crm_import_runs
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_import_runs insert" ON public.crm_import_runs;
CREATE POLICY "crm_import_runs insert" ON public.crm_import_runs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_admin() AND created_by = auth.uid() AND notified_at IS NULL);

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS telegram_bot_username text
        CHECK (telegram_bot_username IS NULL OR telegram_bot_username ~ '^[A-Za-z0-9_]{5,32}$');

COMMIT;
