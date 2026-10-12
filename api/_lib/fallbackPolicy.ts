/**
 * Come risponde `api/ssr-render` quando non può fare il render della pagina
 * di un locale e serve la shell SPA (`dist/app.html`, il body è sempre lo
 * stesso: il browser carica l'app e riprova lato client).
 *
 * - `invalid_slug`, `invalid_lang`, `domain_404`: 404 reale, niente soft-404.
 * - Errori nostri o di rete (`network_no_snapshot`, `render_error`): 503 con
 *   `Retry-After`. Un crawler riprova più tardi e tiene la pagina indicizzata;
 *   con un 200 vedrebbe una pagina vuota.
 * - Locale non pronto (`inactive`, `subscription_inactive`, `empty`) e altri
 *   errori dell'edge (`domain_<4xx>`): 200 con `noindex`. La pagina non ha
 *   contenuto da indicizzare, ma l'utente vede l'app come oggi.
 */
export type FallbackPolicy = {
    status: number;
    noindex: boolean;
    retryAfterSeconds?: number;
};

export const FALLBACK_RETRY_AFTER_SECONDS = 120;

const NOT_FOUND = new Set(["invalid_slug", "invalid_lang", "domain_404"]);
const TRANSIENT = new Set(["network_no_snapshot", "render_error"]);

export function fallbackPolicy(reason: string): FallbackPolicy {
    if (NOT_FOUND.has(reason)) return { status: 404, noindex: false };
    if (TRANSIENT.has(reason)) {
        return { status: 503, noindex: false, retryAfterSeconds: FALLBACK_RETRY_AFTER_SECONDS };
    }
    return { status: 200, noindex: true };
}
