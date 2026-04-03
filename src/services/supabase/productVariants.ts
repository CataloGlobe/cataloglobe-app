import { supabase } from "@/services/supabase/client";
import { createProduct, V2Product, ProductType, VariantStrategy } from "@/services/supabase/products";
import { cartesianProduct } from "@/utils/variantCombinations";

// =============================================================================
// Types
// =============================================================================

export type VariantDimensionValue = {
    id: string;
    dimension_id: string;
    label: string;
    sort_order: number;
};

export type VariantDimension = {
    id: string;
    product_id: string;
    name: string;
    sort_order: number;
    values: VariantDimensionValue[];
};

export type VariantAssignment = {
    id: string;
    parent_product_id: string;
    variant_product_id: string;
    combination_key: string;
    dimension_value_ids: string[];
};

export type VariantMatrixConfig = {
    variant_strategy: VariantStrategy;
    dimensions: VariantDimension[];
    assignments: VariantAssignment[];
};

export type VariantDimensionInput = {
    name: string;
    sort_order?: number;
    values: { label: string; sort_order?: number }[];
};

export type VariantCombination = {
    dimension_value_ids: string[];
    labels: string[];
    already_assigned: boolean;
};

export type GenerateVariantsResult = {
    created: V2Product[];
    skipped: number;
};

// =============================================================================
// DB row shapes (internal — not exported)
// =============================================================================

type DimensionRow = {
    id: string;
    product_id: string;
    name: string;
    sort_order: number;
    created_at: string;
};

type DimensionValueRow = {
    id: string;
    dimension_id: string;
    label: string;
    sort_order: number;
    created_at: string;
};

type AssignmentRow = {
    id: string;
    parent_product_id: string;
    variant_product_id: string;
    combination_key: string;
    created_at: string;
};

type AssignmentValueRow = {
    assignment_id: string;
    dimension_value_id: string;
};

type ProductStrategyRow = {
    id: string;
    parent_product_id: string | null;
    variant_strategy: VariantStrategy;
    name: string;
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Builds a deterministic combination key from an array of dimension_value IDs.
 * UUIDs are sorted lexicographically then joined with ':'.
 * Same combination always yields the same key regardless of insertion order.
 */
export function buildCombinationKey(dimensionValueIds: string[]): string {
    return [...dimensionValueIds].sort().join(":");
}

/**
 * Fetches and validates the target product:
 * - must exist in the tenant
 * - must be a base product (parent_product_id IS NULL)
 */
async function fetchAndValidateParentProduct(
    productId: string,
    tenantId: string
): Promise<ProductStrategyRow> {
    const { data, error } = await supabase
        .from("products")
        .select("id, parent_product_id, variant_strategy, name")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .single();

    if (error) {
        if (error.code === "PGRST116") {
            throw new Error(`Product ${productId} not found.`);
        }
        throw error;
    }

    const row = data as ProductStrategyRow;

    if (row.parent_product_id !== null) {
        throw new Error(
            "Variant matrix configuration is only allowed on base products. This product is already a variant."
        );
    }

    return row;
}

// =============================================================================
// getVariantMatrixConfig
// =============================================================================

export async function getVariantMatrixConfig(
    productId: string,
    tenantId: string
): Promise<VariantMatrixConfig> {
    const product = await fetchAndValidateParentProduct(productId, tenantId);

    // Fetch dimensions
    const { data: dimRows, error: dimError } = await supabase
        .from("product_variant_dimensions")
        .select("id, product_id, name, sort_order, created_at")
        .eq("product_id", productId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true });

    if (dimError) throw dimError;

    const dimensions = (dimRows ?? []) as DimensionRow[];
    const dimensionIds = dimensions.map(d => d.id);

    // Fetch dimension values
    let dimensionValues: DimensionValueRow[] = [];
    if (dimensionIds.length > 0) {
        const { data: valRows, error: valError } = await supabase
            .from("product_variant_dimension_values")
            .select("id, dimension_id, label, sort_order, created_at")
            .in("dimension_id", dimensionIds)
            .eq("tenant_id", tenantId)
            .order("sort_order", { ascending: true });

        if (valError) throw valError;
        dimensionValues = (valRows ?? []) as DimensionValueRow[];
    }

    // Group values by dimension_id
    const valuesByDimension = new Map<string, VariantDimensionValue[]>();
    for (const val of dimensionValues) {
        const list = valuesByDimension.get(val.dimension_id) ?? [];
        list.push({ id: val.id, dimension_id: val.dimension_id, label: val.label, sort_order: val.sort_order });
        valuesByDimension.set(val.dimension_id, list);
    }

    const builtDimensions: VariantDimension[] = dimensions.map(d => ({
        id: d.id,
        product_id: d.product_id,
        name: d.name,
        sort_order: d.sort_order,
        values: valuesByDimension.get(d.id) ?? []
    }));

    // Fetch assignments
    const { data: assignRows, error: assignError } = await supabase
        .from("product_variant_assignments")
        .select("id, parent_product_id, variant_product_id, combination_key, created_at")
        .eq("parent_product_id", productId)
        .eq("tenant_id", tenantId);

    if (assignError) throw assignError;

    const assignments = (assignRows ?? []) as AssignmentRow[];
    const assignmentIds = assignments.map(a => a.id);

    // Fetch assignment values
    let assignmentValues: AssignmentValueRow[] = [];
    if (assignmentIds.length > 0) {
        const { data: avRows, error: avError } = await supabase
            .from("product_variant_assignment_values")
            .select("assignment_id, dimension_value_id")
            .in("assignment_id", assignmentIds);

        if (avError) throw avError;
        assignmentValues = (avRows ?? []) as AssignmentValueRow[];
    }

    // Group assignment values by assignment_id
    const valuesByAssignment = new Map<string, string[]>();
    for (const av of assignmentValues) {
        const list = valuesByAssignment.get(av.assignment_id) ?? [];
        list.push(av.dimension_value_id);
        valuesByAssignment.set(av.assignment_id, list);
    }

    const builtAssignments: VariantAssignment[] = assignments.map(a => ({
        id: a.id,
        parent_product_id: a.parent_product_id,
        variant_product_id: a.variant_product_id,
        combination_key: a.combination_key,
        dimension_value_ids: valuesByAssignment.get(a.id) ?? []
    }));

    return {
        variant_strategy: product.variant_strategy,
        dimensions: builtDimensions,
        assignments: builtAssignments
    };
}

// =============================================================================
// saveVariantMatrixConfig
// =============================================================================

export async function saveVariantMatrixConfig(
    productId: string,
    tenantId: string,
    dimensions: VariantDimensionInput[]
): Promise<VariantMatrixConfig> {
    await fetchAndValidateParentProduct(productId, tenantId);

    // Guardrail: max 2 dimensions
    if (dimensions.length > 2) {
        throw new Error(`A product can have at most 2 variant dimensions. Received ${dimensions.length}.`);
    }

    // Guardrail: duplicate dimension names in input
    const dimNames = dimensions.map(d => d.name.trim().toLowerCase());
    if (new Set(dimNames).size !== dimNames.length) {
        throw new Error("Duplicate dimension names are not allowed.");
    }

    // Guardrail: duplicate value labels within same dimension
    for (const dim of dimensions) {
        const labels = dim.values.map(v => v.label.trim().toLowerCase());
        if (new Set(labels).size !== labels.length) {
            throw new Error(`Duplicate values found in dimension "${dim.name}".`);
        }
    }

    // Check if any existing dimensions/values are referenced by assignments
    const { data: existingDims, error: fetchDimError } = await supabase
        .from("product_variant_dimensions")
        .select("id")
        .eq("product_id", productId)
        .eq("tenant_id", tenantId);

    if (fetchDimError) throw fetchDimError;

    const existingDimIds = ((existingDims ?? []) as { id: string }[]).map(d => d.id);

    if (existingDimIds.length > 0) {
        // Fetch all values of existing dimensions
        const { data: existingVals, error: fetchValError } = await supabase
            .from("product_variant_dimension_values")
            .select("id")
            .in("dimension_id", existingDimIds)
            .eq("tenant_id", tenantId);

        if (fetchValError) throw fetchValError;

        const existingValIds = ((existingVals ?? []) as { id: string }[]).map(v => v.id);

        if (existingValIds.length > 0) {
            // Check if any of these values are referenced by assignment_values
            const { data: usedVals, error: usedError } = await supabase
                .from("product_variant_assignment_values")
                .select("dimension_value_id")
                .in("dimension_value_id", existingValIds)
                .limit(1);

            if (usedError) throw usedError;

            if ((usedVals ?? []).length > 0) {
                throw new Error(
                    "Cannot replace dimension configuration: existing dimension values are referenced by active variant assignments. " +
                    "Remove the assignments first, then update the configuration."
                );
            }
        }

        // Safe to delete existing dimensions (cascades to values)
        const { error: deleteDimsError } = await supabase
            .from("product_variant_dimensions")
            .delete()
            .in("id", existingDimIds)
            .eq("tenant_id", tenantId);

        if (deleteDimsError) throw deleteDimsError;
    }

    // Insert new dimensions and values
    for (let i = 0; i < dimensions.length; i++) {
        const dim = dimensions[i];
        const dimId = crypto.randomUUID();
        const dimSortOrder = dim.sort_order ?? i;

        const { error: insertDimError } = await supabase
            .from("product_variant_dimensions")
            .insert({
                id: dimId,
                tenant_id: tenantId,
                product_id: productId,
                name: dim.name.trim(),
                sort_order: dimSortOrder
            });

        if (insertDimError) throw insertDimError;

        for (let j = 0; j < dim.values.length; j++) {
            const val = dim.values[j];
            const { error: insertValError } = await supabase
                .from("product_variant_dimension_values")
                .insert({
                    id: crypto.randomUUID(),
                    tenant_id: tenantId,
                    dimension_id: dimId,
                    label: val.label.trim(),
                    sort_order: val.sort_order ?? j
                });

            if (insertValError) throw insertValError;
        }
    }

    // Set variant_strategy to 'matrix' on the parent product
    const { error: updateStrategyError } = await supabase
        .from("products")
        .update({ variant_strategy: "matrix" as VariantStrategy })
        .eq("id", productId)
        .eq("tenant_id", tenantId);

    if (updateStrategyError) throw updateStrategyError;

    return getVariantMatrixConfig(productId, tenantId);
}

// =============================================================================
// previewVariantMatrixCombinations
// =============================================================================

export async function previewVariantMatrixCombinations(
    productId: string,
    tenantId: string
): Promise<VariantCombination[]> {
    await fetchAndValidateParentProduct(productId, tenantId);

    const config = await getVariantMatrixConfig(productId, tenantId);

    if (config.dimensions.length === 0) {
        return [];
    }

    // Build set of existing combination keys for fast lookup
    const existingKeys = new Set(config.assignments.map(a => a.combination_key));

    // Build value arrays per dimension (in sort_order)
    const valuesPerDimension = config.dimensions.map(d => d.values);

    // Generate all combinations
    const allCombinations = cartesianProduct(valuesPerDimension);

    return allCombinations.map(combo => {
        const ids = combo.map(v => v.id);
        const key = buildCombinationKey(ids);
        return {
            dimension_value_ids: ids,
            labels: combo.map(v => v.label),
            already_assigned: existingKeys.has(key)
        };
    });
}

// =============================================================================
// generateMissingVariants
// =============================================================================

export async function generateMissingVariants(
    productId: string,
    tenantId: string,
    template: { product_type: ProductType; base_price: number | null }
): Promise<GenerateVariantsResult> {
    const product = await fetchAndValidateParentProduct(productId, tenantId);

    const combinations = await previewVariantMatrixCombinations(productId, tenantId);
    const missing = combinations.filter(c => !c.already_assigned);

    const created: V2Product[] = [];
    let skipped = combinations.length - missing.length;

    for (const combo of missing) {
        // Build the variant name from parent name + dimension labels
        const variantName = `${product.name} — ${combo.labels.join(" / ")}`;

        // 1. Create the product row
        const newProduct = await createProduct(
            tenantId,
            {
                name: variantName,
                product_type: template.product_type,
                base_price: template.base_price
            },
            productId
        );

        // 2. Create the assignment row
        const assignmentId = crypto.randomUUID();
        const combinationKey = buildCombinationKey(combo.dimension_value_ids);

        const { error: assignError } = await supabase
            .from("product_variant_assignments")
            .insert({
                id: assignmentId,
                tenant_id: tenantId,
                parent_product_id: productId,
                variant_product_id: newProduct.id,
                combination_key: combinationKey
            });

        if (assignError) {
            // If the combination was assigned concurrently, skip silently
            if (assignError.code === "23505") {
                skipped += 1;
                continue;
            }
            throw assignError;
        }

        // 3. Insert assignment values (one row per dimension value)
        for (const dimValueId of combo.dimension_value_ids) {
            const { error: avError } = await supabase
                .from("product_variant_assignment_values")
                .insert({
                    assignment_id: assignmentId,
                    dimension_value_id: dimValueId
                });

            if (avError) throw avError;
        }

        created.push(newProduct);
    }

    return { created, skipped };
}
