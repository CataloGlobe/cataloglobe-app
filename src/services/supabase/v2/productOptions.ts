import { supabase } from "../client";

export type OptionGroupKind = "PRIMARY_PRICE" | "ADDON";
export type OptionPricingMode = "ABSOLUTE" | "DELTA";

export type V2ProductOptionGroup = {
    id: string;
    tenant_id: string;
    product_id: string;
    name: string;
    is_required: boolean;
    max_selectable: number | null;
    group_kind: OptionGroupKind;
    pricing_mode: OptionPricingMode;
    created_at: string;
};

export type V2ProductOptionValue = {
    id: string;
    tenant_id: string;
    option_group_id: string;
    name: string;
    price_modifier: number | null;
    absolute_price: number | null;
    created_at: string;
};

export type GroupWithValues = V2ProductOptionGroup & {
    values: V2ProductOptionValue[];
};

export type ProductOptionsResult = {
    primaryPriceGroup: GroupWithValues | null;
    addonGroups: GroupWithValues[];
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

export async function getPrimaryPriceGroup(
    productId: string
): Promise<V2ProductOptionGroup | null> {
    const { data, error } = await supabase
        .from("v2_product_option_groups")
        .select("*")
        .eq("product_id", productId)
        .eq("group_kind", "PRIMARY_PRICE")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
}

export async function getAddonGroups(productId: string): Promise<V2ProductOptionGroup[]> {
    const { data, error } = await supabase
        .from("v2_product_option_groups")
        .select("*")
        .eq("product_id", productId)
        .eq("group_kind", "ADDON")
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Returns a structured view of all option groups for a product,
 * split by kind, each with their values pre-loaded.
 */
export async function getProductOptions(productId: string): Promise<ProductOptionsResult> {
    const allGroups = await getProductOptionGroups(productId);

    const groupsWithValues: GroupWithValues[] = [];
    for (const group of allGroups) {
        const values = await getOptionValues(group.id);
        groupsWithValues.push({ ...group, values });
    }

    const primaryPriceGroup = groupsWithValues.find(g => g.group_kind === "PRIMARY_PRICE") ?? null;
    const addonGroups = groupsWithValues.filter(g => g.group_kind === "ADDON");

    return { primaryPriceGroup, addonGroups };
}

export async function createProductOptionGroup(data: {
    tenant_id: string;
    product_id: string;
    name: string;
    is_required: boolean;
    max_selectable: number | null;
    group_kind?: OptionGroupKind;
    pricing_mode?: OptionPricingMode;
}): Promise<V2ProductOptionGroup> {
    const { data: newGroup, error } = await supabase
        .from("v2_product_option_groups")
        .insert({
            tenant_id: data.tenant_id,
            product_id: data.product_id,
            name: data.name,
            is_required: data.is_required,
            max_selectable: data.max_selectable,
            group_kind: data.group_kind ?? "ADDON",
            pricing_mode: data.pricing_mode ?? "DELTA"
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
        group_kind?: OptionGroupKind;
        pricing_mode?: OptionPricingMode;
    }
): Promise<V2ProductOptionGroup> {
    const updatePayload: Partial<{
        name: string;
        is_required: boolean;
        max_selectable: number | null;
        group_kind: OptionGroupKind;
        pricing_mode: OptionPricingMode;
    }> = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.is_required !== undefined) updatePayload.is_required = data.is_required;
    if (data.max_selectable !== undefined) updatePayload.max_selectable = data.max_selectable;
    if (data.group_kind !== undefined) updatePayload.group_kind = data.group_kind;
    if (data.pricing_mode !== undefined) updatePayload.pricing_mode = data.pricing_mode;

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
    absolute_price?: number | null;
}): Promise<V2ProductOptionValue> {
    const { data: newValue, error } = await supabase
        .from("v2_product_option_values")
        .insert({
            tenant_id: data.tenant_id,
            option_group_id: data.option_group_id,
            name: data.name,
            price_modifier: data.price_modifier,
            absolute_price: data.absolute_price ?? null
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
        absolute_price?: number | null;
    }
): Promise<V2ProductOptionValue> {
    const updatePayload: Partial<{
        name: string;
        price_modifier: number | null;
        absolute_price: number | null;
    }> = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.price_modifier !== undefined) updatePayload.price_modifier = data.price_modifier;
    if (data.absolute_price !== undefined) updatePayload.absolute_price = data.absolute_price;

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
