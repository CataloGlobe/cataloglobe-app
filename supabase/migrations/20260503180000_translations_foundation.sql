-- =============================================================================
-- Translations foundation (Prompt 1 di 24)
-- =============================================================================
--
-- Crea le primitive DB per la feature traduzioni multi-lingua. NON crea ancora
-- la tabella `translations`, `translation_jobs` o RPC `get_public_translations`
-- (quelle vivono nel Prompt 2). NON popola le 33 lingue (Prompt 4). NON fa
-- backfill di allergens/characteristics (Prompt 3 / 3b).
--
-- Cosa fa questa migration:
--   1. CREATE TABLE supported_languages   (whitelist piattaforma)
--   2. INSERT seed minimo della sola riga 'it' (necessario perché la FK su
--      tenants.base_language_code DEFAULT 'it' richiede la chiave esistente
--      al momento dell'ALTER TABLE; resto del seed al Prompt 4).
--   3. CREATE TABLE tenant_languages      (molti-a-molti tenant <-> lingua)
--   4. INDEX parziale "una sola base attiva per tenant" + index su attive.
--   5. ALTER TABLE tenants                 (base_language_code, 3 toggle)
--   6. Hash columns su 14 tabelle target  (TEXT NULL, popolate dal service
--      layer al Prompt 5; NULL = "non ancora hashed", evita esplosione di
--      job di traduzione al go-live).
--   7. RLS policies su supported_languages e tenant_languages.
--   8. Aggiornamento `is_reserved_slug` per coprire dinamicamente i codici
--      lingua via supported_languages (chiusura review punto 1 v3).
--
-- Ref: docs/translations-architecture-v3.md sezioni 1.1, 1.2, 3.2, 4.1, 4.2,
--      4.4, 4.5.
--
-- Decisione di design: la lingua base vive ESCLUSIVAMENTE su
-- tenants.base_language_code (single source of truth). La tabella
-- tenant_languages contiene SOLO le lingue di traduzione addizionali alla
-- base; la base è implicitamente sempre attiva e non viene mai inserita lì.
-- Il service layer (Prompt 5) deve rifiutare INSERT in tenant_languages con
-- language_code = tenants.base_language_code (validazione applicativa, non
-- DB constraint, per evitare cross-table CHECK).
-- =============================================================================


-- 1. supported_languages -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supported_languages (
    code TEXT PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_native TEXT NOT NULL,
    flag_emoji TEXT,
    provider_preference TEXT NOT NULL DEFAULT 'deepl'
        CHECK (provider_preference IN ('deepl', 'google', 'manual', 'system')),
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.supported_languages IS
    'Whitelist piattaforma delle lingue traducibili. PK = ISO 639-1 (it, en, fr, ...). '
    'Lettura pubblica. Scritture solo via service_role / migration.';


-- 2. Seed minimo: solo 'it' per soddisfare la FK su tenants.base_language_code.
--    Le altre 32 lingue arrivano col Prompt 4 (separato schema/data).
INSERT INTO public.supported_languages
    (code, name_en, name_native, flag_emoji, provider_preference, is_available, sort_order)
VALUES
    ('it', 'Italian', 'Italiano', '🇮🇹', 'deepl', true, 0)
ON CONFLICT (code) DO NOTHING;


-- 3. tenant_languages ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL REFERENCES public.supported_languages(code),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (tenant_id, language_code)
);

COMMENT ON TABLE public.tenant_languages IS
    'Lingue di traduzione ADDIZIONALI attivate per il tenant. La lingua base '
    'NON entra qui (vive su tenants.base_language_code ed è implicitamente '
    'sempre attiva). is_active = la lingua è renderizzabile sulla pagina '
    'pubblica; lingue disattivate non vengono risolte ma le translations '
    'esistenti restano (re-attivazione gratuita). Il service layer DEVE '
    'rifiutare INSERT con language_code = tenants.base_language_code '
    '(validazione applicativa, non DB constraint per evitare cross-table check).';


-- 4. INDEXES su tenant_languages ----------------------------------------------

-- Lookup veloce delle lingue attive per tenant (resolver pubblico, dashboard).
CREATE INDEX IF NOT EXISTS tenant_languages_active_idx
    ON public.tenant_languages (tenant_id)
    WHERE is_active = true;


-- 5. tenants: lingua base + 3 toggle traduzione automatica ---------------------

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS base_language_code TEXT NOT NULL DEFAULT 'it';

-- FK separata: la colonna nasce con DEFAULT 'it' che è già nella tabella
-- supported_languages (seed step 2 sopra). Aggiunta via constraint dedicata
-- per chiarezza in eventuali drop/replace futuri.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenants_base_language_code_fkey'
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_base_language_code_fkey
            FOREIGN KEY (base_language_code)
            REFERENCES public.supported_languages(code);
    END IF;
END $$;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS translate_categories  BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS translate_ingredients BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS translate_options     BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenants.base_language_code IS
    'Source of truth della lingua sorgente del tenant. Una sola lingua base '
    'per tenant. Modificabile solo da admin platform (vedi BASE_LANGUAGE_LOCKED '
    'rule, Prompt 5).';

COMMENT ON COLUMN public.tenants.translate_categories IS
    'Toggle: se true, i nomi delle categorie del catalogo vengono auto-tradotti.';

COMMENT ON COLUMN public.tenants.translate_ingredients IS
    'Toggle: se true, i nomi degli ingredienti vengono auto-tradotti.';

COMMENT ON COLUMN public.tenants.translate_options IS
    'Toggle: copre product_option_values.name e product_variant_dimension_values.label.';


-- 6. Hash columns sui campi tradotti ------------------------------------------
--
-- TEXT NULL, no default, no trigger. Calcolo hash = service layer (Prompt 5).
-- Record esistenti restano NULL fino al primo write post-migration. Questo
-- previene un'esplosione di translation_jobs al go-live: i job nascono solo
-- quando il tenant attiva una lingua nuova (backfill al Prompt 23) o edita un
-- record (hook al Prompt 9-12).

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS description_hash TEXT;
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS notes_hash TEXT;

ALTER TABLE public.featured_contents
    ADD COLUMN IF NOT EXISTS title_hash TEXT;
ALTER TABLE public.featured_contents
    ADD COLUMN IF NOT EXISTS subtitle_hash TEXT;
ALTER TABLE public.featured_contents
    ADD COLUMN IF NOT EXISTS description_hash TEXT;
ALTER TABLE public.featured_contents
    ADD COLUMN IF NOT EXISTS cta_text_hash TEXT;

ALTER TABLE public.featured_content_products
    ADD COLUMN IF NOT EXISTS note_hash TEXT;

ALTER TABLE public.catalog_categories
    ADD COLUMN IF NOT EXISTS name_hash TEXT;

ALTER TABLE public.allergens
    ADD COLUMN IF NOT EXISTS label_hash TEXT;

ALTER TABLE public.product_characteristics
    ADD COLUMN IF NOT EXISTS label_hash TEXT;

ALTER TABLE public.ingredients
    ADD COLUMN IF NOT EXISTS name_hash TEXT;

ALTER TABLE public.product_option_groups
    ADD COLUMN IF NOT EXISTS name_hash TEXT;

ALTER TABLE public.product_option_values
    ADD COLUMN IF NOT EXISTS name_hash TEXT;

ALTER TABLE public.product_attribute_definitions
    ADD COLUMN IF NOT EXISTS label_hash TEXT;

ALTER TABLE public.product_attribute_values
    ADD COLUMN IF NOT EXISTS value_text_hash TEXT;

ALTER TABLE public.product_variant_dimensions
    ADD COLUMN IF NOT EXISTS name_hash TEXT;

ALTER TABLE public.product_variant_dimension_values
    ADD COLUMN IF NOT EXISTS label_hash TEXT;

ALTER TABLE public.activity_closures
    ADD COLUMN IF NOT EXISTS label_hash TEXT;


-- 7. RLS policies su nuove tabelle --------------------------------------------

ALTER TABLE public.supported_languages ENABLE ROW LEVEL SECURITY;

-- Lettura libera (lookup whitelist). Scritture solo via service_role.
DROP POLICY IF EXISTS supported_languages_read_all ON public.supported_languages;
CREATE POLICY supported_languages_read_all
    ON public.supported_languages
    FOR SELECT
    USING (true);


ALTER TABLE public.tenant_languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_languages_select ON public.tenant_languages;
CREATE POLICY tenant_languages_select
    ON public.tenant_languages
    FOR SELECT
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS tenant_languages_insert ON public.tenant_languages;
CREATE POLICY tenant_languages_insert
    ON public.tenant_languages
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS tenant_languages_update ON public.tenant_languages;
CREATE POLICY tenant_languages_update
    ON public.tenant_languages
    FOR UPDATE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS tenant_languages_delete ON public.tenant_languages;
CREATE POLICY tenant_languages_delete
    ON public.tenant_languages
    FOR DELETE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));


-- 8. is_reserved_slug: estensione dinamica via supported_languages ------------
--
-- Versione precedente (migration 20260416140000): array hardcoded di slug
-- riservati (auth/legal/infra/ecc.), LANGUAGE sql IMMUTABLE.
--
-- Nuova versione: stesso array hardcoded + OR EXISTS su supported_languages.
-- Il vincolo IMMUTABLE diventa incompatibile (ora legge una tabella) → passa
-- a STABLE. Il param resta `slug TEXT` per compat con eventuali chiamate
-- esistenti (CHECK constraints, ecc.). Il SET search_path = '' viene
-- preservato per coerenza con l'hardening 20260429140000.

-- Drop temporaneo del CHECK constraint che dipende dalla funzione is_reserved_slug.
-- Necessario perché PostgreSQL rifiuta CREATE OR REPLACE FUNCTION con cambio
-- volatility (IMMUTABLE → STABLE) se la funzione è referenziata da un CHECK.
-- Il constraint viene ricreato in coda alla migration con la stessa firma.
ALTER TABLE public.activities
    DROP CONSTRAINT IF EXISTS activities_slug_not_reserved;

CREATE OR REPLACE FUNCTION public.is_reserved_slug(slug TEXT)
    RETURNS BOOLEAN
    LANGUAGE sql
    STABLE
    SET search_path TO ''
AS $$
    SELECT
        slug = ANY(ARRAY[
            -- auth
            'login', 'logout', 'signup', 'sign-up', 'register',
            'verify-otp', 'check-email', 'email-confirmed',
            'forgot-password', 'reset-password', 'update-password',
            -- app
            'workspace', 'onboarding', 'select-business',
            'business', 'invite', 'dashboard',
            -- legal
            'legal', 'privacy', 'terms', 'termini',
            -- admin/api
            'admin', 'api', 'app',
            'settings', 'subscription', 'billing',
            -- marketing
            'pricing', 'features', 'about', 'contact', 'blog',
            'help', 'support',
            -- infra
            'favicon.ico', 'robots.txt', 'sitemap.xml',
            'static', 'assets', 'public', 'media', 'uploads',
            -- sentinel
            'null', 'undefined', 'test', 'demo', 'example',
            'cataloglobe', 'www', 'mail', 'ftp'
        ])
        OR EXISTS (
            SELECT 1
            FROM public.supported_languages sl
            WHERE sl.code = slug
        );
$$;

COMMENT ON FUNCTION public.is_reserved_slug(TEXT) IS
    'Restituisce true se lo slug entra in conflitto con route applicative '
    'riservate o con un codice lingua ISO presente in supported_languages. '
    'Usata dai CHECK constraints sugli slug. STABLE perché legge la tabella '
    'lingue (era IMMUTABLE quando solo array hardcoded). LIMITAZIONE NOTA: '
    'PostgreSQL non rivalida i CHECK constraint esistenti quando supported_languages '
    'cambia; la validazione avviene solo at-write-time (INSERT/UPDATE su slug). '
    'Le seed migration successive (es. Prompt 4) DEVONO eseguire un pre-flight '
    'SELECT su activities.slug per identificare conflitti prima di INSERT lingue nuove.';

-- Ricrea il CHECK constraint con la stessa firma. Il pre-flight ha già
-- confermato 0 violazioni correnti → ADD CONSTRAINT esegue lo scan ma non
-- respinge righe esistenti.
ALTER TABLE public.activities
    ADD CONSTRAINT activities_slug_not_reserved
    CHECK (NOT public.is_reserved_slug(slug));
