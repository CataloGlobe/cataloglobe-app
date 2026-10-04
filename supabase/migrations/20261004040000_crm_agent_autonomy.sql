-- =============================================================================
-- CRM interno (Fase 1, F1-7): uscita dalla prova, tabelle
-- =============================================================================
-- Regole decise da Alex il 2026-10-01 (piano Fase 1, sezione G): un tipo
-- (risposte, follow-up) diventa autonomo dopo 5 bozze approvate di fila senza
-- modifiche e dopo almeno 3 giorni di prova; dopo una correzione torna in
-- approvazione per 3. Le azioni sensibili (richieste per una persona, «sei un
-- bot?», stop, orari, Perso, riattivazioni) restano sempre con conferma.
--
-- Solo il codice: l'accensione (agent_autonomy_on) è spenta e la decide
-- Alex. Finché è spenta il CRM dice soltanto quando un tipo è pronto.
-- =============================================================================

BEGIN;

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS agent_autonomy_on boolean NOT NULL DEFAULT false;

ALTER TABLE public.crm_agent_trust
    -- Prima approvazione del tipo: i 3 giorni di prova contano da qui.
    ADD COLUMN IF NOT EXISTS started_at timestamptz,
    -- Approvate di fila che servono: 5 la prima volta, 3 dopo una correzione.
    ADD COLUMN IF NOT EXISTS required_in_row integer NOT NULL DEFAULT 5 CHECK (required_in_row BETWEEN 1 AND 20),
    ADD COLUMN IF NOT EXISTS autonomous boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS autonomous_since timestamptz,
    ADD COLUMN IF NOT EXISTS earned_once boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_auto integer NOT NULL DEFAULT 0 CHECK (total_auto >= 0),
    ADD COLUMN IF NOT EXISTS eligible_notified_at timestamptz;

COMMIT;
