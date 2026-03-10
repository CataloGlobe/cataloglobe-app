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
        .from("v2_allergens")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * ----------------------------------------------------
 * PRODUCT ALLERGENS
 * ----------------------------------------------------
 */

export async function getProductAllergens(productId: string, tenantId: string): Promise<number[]> {
    const { data, error } = await supabase
        .from("v2_product_allergens")
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
        .from("v2_product_allergens")
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
            .from("v2_product_allergens")
            .insert(insertPayload);

        if (insertError) throw insertError;
    }
}
