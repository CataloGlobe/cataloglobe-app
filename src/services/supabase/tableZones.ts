import { supabase } from "@/services/supabase/client";
import type {
    V2TableZone,
    V2TableZoneInsert,
    V2TableZoneUpdate
} from "@/types/orders";

const TABLE = "table_zones";

/**
 * Lista zone tavoli per una sede, ordinate per sort_order ASC poi name ASC.
 */
export async function listTableZones(
    tenantId: string,
    activityId: string
): Promise<V2TableZone[]> {
    const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
}

/**
 * Crea nuova zona. Throw "TABLE_ZONE_NAME_CONFLICT" se nome gia esiste
 * nella stessa sede (vincolo UNIQUE table_zones_unique_name_per_activity).
 */
export async function createTableZone(
    tenantId: string,
    input: V2TableZoneInsert
): Promise<V2TableZone> {
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            tenant_id: tenantId,
            activity_id: input.activity_id,
            name: input.name.trim(),
            sort_order: input.sort_order ?? 0
        })
        .select()
        .single();
    if (error) {
        if (error.code === "23505") throw new Error("TABLE_ZONE_NAME_CONFLICT");
        throw error;
    }
    return data;
}

/**
 * Aggiorna name/sort_order di una zona. Throw "TABLE_ZONE_NOT_FOUND" se
 * inesistente, "TABLE_ZONE_NAME_CONFLICT" su collisione name.
 */
export async function updateTableZone(
    id: string,
    tenantId: string,
    updates: V2TableZoneUpdate
): Promise<V2TableZone> {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

    const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .maybeSingle();
    if (error) {
        if (error.code === "23505") throw new Error("TABLE_ZONE_NAME_CONFLICT");
        throw error;
    }
    if (!data) throw new Error("TABLE_ZONE_NOT_FOUND");
    return data;
}

/**
 * Hard delete della zona. FK `tables.zone_id ON DELETE SET NULL` → i tavoli
 * con quella zona restano e perdono il riferimento (zone_id = null).
 */
export async function deleteTableZone(
    id: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}

/**
 * Conteggio tavoli attivi per zone_id in una sede. Usato dal drawer
 * "Gestisci zone" per mostrare quanti tavoli verranno orfanati se la
 * zona viene eliminata. Aggregazione client-side (dataset piccolo,
 * RLS filtra per tenant).
 */
export async function getZoneTableCounts(
    tenantId: string,
    activityId: string
): Promise<Record<string, number>> {
    const { data, error } = await supabase
        .from("tables")
        .select("zone_id")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .is("deleted_at", null)
        .not("zone_id", "is", null);
    if (error) throw error;
    return (data ?? []).reduce<Record<string, number>>((acc, row) => {
        const zoneId = (row as { zone_id: string }).zone_id;
        acc[zoneId] = (acc[zoneId] ?? 0) + 1;
        return acc;
    }, {});
}
