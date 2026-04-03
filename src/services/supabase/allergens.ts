import { supabase } from "@/services/supabase/client";

export type V2SystemAllergen = {
    id: number;
    code: string;
    label_it: string;
    label_en: string;
    sort_order: number;
};

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
    // Replace all assigned allergens: delete existing, then insert new ones
    // We do this in two steps from the client side since standard REST doesn't expose transactions directly.

    // 1. Delete all existing allergens for this product
    const { error: deleteError } = await supabase
        .from("product_allergens")
        .delete()
        .eq("product_id", productId)
        .eq("tenant_id", tenantId);

    if (deleteError) throw deleteError;

    // 2. Insert new allergens if any
    if (allergenIds && allergenIds.length > 0) {
        // Create an array of objects to insert in bulk
        const insertPayload = allergenIds.map(allergenId => ({
            tenant_id: tenantId,
            product_id: productId,
            allergen_id: allergenId
        }));

        const { error: insertError } = await supabase
            .from("product_allergens")
            .insert(insertPayload);

        if (insertError) throw insertError;
    }
}
