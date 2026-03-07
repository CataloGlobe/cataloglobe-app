import { supabase } from "../client";

export type V2Ingredient = {
    id: string;
    tenant_id: string;
    name: string;
    created_at: string;
};

export type V2ProductIngredient = {
    tenant_id: string;
    product_id: string;
    ingredient_id: string;
    created_at: string;
};

// =========================================
// INGREDIENTS
// =========================================

export async function getIngredients(tenantId: string): Promise<V2Ingredient[]> {
    const { data, error } = await supabase
        .from("v2_ingredients")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createIngredient(tenantId: string, name: string): Promise<V2Ingredient> {
    const { data, error } = await supabase
        .from("v2_ingredients")
        .insert({
            tenant_id: tenantId,
            name: name.trim()
        })
        .select()
        .single();

    if (error) {
        // Handle unique constraint violation gracefully
        if (error.code === "23505") {
            throw new Error("Un ingrediente con questo nome esiste già.");
        }
        throw error;
    }
    return data;
}

export async function deleteIngredient(id: string): Promise<void> {
    const { error } = await supabase.from("v2_ingredients").delete().eq("id", id);

    if (error) throw error;
}

// =========================================
// PRODUCT ASSIGNMENTS
// =========================================

export async function getProductIngredients(productId: string): Promise<V2ProductIngredient[]> {
    const { data, error } = await supabase
        .from("v2_product_ingredients")
        .select("*")
        .eq("product_id", productId);

    if (error) throw error;
    return data || [];
}

export async function setProductIngredients(
    tenantId: string,
    productId: string,
    ingredientIds: string[]
): Promise<void> {
    // 1. Get current assignments
    const currentAssignments = await getProductIngredients(productId);
    const currentIngredientIds = currentAssignments.map(a => a.ingredient_id);

    // 2. Calculate delta
    const toAdd = ingredientIds.filter(id => !currentIngredientIds.includes(id));
    const toRemove = currentIngredientIds.filter(id => !ingredientIds.includes(id));

    // 3. Remove deselected ingredients
    if (toRemove.length > 0) {
        const { error: removeError } = await supabase
            .from("v2_product_ingredients")
            .delete()
            .eq("product_id", productId)
            .in("ingredient_id", toRemove);

        if (removeError) throw removeError;
    }

    // 4. Add newly selected ingredients
    if (toAdd.length > 0) {
        const insertPayload = toAdd.map(ingredientId => ({
            tenant_id: tenantId,
            product_id: productId,
            ingredient_id: ingredientId
        }));

        const { error: addError } = await supabase
            .from("v2_product_ingredients")
            .insert(insertPayload);

        if (addError) throw addError;
    }
}
