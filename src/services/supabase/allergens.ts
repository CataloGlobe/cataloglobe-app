import { supabase } from "@/services/supabase/client";

export type V2SystemAllergen = {
    id: number;
    code: string;
    label_it: string;
    label_en: string;
    sort_order: number;
};

export type Allergen = V2SystemAllergen;

export type V2ProductAllergen = {
    tenant_id: string;
    product_id: string;
    allergen_id: number;
    created_at: string;
};

/**
 * ----------------------------------------------------
 * SYSTEM ALLERGENS
 * ----------------------------------------------------
 */

export async function listAllergens(): Promise<V2SystemAllergen[]> {
    const { data, error } = await supabase
        .from("allergens")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
}

export const listAllAllergens = listAllergens;

export type ResolvedProductAllergen = {
    allergen_id: number;
    code: string;
    label_it: string;
};

/**
 * ----------------------------------------------------
 * PRODUCT ALLERGENS
 * ----------------------------------------------------
 */

/**
 * Batch-load allergens for multiple products in a single query.
 * Returns a map of productId → resolved allergens.
 */
export async function getProductsAllergens(
    productIds: string[],
    tenantId: string
): Promise<Record<string, ResolvedProductAllergen[]>> {
    if (productIds.length === 0) return {};

    const { data, error } = await supabase
        .from("product_allergens")
        .select("product_id, allergen_id, allergens(code, label_it)")
        .in("product_id", productIds)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    const result: Record<string, ResolvedProductAllergen[]> = {};
    for (const row of data ?? []) {
        const allergen = row.allergens as unknown as { code: string; label_it: string } | null;
        if (!allergen) continue;
        const entry: ResolvedProductAllergen = {
            allergen_id: row.allergen_id,
            code: allergen.code,
            label_it: allergen.label_it,
        };
        if (!result[row.product_id]) {
            result[row.product_id] = [];
        }
        result[row.product_id].push(entry);
    }
    return result;
}

export async function getProductAllergens(productId: string, tenantId: string): Promise<number[]> {
    const { data, error } = await supabase
        .from("product_allergens")
        .select("allergen_id")
        .eq("product_id", productId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return data ? data.map(row => row.allergen_id) : [];
}

export async function setProductAllergens(
    tenantId: string,
    productId: string,
    allergenIds: number[]
): Promise<void> {
    const { error } = await supabase.rpc("replace_product_allergens", {
        p_tenant_id: tenantId,
        p_product_id: productId,
        p_allergen_ids: allergenIds
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
