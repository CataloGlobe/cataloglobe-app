-- =============================================================================
-- CRM interno (Fase 0): tabelle
-- =============================================================================
-- Il CRM di CataloGlobe vive in /admin e lo usano solo gli admin di
-- piattaforma (`public.platform_admins`). Piano: second brain di Alex,
-- `piano-costruzione` (2026-10-01).
--
-- ECCEZIONE MOTIVATA alla regola tenant_id, come `public.leads`
-- (20260926120000): sono dati di piattaforma (chi potrebbe diventare cliente),
-- non appartengono a nessun tenant. Accesso: RLS con policy
-- `public.is_platform_admin()` per `authenticated`, niente per `anon`.
--
-- AGGIUNTA PURA: nessuna tabella, funzione o policy esistente viene toccata.
-- `crm_venues.tenant_id` NON ha FK verso `public.tenants` di proposito: una FK
-- aggiungerebbe trigger di sistema su `tenants`. Il collegamento lo scrive solo
-- il job di sincronizzazione con gli account (PR successiva), che gestisce da
-- sé i tenant spariti.
--
-- Tabelle:
--   crm_team_members  chi lavora i lead (Alex, Lorenzo) e la sua chat Telegram
--   crm_venues        il locale = la carta della pipeline a 8 colonne
--   crm_contacts      le persone del locale; chiave dei doppioni = telefono E.164
--   crm_leads         ogni ingresso (landing, form Meta, chat WhatsApp, a mano)
--   crm_events        la storia unica del locale (solo aggiunte)
--   crm_settings      una riga: impostazioni (testo WhatsApp pronto)
--   crm_landing_imported  id dei contatti della landing già copiati (senza FK)
--   crm_suppressions      impronte dei telefoni che hanno chiesto lo stop
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- crm_team_members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_team_members (
    user_id                   uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at                timestamptz NOT NULL DEFAULT now(),
    display_name              text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
    -- Chat privata col bot, salvata dal webhook Telegram dopo /start <token>.
    telegram_chat_id          bigint      UNIQUE,
    telegram_link_token       uuid        UNIQUE,
    telegram_link_expires_at  timestamptz,
    -- A chi va il lead nuovo (uno solo: indice parziale sotto).
    is_default_assignee       boolean     NOT NULL DEFAULT false,
    -- Chi riceve il sollecito dei lead fermi in Nuovo.
    receives_escalations      boolean     NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_team_members_one_default_idx
    ON public.crm_team_members (is_default_assignee) WHERE is_default_assignee;

-- -----------------------------------------------------------------------------
-- crm_venues
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_venues (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    name                text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    city                text        CHECK (city IS NULL OR char_length(city) <= 120),
    stage               text        NOT NULL DEFAULT 'nuovo'
                                    CHECK (stage IN (
                                        'nuovo', 'contattato', 'in_conversazione', 'appuntamento',
                                        'chiamata_fatta', 'in_prova', 'cliente_pagante', 'perso'
                                    )),
    -- obiezione = "non adesso" (si riattiva); stop = "non contattatemi più" (definitivo).
    lost_kind           text        CHECK (lost_kind IN ('obiezione', 'stop')),
    lost_reason         text        CHECK (lost_reason IS NULL OR char_length(lost_reason) <= 500),
    assigned_to         uuid        REFERENCES public.crm_team_members(user_id) ON DELETE SET NULL,
    -- Account CataloGlobe collegato (niente FK, vedi intestazione).
    tenant_id           uuid,
    link_source         text        CHECK (link_source IN ('phone_auto', 'manual')),
    referred_by         text        CHECK (referred_by IS NULL OR char_length(referred_by) <= 160),
    stage_changed_at    timestamptz NOT NULL DEFAULT now(),
    first_contacted_at  timestamptz,
    last_activity_at    timestamptz NOT NULL DEFAULT now(),
    -- Perso ha sempre tipo e motivo; fuori da Perso non restano valori vecchi
    -- (lo storico dei motivi sta in crm_events).
    CONSTRAINT crm_venues_lost_consistent CHECK (
        (stage = 'perso' AND lost_kind IS NOT NULL
            AND lost_reason IS NOT NULL AND char_length(btrim(lost_reason)) > 0)
        OR (stage <> 'perso' AND lost_kind IS NULL AND lost_reason IS NULL)
    ),
    CONSTRAINT crm_venues_link_consistent CHECK ((tenant_id IS NULL) = (link_source IS NULL))
);

CREATE INDEX IF NOT EXISTS crm_venues_stage_idx ON public.crm_venues (stage);
CREATE INDEX IF NOT EXISTS crm_venues_assigned_to_idx ON public.crm_venues (assigned_to);
CREATE INDEX IF NOT EXISTS crm_venues_last_activity_idx ON public.crm_venues (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS crm_venues_tenant_id_idx ON public.crm_venues (tenant_id) WHERE tenant_id IS NOT NULL;

-- Funzione esistente, solo usata (non modificata): NEW.updated_at = now().
DROP TRIGGER IF EXISTS crm_venues_set_updated_at ON public.crm_venues;
CREATE TRIGGER crm_venues_set_updated_at
    BEFORE UPDATE ON public.crm_venues
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- crm_contacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    venue_id    uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    -- Chiave dei doppioni: lo stesso telefono è la stessa persona, quindi lo
    -- stesso locale. E.164 normalizzato prima di arrivare qui.
    phone_e164  text        UNIQUE CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    email       text        CHECK (email IS NULL OR char_length(email) <= 254),
    role        text        CHECK (role IS NULL OR char_length(role) <= 80)
);

CREATE INDEX IF NOT EXISTS crm_contacts_venue_id_idx ON public.crm_contacts (venue_id);
CREATE INDEX IF NOT EXISTS crm_contacts_email_idx ON public.crm_contacts (lower(email)) WHERE email IS NOT NULL;

-- -----------------------------------------------------------------------------
-- crm_leads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    venue_id       uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    contact_id     uuid        REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    -- meta_form vale sia per il webhook sia per l'import CSV dal Centro lead:
    -- stesso id del lead Meta in source_ref, quindi niente doppioni tra i due.
    source         text        NOT NULL CHECK (source IN ('landing', 'meta_form', 'whatsapp', 'manuale')),
    -- Id nella fonte (leads.id, leadgen_id di Meta). Idempotenza dell'ingresso.
    source_ref     text        CHECK (source_ref IS NULL OR char_length(source_ref) <= 200),
    ad_id          text        CHECK (ad_id IS NULL OR char_length(ad_id) <= 200),
    ad_name        text        CHECK (ad_name IS NULL OR char_length(ad_name) <= 300),
    campaign       text        CHECK (campaign IS NULL OR char_length(campaign) <= 300),
    form_answers   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    interests      text[]      NOT NULL DEFAULT '{}',
    consent_at     timestamptz,
    consent_text   text,
    received_at    timestamptz NOT NULL DEFAULT now(),
    -- Outbox Telegram: NULL = da notificare.
    notified_at    timestamptz,
    -- Sollecito a chi riceve le escalation: una volta sola.
    escalated_at   timestamptz,
    CONSTRAINT crm_leads_source_ref_key UNIQUE (source, source_ref)
);

CREATE INDEX IF NOT EXISTS crm_leads_venue_id_idx ON public.crm_leads (venue_id, received_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_received_at_idx ON public.crm_leads (received_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_to_notify_idx ON public.crm_leads (received_at) WHERE notified_at IS NULL;

-- -----------------------------------------------------------------------------
-- crm_events (storia unica, solo aggiunte)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_events (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    venue_id       uuid        NOT NULL REFERENCES public.crm_venues(id) ON DELETE CASCADE,
    lead_id        uuid        REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    type           text        NOT NULL CHECK (type IN (
                                   'lead_in', 'lead_returned', 'assigned', 'stage_changed',
                                   'whatsapp_opened', 'note', 'account_linked', 'escalated'
                               )),
    -- NULL = il sistema (ingresso, job).
    actor_user_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    payload        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS crm_events_venue_id_idx ON public.crm_events (venue_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- crm_settings (una riga)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_settings (
    id                 boolean     PRIMARY KEY DEFAULT true CHECK (id),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    -- Segnaposto {nome} e {locale}. NULL finché Alex non approva il testo.
    whatsapp_template  text        CHECK (whatsapp_template IS NULL OR char_length(whatsapp_template) <= 1000)
);

INSERT INTO public.crm_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS crm_settings_set_updated_at ON public.crm_settings;
CREATE TRIGGER crm_settings_set_updated_at
    BEFORE UPDATE ON public.crm_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- crm_landing_imported (marcatore della copia dalla landing)
-- -----------------------------------------------------------------------------
-- Una riga per ogni `public.leads.id` già passato dalla copia, qualunque sia
-- l'esito (entrato, doppione, escluso). Niente FK, né verso `leads` né verso
-- `crm_leads`: deve sopravvivere alla cancellazione del locale dal CRM,
-- altrimenti la copia ogni minuto lo ricreerebbe finché la riga resta in
-- `leads` (fino a 12 mesi). Nessun dato personale: solo l'id.
CREATE TABLE IF NOT EXISTS public.crm_landing_imported (
    lead_id      uuid        PRIMARY KEY,
    imported_at  timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- crm_suppressions (lista di esclusione degli stop)
-- -----------------------------------------------------------------------------
-- Chi ha chiesto di non essere più contattato (Perso, tipo stop) non deve
-- rientrare da nessuna fonte, neanche dopo che il suo locale è stato
-- cancellato. Si conserva solo l'impronta del telefono (sha256 dell'E.164,
-- `public.crm_phone_fingerprint`), mai il numero in chiaro. La scrive il
-- trigger di cancellazione di `crm_venues` (20261001120100); la legge
-- `crm_ingest_lead`. Decisione di Alex del 2026-10-01, da validare col
-- consulente nella verifica GDPR.
CREATE TABLE IF NOT EXISTS public.crm_suppressions (
    phone_fingerprint  text        PRIMARY KEY CHECK (phone_fingerprint ~ '^[0-9a-f]{64}$'),
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Privilegi: niente ad anon; authenticated passa comunque dalle policy.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE
    public.crm_team_members, public.crm_venues, public.crm_contacts,
    public.crm_leads, public.crm_events, public.crm_settings
    FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.crm_team_members, public.crm_venues, public.crm_contacts, public.crm_leads
    TO authenticated;
-- Storia: solo lettura e aggiunta. Le righe se ne vanno solo a cascata col locale.
GRANT SELECT, INSERT ON TABLE public.crm_events TO authenticated;
-- Impostazioni: la riga esiste già, si legge e si aggiorna.
GRANT SELECT, UPDATE ON TABLE public.crm_settings TO authenticated;

-- Marcatore ed esclusioni: li scrivono solo la copia (postgres, pg_cron) e il
-- trigger SECURITY DEFINER. Gli admin leggono le esclusioni perché
-- crm_ingest_lead (SECURITY INVOKER) le controlla anche dall'aggiunta a mano
-- e dall'import CSV.
REVOKE ALL ON TABLE public.crm_landing_imported, public.crm_suppressions
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_suppressions TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS: solo admin di piattaforma
-- -----------------------------------------------------------------------------
ALTER TABLE public.crm_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_venues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings     ENABLE ROW LEVEL SECURITY;
-- Senza policy: nessun accesso da authenticated.
ALTER TABLE public.crm_landing_imported ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_suppressions     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['crm_team_members', 'crm_venues', 'crm_contacts', 'crm_leads']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' select', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_admin())',
            t || ' select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' insert', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin())',
            t || ' insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' update', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin())',
            t || ' update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || ' delete', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_platform_admin())',
            t || ' delete', t);
    END LOOP;
END $$;

DROP POLICY IF EXISTS "crm_events select" ON public.crm_events;
CREATE POLICY "crm_events select" ON public.crm_events
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_events insert" ON public.crm_events;
CREATE POLICY "crm_events insert" ON public.crm_events
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_settings select" ON public.crm_settings;
CREATE POLICY "crm_settings select" ON public.crm_settings
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_settings update" ON public.crm_settings;
CREATE POLICY "crm_settings update" ON public.crm_settings
    FOR UPDATE TO authenticated
    USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_suppressions select" ON public.crm_suppressions;
CREATE POLICY "crm_suppressions select" ON public.crm_suppressions
    FOR SELECT TO authenticated USING (public.is_platform_admin());

COMMENT ON TABLE public.crm_landing_imported IS
    'CRM interno: id dei public.leads già copiati. Senza FK di proposito: sopravvive alla cancellazione del locale.';
COMMENT ON TABLE public.crm_suppressions IS
    'CRM interno: impronte (sha256 E.164) dei telefoni che hanno chiesto lo stop. Mai il numero in chiaro.';
COMMENT ON TABLE public.crm_venues IS
    'CRM interno: il locale (carta della pipeline). Tabella di piattaforma: niente tenant_id, accesso solo is_platform_admin().';
COMMENT ON TABLE public.crm_leads IS
    'CRM interno: ogni ingresso di un lead. UNIQUE(source, source_ref) rende idempotente l''ingresso.';
COMMENT ON TABLE public.crm_events IS
    'CRM interno: storia del locale, solo aggiunte.';

COMMIT;
