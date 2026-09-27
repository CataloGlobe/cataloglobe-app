-- is_reserved_slug(): aggiunge le rotte dell'app con un solo segmento che
-- mancavano, `status` e `landing-dev`. Le altre (login, sign-up, workspace,
-- select-business, onboarding, business, invite, dashboard, legal, admin,
-- verify-otp, check-email, email-confirmed, forgot-password, reset-password)
-- c'erano già. `t` (/t/:token) non serve: uno slug ha almeno 3 caratteri
-- (activities_slug_length).
--
-- Stessa lista di vercel.json (rewrite a /index.html prima della regola
-- slug) e di RESERVED_SEGMENTS in api/ssr-render/index.ts.
--
-- Corpo preso da pg_get_functiondef su staging il 2026-09-27, cambiano solo le
-- due voci aggiunte in «app». CREATE OR REPLACE con la stessa firma: i grant
-- esistenti restano.
--
-- PRIMA DI APPLICARE IN PRODUZIONE: nessuna sede né alias deve già usare
-- questi slug (su staging verificato: nessuno).
--   SELECT slug FROM public.activities WHERE slug IN ('status', 'landing-dev')
--   UNION ALL
--   SELECT slug FROM public.activity_slug_aliases WHERE slug IN ('status', 'landing-dev');

CREATE OR REPLACE FUNCTION public.is_reserved_slug(slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT
        slug = ANY(ARRAY[
            -- auth
            'login', 'logout', 'signup', 'sign-up', 'register',
            'verify-otp', 'check-email', 'email-confirmed',
            'forgot-password', 'reset-password', 'update-password',
            -- app
            'workspace', 'onboarding', 'select-business',
            'business', 'invite', 'dashboard', 'status', 'landing-dev',
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
$function$;
