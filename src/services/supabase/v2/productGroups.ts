import { supabase } from "../client";

export type ProductGroup = {
    id: string;
    tenant_id: string;
    name: string;
    parent_group_id: string | null;
    created_at: string;
    updated_at: string;
};

export type ProductGroupInsert = {
    tenant_id: string;
    name: string;
    parent_group_id?: string | null;
};

export type ProductGroupUpdate = {
    name?: string;
    parent_group_id?: string | null;
};

export type ProductGroupItem = {
    tenant_id: string;
    product_id: string;
    group_id: string;
    created_at: string;
};

// =========================================
// GROUPS
// =========================================

export async function getProductGroups(tenantId: string): Promise<ProductGroup[]> {
    const { data, error } = await supabase
        .from("v2_product_groups")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createProductGroup(data: ProductGroupInsert): Promise<ProductGroup> {
    const { data: newGroup, error } = await supabase
        .from("v2_product_groups")
        .insert({
            tenant_id: data.tenant_id,
            name: data.name,
            parent_group_id: data.parent_group_id || null
        })
        .select()
        .single();

    if (error) throw error;
    return newGroup;
}

export async function updateProductGroup(
    id: string,
    data: ProductGroupUpdate
): Promise<ProductGroup> {
    const updatePayload: ProductGroupUpdate = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.parent_group_id !== undefined) updatePayload.parent_group_id = data.parent_group_id;

    const { data: updatedGroup, error } = await supabase
        .from("v2_product_groups")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return updatedGroup;
}

export async function deleteProductGroup(id: string): Promise<void> {
    const { error } = await supabase.from("v2_product_groups").delete().eq("id", id);

    if (error) throw error;
}

// =========================================
// ASSIGNMENTS
// =========================================

export async function getProductGroupAssignments(productId: string): Promise<ProductGroupItem[]> {
    const { data, error } = await supabase
        .from("v2_product_group_items")
        .select("*")
        .eq("product_id", productId);

    if (error) throw error;
    return data || [];
}

export async function assignProductToGroup(params: {
    tenantId: string;
    productId: string;
    groupId: string;
}): Promise<ProductGroupItem> {
    const { data, error } = await supabase
        .from("v2_product_group_items")
        .insert({
            tenant_id: params.tenantId,
            product_id: params.productId,
            group_id: params.groupId
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function removeProductFromGroup(params: {
    productId: string;
    groupId: string;
}): Promise<void> {
    const { error } = await supabase
        .from("v2_product_group_items")
        .delete()
        .eq("product_id", params.productId)
        .eq("group_id", params.groupId);

    if (error) throw error;
}
