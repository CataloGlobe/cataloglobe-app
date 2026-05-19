import { supabase } from "@services/supabase/client";

/**
 * Client-side helper per invalidare la cache Redis del menu pubblico
 * (vedi `api/public-catalog/revalidate.ts`).
 *
 * ── Pattern d'uso ──
 *   - Tutte le funzioni sono **fire-and-forget**: catturano gli errori internamente
 *     (console.warn) e NON li propagano. Il save del ristoratore non viene rollback
 *     se il revalidate fallisce — la cache si rigenererà comunque al prossimo TTL.
 *   - Chiamare DOPO il save success, mai prima.
 *
 * ── Trade-off sicurezza ──
 *   `VITE_REVALIDATE_SECRET` è esposto nel bundle JS lato browser. Un attaccante
 *   può fare richieste revalidate arbitrarie causando carico extra su
 *   Supabase/Upstash. **Non è una breach di dati** — revalidate non muta dati,
 *   cancella cache. Il danno massimo è "carico extra".
 *
 *   Trade-off accettato per stage early-stage. Se in futuro il volume di abuso
 *   diventa rilevante, migrare a una route Vercel autenticata via JWT Supabase
 *   dell'utente loggato (es. `/api/dashboard/save-and-revalidate`) che valida
 *   l'ownership prima di chiamare revalidate internamente con secret server-side.
 */

function getApiBase(): string {
    return import.meta.env.VITE_PUBLIC_CATALOG_API_BASE ?? "";
}

function getSecret(): string | null {
    return import.meta.env.VITE_REVALIDATE_SECRET ?? null;
}

async function postRevalidate(body: { slug?: string; slugs?: string[] }): Promise<void> {
    const secret = getSecret();
    if (!secret) {
        // Senza secret la chiamata fallirebbe 401: meglio skip silenzioso
        // (es. ambienti locali senza env settato).
        console.warn("[revalidatePublicCatalog] VITE_REVALIDATE_SECRET not set, skip");
        return;
    }

    const url = `${getApiBase()}/api/public-catalog/revalidate`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${secret}`
            },
            body: JSON.stringify(body),
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
 * Invalida la cache per un singolo slug. Usare quando il mutator impatta una
 * SOLA sede (es. cover/orari/closures dell'attività X).
 */
export function revalidatePublicCatalogForSlug(slug: string): void {
    if (!slug) return;
    void postRevalidate({ slug });
}

/**
 * Invalida la cache per più slug in batch.
 */
export function revalidatePublicCatalogForSlugs(slugs: string[]): void {
    const cleaned = Array.from(new Set(slugs.filter(Boolean)));
    if (cleaned.length === 0) return;
    void postRevalidate({ slugs: cleaned });
}

/**
 * Invalida la cache per TUTTE le sedi (slug) di un tenant.
 * Usare quando il mutator impatta dati tenant-scoped non legati a una sola sede
 * (catalogo, prodotti, stili, traduzioni, featured, ecc.).
 *
 * Query lato client su `activities` filtrata per `tenant_id`. RLS già scope per
 * tenant grazie a `get_my_tenant_ids()`, ma `eq("tenant_id", ...)` rende
 * esplicito l'intento e protegge da bug RLS.
 */
export async function revalidatePublicCatalogForTenant(tenantId: string): Promise<void> {
    if (!tenantId) return;
    try {
        const { data, error } = await supabase
            .from("activities")
            .select("slug")
            .eq("tenant_id", tenantId);
        if (error) {
            console.warn("[revalidatePublicCatalog] failed to list activities for tenant:", error.message);
            return;
        }
        const slugs = (data ?? [])
            .map(row => (row as { slug?: unknown }).slug)
            .filter((s): s is string => typeof s === "string" && s.length > 0);
        if (slugs.length === 0) return;
        revalidatePublicCatalogForSlugs(slugs);
    } catch (err) {
        console.warn(
            "[revalidatePublicCatalog] unexpected error:",
            err instanceof Error ? err.message : String(err)
        );
    }
}
