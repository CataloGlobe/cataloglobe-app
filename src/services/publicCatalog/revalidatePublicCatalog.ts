import { supabase } from "@services/supabase/client";

/**
 * Client-side helper per invalidare la cache Redis del menu pubblico
 * (vedi `api/public-catalog/revalidate.ts`).
 *
 * ── Pattern d'uso ──
 *   - Fire-and-forget: cattura gli errori internamente (console.warn) e NON li
 *     propaga. Il save del ristoratore non viene rollback se il revalidate
 *     fallisce — la cache si rigenererà comunque al prossimo TTL.
 *   - Chiamare DOPO il save success, mai prima.
 *
 * ── Auth ──
 *   L'endpoint è autenticato con il **JWT Supabase dell'utente loggato** (niente
 *   secret condiviso nel bundle). Passiamo l'`access_token` della sessione
 *   corrente nel Bearer; il server valida il token + il permesso `catalogs.write`
 *   sul tenant prima di purgare. Il mapping tenant→slug avviene SERVER-side
 *   (non esponiamo più gli slug né interroghiamo `activities` dal client).
 */

function getApiBase(): string {
    return import.meta.env.VITE_PUBLIC_CATALOG_API_BASE ?? "";
}

async function postRevalidate(tenantId: string): Promise<void> {
    const {
        data: { session }
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
        // Senza sessione la chiamata fallirebbe 401: meglio skip silenzioso.
        console.warn("[revalidatePublicCatalog] no active session, skip");
        return;
    }

    const url = `${getApiBase()}/api/public-catalog/revalidate`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ tenantId }),
            // Keepalive: la pagina può navigare/scaricare subito dopo il save
            keepalive: true
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.warn(
                `[revalidatePublicCatalog] non-2xx response`,
                res.status,
                text.slice(0, 200)
            );
        }
    } catch (err) {
        console.warn(
            "[revalidatePublicCatalog] request failed:",
            err instanceof Error ? err.message : String(err)
        );
    }
}

/**
 * Invalida la cache per TUTTE le sedi (slug) di un tenant.
 * Usare dopo qualsiasi mutazione tenant-scoped che impatti la pagina pubblica
 * (catalogo, prodotti, stili, traduzioni, featured, orari, closures, ecc.).
 *
 * Il server risolve gli slug del tenant dopo aver verificato `catalogs.write`.
 */
export function revalidatePublicCatalogForTenant(tenantId: string): void {
    if (!tenantId) return;
    void postRevalidate(tenantId);
}
