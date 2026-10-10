// ⚠️ SYNC con DB: is_reserved_slug(), ultima versione in
// supabase/migrations/20260927120000_is_reserved_slug_app_routes.sql (più i
// codici lingua di supported_languages, che qui non servono: 2 lettere < 3).
// Test: src/tests/reservedSlugsSync.test.ts.
// L'enforcement definitivo è a DB level — questa lista serve solo per feedback UX immediato
// prima del round-trip. Aggiornare entrambe le fonti in caso di modifiche.
export const RESERVED_SLUGS = new Set([
    // auth
    "login",
    "logout",
    "signup",
    "sign-up",  // route effettiva in App.tsx
    "register",
    "verify-otp",
    "check-email",
    "email-confirmed",
    "forgot-password",
    "reset-password",
    "update-password",

    // app
    "workspace",
    "onboarding",
    "select-business",
    "business",
    "invite",
    "dashboard",
    "status",       // pagina di stato del servizio
    "landing-dev",  // 301 a / in vercel.json

    // legal
    "legal",
    "privacy",
    "terms",
    "termini",

    // admin / api
    "admin",
    "api",
    "app",
    "settings",
    "subscription",
    "billing",

    // marketing
    "pricing",
    "features",
    "about",
    "contact",
    "blog",
    "help",
    "support",

    // infra
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "static",
    "assets",
    "public",
    "media",
    "uploads",

    // sentinel
    "null",
    "undefined",
    "test",
    "demo",
    "example",
    "cataloglobe",
    "www",
    "mail",
    "ftp",
]);
