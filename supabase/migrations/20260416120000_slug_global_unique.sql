-- ============================================================
-- Slug security hardening per la tabella activities
-- 1. UNIQUE globale (rimosso scope tenant_id)
-- 2. Indice esplicito per lookup pubblico
-- 3. CHECK formato aggiornato (vieta trattini consecutivi)
-- 4. Funzione + CHECK per reserved slugs
-- ============================================================

-- 1a. Rimuovi UNIQUE composito (tenant_id, slug) e aggiungi UNIQUE globale
ALTER TABLE activities DROP CONSTRAINT IF EXISTS v2_activities_tenant_id_slug_key;
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_tenant_id_slug_key;
ALTER TABLE activities ADD CONSTRAINT activities_slug_unique UNIQUE (slug);

-- 1b. Indice esplicito su slug per performance lookup pubblico (/:slug)
CREATE INDEX IF NOT EXISTS idx_activities_slug ON activities (slug);

-- 1c. Aggiorna CHECK formato: vieta trattini consecutivi
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_slug_format;
ALTER TABLE activities ADD CONSTRAINT activities_slug_format CHECK (
    slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
    AND slug !~ '--'
);
-- Nota: activities_slug_length (char_length >= 3 AND <= 60) rimane invariato

-- 1d. Funzione is_reserved_slug centralizzata
CREATE OR REPLACE FUNCTION is_reserved_slug(slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT slug = ANY(ARRAY[
        -- auth
        'login', 'logout', 'signup', 'sign-up', 'register',
        'verify-otp', 'check-email', 'forgot-password',
        'reset-password', 'invite', 'onboarding',
        -- app
        'dashboard', 'admin', 'api', 'app',
        'workspace', 'settings', 'subscription', 'billing',
        -- marketing
        'pricing', 'features', 'about', 'contact', 'blog',
        'terms', 'privacy', 'legal', 'help', 'support',
        -- infra
        'favicon.ico', 'robots.txt', 'sitemap.xml',
        'static', 'assets', 'public', 'media', 'uploads',
        -- sentinel
        'null', 'undefined', 'test', 'demo', 'example',
        'cataloglobe', 'www', 'mail', 'ftp'
    ]);
$$;

-- 1e. CHECK constraint che usa la funzione
ALTER TABLE activities ADD CONSTRAINT activities_slug_not_reserved
    CHECK (NOT is_reserved_slug(slug));
