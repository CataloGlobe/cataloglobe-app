-- =============================================================================
-- CRM interno (Fase 1, F1-3): agente WhatsApp in prova, tabelle
-- =============================================================================
-- L'agente scrive ai lead, ma ogni testo è una bozza che va su Telegram ad
-- Alex e Lorenzo e parte solo dopo il tocco di una persona (call con Lorenzo
-- del 2026-10-03). Quando non sa cosa fare non scrive nulla al lead.
--
--   * crm_agent_drafts: una bozza o una richiesta di intervento per locale.
--     Tipi: reply, follow_up, bot_question («sei un bot?»: risposta proposta),
--     ask (serve una persona), schedule (il lead ha accettato un orario),
--     stop_check (stop o obiezione?). Una sola aperta per locale.
--   * crm_agent_draft_messages: i messaggi Telegram di ogni bozza, per chat
--     (tasti da chiudere quando decide qualcuno, risposta forzata di «Lo
--     correggo io»).
--   * crm_agent_trust: per tipo, le approvate di fila senza modifiche. Solo
--     registro: l'uscita dalla prova è F1-7.
--   * crm_messages: draft_id (la bozza da cui viene il testo) e send_after
--     (il primo messaggio aspetta 2-5 minuti dopo il form).
--   * crm_settings: agent_replies_on, agent_followups_on (spenti: li accende
--     Alex quando le regole del brand sono approvate).
--
-- Tabelle di piattaforma come le altre crm_*: niente tenant_id, RLS su
-- is_platform_admin(), dal client solo lettura. Scrive l'edge crm-agent e il
-- webhook di Telegram col service role. Funzioni in 20261004010100, GRANT in
-- 010200, cron in 010300.
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS agent_replies_on boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS agent_followups_on boolean NOT NULL DEFAULT false,
    -- Da quando le risposte sono accese: i messaggi dei lead arrivati prima
    -- non diventano bozze (niente valanga di chat vecchie all'accensione).
    ADD COLUMN IF NOT EXISTS agent_replies_on_since timestamptz;

CREATE TABLE IF NOT EXISTS public.crm_agent_drafts (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    venue_id            uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    lead_id             uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    contact_id          uuid        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    kind                text        NOT NULL
                                    CHECK (kind IN ('reply', 'follow_up', 'bot_question', 'ask', 'schedule', 'stop_check')),
    status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'sent', 'edited', 'discarded', 'expired', 'scheduled', 'handled')),
    -- L'ultimo messaggio del lead considerato: se ne arriva uno più nuovo
    -- prima del tocco, la bozza scade e si rifà.
    trigger_message_id  uuid        REFERENCES public.crm_messages(id) ON DELETE SET NULL,
    proposed_text       text        CHECK (proposed_text IS NULL OR char_length(proposed_text) BETWEEN 1 AND 1000),
    final_text          text        CHECK (final_text IS NULL OR char_length(final_text) BETWEEN 1 AND 1000),
    reason              text        CHECK (reason IS NULL OR char_length(reason) <= 500),
    review_notes        text        CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
    review_rounds       integer     NOT NULL DEFAULT 0 CHECK (review_rounds BETWEEN 0 AND 5),
    proposed_starts_at  timestamptz,
    follow_up_number    integer     CHECK (follow_up_number IS NULL OR follow_up_number BETWEEN 1 AND 20),
    decision_id         uuid        REFERENCES public.crm_agent_decisions(id) ON DELETE SET NULL,
    message_id          uuid        REFERENCES public.crm_messages(id) ON DELETE SET NULL,
    appointment_id      uuid        REFERENCES public.crm_appointments(id) ON DELETE SET NULL,
    decided_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at          timestamptz,
    notified_at         timestamptz,
    reminders           integer     NOT NULL DEFAULT 0 CHECK (reminders >= 0),
    last_reminded_at    timestamptz,
    cost_usd            numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    CONSTRAINT crm_agent_drafts_schedule_time CHECK ((kind = 'schedule') = (proposed_starts_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_agent_drafts_one_open_idx
    ON public.crm_agent_drafts (venue_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS crm_agent_drafts_venue_idx ON public.crm_agent_drafts (venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_pending_idx ON public.crm_agent_drafts (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.crm_agent_draft_messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    draft_id    uuid        NOT NULL REFERENCES public.crm_agent_drafts(id) ON DELETE CASCADE,
    user_id     uuid        REFERENCES public.crm_team_members(user_id) ON DELETE SET NULL,
    chat_id     bigint      NOT NULL,
    message_id  bigint      NOT NULL,
    role        text        NOT NULL CHECK (role IN ('draft', 'reminder', 'edit_prompt')),
    UNIQUE (chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS crm_agent_draft_messages_draft_idx ON public.crm_agent_draft_messages (draft_id);

CREATE TABLE IF NOT EXISTS public.crm_agent_trust (
    kind              text        PRIMARY KEY CHECK (kind IN ('reply', 'follow_up')),
    approved_in_row   integer     NOT NULL DEFAULT 0 CHECK (approved_in_row >= 0),
    since             timestamptz,
    total_approved    integer     NOT NULL DEFAULT 0 CHECK (total_approved >= 0),
    total_edited      integer     NOT NULL DEFAULT 0 CHECK (total_edited >= 0),
    total_discarded   integer     NOT NULL DEFAULT 0 CHECK (total_discarded >= 0),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.crm_agent_trust (kind) VALUES ('reply'), ('follow_up') ON CONFLICT (kind) DO NOTHING;

ALTER TABLE public.crm_messages
    ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES public.crm_agent_drafts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS send_after timestamptz;

-- -----------------------------------------------------------------------------
-- Privilegi e RLS: dal client solo lettura
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_agent_drafts, public.crm_agent_draft_messages, public.crm_agent_trust
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_agent_drafts, public.crm_agent_trust TO authenticated;
GRANT ALL ON TABLE public.crm_agent_drafts, public.crm_agent_draft_messages, public.crm_agent_trust TO service_role;

ALTER TABLE public.crm_agent_drafts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agent_draft_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agent_trust          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_agent_drafts select" ON public.crm_agent_drafts;
CREATE POLICY "crm_agent_drafts select" ON public.crm_agent_drafts
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_agent_trust select" ON public.crm_agent_trust;
CREATE POLICY "crm_agent_trust select" ON public.crm_agent_trust
    FOR SELECT TO authenticated USING (public.is_platform_admin());

COMMIT;
