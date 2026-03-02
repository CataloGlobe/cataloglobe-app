import { supabase } from "../client";
import { getProductAttributes, setProductAttributeValue } from "./attributes";
import { getProductAllergens, setProductAllergens } from "./allergens";
import { getProductGroupAssignments, assignProductToGroup } from "./productGroups";

export type V2Product = {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    parent_product_id: string | null;
    is_visible: boolean;
    image_url: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    variants?: V2Product[];
};

/**
 * Validates cross-tenant and nested variant conditions application-side
 * before hitting the database (which would also block it via the new trigger).
 */
async function validateParentBeforeSave(tenantId: string, parentId?: string | null) {
    if (!parentId) return;

    const { data: parent, error } = await supabase
        .from("v2_products")
        .select("tenant_id, parent_product_id")
        .eq("id", parentId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new Error(`Parent product ${parentId} not found.`);
        }
        throw error;
    }

    if (parent.tenant_id !== tenantId) {
        throw new Error("Cannot link product to a parent belonging to a different tenant.");
    }

    if (parent.parent_product_id !== null) {
        throw new Error(
            "Cannot create a variant of a variant. The chosen parent is already a variant."
        );
    }
}

export async function listBaseProductsWithVariants(tenantId: string): Promise<V2Product[]> {
    const { data, error } = await supabase
        .from("v2_products")
        .select(
            `
            *,
            variants:v2_products!parent_product_id(*)
        `
        )
        .eq("tenant_id", tenantId)
        .is("parent_product_id", null) // Only fetch base products at root level
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getProduct(id: string, tenantId: string): Promise<V2Product> {
    const { data, error } = await supabase
        .from("v2_products")
        .select(
            `
            *,
            variants:v2_products!parent_product_id(*)
        `
        )
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

    if (error) throw error;
    return data;
}

export async function createProduct(
    tenantId: string,
    data: {
        name: string;
        description?: string | null;
        base_price?: number | null;
        is_visible?: boolean;
        image_url?: string | null;
    },
    parentId?: string | null
): Promise<V2Product> {
    await validateParentBeforeSave(tenantId, parentId);

    const { data: newProduct, error } = await supabase
        .from("v2_products")
        .insert({
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            name: data.name,
            description: data.description || null,
            base_price: data.base_price ?? null,
            parent_product_id: parentId || null,
            is_visible: data.is_visible ?? true,
            image_url: data.image_url ?? null
        })
        .select()
        .single();

    if (error) throw error;
    return newProduct;
}

export async function updateProduct(
    id: string,
    tenantId: string,
    data: {
        name?: string;
        description?: string | null;
        base_price?: number | null;
        is_visible?: boolean;
        image_url?: string | null;
    },
    parentId?: string | null
): Promise<V2Product> {
    await validateParentBeforeSave(tenantId, parentId);

    const updatePayload: any = {
        updated_at: new Date().toISOString()
    };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.base_price !== undefined) updatePayload.base_price = data.base_price;
    if (data.is_visible !== undefined) updatePayload.is_visible = data.is_visible;
    if (data.image_url !== undefined) updatePayload.image_url = data.image_url;
    if (parentId !== undefined) updatePayload.parent_product_id = parentId;

    const { data: updatedProduct, error } = await supabase
        .from("v2_products")
        .update(updatePayload)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return updatedProduct;
}

/**
 * Safely deletes a product.
 * - Checks if the product is in use by `v2_featured_content_products` (ON DELETE RESTRICT).
 * - If `cascadeVariants` is false and variants exist, throws an error.
 * - If `cascadeVariants` is true, deletes the children first, then the parent.
 */
export async function deleteProduct(
    id: string,
    tenantId: string,
    cascadeVariants: boolean = false
): Promise<void> {
    // 1. Check if used in featured contents
    const { data: featuredUsage, error: featuredError } = await supabase
        .from("v2_featured_content_products")
        .select("id")
        .eq("product_id", id)
        .limit(1);

    if (featuredError) throw featuredError;
    if (featuredUsage && featuredUsage.length > 0) {
        throw new Error("Cannot delete product because it is used in Featured Contents.");
    }

    // 1.5 Check if used in any catalog category
    const { data: catalogUsage, error: catalogError } = await supabase
        .from("v2_catalog_category_products")
        .select("id")
        .eq("product_id", id)
        .limit(1);

    if (catalogError) throw catalogError;
    if (catalogUsage && catalogUsage.length > 0) {
        throw new Error(
            "Cannot delete product because it is present in one or more Catalogs. Remove it from the catalogs first."
        );
    }

    // 2. Handle variants
    const { data: variants, error: variantsError } = await supabase
        .from("v2_products")
        .select("id")
        .eq("parent_product_id", id);

    if (variantsError) throw variantsError;

    const hasVariants = variants && variants.length > 0;

    if (hasVariants) {
        if (!cascadeVariants) {
            throw new Error(`Cannot delete product because it has ${variants.length} variant(s).`);
        } else {
            // Delete variants first (since DB constraint is ON DELETE RESTRICT)
            const variantIds = variants.map(v => v.id);
            const { error: delVariantsError } = await supabase
                .from("v2_products")
                .delete()
                .in("id", variantIds)
                .eq("tenant_id", tenantId); // security check

            if (delVariantsError) throw delVariantsError;
        }
    }

    // 3. Delete the product itself
    // (Other tables like v2_catalog_items or overrides have ON DELETE CASCADE so they clean up automatically)
    const { error: delError } = await supabase
        .from("v2_products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (delError) {
        // Fallback for any unanticipated restrict constraint
        if (delError.code === "23503") {
            throw new Error("Cannot delete product because it is referenced by another record.");
        }
        throw delError;
    }
}

import {
    getProductOptionGroups,
    getOptionValues,
    createProductOptionGroup,
    createOptionValue
} from "./productOptions";
import { getProductIngredients, setProductIngredients } from "./ingredients";

export async function duplicateProduct(productId: string, tenantId: string): Promise<V2Product> {
    // 1. Fetch original product
    const original = await getProduct(productId, tenantId);
    if (!original) {
        throw new Error(`Product ${productId} not found.`);
    }

    // 2. Create new product
    const newProduct = await createProduct(
        tenantId,
        {
            name: `${original.name} (Copia)`,
            description: original.description,
            base_price: original.base_price,
            is_visible: original.is_visible,
            image_url: original.image_url
        },
        null // parent_product_id = null
    );

    // 3. Copy attributes
    const originalAttributes = await getProductAttributes(productId, tenantId);
    for (const attr of originalAttributes) {
        await setProductAttributeValue(tenantId, newProduct.id, attr.attribute_definition_id, {
            value_text: attr.value_text || undefined,
            value_number: attr.value_number !== null ? attr.value_number : undefined,
            value_boolean: attr.value_boolean !== null ? attr.value_boolean : undefined,
            value_json: attr.value_json || undefined
        });
    }

    // 4. Copy allergens
    const originalAllergens = await getProductAllergens(productId, tenantId);
    if (originalAllergens.length > 0) {
        await setProductAllergens(tenantId, newProduct.id, originalAllergens);
    }

    // 5. Copy groups
    const originalGroups = await getProductGroupAssignments(productId);
    for (const group of originalGroups) {
        await assignProductToGroup({
            productId: newProduct.id,
            groupId: group.group_id,
            tenantId: tenantId
        });
    }

    // 6. Copy ingredients
    const originalIngredients = await getProductIngredients(productId);
    if (originalIngredients.length > 0) {
        await setProductIngredients(
            tenantId,
            newProduct.id,
            originalIngredients.map(i => i.ingredient_id)
        );
    }

    // 7. Copy product options
    const originalOptionGroups = await getProductOptionGroups(productId);
    for (const group of originalOptionGroups) {
        const newGroup = await createProductOptionGroup({
            tenant_id: tenantId,
            product_id: newProduct.id,
            name: group.name,
            is_required: group.is_required,
            max_selectable: group.max_selectable,
            group_kind: group.group_kind,
            pricing_mode: group.pricing_mode
        });

        const originalValues = await getOptionValues(group.id);
        for (const val of originalValues) {
            await createOptionValue({
                tenant_id: tenantId,
                option_group_id: newGroup.id,
                name: val.name,
                price_modifier: val.price_modifier,
                absolute_price: val.absolute_price
            });
        }
    }

    return newProduct;
}
