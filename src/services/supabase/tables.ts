import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    V2Table,
    V2TableInsert,
    V2TableUpdate,
    V2TableActiveOrder,
    V2TableWithState
} from "@/types/orders";

/**
 * Lista tavoli attivi (non soft-deleted) di una sede, ordinati per label ASC.
 * JOIN su table_zones per esporre `zone_name` (null se nessuna zona assegnata).
 */
export async function listTables(
    tenantId: string,
    activityId: string
): Promise<V2Table[]> {
    const { data, error } = await supabase
        .from("tables")
        .select("*, zone:table_zones!tables_zone_id_fkey(name)")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .is("deleted_at", null)
        .order("label", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapJoinedRowToV2Table);
}

// supabase-js tipizza la relation come array o oggetto a seconda del JOIN;
// table_zones e' FK 1:1 (zone_id NULL o singolo id) → object o null.
type JoinedZone = { name: string } | { name: string }[] | null;

function mapJoinedRowToV2Table(row: Record<string, unknown> & { zone?: JoinedZone }): V2Table {
    const { zone, ...rest } = row;
    const zoneObj = Array.isArray(zone) ? zone[0] : zone;
    return {
        ...(rest as Omit<V2Table, "zone_name">),
        zone_name: zoneObj?.name ?? null
    } as V2Table;
}

/**
 * Lista tavoli con stato derivato (sessioni attive, ordini pendenti, gruppi
 * aperti, totale corrente). Legge dalla view `v_tables_with_state` che applica
 * security_invoker → RLS tenant-scoped.
 */
export async function listTablesWithState(
    tenantId: string,
    activityId: string
): Promise<V2TableWithState[]> {
    const { data, error } = await supabase
        .from("v_tables_with_state")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .order("label", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(row => {
        const rawOrders = Array.isArray(row.active_orders) ? row.active_orders : [];
        return {
            ...row,
            current_total: Number(row.current_total),
            bill_requested_count: Number(row.bill_requested_count ?? 0),
            waiter_called_count: Number(row.waiter_called_count ?? 0),
            active_orders: (rawOrders as Array<Record<string, unknown>>).map(o => ({
                id: String(o.id),
                status: o.status as V2TableActiveOrder["status"],
                total_amount: Number(o.total_amount),
                submitted_at: String(o.submitted_at)
            })),
            session_opened_at: (row.session_opened_at as string | null) ?? null
        } as V2TableWithState;
    });
}

/**
 * Admin clear "Risposto" della richiesta conto per una session specifica.
 * RLS authenticated permette UPDATE su customer_sessions tenant-scoped.
 */
export async function clearBillRequest(
    sessionId: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("customer_sessions")
        .update({ bill_requested_at: null })
        .eq("id", sessionId)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}

/**
 * Admin clear "Segna conto portato" table-level: azzera `bill_requested_at`
 * su tutte le sessions attive del tavolo (idempotent). Stessa shape dello
 * step in close-table RPC e in submit-order. Ritorna il numero di sessions
 * effettivamente azzerate (per toast / log).
 */
export async function clearBillRequestsForTable(
    tableId: string,
    tenantId: string
): Promise<number> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .update({ bill_requested_at: null })
        .eq("current_table_id", tableId)
        .eq("tenant_id", tenantId)
        .gt("expires_at", nowIso)
        .not("bill_requested_at", "is", null)
        .select("id");
    if (error) throw error;
    return data?.length ?? 0;
}

/**
 * Admin clear "Cameriere arrivato" per una session specifica.
 * Gemello di clearBillRequest: azzera waiter_called_at su una singola session.
 */
export async function clearWaiterCall(
    sessionId: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("customer_sessions")
        .update({ waiter_called_at: null })
        .eq("id", sessionId)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}

/**
 * Admin clear "Segna cameriere arrivato" table-level: azzera waiter_called_at
 * su tutte le sessions attive del tavolo (idempotent). Gemello di
 * clearBillRequestsForTable. Ritorna count sessions azzerate.
 */
export async function clearWaiterCallsForTable(
    tableId: string,
    tenantId: string
): Promise<number> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .update({ waiter_called_at: null })
        .eq("current_table_id", tableId)
        .eq("tenant_id", tenantId)
        .gt("expires_at", nowIso)
        .not("waiter_called_at", "is", null)
        .select("id");
    if (error) throw error;
    return data?.length ?? 0;
}

/**
 * Admin lista sessions attive con bill_requested_at NOT NULL per un tavolo.
 * Usata da drawer "Risposto" per mostrare chi ha chiamato.
 */
export interface BillRequestRow {
    id: string;
    customer_name: string | null;
    bill_requested_at: string;
    first_seen_at: string;
}

export async function listBillRequestsForTable(
    tableId: string,
    tenantId: string
): Promise<BillRequestRow[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("id, customer_name, bill_requested_at, first_seen_at")
        .eq("current_table_id", tableId)
        .eq("tenant_id", tenantId)
        .not("bill_requested_at", "is", null)
        .gt("expires_at", nowIso)
        .order("bill_requested_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as BillRequestRow[];
}

export interface WaiterCallRow {
    id: string;
    customer_name: string | null;
    waiter_called_at: string;
    first_seen_at: string;
}

export async function listWaiterCallsForTable(
    tableId: string,
    tenantId: string
): Promise<WaiterCallRow[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("id, customer_name, waiter_called_at, first_seen_at")
        .eq("current_table_id", tableId)
        .eq("tenant_id", tenantId)
        .not("waiter_called_at", "is", null)
        .gt("expires_at", nowIso)
        .order("waiter_called_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as WaiterCallRow[];
}

/**
 * Recupera singolo tavolo attivo. Throw "TABLE_NOT_FOUND" se inesistente o soft-deleted.
 */
export async function getTable(id: string, tenantId: string): Promise<V2Table> {
    const { data, error } = await supabase
        .from("tables")
        .select("*, zone:table_zones!tables_zone_id_fkey(name)")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("TABLE_NOT_FOUND");
    return mapJoinedRowToV2Table(data);
}

/**
 * Crea un nuovo tavolo. Throw "TABLE_LABEL_CONFLICT" se label già usata
 * nella stessa sede tra i tavoli attivi (vincolo `tables_activity_label_unique`).
 */
export async function createTable(
    tenantId: string,
    data: {
        activity_id: string;
        label: string;
        seats?: number;
        zone_id?: string | null;
        maintenance_mode?: boolean;
    }
): Promise<V2Table> {
    const payload: V2TableInsert = {
        tenant_id: tenantId,
        activity_id: data.activity_id,
        label: data.label,
        seats: data.seats,
        zone_id: data.zone_id ?? null,
        maintenance_mode: data.maintenance_mode ?? false
    };

    const { data: inserted, error } = await supabase
        .from("tables")
        .insert([payload])
        .select("*, zone:table_zones!tables_zone_id_fkey(name)")
        .single();

    if (error) {
        if (
            error.code === "23505" &&
            error.message?.includes("tables_activity_label_unique")
        ) {
            throw new Error("TABLE_LABEL_CONFLICT");
        }
        throw error;
    }
    return mapJoinedRowToV2Table(inserted);
}

/**
 * Aggiorna campi mutabili del tavolo. `updated_at` aggiornato dal trigger DB.
 * Throw "TABLE_LABEL_CONFLICT" su collisione `label` nella stessa sede.
 */
export async function updateTable(
    id: string,
    tenantId: string,
    updates: V2TableUpdate
): Promise<V2Table> {
    const { data, error } = await supabase
        .from("tables")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .select("*, zone:table_zones!tables_zone_id_fkey(name)")
        .single();

    if (error) {
        if (
            error.code === "23505" &&
            error.message?.includes("tables_activity_label_unique")
        ) {
            throw new Error("TABLE_LABEL_CONFLICT");
        }
        throw error;
    }
    return mapJoinedRowToV2Table(data);
}

/**
 * Soft-delete: imposta `deleted_at = now()` client-side. Idempotente: se già
 * soft-deleted la WHERE clause `is deleted_at null` evita la riscrittura.
 */
export async function deleteTable(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("tables")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
    if (error) throw error;
}

/**
 * Rigenera `qr_token` (nuovo UUID v4 lato DB via RPC `regenerate_table_qr_token`).
 * Invalida QR fisici stampati. La RPC è SECURITY DEFINER e riverifica
 * `tables.manage` server-side (kill-switch, non affidato solo a RLS).
 *
 * `terminateActiveSessions` (default true): se true, la RPC azzera anche
 * `expires_at` delle `customer_sessions` attive sul tavolo — i clienti
 * connessi dovranno riscansionare il nuovo QR.
 */
export async function regenerateTableQrToken(
    id: string,
    tenantId: string,
    terminateActiveSessions: boolean = true
): Promise<V2Table> {
    const { error: rpcError } = await supabase.rpc("regenerate_table_qr_token", {
        p_table_id: id,
        p_terminate_active_sessions: terminateActiveSessions,
    });
    if (rpcError) throw rpcError;

    // Re-read the row with the zone join so callers keep zone_name.
    const { data, error } = await supabase
        .from("tables")
        .select("*, zone:table_zones!tables_zone_id_fkey(name)")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .single();
    if (error) throw error;
    return mapJoinedRowToV2Table(data);
}

/**
 * Genera PDF stampabile con QR dei tavoli via Edge Function `generate-table-qrs`.
 * Ritorna Blob (Content-Type application/pdf).
 *
 * @param tableIds opzionale. null/undefined = tutti i tavoli attivi della sede.
 *                 Array vuoto NON ammesso (validato lato Edge Function).
 */
export async function generateTableQrsPdf(
    activityId: string,
    tableIds?: string[] | null
): Promise<Blob> {
    const { data, error } = await supabase.functions.invoke("generate-table-qrs", {
        body: {
            activity_id: activityId,
            table_ids: tableIds ?? null
        }
    });

    if (error) {
        if (error instanceof FunctionsHttpError) {
            const status = error.context.status;
            if (status === 401) {
                throw new Error("Sessione scaduta, accedi di nuovo");
            }
            if (status === 403) {
                throw new Error("Non hai i permessi per generare QR per questa sede");
            }
            if (status === 404) {
                // Distinguish ACTIVITY_NOT_FOUND vs NO_TABLES_FOUND via body.code
                const rawResponse = (error as unknown as { context?: Response }).context;
                if (rawResponse) {
                    try {
                        const body = (await rawResponse.json()) as { code?: string };
                        if (body.code === "NO_TABLES_FOUND") {
                            throw new Error("Nessun tavolo trovato per questa sede");
                        }
                    } catch (inner) {
                        if (inner instanceof Error && inner.message !== "") {
                            // Re-throw mapped error if it was one of ours
                            if (
                                inner.message === "Nessun tavolo trovato per questa sede"
                            ) {
                                throw inner;
                            }
                        }
                        // JSON parse failed → fall through to generic 404
                    }
                }
                throw new Error("Sede non trovata");
            }
            if (status === 429) {
                throw new Error("Troppe richieste, riprova tra un minuto");
            }
            if (status === 400) {
                throw new Error("Richiesta non valida");
            }
        }
        throw new Error("Errore nella generazione del PDF");
    }

    return data as Blob;
}
