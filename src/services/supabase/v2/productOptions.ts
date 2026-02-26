import { supabase } from "../client";

export type V2ProductOptionGroup = {
    id: string;
    tenant_id: string;
    product_id: string;
    name: string;
    is_required: boolean;
    max_selectable: number | null;
    created_at: string;
};

export type V2ProductOptionValue = {
    id: string;
    tenant_id: string;
    option_group_id: string;
    name: string;
    price_modifier: number | null;
    created_at: string;
};

// =========================================
// GROUPS
// =========================================

export async function getProductOptionGroups(productId: string): Promise<V2ProductOptionGroup[]> {
    const { data, error } = await supabase
        .from("v2_product_option_groups")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createProductOptionGroup(data: {
    tenant_id: string;
    product_id: string;
    name: string;
    is_required: boolean;
    max_selectable: number | null;
}): Promise<V2ProductOptionGroup> {
    const { data: newGroup, error } = await supabase
        .from("v2_product_option_groups")
        .insert({
            tenant_id: data.tenant_id,
            product_id: data.product_id,
            name: data.name,
            is_required: data.is_required,
            max_selectable: data.max_selectable
        })
        .select()
        .single();

    if (error) throw error;
    return newGroup;
}

export async function updateProductOptionGroup(
    id: string,
    data: {
        name?: string;
        is_required?: boolean;
        max_selectable?: number | null;
    }
): Promise<V2ProductOptionGroup> {
    const updatePayload: Partial<{
        name: string;
        is_required: boolean;
        max_selectable: number | null;
    }> = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.is_required !== undefined) updatePayload.is_required = data.is_required;
    if (data.max_selectable !== undefined) updatePayload.max_selectable = data.max_selectable;

    const { data: updatedGroup, error } = await supabase
        .from("v2_product_option_groups")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return updatedGroup;
}

export async function deleteProductOptionGroup(id: string): Promise<void> {
    const { error } = await supabase.from("v2_product_option_groups").delete().eq("id", id);

    if (error) throw error;
}

// =========================================
// VALUES
// =========================================

export async function getOptionValues(groupId: string): Promise<V2ProductOptionValue[]> {
    const { data, error } = await supabase
        .from("v2_product_option_values")
        .select("*")
        .eq("option_group_id", groupId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createOptionValue(data: {
    tenant_id: string;
    option_group_id: string;
    name: string;
    price_modifier: number | null;
}): Promise<V2ProductOptionValue> {
    const { data: newValue, error } = await supabase
        .from("v2_product_option_values")
        .insert({
            tenant_id: data.tenant_id,
            option_group_id: data.option_group_id,
            name: data.name,
            price_modifier: data.price_modifier
        })
        .select()
        .single();

    if (error) throw error;
    return newValue;
}

export async function updateOptionValue(
    id: string,
    data: {
        name?: string;
        price_modifier?: number | null;
    }
): Promise<V2ProductOptionValue> {
    const updatePayload: Partial<{
        name: string;
        price_modifier: number | null;
    }> = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.price_modifier !== undefined) updatePayload.price_modifier = data.price_modifier;

    const { data: updatedValue, error } = await supabase
        .from("v2_product_option_values")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return updatedValue;
}

export async function deleteOptionValue(id: string): Promise<void> {
    const { error } = await supabase.from("v2_product_option_values").delete().eq("id", id);

    if (error) throw error;
}
