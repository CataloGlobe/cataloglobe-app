-- =============================================================================
-- CRM, Fase 2 (F2-1): base dei contatti per l'outreach, solo dati.
--
--   crm_outreach_prospects  contatti a freddo, prima che diventino lead
--   crm_email_suppressions  impronte delle mail che non vanno più scritte
--
-- I contatti a freddo stanno fuori da crm_venues: entrano nella pipeline solo
-- quando rispondono (F2-2), così migliaia di righe non riempiono Lead. Ogni
-- contatto dice da dove viene (fonte, dettaglio, data): serve a rispondere a
-- «dove avete preso il mio indirizzo». La fonte vera aspetta la risposta
-- legale: questa migrazione non importa niente e non manda niente.
--
-- La lista di esclusione delle mail è come crm_suppressions per i telefoni:
-- solo l'impronta sha256 dell'indirizzo normalizzato, mai l'indirizzo in
-- chiaro, sopravvive alla cancellazione del contatto. Dal client si legge e
-- basta; si scrive solo con crm_suppress_email (migrazione successiva).
--
-- Tabelle nuove, nessuna tabella, funzione o policy esistente toccata.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- crm_outreach_prospects
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_outreach_prospects (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    name                 text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
    city                 text        CHECK (city IS NULL OR char_length(city) <= 120),
    -- Tipo di locale come lo dice la fonte (ristorante, pizzeria, bar...).
    category             text        CHECK (category IS NULL OR char_length(category) <= 80),
    address              text        CHECK (address IS NULL OR char_length(address) <= 300),
    website              text        CHECK (website IS NULL OR char_length(website) <= 500),
    instagram            text        CHECK (instagram IS NULL OR char_length(instagram) <= 100),
    -- Normalizzata (minuscole, senza spazi) dal trigger di guardia.
    email                text        CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
    phone_e164           text        CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),

    -- Provenienza, obbligatoria.
    source               text        NOT NULL CHECK (source IN ('lista', 'scraper', 'a_mano')),
    source_detail        text        NOT NULL CHECK (char_length(btrim(source_detail)) BETWEEN 1 AND 300),
    source_collected_at  timestamptz NOT NULL,

    -- Verifica dell'indirizzo (servizio esterno, F2-2).
    email_check          text        NOT NULL DEFAULT 'da_verificare'
                                     CHECK (email_check IN ('da_verificare', 'valida', 'rischiosa', 'non_valida')),
    email_checked_at     timestamptz,

    -- Segnali del punteggio di partenza.
    rating               numeric(2,1) CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
    reviews_count        integer     CHECK (reviews_count IS NULL OR reviews_count >= 0),
    has_online_menu      boolean,
    locations_count      integer     CHECK (locations_count IS NULL OR locations_count >= 1),
    score                smallint    CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    scored_at            timestamptz,

    status               text        NOT NULL DEFAULT 'da_contattare'
                                     CHECK (status IN ('da_contattare', 'escluso', 'contattato', 'convertito')),
    excluded_reason      text        CHECK (excluded_reason IN (
                                         'catena_grande', 'gia_lead', 'gia_cliente', 'lista_stop', 'non_valida', 'a_mano'
                                     )),
    -- Il locale nella pipeline, quando risponde. Niente vincolo con
    -- 'convertito': dopo la pulizia dei 12 mesi il locale non c'è più e il
    -- contatto resta convertito senza locale (un CHECK bloccherebbe la DELETE).
    venue_id             uuid        REFERENCES public.crm_venues(id) ON DELETE SET NULL,

    CONSTRAINT crm_outreach_prospects_reachable CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL OR instagram IS NOT NULL),
    CONSTRAINT crm_outreach_prospects_excluded_consistent CHECK ((status = 'escluso') = (excluded_reason IS NOT NULL))
);

-- Doppioni: la stessa mail o lo stesso telefono è lo stesso contatto.
CREATE UNIQUE INDEX IF NOT EXISTS crm_outreach_prospects_email_key
    ON public.crm_outreach_prospects (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_outreach_prospects_phone_key
    ON public.crm_outreach_prospects (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_outreach_prospects_queue_idx
    ON public.crm_outreach_prospects (score DESC NULLS LAST) WHERE status = 'da_contattare';
CREATE INDEX IF NOT EXISTS crm_outreach_prospects_venue_id_idx
    ON public.crm_outreach_prospects (venue_id) WHERE venue_id IS NOT NULL;

-- Funzione esistente, solo usata (non modificata): NEW.updated_at = now().
DROP TRIGGER IF EXISTS crm_outreach_prospects_set_updated_at ON public.crm_outreach_prospects;
CREATE TRIGGER crm_outreach_prospects_set_updated_at
    BEFORE UPDATE ON public.crm_outreach_prospects
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- crm_email_suppressions (lista di esclusione permanente delle mail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_email_suppressions (
    email_fingerprint  text        PRIMARY KEY CHECK (email_fingerprint ~ '^[0-9a-f]{64}$'),
    reason             text        NOT NULL CHECK (reason IN ('disiscritto', 'richiesta', 'rimbalzo', 'a_mano')),
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- Privilegi e RLS: solo admin di piattaforma
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.crm_outreach_prospects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_outreach_prospects TO authenticated;
-- Le impronte si leggono e basta: le scrive crm_suppress_email.
REVOKE ALL ON TABLE public.crm_email_suppressions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.crm_email_suppressions TO authenticated;

ALTER TABLE public.crm_outreach_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_outreach_prospects select" ON public.crm_outreach_prospects;
CREATE POLICY "crm_outreach_prospects select" ON public.crm_outreach_prospects
    FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_outreach_prospects insert" ON public.crm_outreach_prospects;
CREATE POLICY "crm_outreach_prospects insert" ON public.crm_outreach_prospects
    FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_outreach_prospects update" ON public.crm_outreach_prospects;
CREATE POLICY "crm_outreach_prospects update" ON public.crm_outreach_prospects
    FOR UPDATE TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS "crm_outreach_prospects delete" ON public.crm_outreach_prospects;
CREATE POLICY "crm_outreach_prospects delete" ON public.crm_outreach_prospects
    FOR DELETE TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS "crm_email_suppressions select" ON public.crm_email_suppressions;
CREATE POLICY "crm_email_suppressions select" ON public.crm_email_suppressions
    FOR SELECT TO authenticated USING (public.is_platform_admin());

COMMENT ON TABLE public.crm_outreach_prospects IS
    'CRM F2-1: contatti a freddo per l''outreach, con provenienza obbligatoria. Entrano in crm_venues solo quando rispondono.';
COMMENT ON TABLE public.crm_email_suppressions IS
    'CRM F2-1: impronte sha256 delle mail da non scrivere mai più (crm_email_fingerprint). Permanente, mai l''indirizzo in chiaro.';
