import { createClient, FunctionsHttpError, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    V2CustomerSession,
    ResolveTableResult,
    ResolveTableOrderingUnavailable,
    CloseTableResult
} from "@/types/orders";
import { ResolveTableOrderingUnavailableError } from "@/types/orders";

function getEnvValue(key: string): string | undefined {
    const importMetaEnv =
        typeof import.meta !== "undefined"
            ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
            : undefined;
    if (importMetaEnv?.[key]) return importMetaEnv[key];
    const processEnv =
        (
            globalThis as typeof globalThis & {
                process?: { env?: Record<string, string | undefined> };
            }
        ).process?.env ?? {};
    return processEnv[key];
}

const SUPABASE_URL = getEnvValue("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = getEnvValue("VITE_SUPABASE_ANON_KEY");

/**
 * Crea un client supabase transient con il customer JWT come Authorization
 * override. Da NON memoizzare: ogni chiamata customer-side ricostruisce il
 * client perché il JWT può cambiare (refresh post resolve-table).
 *
 * RLS lato anon su customer_sessions / orders / order_items filtra le righe via
 * `id = get_jwt_customer_session_id()` (migration 20260519170000).
 */
function buildCustomerClient(customerJwt: string): SupabaseClient {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error("Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
    }
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${customerJwt}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

// ============================================================
// CUSTOMER-SIDE (pagina pubblica ordering)
// ============================================================

/**
 * Risolve un QR token chiamando l'Edge Function `resolve-table`.
 * Crea (o ri-attacca) una customer_session sul tavolo scansionato.
 *
 * @param qrToken           UUID del QR scansionato.
 * @param existingSessionId UUID opzionale di una session già salvata in
 *                          localStorage (TTL 12h). Se valida e same-tenant,
 *                          l'Edge Function la riusa invece di crearne una nuova.
 */
export async function resolveTable(
    qrToken: string,
    existingSessionId?: string | null
): Promise<ResolveTableResult> {
    const { data, error } = await supabase.functions.invoke("resolve-table", {
        body: {
            qr_token: qrToken,
            existing_session_id: existingSessionId ?? null
        }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 423) {
                // Maintenance mode: parse body per esporre reason + canViewMenu
                // al caller (TableEntryPage decide se redirigere al menu o
                // mostrare TableUnavailablePage).
                let body: ResolveTableOrderingUnavailable | null = null;
                try {
                    body = (await error.context.clone().json()) as ResolveTableOrderingUnavailable;
                } catch {
                    /* fall through to generic message */
                }
                if (body && body.code === "ORDERING_UNAVAILABLE") {
                    throw new ResolveTableOrderingUnavailableError(body);
                }
                throw new Error("Tavolo temporaneamente non disponibile");
            }
            if (status === 400) throw new Error("Codice QR non valido");
            if (status === 404) throw new Error("QR code non valido. Verifica con lo staff.");
            if (status === 429) throw new Error("Troppe richieste, riprova tra poco");
        }
        throw new Error("Errore nella risoluzione del tavolo");
    }
    return data as ResolveTableResult;
}

/**
 * Legge la customer_session corrente associata al customer JWT.
 *
 * Usa un client supabase transient con il JWT come Authorization override.
 * RLS anon SELECT (`id = get_jwt_customer_session_id()`) garantisce che venga
 * restituita SOLO la riga del session id contenuto nel JWT — niente filtro
 * esplicito necessario.
 *
 * Throw "SESSION_NOT_FOUND" se la session è scaduta o cancellata (riga
 * filtrata dalla RLS o purgata dal cron TTL).
 */
export async function getCurrentSession(customerJwt: string): Promise<V2CustomerSession> {
    const client = buildCustomerClient(customerJwt);
    const { data, error } = await client
        .from("customer_sessions")
        .select("*")
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("SESSION_NOT_FOUND");
    return data as V2CustomerSession;
}

/**
 * Aggiorna il nome del cliente sulla propria session (campo `customer_name`).
 * RLS anon UPDATE + column-level grant (`GRANT UPDATE (customer_name) TO anon`)
 * impedisce al customer di toccare altri campi anche tentando override.
 *
 * Validation: trim + max 40 caratteri. Empty/whitespace → null.
 * Throw "CUSTOMER_NAME_TOO_LONG" se eccede.
 */
/**
 * Decode helper inline: estrae `customer_session_id` dal payload del JWT custom
 * firmato da resolve-table. Variant locale di `decodeJwtPart` (activities.ts,
 * non exported). Ritorna null se token malformato o claim assente.
 */
function decodeCustomerSessionIdFromJwt(jwt: string): string | null {
    try {
        const parts = jwt.split(".");
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padding = "=".repeat((4 - (base64.length % 4)) % 4);
        const payload = JSON.parse(atob(base64 + padding)) as { customer_session_id?: unknown };
        return typeof payload.customer_session_id === "string" ? payload.customer_session_id : null;
    } catch {
        return null;
    }
}

export async function updateCustomerName(
    customerJwt: string,
    name: string
): Promise<V2CustomerSession> {
    const trimmed = name.trim();
    const normalized = trimmed.length === 0 ? null : trimmed;
    if (normalized !== null && normalized.length > 40) {
        throw new Error("CUSTOMER_NAME_TOO_LONG");
    }

    // Postgres rifiuta UPDATE senza WHERE (error 21000) — il filtro RLS anon
    // arriva DOPO il parser, quindi serve .eq("id", sessionId) esplicito.
    const sessionId = decodeCustomerSessionIdFromJwt(customerJwt);
    if (!sessionId) {
        throw new Error("SESSION_NOT_FOUND");
    }

    const client = buildCustomerClient(customerJwt);
    const { data, error } = await client
        .from("customer_sessions")
        .update({ customer_name: normalized })
        .eq("id", sessionId)
        .select("*")
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("SESSION_NOT_FOUND");
    return data as V2CustomerSession;
}

// ============================================================
// ADMIN-SIDE (dashboard staff)
// ============================================================

/**
 * Lista delle customer_sessions attive (non scadute, attaccate a un tavolo)
 * per una sede. Usata dalla dashboard "Tavoli attivi" / drill-down tavolo.
 *
 * RLS authenticated tenant-scoped: il client deve essere admin del tenant.
 */
export async function listActiveSessions(
    tenantId: string,
    activityId: string
): Promise<V2CustomerSession[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .gt("expires_at", nowIso)
        .not("current_table_id", "is", null)
        .order("last_activity_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

/**
 * Lista delle customer_sessions attive su uno specifico tavolo. Utile per il
 * pannello drill-down "Chi è seduto al tavolo X?".
 */
export async function listActiveSessionsForTable(
    tenantId: string,
    tableId: string
): Promise<V2CustomerSession[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("current_table_id", tableId)
        .gt("expires_at", nowIso)
        .order("first_seen_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

// ============================================================
// ADMIN-SIDE OPS (via Edge Function)
// ============================================================

/**
 * Chiude tutti gli `order_groups` aperti su un tavolo via Edge Function
 * `close-table`. NON tocca `customer_sessions` né `orders`: le sessions
 * restano puntate ai gruppi chiusi; al prossimo scan QR `resolve-table`
 * creerà nuovo group on-demand.
 *
 * Throw "TABLE_HAS_OPEN_ORDERS" se ci sono orders ancora in stato
 * `submitted`/`acknowledged` sul tavolo: lo staff deve risolverli prima
 * (acknowledge/deliver/cancel) per poter chiudere.
 */
export async function closeTable(tableId: string): Promise<CloseTableResult> {
    const { data, error } = await supabase.functions.invoke("close-table", {
        body: { table_id: tableId }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 400) throw new Error("Richiesta non valida");
            if (status === 401) throw new Error("Sessione scaduta, accedi di nuovo");
            if (status === 403) throw new Error("Non hai i permessi per chiudere questo tavolo");
            if (status === 404) throw new Error("Tavolo non trovato");
            if (status === 409) throw new Error("TABLE_HAS_OPEN_ORDERS");
            if (status === 429) throw new Error("Troppe richieste, riprova tra un minuto");
        }
        throw new Error("Errore nella chiusura del tavolo");
    }
    return data as CloseTableResult;
}

// ============================================================
// CUSTOMER BILL REQUEST
// ============================================================

export interface RequestBillResult {
    bill_requested_at: string;
    already_requested: boolean;
}

/**
 * Customer "Chiedi il conto". POST /request-bill con customer JWT.
 * Idempotente lato Edge: chiamate ripetute ritornano already_requested=true.
 *
 * Throws (italiano user-facing):
 *   401/404 SESSION_EXPIRED|SESSION_NOT_FOUND → "Sessione scaduta..."
 *   429 RATE_LIMITED → "Troppe richieste..."
 *   500 → "Errore del server"
 */
export async function requestBill(customerJwt: string): Promise<RequestBillResult> {
    const { data, error } = await supabase.functions.invoke<RequestBillResult>(
        "request-bill",
        {
            body: {},
            headers: { Authorization: `Bearer ${customerJwt}` }
        }
    );

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 401 || status === 404) {
                throw new Error("Sessione scaduta, scansiona di nuovo il QR");
            }
            if (status === 429) {
                throw new Error("Troppe richieste, riprova tra poco");
            }
        }
        throw new Error("Errore durante la richiesta del conto");
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Subscribe Realtime alla customer_sessions row corrente. RLS anon
 * "Customer select own session" garantisce che il channel riceva SOLO
 * eventi della session del JWT.
 *
 * Pattern coerente con subscribeToSessionOrders (orders.ts): setAuth +
 * channel postgres_changes UPDATE. Caller responsabile cleanup
 * `channel.unsubscribe()` onmount.
 */
export function subscribeToCustomerSession(
    customerJwt: string,
    callbacks: {
        onUpdate?: (session: V2CustomerSession) => void;
        onError?: (error: Error) => void;
    }
): RealtimeChannel | null {
    try {
        supabase.realtime.setAuth(customerJwt);
        const channel = supabase
            .channel("customer-session-" + Date.now())
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "customer_sessions" },
                payload => {
                    callbacks.onUpdate?.(payload.new as V2CustomerSession);
                }
            )
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    callbacks.onError?.(
                        err instanceof Error ? err : new Error("Realtime channel error: " + status)
                    );
                }
            });
        return channel;
    } catch (err) {
        callbacks.onError?.(err instanceof Error ? err : new Error("Realtime subscribe failed"));
        return null;
    }
}
