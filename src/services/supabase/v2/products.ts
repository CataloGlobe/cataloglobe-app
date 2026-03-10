import { supabase } from "@/services/supabase/client";
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
    image_url: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    variants?: V2Product[];
};

export type ProductListMetadata = {
    formatsCount: number;
    configurationsCount: number;
    catalogsCount: number;
    fromPrice: number | null;
};

type ProductOptionGroupListRow = {
    id: string;
    product_id: string;
    group_kind: "PRIMARY_PRICE" | "ADDON";
};

type ProductOptionValueListRow = {
    option_group_id: string;
    absolute_price: number | null;
};

type CatalogItemListRow = {
    product_id: string;
    catalog_id: string;
};

export async function getProductListMetadata(
    tenantId: string,
    productIds: string[]
): Promise<Record<string, ProductListMetadata>> {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    const metadataByProductId: Record<string, ProductListMetadata> = {};

    for (const productId of uniqueProductIds) {
        metadataByProductId[productId] = {
            formatsCount: 0,
            configurationsCount: 0,
            catalogsCount: 0,
            fromPrice: null
        };
    }

    if (uniqueProductIds.length === 0) {
        return metadataByProductId;
    }

    const [groupsRes, catalogItemsRes] = await Promise.all([
        supabase
            .from("v2_product_option_groups")
            .select("id, product_id, group_kind")
            .eq("tenant_id", tenantId)
            .in("product_id", uniqueProductIds),
        supabase
            .from("v2_catalog_items")
            .select("product_id, catalog_id")
            .eq("tenant_id", tenantId)
            .in("product_id", uniqueProductIds)
    ]);

    if (groupsRes.error) throw groupsRes.error;
    if (catalogItemsRes.error) throw catalogItemsRes.error;

    const primaryGroupToProductId = new Map<string, string>();
    const groups = (groupsRes.data ?? []) as ProductOptionGroupListRow[];

    for (const group of groups) {
        const meta = metadataByProductId[group.product_id];
        if (!meta) continue;

        if (group.group_kind === "ADDON") {
            meta.configurationsCount += 1;
            continue;
        }

        primaryGroupToProductId.set(group.id, group.product_id);
    }

    if (primaryGroupToProductId.size > 0) {
        const primaryGroupIds = Array.from(primaryGroupToProductId.keys());
        const { data: values, error: valuesError } = await supabase
            .from("v2_product_option_values")
            .select("option_group_id, absolute_price")
            .eq("tenant_id", tenantId)
            .in("option_group_id", primaryGroupIds);

        if (valuesError) throw valuesError;

        for (const value of (values ?? []) as ProductOptionValueListRow[]) {
            const productId = primaryGroupToProductId.get(value.option_group_id);
            if (!productId) continue;

            const meta = metadataByProductId[productId];
            if (!meta) continue;

            meta.formatsCount += 1;

            if (typeof value.absolute_price === "number") {
                meta.fromPrice =
                    meta.fromPrice === null
                        ? value.absolute_price
                        : Math.min(meta.fromPrice, value.absolute_price);
            }
        }
    }

    const catalogIdsByProductId = new Map<string, Set<string>>();
    const catalogItems = (catalogItemsRes.data ?? []) as CatalogItemListRow[];

    for (const item of catalogItems) {
        const catalogIds = catalogIdsByProductId.get(item.product_id) ?? new Set<string>();
        catalogIds.add(item.catalog_id);
        catalogIdsByProductId.set(item.product_id, catalogIds);
    }

    for (const [productId, catalogIds] of catalogIdsByProductId.entries()) {
        const meta = metadataByProductId[productId];
        if (!meta) continue;
        meta.catalogsCount = catalogIds.size;
    }

    return metadataByProductId;
}

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
 * Deletes a product and all its dependencies via ON DELETE CASCADE.
 * Cascades to: variants, catalog items, featured content products,
 * activity overrides, schedule overrides, allergens, attributes, ingredients.
 */
export async function deleteProduct(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("v2_products")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) {
        if (error.code === "23503") {
            throw new Error("Cannot delete product because it is referenced by another record.");
        }
        throw error;
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
