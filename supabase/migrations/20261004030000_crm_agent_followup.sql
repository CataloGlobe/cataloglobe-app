-- =============================================================================
-- CRM interno (Fase 1, F1-6): proposta di Perso e riattivazione
-- =============================================================================
-- Seguito della #213 (agente in prova). Testi di partenza nelle impostazioni,
-- vuoti = spento: li approva Alex (piano della Fase 1, F1-6).
--
--   * Proposta di Perso: dopo 10 follow-up inviati senza risposta, l'ultimo da
--     48 ore, l'agente chiede su Telegram «Metti in Perso» / «Lo gestisco io»
--     / «Non adesso». Nessun messaggio al lead.
--   * Riattivazione: un locale in Perso per obiezione da almeno
--     agent_reactivation_days giorni (90 di default) riceve, dopo il tocco,
--     il testo agent_reactivation_message; all'invio il locale torna in
--     Contattato. Una volta sola per locale. Gli stop non si riattivano mai.
--     Riattivazione corta (decisa da Alex il 2026-10-04): dopo il messaggio
--     nessun sollecito; se il lead non risponde entro 7 giorni il locale
--     torna in Perso da solo. Al massimo 10 solleciti più 1 riattivazione.
--
-- Rifatte da 20261004010100 (solo le parti nuove, il resto è identico):
-- crm_agent_decide_draft, crm_agent_candidates, crm_agent_has_work.
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_agent_drafts DROP CONSTRAINT IF EXISTS crm_agent_drafts_kind_check;
ALTER TABLE public.crm_agent_drafts ADD CONSTRAINT crm_agent_drafts_kind_check CHECK (
    kind IN ('reply', 'follow_up', 'bot_question', 'ask', 'schedule', 'stop_check', 'lost_proposal', 'reactivation')
);

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS agent_reactivation_message text
        CHECK (agent_reactivation_message IS NULL OR char_length(btrim(agent_reactivation_message)) BETWEEN 1 AND 1000),
    ADD COLUMN IF NOT EXISTS agent_reactivation_days integer NOT NULL DEFAULT 90
        CHECK (agent_reactivation_days BETWEEN 30 AND 365);

COMMIT;
