/**
 * Product Availability service.
 *
 * Gestisce gli override "questo prodotto NON è disponibile in questa sede"
 * via tabella product_availability_overrides.
 *
 * Auth: tutto admin-side (Supabase user JWT). RLS authenticated standard.
 * Il guest non legge mai questa tabella: il resolver public catalog applica
 * gli override server-side prima di esporre i prodotti.
 *
 * Toggle (write) passa SEMPRE per Edge Function `toggle-product-availability`
 * che gestisce UPSERT, calcolo auto_reset_at, cross-tenant check, rate limit.
 * Read passa per query dirette con RLS.
 */

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    V2ProductAvailabilityOverride,
    ProductAvailabilityScope
} from "@/types/orders";

/**
 * Lista override prodotti per una sede.
 *
 * Default: solo override "attivi" (available=false), ordinati per disabled_at DESC.
 * Con includeLeftover=true: include anche righe re-abilitate (available=true)
 * leftover dal cron — utile solo per audit/debug.
 */
export async function listProductOverrides(
    tenantId: string,
    activityId: string,
    options?: { includeLeftover?: boolean }
): Promise<V2ProductAvailabilityOverride[]> {
    let query = supabase
        .from("product_availability_overrides")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId);

    if (!options?.includeLeftover) {
        query = query.eq("available", false);
    }

    const { data, error } = await query.order("disabled_at", {
        ascending: false,
        nullsFirst: false
    });
    if (error) throw error;
    return data ?? [];
}

/**
 * Conta prodotti attualmente non disponibili in una sede.
 * Usato dalla UI catalogo admin per badge contestuali.
 */
export async function countUnavailableProducts(
    tenantId: string,
    activityId: string
): Promise<number> {
    const { count, error } = await supabase
        .from("product_availability_overrides")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .eq("available", false);
    if (error) throw error;
    return count ?? 0;
}

/**
 * Toggle availability di un prodotto in una sede.
 *
 * Flow:
 *   1. Validation lato client (scope/reason)
 *   2. Invoke Edge Function toggle-product-availability (UPSERT atomico)
 *   3. Re-fetch dell'override per ritornare stato completo
 *
 * @param scope obbligatorio se available=false. Ignorato se available=true.
 * @param reason opzionale, trim+null se vuoto, max 500 char.
 *
 * Throws (validation, prima di toccare il network):
 *   "SCOPE_REQUIRED"    se available=false senza scope
 *   "REASON_TOO_LONG"   se reason > 500 char dopo trim
 *
 * Throws (Edge Function errors mapped HTTP → italiano):
 *   400 → "Richiesta non valida"
 *   401 → "Sessione scaduta, accedi di nuovo"
 *   403 CROSS_TENANT_MISMATCH → "Prodotto e sede non corrispondono"
 *   403 → "Non hai i permessi per questa operazione"
 *   404 ACTIVITY_NOT_FOUND → "Sede non trovata"
 *   404 PRODUCT_NOT_FOUND → "Prodotto non trovato"
 *   429 → "Troppe richieste, riprova tra un momento"
 *   500 → "Errore del server"
 *
 * Throws (post-Edge):
 *   "OVERRIDE_FETCH_FAILED" se l'override non viene trovato post-toggle
 *   (race condition improbabile con cron).
 */
export async function toggleProductAvailability(
    tenantId: string,
    activityId: string,
    productId: string,
    available: boolean,
    options?: {
        scope?: ProductAvailabilityScope;
        reason?: string;
    }
): Promise<V2ProductAvailabilityOverride> {
    // Step 1: validation client-side
    if (!available && !options?.scope) {
        throw new Error("SCOPE_REQUIRED");
    }
    const trimmedReason = options?.reason?.trim() ?? "";
    const normalizedReason = trimmedReason.length === 0 ? null : trimmedReason;
    if (normalizedReason !== null && normalizedReason.length > 500) {
        throw new Error("REASON_TOO_LONG");
    }

    // Step 2: invoke Edge Function
    const body: Record<string, unknown> = {
        product_id: productId,
        activity_id: activityId,
        available,
        reason: normalizedReason
    };
    if (!available) {
        body.scope = options?.scope ?? null;
    }

    const { data: invokeData, error: invokeError } = await supabase.functions.invoke<{
        override_id: string;
    }>("toggle-product-availability", { body });

    if (invokeError) {
        if (invokeError instanceof FunctionsHttpError) {
            const status = invokeError.context.status;
            if (status === 400) throw new Error("Richiesta non valida");
            if (status === 401) throw new Error("Sessione scaduta, accedi di nuovo");
            if (status === 403 || status === 404) {
                // Disambigua via body.code: CROSS_TENANT_MISMATCH (403),
                // ACTIVITY_NOT_FOUND vs PRODUCT_NOT_FOUND (404).
                const rawResponse = (invokeError as unknown as { context?: Response })
                    .context;
                if (rawResponse) {
                    try {
                        const body = (await rawResponse.json()) as {
                            code?: string;
                            details?: { reason?: string };
                        };
                        if (status === 403) {
                            if (body.details?.reason === "CROSS_TENANT_MISMATCH") {
                                throw new Error("Prodotto e sede non corrispondono");
                            }
                            throw new Error("Non hai i permessi per questa operazione");
                        }
                        // status === 404
                        if (body.code === "ACTIVITY_NOT_FOUND") {
                            throw new Error("Sede non trovata");
                        }
                        if (body.code === "PRODUCT_NOT_FOUND") {
                            throw new Error("Prodotto non trovato");
                        }
                    } catch (inner) {
                        if (inner instanceof Error) {
                            // Re-throw mapped italian errors as-is
                            const mapped = [
                                "Prodotto e sede non corrispondono",
                                "Non hai i permessi per questa operazione",
                                "Sede non trovata",
                                "Prodotto non trovato"
                            ];
                            if (mapped.includes(inner.message)) throw inner;
                        }
                        // JSON parse failed → fall through to generic
                    }
                }
                if (status === 403) throw new Error("Non hai i permessi per questa operazione");
                throw new Error("Risorsa non trovata");
            }
            if (status === 429) throw new Error("Troppe richieste, riprova tra un momento");
        }
        throw new Error("Errore del server");
    }

    if (!invokeData?.override_id) {
        throw new Error("OVERRIDE_FETCH_FAILED");
    }

    // Step 3: re-fetch per stato completo
    const { data: override, error: fetchError } = await supabase
        .from("product_availability_overrides")
        .select("*")
        .eq("id", invokeData.override_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    if (fetchError) throw fetchError;
    if (!override) throw new Error("OVERRIDE_FETCH_FAILED");

    return override as V2ProductAvailabilityOverride;
}
