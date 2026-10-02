-- =============================================================================
-- CRM interno (Fase 1, F1-1): fondamenta degli agenti
-- =============================================================================
-- Le reti di sicurezza che devono esistere prima del primo messaggio scritto
-- da un agente (decisioni di Alex del 2026-10-01, domande 1, 6 e 7 della Fase 1):
--
--   crm_settings (colonne nuove)
--       freno a mano: ferma ogni invio degli agenti; si aziona da /admin, da
--       Telegram o in automatico dalle altre reti; per ripartire serve una
--       persona (trigger crm_settings_agent_guard, funzione crm_set_brake);
--       tetto di spesa AI: 100 dollari al mese e 10 al giorno, avviso all'80%,
--       freno a mano al 100% (crm_record_ai_usage);
--       modello per ruolo: Sonnet 5.5 conversa, Opus 5.5 rivede e decide le
--       cose sensibili; si cambia senza rilasci.
--   crm_agent_decisions
--       il diario: ogni azione degli agenti e delle reti, col motivo in una
--       riga, l'esito del Revisore e chi ha approvato. Solo lettura e aggiunta
--       (come crm_events); se ne va a cascata col locale (dati del lead).
--   crm_ai_usage
--       registro dei costi: una riga per chiamata a Claude, coi token e il
--       costo in dollari. Lo scrive solo il service role (crm_record_ai_usage).
--       Nessun dato personale: col locale cancellato resta, senza il legame.
--   crm_brand_rules
--       le regole del brand con le versioni: una sola approvata alla volta,
--       il testo di una versione non più in bozza non cambia.
--
-- Il freno parte TIRATO: gli agenti non esistono ancora, e la prima
-- accensione resta un gesto di una persona. Funzioni in 20261002160100,
-- ACL in 20261002160200 (42601 con `supabase db push`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- crm_settings: freno a mano, tetto di spesa, modelli
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS brake_on            boolean       NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS brake_reason        text          CHECK (brake_reason IS NULL OR char_length(brake_reason) <= 300),
    ADD COLUMN IF NOT EXISTS brake_source        text          NOT NULL DEFAULT 'setup'
        CHECK (brake_source IN ('setup', 'admin', 'telegram', 'spend_cap', 'channel', 'system')),
    ADD COLUMN IF NOT EXISTS brake_changed_at    timestamptz,
    ADD COLUMN IF NOT EXISTS brake_changed_by    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ai_month_cap_usd    numeric(10,2) NOT NULL DEFAULT 100
        CHECK (ai_month_cap_usd > 0 AND ai_month_cap_usd <= 10000),
    ADD COLUMN IF NOT EXISTS ai_day_cap_usd      numeric(10,2) NOT NULL DEFAULT 10
        CHECK (ai_day_cap_usd > 0),
    -- Avviso dell'80% già mandato per quel mese ('2026-10') e quel giorno ('2026-10-02'), ora di Roma.
    ADD COLUMN IF NOT EXISTS ai_alert_month      text,
    ADD COLUMN IF NOT EXISTS ai_alert_day        text,
    ADD COLUMN IF NOT EXISTS ai_model_conversation text NOT NULL DEFAULT 'claude-sonnet-5-5'
        CHECK (ai_model_conversation ~ '^claude-[a-z0-9.-]{1,60}$'),
    ADD COLUMN IF NOT EXISTS ai_model_reviewer   text NOT NULL DEFAULT 'claude-opus-5-5'
        CHECK (ai_model_reviewer ~ '^claude-[a-z0-9.-]{1,60}$'),
    ADD COLUMN IF NOT EXISTS ai_model_sensitive  text NOT NULL DEFAULT 'claude-opus-5-5'
        CHECK (ai_model_sensitive ~ '^claude-[a-z0-9.-]{1,60}$'),
    ADD COLUMN IF NOT EXISTS ai_model_gea        text NOT NULL DEFAULT 'claude-sonnet-5-5'
        CHECK (ai_model_gea ~ '^claude-[a-z0-9.-]{1,60}$');

ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_ai_day_cap_within_month;
ALTER TABLE public.crm_settings
    ADD CONSTRAINT crm_settings_ai_day_cap_within_month CHECK (ai_day_cap_usd <= ai_month_cap_usd);

UPDATE public.crm_settings
SET brake_reason = 'Agenti non ancora accesi.'
WHERE brake_on AND brake_source = 'setup' AND brake_reason IS NULL;

-- -----------------------------------------------------------------------------
-- crm_agent_decisions (il diario)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_agent_decisions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- Chi ha agito: un agente, il Revisore, Gea, una rete automatica, una persona.
    actor           text        NOT NULL CHECK (actor IN ('agent', 'reviewer', 'gea', 'system', 'person')),
    actor_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Cosa: 'brake_on', 'spend_alert', 'brand_rules_approved', più avanti 'message_draft'…
    action          text        NOT NULL CHECK (action ~ '^[a-z][a-z_]{1,59}$'),
    -- Il perché in una riga: è la base di «perché l'hai fatto?».
    reason          text        NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
    venue_id        uuid        REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    lead_id         uuid        REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    -- Esito del Revisore e decisione di una persona sulla bozza (dalla F1-3).
    review_outcome  text        CHECK (review_outcome IN ('ok', 'rejected')),
    review_notes    text        CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
    decided_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at      timestamptz,
    payload         jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS crm_agent_decisions_created_idx ON public.crm_agent_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_agent_decisions_venue_idx
    ON public.crm_agent_decisions (venue_id, created_at DESC) WHERE venue_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- crm_ai_usage (registro dei costi)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_ai_usage (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    role                text          NOT NULL CHECK (role IN ('conversation', 'reviewer', 'sensitive', 'gea')),
    model               text          NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80),
    input_tokens        integer       NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens       integer       NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cache_read_tokens   integer       NOT NULL DEFAULT 0 CHECK (cache_read_tokens >= 0),
    cache_write_tokens  integer       NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
    cost_usd            numeric(12,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    -- Versione del listino usato (_shared/crmAi.ts): il costo resta ricalcolabile dai token.
    price_version       text,
    -- false = chiamata fallita: costo 0, resta per contare gli errori.
    ok                  boolean       NOT NULL,
    request_id          text          CHECK (request_id IS NULL OR char_length(request_id) <= 120),
    decision_id         uuid          REFERENCES public.crm_agent_decisions(id) ON DELETE SET NULL,
    venue_id            uuid          REFERENCES public.crm_venues(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS crm_ai_usage_created_idx ON public.crm_ai_usage (created_at DESC);

-- -----------------------------------------------------------------------------
-- crm_brand_rules (regole del brand con versioni)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_brand_rules (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    version      integer     NOT NULL UNIQUE CHECK (version > 0),
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    body         text        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
    note         text        CHECK (note IS NULL OR char_length(note) <= 300),
    status       text        NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'retired', 'discarded')),
    approved_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at  timestamptz
);

-- Una sola versione in vigore.
CREATE UNIQUE INDEX IF NOT EXISTS crm_brand_rules_one_approved_idx
    ON public.crm_brand_rules (status) WHERE status = 'approved';

-- -----------------------------------------------------------------------------
-- Privilegi e RLS: solo admin di piattaforma
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_agent_decisions, public.crm_ai_usage, public.crm_brand_rules
    FROM PUBLIC, anon, authenticated;

-- Diario: solo lettura e aggiunta, come la storia (crm_events).
GRANT SELECT, INSERT ON TABLE public.crm_agent_decisions TO authenticated;
-- Costi: li scrive solo il service role.
GRANT SELECT ON TABLE public.crm_ai_usage TO authenticated;
-- Regole: le scrivono le funzioni crm_*_brand_rules (SECURITY INVOKER).
GRANT SELECT, INSERT, UPDATE ON TABLE public.crm_brand_rules TO authenticated;

ALTER TABLE public.crm_agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ai_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_brand_rules     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_agent_decisions select" ON public.crm_agent_decisions;
CREATE POLICY "crm_agent_decisions select" ON public.crm_agent_decisions
    FOR SELECT TO authenticated USING (public.is_platform_admin());
-- Dal client una persona scrive solo a nome suo: niente righe a nome degli
-- agenti, del Revisore o di un'altra persona (i trigger crm_* scrivono
-- 'person' con crm_agent_actor() = auth.uid()). Il resto lo scrive il service role.
DROP POLICY IF EXISTS "crm_agent_decisions insert" ON public.crm_agent_decisions;
CREATE POLICY "crm_agent_decisions insert" ON public.crm_agent_decisions
    FOR INSERT TO authenticated WITH CHECK (
        public.is_platform_admin()
        AND actor = 'person'
        AND actor_user_id = auth.uid()
        AND review_outcome IS NULL
        AND (decided_by IS NULL OR decided_by = auth.uid())
    );

DROP POLICY IF EXISTS "crm_ai_usage select" ON public.crm_ai_usage;
CREATE POLICY "crm_ai_usage select" ON public.crm_ai_usage
    FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_brand_rules select" ON public.crm_brand_rules;
CREATE POLICY "crm_brand_rules select" ON public.crm_brand_rules
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_brand_rules insert" ON public.crm_brand_rules;
CREATE POLICY "crm_brand_rules insert" ON public.crm_brand_rules
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_brand_rules update" ON public.crm_brand_rules;
CREATE POLICY "crm_brand_rules update" ON public.crm_brand_rules
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

COMMIT;
