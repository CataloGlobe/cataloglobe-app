import { supabase } from "@/services/supabase/client";
import type {
    V2TableCombinationGroup,
    V2TableCombinationGroupInsert,
    V2TableCombinationGroupUpdate
} from "@/types/orders";

const TABLE = "table_combination_groups";

/**
 * Lista gruppi di accostamento di una sede, ordinati per sort_order ASC poi
 * name ASC. Stesso contratto di `listTableZones`.
 */
export async function listTableCombinationGroups(
    tenantId: string,
    activityId: string
): Promise<V2TableCombinationGroup[]> {
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
 * Crea un gruppo di accostamento. Throw "TABLE_COMBINATION_GROUP_NAME_CONFLICT"
 * se il nome esiste gia nella stessa sede (UNIQUE activity_id + name).
 */
export async function createTableCombinationGroup(
    tenantId: string,
    input: V2TableCombinationGroupInsert
): Promise<V2TableCombinationGroup> {
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
        if (error.code === "23505") {
            throw new Error("TABLE_COMBINATION_GROUP_NAME_CONFLICT");
        }
        throw error;
    }
    return data;
}

/**
 * Aggiorna name/sort_order. Throw "TABLE_COMBINATION_GROUP_NOT_FOUND" se
 * inesistente, "TABLE_COMBINATION_GROUP_NAME_CONFLICT" su collisione name.
 */
export async function updateTableCombinationGroup(
    id: string,
    tenantId: string,
    updates: V2TableCombinationGroupUpdate
): Promise<V2TableCombinationGroup> {
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
        if (error.code === "23505") {
            throw new Error("TABLE_COMBINATION_GROUP_NAME_CONFLICT");
        }
        throw error;
    }
    if (!data) throw new Error("TABLE_COMBINATION_GROUP_NOT_FOUND");
    return data;
}

/**
 * Hard delete del gruppo. FK `tables.combination_group_id ON DELETE SET NULL`
 * → i tavoli restano e tornano al default sicuro (non accostabili).
 */
export async function deleteTableCombinationGroup(
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
