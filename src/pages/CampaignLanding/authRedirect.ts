/**
 * Rete di sicurezza per i link email di Supabase che atterrano sulla landing.
 *
 * Tutti i flussi del codice hanno un redirect esplicito (`/email-confirmed`,
 * `/reset-password`), ma Supabase ricade sulla Site URL (`/`) quando il
 * redirect non è tra quelli ammessi o quando l'email parte dalla dashboard.
 * La landing non carica il client Supabase: chi arriva con un token va
 * nell'app, che lo consuma come faceva su `/` prima dell'entry separata.
 *
 * Token riconosciuti: `#access_token` (flusso implicito), `?code` (PKCE),
 * `?token_hash`, e gli errori (`error_code` / `error_description`) in hash o query.
 * `type=recovery` va al reset della password, il resto al login.
 */
const AUTH_HASH_KEYS = ["access_token", "error_code", "error_description"] as const;
const AUTH_QUERY_KEYS = ["code", "token_hash", "error_code", "error_description"] as const;

export function authRedirectTarget(search: string, hash: string): string | null {
    const query = new URLSearchParams(search);
    const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

    const isAuth =
        AUTH_HASH_KEYS.some((key) => fragment.has(key)) || AUTH_QUERY_KEYS.some((key) => query.has(key));
    if (!isAuth) return null;

    const type = fragment.get("type") ?? query.get("type");
    const path = type === "recovery" ? "/reset-password" : "/login";
    return `${path}${search}${hash}`;
}
