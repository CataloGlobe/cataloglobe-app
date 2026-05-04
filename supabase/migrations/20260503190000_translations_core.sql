-- =============================================================================
-- Translations core (Prompt 2 di 24)
-- =============================================================================
--
-- Crea le tabelle core della pipeline traduzioni + RPC pubblica per il resolver.
--
-- Cosa fa questa migration:
--   1. CREATE TABLE translations            (poliforma, una riga per <tenant,
--                                            entity, field, lingua>)
--   2. CHECK constraints + UNIQUE su translations
--   3. INDEXES translations (lookup_idx, by_tenant_idx)
--   4. Trigger updated_at su translations (riusa public.set_updated_at()
--      esistente — già consumata da featured_contents)
--   5. CREATE TABLE translation_jobs        (job queue async)
--   6. CHECK + INDEXES translation_jobs
--   7. RLS policies (4+4) su entrambe
--   8. RPC get_public_translations          (SECURITY DEFINER STABLE,
--                                            chiamata solo da edge function
--                                            via service_role)
--
-- Precondizioni (Prompt 1, già applicato):
--   - public.tenants
--   - public.supported_languages          (PK code, seed minimo 'it')
--   - public.tenant_languages
--   - public.get_my_tenant_ids()
--   - public.set_updated_at()             (utility esistente)
--
-- Ref: docs/translations-architecture-v3.md sezioni 4.2, 4.5, 4.6, 6.2, 7.1,
--      11.2.
-- =============================================================================


-- 1. translations -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field TEXT NOT NULL,
    language_code TEXT NOT NULL REFERENCES public.supported_languages(code),
    source_text TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (tenant_id, entity_type, entity_id, field, language_code)
);

COMMENT ON TABLE public.translations IS
    'Tabella poliforma: una riga per <tenant, entity, field, lingua>. '
    'tenant_id NULL ammesso solo per system entities (allergen, characteristic, '
    'attr_def, attr_def_option) tramite CHECK. entity_id è TEXT per supportare '
    'composite keys (es. "{def_id}:{option_value}" per attr_def_option). '
    'Lookup pubblico esclusivamente via RPC get_public_translations (SECURITY '
    'DEFINER, chiamata da edge function); le RLS sono per dashboard authenticated.';


-- 2. CHECK constraints translations -------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'translations_system_entity_only_null_tenant'
    ) THEN
        ALTER TABLE public.translations
            ADD CONSTRAINT translations_system_entity_only_null_tenant
            CHECK (
                tenant_id IS NOT NULL
                OR entity_type IN ('allergen', 'characteristic', 'attr_def', 'attr_def_option')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'translations_provider_check'
    ) THEN
        ALTER TABLE public.translations
            ADD CONSTRAINT translations_provider_check
            CHECK (provider IN ('deepl', 'google', 'manual', 'system'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'translations_status_check'
    ) THEN
        ALTER TABLE public.translations
            ADD CONSTRAINT translations_status_check
            CHECK (status IN ('auto', 'manual', 'overridden'));
    END IF;
END $$;


-- 3. INDEXES translations ------------------------------------------------------

-- Resolver pubblico: lookup batch per (entity_type, entity_id, language_code).
-- INCLUDE translated_text + source_hash per index-only scan.
CREATE INDEX IF NOT EXISTS translations_lookup_idx
    ON public.translations (entity_type, entity_id, language_code)
    INCLUDE (translated_text, source_hash);

-- Maintenance + dashboard query "tutte le translations di un tenant".
CREATE INDEX IF NOT EXISTS translations_by_tenant_idx
    ON public.translations (tenant_id, entity_type)
    WHERE tenant_id IS NOT NULL;


-- 4. Trigger updated_at su translations ----------------------------------------
--
-- Riusa public.set_updated_at() esistente (già consumata da featured_contents).
-- Convention del progetto: non creare nuove utility quando una equivalente
-- esiste con naming pulito.

DROP TRIGGER IF EXISTS trg_translations_updated_at ON public.translations;
CREATE TRIGGER trg_translations_updated_at
    BEFORE UPDATE ON public.translations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- 5. translation_jobs ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.translation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    field TEXT NOT NULL,
    target_language_code TEXT NOT NULL REFERENCES public.supported_languages(code),
    source_text TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    processed_at TIMESTAMPTZ
);

COMMENT ON TABLE public.translation_jobs IS
    'Job queue async per le richieste di traduzione. tenant_id NULL ammesso '
    'per system jobs (es. backfill platform allergens / characteristics). '
    'Dedup logic in service layer Prompt 5: prima di INSERT, SELECT per '
    'pending duplicati su (entity, field, target_language) e UPDATE invece '
    'di nuovo INSERT. Job processor (Prompt 7) consuma con FOR UPDATE SKIP '
    'LOCKED LIMIT 50.';


-- 6. CHECK + INDEXES translation_jobs -----------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'translation_jobs_status_check'
    ) THEN
        ALTER TABLE public.translation_jobs
            ADD CONSTRAINT translation_jobs_status_check
            CHECK (status IN ('pending', 'processing', 'done', 'failed'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'translation_jobs_attempts_nonneg'
    ) THEN
        ALTER TABLE public.translation_jobs
            ADD CONSTRAINT translation_jobs_attempts_nonneg
            CHECK (attempts >= 0);
    END IF;
END $$;

-- Job processor: pull dei pending in ordine di creazione, capped a 50.
CREATE INDEX IF NOT EXISTS translation_jobs_pending_idx
    ON public.translation_jobs (status, created_at)
    WHERE status = 'pending';

-- Dedup in fase di enqueue: lookup pending duplicati per stesso (entity, field, lang).
CREATE INDEX IF NOT EXISTS translation_jobs_dedup_idx
    ON public.translation_jobs (entity_type, entity_id, field, target_language_code)
    WHERE status = 'pending';


-- 7. RLS policies --------------------------------------------------------------

-- 7.1 translations -------------------------------------------------------------
--
-- Lettura: tenant authenticated può leggere proprie translations + system
-- (tenant_id IS NULL). Scrittura: tenant authenticated SOLO sue translations,
-- mai su system (tenant_id IS NOT NULL forzato in WITH CHECK).
--
-- Lettura pubblica NON passa da queste policy: la pagina pubblica fa lookup
-- via RPC get_public_translations chiamata dall'edge function con service_role.

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translations_select ON public.translations;
CREATE POLICY translations_select
    ON public.translations
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IS NULL
        OR tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translations_insert ON public.translations;
CREATE POLICY translations_insert
    ON public.translations
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translations_update ON public.translations;
CREATE POLICY translations_update
    ON public.translations
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    )
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translations_delete ON public.translations;
CREATE POLICY translations_delete
    ON public.translations
    FOR DELETE
    TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );


-- 7.2 translation_jobs ---------------------------------------------------------
--
-- Job records sono operativi: niente esposizione pubblica. Lettura tenant-only
-- (NO system jobs cross-tenant — i system jobs sono operativi piattaforma,
-- gestiti solo via service_role). Scritture sempre tenant-scoped.

ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS translation_jobs_select ON public.translation_jobs;
CREATE POLICY translation_jobs_select
    ON public.translation_jobs
    FOR SELECT
    TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translation_jobs_insert ON public.translation_jobs;
CREATE POLICY translation_jobs_insert
    ON public.translation_jobs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translation_jobs_update ON public.translation_jobs;
CREATE POLICY translation_jobs_update
    ON public.translation_jobs
    FOR UPDATE
    TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    )
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );

DROP POLICY IF EXISTS translation_jobs_delete ON public.translation_jobs;
CREATE POLICY translation_jobs_delete
    ON public.translation_jobs
    FOR DELETE
    TO authenticated
    USING (
        tenant_id IS NOT NULL
        AND tenant_id IN (SELECT public.get_my_tenant_ids())
    );


-- 8. RPC get_public_translations ----------------------------------------------
--
-- Batch lookup chiamato dall'edge function resolve-public-catalog (service_role)
-- per tradurre il payload in lingua diversa dalla base. SECURITY DEFINER perché
-- la pagina pubblica non è authenticated; STABLE perché letture (cacheable
-- nello stesso statement). v1.1 valuterà se servirà una sister RPC dashboard
-- per preview lookup authenticated.

CREATE OR REPLACE FUNCTION public.get_public_translations(
    p_tenant_id UUID,
    p_lang TEXT,
    p_entities JSONB
)
RETURNS TABLE (
    entity_type TEXT,
    entity_id TEXT,
    field TEXT,
    translated_text TEXT,
    source_hash TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
    WITH requested AS (
        SELECT
            (e->>'type')::TEXT AS entity_type,
            jsonb_array_elements_text(e->'ids') AS entity_id
        FROM jsonb_array_elements(p_entities) e
    )
    SELECT
        t.entity_type,
        t.entity_id,
        t.field,
        t.translated_text,
        t.source_hash
    FROM public.translations t
    INNER JOIN requested r
        ON r.entity_type = t.entity_type
       AND r.entity_id = t.entity_id
    WHERE t.language_code = p_lang
      AND (t.tenant_id = p_tenant_id OR t.tenant_id IS NULL);
$$;

COMMENT ON FUNCTION public.get_public_translations(UUID, TEXT, JSONB) IS
    'Batch lookup di traduzioni per resolver pubblico. SECURITY DEFINER perché '
    'la pagina pubblica non è authenticated (chiamata via service_role da edge '
    'function resolve-public-catalog). Input p_entities = JSONB array di '
    '{"type": "...", "ids": ["...", ...]}. Filtro: language_code esatto + '
    'tenant_id match OR system (tenant_id NULL). NON usa RLS — la sicurezza '
    'è data dal fatto che il caller è solo edge function trusted. v1.1 '
    'introdurrà sister RPC dashboard se serve preview lookup authenticated.';

-- Permessi: solo service_role può eseguire. authenticated/anon revocate
-- esplicitamente per evitare leak via REST endpoint Supabase.
REVOKE EXECUTE ON FUNCTION public.get_public_translations(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_translations(UUID, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_translations(UUID, TEXT, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_public_translations(UUID, TEXT, JSONB) TO service_role;
