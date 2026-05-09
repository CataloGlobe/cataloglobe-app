import { supabase } from "@/services/supabase/client";
import type {
    ProductCharacteristic,
    ProductCharacteristicCategory,
    ResolvedProductCharacteristic
} from "@/types/productCharacteristic";

// =============================================================================
// LOOKUP — cross-tenant system table
// =============================================================================

/**
 * Lists characteristics from `product_characteristics`.
 *
 * Cross-tenant (no `tenantId` argument). When `vertical` is provided the
 * query filters `WHERE vertical = vertical`; when omitted, all rows are
 * returned (e.g. backoffice multi-vertical view).
 *
 * Ordering: `sort_order ASC, label_it ASC` for stable tie-break.
 */
export async function listCharacteristics(
    vertical?: string
): Promise<ProductCharacteristic[]> {
    let query = supabase
        .from("product_characteristics")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("label_it", { ascending: true });

    if (vertical) {
        query = query.eq("vertical", vertical);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
}

// =============================================================================
// ASSIGNMENTS — tenant-scoped join
// =============================================================================

/**
 * Returns the list of characteristic IDs assigned to a single product.
 * Mirror of `getProductAllergens`.
 */
export async function getProductCharacteristics(
    productId: string,
    tenantId: string
): Promise<string[]> {
    const { data, error } = await supabase
        .from("product_characteristic_assignments")
        .select("characteristic_id")
        .eq("product_id", productId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return (data ?? []).map(row => row.characteristic_id);
}

type CharacteristicJoinRow = {
    code: string;
    label_it: string;
    icon: string;
    category: ProductCharacteristicCategory;
};

/**
 * Batch-loads resolved characteristics for multiple products in a single
 * query. Returns a map `productId → ResolvedProductCharacteristic[]`.
 *
 * Mirror of `getProductsAllergens`. Empty input returns an empty map.
 */
export async function getProductsCharacteristics(
    productIds: string[],
    tenantId: string
): Promise<Record<string, ResolvedProductCharacteristic[]>> {
    if (productIds.length === 0) return {};

    const { data, error } = await supabase
        .from("product_characteristic_assignments")
        .select(
            "product_id, characteristic_id, characteristic:product_characteristics(code, label_it, icon, category)"
        )
        .in("product_id", productIds)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    const result: Record<string, ResolvedProductCharacteristic[]> = {};
    for (const row of data ?? []) {
        const characteristic = row.characteristic as unknown as CharacteristicJoinRow | null;
        if (!characteristic) continue;
        const entry: ResolvedProductCharacteristic = {
            characteristic_id: row.characteristic_id,
            code: characteristic.code,
            label_it: characteristic.label_it,
            icon: characteristic.icon,
            category: characteristic.category
        };
        if (!result[row.product_id]) {
            result[row.product_id] = [];
        }
        result[row.product_id].push(entry);
    }
    return result;
}

/**
 * Replaces all characteristic assignments for a product atomically via the
 * `replace_product_characteristics` RPC (DELETE + INSERT inside a single
 * SECURITY DEFINER transaction).
 *
 * Validation that the assigned characteristics belong to the tenant's
 * vertical is delegated to the caller (UI restricts the pickable set via
 * `listCharacteristics(vertical)`). The DB does not enforce vertical match
 * (see DESIGN_product_characteristics.md sez. 7.3).
 */
export async function setProductCharacteristics(
    tenantId: string,
    productId: string,
    characteristicIds: string[]
): Promise<void> {
    const { error } = await supabase.rpc("replace_product_characteristics", {
        p_tenant_id: tenantId,
        p_product_id: productId,
        p_characteristic_ids: characteristicIds
    });

    if (error) {
        if (error.code === "42501") {
            throw new Error("Operazione non autorizzata");
        }
        if (error.code === "P0002") {
            throw new Error("Prodotto non trovato");
        }
        throw error;
    }
}
