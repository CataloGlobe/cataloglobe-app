import { supabase } from "../client";

export type AttributeType = "text" | "number" | "boolean" | "select" | "multi_select";

export type V2ProductAttributeDefinition = {
    id: string;
    tenant_id: string;
    code: string;
    label: string;
    type: AttributeType;
    options: any | null; // Used for select/multi_select
    is_required: boolean;
    vertical: string | null;
    created_at: string;
};

export type V2ProductAttributeValue = {
    id: string;
    tenant_id: string;
    product_id: string;
    attribute_definition_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
    value_json: any | null;
    created_at: string;
};

export type AttributeValuePayload = {
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: any | null;
};

/**
 * ----------------------------------------------------
 * ATTRIBUTE DEFINITIONS
 * ----------------------------------------------------
 */

export async function listAttributeDefinitions(
    tenantId: string,
    vertical?: string
): Promise<V2ProductAttributeDefinition[]> {
    let query = supabase
        .from("v2_product_attribute_definitions")
        .select("*")
        .eq("tenant_id", tenantId);

    if (vertical) {
        query = query.eq("vertical", vertical);
    }

    const { data, error } = await query.order("label", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createAttributeDefinition(
    tenantId: string,
    data: {
        code: string;
        label: string;
        type: AttributeType;
        options?: any;
        is_required?: boolean;
        vertical?: string;
    }
): Promise<V2ProductAttributeDefinition> {
    const { data: newDef, error } = await supabase
        .from("v2_product_attribute_definitions")
        .insert({
            tenant_id: tenantId,
            code: data.code,
            label: data.label,
            type: data.type,
            options: data.options || null,
            is_required: data.is_required || false,
            vertical: data.vertical || null
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            // Unique violation
            throw new Error(
                `Un attributo con il codice "${data.code}" esiste già per questo tenant.`
            );
        }
        throw error;
    }
    return newDef;
}

export async function updateAttributeDefinition(
    id: string,
    tenantId: string,
    data: {
        label?: string;
        is_required?: boolean;
        options?: any;
    }
): Promise<V2ProductAttributeDefinition> {
    const { data: updatedDef, error } = await supabase
        .from("v2_product_attribute_definitions")
        .update({
            ...(data.label !== undefined && { label: data.label }),
            ...(data.is_required !== undefined && { is_required: data.is_required }),
            ...(data.options !== undefined && { options: data.options })
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return updatedDef;
}

export async function deleteAttributeDefinition(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("v2_product_attribute_definitions")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}

/**
 * ----------------------------------------------------
 * ATTRIBUTE VALUES
 * ----------------------------------------------------
 */

export async function getProductAttributes(
    productId: string,
    tenantId: string
): Promise<V2ProductAttributeValue[]> {
    const { data, error } = await supabase
        .from("v2_product_attribute_values")
        .select("*")
        .eq("product_id", productId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return data || [];
}

export async function setProductAttributeValue(
    tenantId: string,
    productId: string,
    attributeDefinitionId: string,
    payload: AttributeValuePayload
): Promise<void> {
    // We use upsert on the unique constraint (product_id, attribute_definition_id)
    // Supabase JS allows upsert with an `onConflict` parameter.

    // Check if value already exists to do a clean update/insert
    const { data: existing, error: checkError } = await supabase
        .from("v2_product_attribute_values")
        .select("id")
        .eq("product_id", productId)
        .eq("attribute_definition_id", attributeDefinitionId)
        .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
        // Update
        const { error: updateError } = await supabase
            .from("v2_product_attribute_values")
            .update({
                value_text: payload.value_text ?? null,
                value_number: payload.value_number ?? null,
                value_boolean: payload.value_boolean ?? null,
                value_json: payload.value_json ?? null
            })
            .eq("id", existing.id)
            .eq("tenant_id", tenantId);

        if (updateError) throw updateError;
    } else {
        // Insert
        // If all values are null/empty, we might not even need to insert, but let's insert for now if called.
        // Actually, if it's completely empty, it's better to not have a row or delete it.
        const isEmpty =
            (payload.value_text === null ||
                payload.value_text === undefined ||
                payload.value_text === "") &&
            (payload.value_number === null || payload.value_number === undefined) &&
            (payload.value_boolean === null || payload.value_boolean === undefined) &&
            (payload.value_json === null || payload.value_json === undefined);

        if (isEmpty) return; // Don't create empty rows

        const { error: insertError } = await supabase.from("v2_product_attribute_values").insert({
            tenant_id: tenantId,
            product_id: productId,
            attribute_definition_id: attributeDefinitionId,
            value_text: payload.value_text ?? null,
            value_number: payload.value_number ?? null,
            value_boolean: payload.value_boolean ?? null,
            value_json: payload.value_json ?? null
        });

        if (insertError) throw insertError;
    }
}

// Optional helper to remove a value if cleared
export async function removeProductAttributeValue(
    tenantId: string,
    productId: string,
    attributeDefinitionId: string
): Promise<void> {
    const { error } = await supabase
        .from("v2_product_attribute_values")
        .delete()
        .eq("product_id", productId)
        .eq("attribute_definition_id", attributeDefinitionId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}
