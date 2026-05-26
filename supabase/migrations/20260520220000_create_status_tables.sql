-- =========================================
-- STATUS PAGE — schema iniziale
-- =========================================
-- Backing store per la status page custom di CataloGlobe (pagina pubblica
-- /status + monitoring interno via Vercel Cron + alert email via Resend).
--
-- Tre tabelle, due ruoli:
--
--   1. status_checks
--      - Storico append-only delle health-check eseguite dal cron Vercel
--        (`/api/_cron/status-check`) ogni 2 minuti contro 4 servizi:
--        public-menu | dashboard | database | cache.
--      - SELECT pubblica (la pagina /status legge senza auth).
--      - INSERT esclusivamente via service_role (cron job).
--      - Pulizia: cron giornaliero `/api/_cron/status-prune` cancella righe
--        con `checked_at < now() - 90 days` (vedi spec, sezione "Storico").
--
--   2. status_incidents
--      - Incident manuali pubblicati dall'admin (Lorenzo) per comunicare
--        ai ristoratori. Stati: investigating | identified | monitoring |
--        resolved. Aggiornamenti accumulati in `updates` JSONB.
--      - SELECT pubblica.
--      - Mutazioni SOLO via service_role attraverso l'endpoint Vercel
--        `/api/admin/status-incidents` (che valida JWT email vs
--        ADMIN_EMAIL env var). RLS non espone INSERT/UPDATE/DELETE a
--        anon o authenticated → la verifica auth vive lato API.
--      - TODO: quando arriverà il supporto multi-admin (team interno),
--        sostituire la verifica email-based con colonna `is_admin` su
--        user_profiles e abilitare policy RLS authenticated dirette.
--
--   3. status_service_state
--      - Cache di stato corrente per servizio (1 riga per service_key).
--        Usata dal cron per detect del "cambio di stato" e anti-spam
--        delle email (1 email su transizione up→down, 1 su recovery,
--        zero email sui check consecutivi nello stesso stato).
--      - service_role only. Mai esposta al frontend pubblico.
--
-- Servizi monitorati (service_key = TEXT, validato in application code,
-- non in CHECK constraint per evitare migration churn quando se ne
-- aggiungeranno altri):
--   - 'public-menu'  → GET /api/public-catalog?slug=<canary>
--   - 'dashboard'    → GET / (homepage app, marker HTML)
--   - 'database'     → SELECT 1 via Supabase
--   - 'cache'        → redis.ping() via Upstash
--
-- Status enum (validato application-side, non SQL CHECK per stessa ragione):
--   - 'up'        → risposta <2s e content corretto
--   - 'degraded'  → risposta 2-10s OPPURE soft error
--   - 'down'      → no risposta in 10s OPPURE errore esplicito

BEGIN;

-- =========================================
-- status_checks
-- =========================================

CREATE TABLE IF NOT EXISTS public.status_checks (
    id                BIGSERIAL PRIMARY KEY,
    service_key       TEXT        NOT NULL,
    status            TEXT        NOT NULL,
    response_time_ms  INTEGER,
    error_message     TEXT,
    checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_checks_service_time_idx
    ON public.status_checks (service_key, checked_at DESC);

-- Per la query "ultimi 90 giorni per servizio" usata dalla pagina pubblica:
-- l'indice composito sopra serve a entrambi gli scenari (lista checks recenti
-- per servizio + aggregazione daily). Indice singolo su checked_at separato
-- non serve: il prune giornaliero è una DELETE su tutta la tabella ed è
-- comunque OK con scan sequenziale a quel volume (~2880 righe/giorno × 90gg
-- ≈ 260k righe massime, trascurabile).

ALTER TABLE public.status_checks ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica: la pagina /status anonima legge questi dati.
DROP POLICY IF EXISTS "status_checks public read" ON public.status_checks;
CREATE POLICY "status_checks public read"
    ON public.status_checks
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Nessuna policy INSERT/UPDATE/DELETE per anon o authenticated.
-- Tutte le scritture passano per service_role (cron Vercel), che bypassa RLS.

-- =========================================
-- status_incidents
-- =========================================

CREATE TABLE IF NOT EXISTS public.status_incidents (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT         NOT NULL,
    description         TEXT,
    status              TEXT         NOT NULL,
    severity            TEXT         NOT NULL,
    affected_services   TEXT[]       NOT NULL DEFAULT '{}',
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    updates             JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Lookup tipici dalla pagina /status:
--   - "incident attivi"   → WHERE resolved_at IS NULL
--   - "incident recenti"  → ORDER BY started_at DESC LIMIT N
CREATE INDEX IF NOT EXISTS status_incidents_active_idx
    ON public.status_incidents (started_at DESC)
    WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS status_incidents_started_idx
    ON public.status_incidents (started_at DESC);

ALTER TABLE public.status_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "status_incidents public read" ON public.status_incidents;
CREATE POLICY "status_incidents public read"
    ON public.status_incidents
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Mutazioni: service_role only via `/api/admin/status-incidents`.
-- Nessuna policy authenticated INSERT/UPDATE/DELETE per ora.

-- Trigger su updated_at: la rotta admin ne dipende per ordinamento e
-- per mostrare "Ultimo aggiornamento N min fa" sulla pagina pubblica.
CREATE OR REPLACE FUNCTION public.status_incidents_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.status_incidents_set_updated_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS status_incidents_updated_at_trigger ON public.status_incidents;
CREATE TRIGGER status_incidents_updated_at_trigger
    BEFORE UPDATE ON public.status_incidents
    FOR EACH ROW
    EXECUTE FUNCTION public.status_incidents_set_updated_at();

-- =========================================
-- status_service_state
-- =========================================
-- 1 riga per service_key. Aggiornata dal cron dopo ogni check.
-- Usata per:
--   - detect transizione (last_status diverso da current_status) → trigger alert
--   - anti-spam (last_notified_status === current_status → skip alert)
--   - mostrare "ultimo check" sulla pagina pubblica (potenzialmente, ma in
--     pratica usiamo MAX(checked_at) da status_checks; questa tabella resta
--     interna al cron)
--
-- service_role only. RLS abilitato senza policy = accesso negato a
-- anon/authenticated. Mai letta dal frontend.

CREATE TABLE IF NOT EXISTS public.status_service_state (
    service_key             TEXT         PRIMARY KEY,
    last_status             TEXT         NOT NULL,
    last_status_changed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_notified_status    TEXT,
    last_notified_at        TIMESTAMPTZ,
    last_check_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.status_service_state ENABLE ROW LEVEL SECURITY;
-- Nessuna policy → solo service_role accede.

COMMIT;
