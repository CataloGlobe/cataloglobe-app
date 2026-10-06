-- =============================================================================
-- CRM interno (Fase 1, F1-8): Gea 1 su Telegram, tabella
-- =============================================================================
-- Gea è l'assistente del team: risponde ad Alex e Lorenzo nella stessa chat
-- del bot del CRM. Non scrive mai ai lead (crm_lead_send_gate le dice sempre
-- no). Gea 1 legge solo testo: un vocale riceve «scrivimelo».
--
--   * crm_gea_inbox: ingresso unico. Ogni messaggio a Gea, con chi l'ha
--     mandato, da dove (testo o vocale su Telegram), cosa ha capito Gea, la
--     risposta, il costo. Un comando che vuole un tocco di conferma (gruppo
--     2) resta qui con `pending_command` finché qualcuno non tocca il tasto.
--     (chat_id, message_id) unico: Telegram che ripete un update non fa
--     rispondere Gea due volte.
--
-- Tabella di piattaforma come le altre crm_*: niente tenant_id, RLS su
-- is_platform_admin(), dal client solo lettura. Scrive il webhook di
-- Telegram col service role. Funzioni in 20261004050100, GRANT in 050200.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_gea_inbox (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    user_id          uuid        NOT NULL REFERENCES public.crm_team_members(user_id) ON DELETE CASCADE,
    source           text        NOT NULL CHECK (source IN ('telegram_text', 'telegram_voice')),
    chat_id          bigint      NOT NULL,
    message_id       bigint      NOT NULL,
    body             text        CHECK (body IS NULL OR char_length(body) <= 4000),
    status           text        NOT NULL DEFAULT 'received'
                                 CHECK (status IN ('received', 'working', 'answered', 'pending', 'refused', 'failed', 'ignored')),
    -- Cosa ha capito Gea: question, command, today, refuse, other.
    intent           text        CHECK (intent IS NULL OR intent ~ '^[a-z_]{1,30}$'),
    -- Lo strumento di sola lettura usato o il comando eseguito.
    tool             text        CHECK (tool IS NULL OR tool ~ '^[a-z_]{1,40}$'),
    reply            text        CHECK (reply IS NULL OR char_length(reply) <= 4000),
    -- Comando del gruppo 2 in attesa del tocco «Sì, fallo».
    pending_command  jsonb       CHECK (pending_command IS NULL OR jsonb_typeof(pending_command) = 'object'),
    confirmed_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    confirmed_at     timestamptz,
    cost_usd         numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    error            text        CHECK (error IS NULL OR char_length(error) <= 300),
    answered_at      timestamptz,
    CONSTRAINT crm_gea_inbox_message_key UNIQUE (chat_id, message_id),
    CONSTRAINT crm_gea_inbox_pending CHECK ((status = 'pending') = (pending_command IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS crm_gea_inbox_created_idx ON public.crm_gea_inbox (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_gea_inbox_user_idx ON public.crm_gea_inbox (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Privilegi e RLS: dal client solo lettura
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_gea_inbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_gea_inbox TO authenticated;
GRANT ALL ON TABLE public.crm_gea_inbox TO service_role;

ALTER TABLE public.crm_gea_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_gea_inbox select" ON public.crm_gea_inbox;
CREATE POLICY "crm_gea_inbox select" ON public.crm_gea_inbox
    FOR SELECT TO authenticated USING (public.is_platform_admin());

COMMIT;
