// CORS delle edge chiamate dall'app (back office, checkout, prenotazioni):
// una lista sola di origin ammessi, al posto delle copie in ogni funzione.
// Le edge della pagina pubblica e dei webhook restano con le loro regole.
// Senza import Deno: testabile con vitest.

export const APP_ORIGINS: readonly string[] = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com"
];

export function isAppOrigin(origin: string | null | undefined): boolean {
    return !!origin && APP_ORIGINS.includes(origin);
}

/**
 * Header CORS per un origin dell'app: l'origin torna indietro solo se è nella
 * lista, altrimenti `Access-Control-Allow-Origin` resta vuoto e il browser
 * blocca. `json: true` aggiunge `Content-Type: application/json`, come facevano
 * le funzioni che usano gli stessi header anche per le risposte.
 */
export function appCorsHeaders(
    origin: string | null | undefined,
    opts: { json?: boolean; allowed?: (origin: string) => boolean } = {}
): Record<string, string> {
    const o = origin ?? "";
    const ok = opts.allowed ? opts.allowed(o) : isAppOrigin(o);
    const headers: Record<string, string> = {
        "Access-Control-Allow-Origin": ok ? o : "",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
    };
    if (opts.json) headers["Content-Type"] = "application/json";
    return headers;
}
