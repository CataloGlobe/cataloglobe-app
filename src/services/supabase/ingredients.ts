import { supabase } from "@/services/supabase/client";
import { computeFieldHash } from "@/services/translation/hashUtils";
import { enqueueWithSilentError } from "./translationJobs";
import { deleteTranslationsForEntity } from "./translations";
import { revalidatePublicCatalogForTenant } from "@services/publicCatalog/revalidatePublicCatalog";

export type V2Ingredient = {
    id: string;
    tenant_id: string;
    name: string;
    created_at: string;
    /**
     * DORMIENTE — unità di misura predefinita per il futuro modulo food cost.
     * Nessuna UI la scrive, nessuna logica la legge, fuori dal sistema
     * traduzioni per scelta esplicita. Resta NULL finché il modulo non esiste.
     */
    default_unit: string | null;
};

export type V2ProductIngredient = {
    tenant_id: string;
    product_id: string;
    ingredient_id: string;
    created_at: string;
    /** Ordine dell'ingrediente dentro il prodotto (0-based). */
    sort_order: number;
    /** DORMIENTE — food cost. Vedi `V2Ingredient.default_unit`. */
    quantity: number | null;
    /** DORMIENTE — food cost. Vedi `V2Ingredient.default_unit`. */
    unit: string | null;
};

/**
 * Elemento del payload jsonb di `replace_product_ingredients`.
 * Il modulo food cost aggiungera' qui `quantity`/`unit` come chiavi opzionali,
 * senza cambiare la firma della RPC.
 */
export type ProductIngredientOrderItem = {
    ingredient_id: string;
    sort_order: number;
};

/**
 * L'ordine dell'array E' l'ordine voluto: `sort_order` = posizione.
 * Funzione pura, estratta per essere testabile senza toccare il DB.
 */
export function buildProductIngredientsPayload(
    ingredientIds: string[]
): ProductIngredientOrderItem[] {
    return ingredientIds.map((ingredient_id, index) => ({
        ingredient_id,
        sort_order: index
    }));
}

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

/**
 * Tutte le coppie prodotto↔ingrediente del tenant in una sola query piatta
 * (2 UUID per riga). Usata dalla vista "Ingredienti" del drawer Gestisci
 * disponibilità per derivare client-side stato aggregato e conteggi — mai una
 * query per ingrediente.
 */
export async function listProductIngredientPairs(
    tenantId: string
): Promise<Array<Pick<V2ProductIngredient, "product_id" | "ingredient_id">>> {
    const { data, error } = await supabase
        .from("product_ingredients")
        .select("product_id, ingredient_id")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
}

/** Legami del prodotto, già ordinati: l'ordine dell'array è `sort_order`. */
export async function getProductIngredients(productId: string): Promise<V2ProductIngredient[]> {
    const { data, error } = await supabase
        .from("product_ingredients")
        .select("*")
        .eq("product_id", productId)
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Sostituisce i legami del prodotto. L'ORDINE dell'array è significativo:
 * diventa `sort_order` (0-based) e determina l'ordine mostrato sulla pagina
 * pubblica.
 */
export async function setProductIngredients(
    tenantId: string,
    productId: string,
    ingredientIds: string[]
): Promise<void> {
    const { error } = await supabase.rpc("replace_product_ingredients", {
        p_tenant_id: tenantId,
        p_product_id: productId,
        p_ingredients: buildProductIngredientsPayload(ingredientIds)
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

    void revalidatePublicCatalogForTenant(tenantId);
}
