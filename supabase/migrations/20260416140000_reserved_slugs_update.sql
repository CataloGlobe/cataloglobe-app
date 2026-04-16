-- Aggiorna is_reserved_slug() con lista completa allineata alle route App.tsx
CREATE OR REPLACE FUNCTION is_reserved_slug(slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT slug = ANY(ARRAY[
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
    ]);
$$;
