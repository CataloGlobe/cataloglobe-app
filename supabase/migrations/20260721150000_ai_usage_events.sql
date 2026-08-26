-- =============================================================================
-- ai_usage_events — metering consumo AI (FASE 2: solo logging, zero quota)
-- =============================================================================
--
-- Registra il consumo reale di ogni operazione AI (Gemini + DeepL) per tenant.
-- NESSUN enforcement in questa fase: la tabella è pura strumentazione; le quote
-- verranno derivate dai dati raccolti (fase futura, ciclo fatturazione Stripe).
--
-- Design model-agnostic: le unità grezze (units_*) sono la source of truth
-- immutabile; cost_nanos_usd è una comodità ricomputabile da (model + unità ×
-- tariffario versionato). Al cambio modello (es. ritiro gemini-2.5-flash il
-- 16 ott 2026) si aggiorna SOLO la price map in _shared/aiPricing.ts — questa
-- tabella non si tocca.
--
-- Scritture: ESCLUSIVE service_role (edge functions via _shared/aiUsageLog.ts).
-- Deviazione consapevole dal template a 4 policy:
--   - tenant_id NULLABLE: salvaguardia tecnica per job di piattaforma
--     (enqueue_platform_languages_backfill, service_role-only) che non hanno un
--     tenant innescante. In pratica sempre valorizzato.
--   - SOLO policy SELECT per il tenant proprietario (serve alla UI consumi
--     futura). Nessuna policy INSERT/UPDATE/DELETE: service_role bypassa RLS,
--     gli utenti non scrivono mai qui.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- ON DELETE SET NULL: lo storico costi di piattaforma sopravvive al purge
    -- del tenant (serve all'analisi costi globale; la quota per-tenant no).
    tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
    -- 'gemini' | 'deepl' — nessun CHECK: provider futuri (es. Google Translate
    -- fallback v1.1 del router traduzioni) non devono richiedere migration.
    provider TEXT NOT NULL,
    -- Stringa modello reale usata per la chiamata (es. 'gemini-2.5-flash').
    -- Per DeepL coincide con la chiave del tariffario ('deepl').
    model TEXT NOT NULL,
    -- 'menu_import' | 'product_enrich' | 'translation'
    operation TEXT NOT NULL,
    -- Unità grezze (source of truth, immutabili).
    units_input INTEGER NULL,
    units_output INTEGER NULL,
    units_total INTEGER NULL,
    unit_kind TEXT NOT NULL CHECK (unit_kind IN ('tokens', 'chars')),
    -- Costo calcolato (comodità, ricomputabile dalle unità grezze).
    -- Unità: nano-USD (1e-9 USD) — granularità necessaria perché un singolo
    -- evento translation può valere < 1 micro-USD.
    cost_nanos_usd BIGINT NULL,
    -- Versione del tariffario usato per il calcolo (da _shared/aiPricing.ts).
    price_map_version TEXT NULL,
    -- usageMetadata Gemini completo (audit). NULL per DeepL (nessun metadato
    -- di consumo dal provider: conteggio calcolato lato nostro).
    raw_meta JSONB NULL
);

COMMENT ON TABLE public.ai_usage_events IS
    'Metering consumo AI per tenant (Gemini token, DeepL caratteri). '
    'Solo strumentazione — nessuna quota. Scritture esclusive service_role.';

COMMENT ON COLUMN public.ai_usage_events.cost_nanos_usd IS
    'Costo in nano-USD (1e-9 USD). Ricomputabile da model + unità grezze × '
    'tariffario (price_map_version). NULL se il model non è nel tariffario.';

COMMENT ON COLUMN public.ai_usage_events.tenant_id IS
    'Tenant che ha innescato l''operazione. NULL solo per job di piattaforma '
    '(backfill system entities via service_role) — in pratica sempre valorizzato.';

-- Aggregazioni future per tenant/periodo (ciclo Stripe).
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_tenant_created
    ON public.ai_usage_events (tenant_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_events_select" ON public.ai_usage_events;
CREATE POLICY "ai_usage_events_select" ON public.ai_usage_events
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- Nessuna policy INSERT/UPDATE/DELETE (deviazione voluta dal template a 4
-- policy): la scrittura è esclusiva service_role, che bypassa RLS. Con RLS
-- abilitato e nessuna policy di scrittura, authenticated/anon non possono
-- scrivere né modificare.
