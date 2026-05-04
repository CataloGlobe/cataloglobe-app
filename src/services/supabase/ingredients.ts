import { supabase } from "@/services/supabase/client";
import { computeFieldHash } from "@/services/translation/hashUtils";
import { enqueueWithSilentError } from "./translationJobs";
import { deleteTranslationsForEntity } from "./translations";

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
        .from("ingredients")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createIngredient(tenantId: string, name: string): Promise<V2Ingredient> {
    const trimmedName = name.trim();
    const nameHash = await computeFieldHash(trimmedName);

    const { data, error } = await supabase
        .from("ingredients")
        .insert({
            tenant_id: tenantId,
            name: trimmedName,
            name_hash: nameHash
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

    if (nameHash !== null) {
        await enqueueWithSilentError({
            tenantId,
            entityType: "ingredient",
            entityId: data.id,
            field: "name",
            newSourceText: trimmedName,
            newSourceHash: nameHash
        });
    }

    return data;
}

export async function listIngredients(tenantId: string): Promise<V2Ingredient[]> {
    return getIngredients(tenantId);
}

export async function updateIngredient(
    id: string,
    tenantId: string,
    data: { name: string }
): Promise<V2Ingredient> {
    const trimmedName = data.name.trim();
    const nameHash = await computeFieldHash(trimmedName);

    const { data: updated, error } = await supabase
        .from("ingredients")
        .update({ name: trimmedName, name_hash: nameHash })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            throw new Error("Un ingrediente con questo nome esiste già.");
        }
        throw error;
    }

    await enqueueWithSilentError({
        tenantId,
        entityType: "ingredient",
        entityId: id,
        field: "name",
        newSourceText: trimmedName,
        newSourceHash: nameHash
    });

    return updated;
}

export async function deleteIngredient(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;

    try {
        await deleteTranslationsForEntity(tenantId, "ingredient", id, "name");
    } catch (err) {
        console.error("[translations] cleanup on deleteIngredient failed:", err);
    }
}

// =========================================
// PRODUCT ASSIGNMENTS
// =========================================

export async function getProductIngredients(productId: string): Promise<V2ProductIngredient[]> {
    const { data, error } = await supabase
        .from("product_ingredients")
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
            .from("product_ingredients")
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
            .from("product_ingredients")
            .insert(insertPayload);

        if (addError) throw addError;
    }
}
