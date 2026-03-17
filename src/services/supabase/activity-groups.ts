import { supabase } from "@/services/supabase/client";
import {
    V2ActivityGroup,
    V2ActivityGroupInsert,
    V2ActivityGroupUpdate,
    V2ActivityGroupWithCounts
} from "@/types/activity-group";

export async function getActivityGroups(tenantId: string): Promise<V2ActivityGroupWithCounts[]> {
    const { data, error } = await supabase
        .from("activity_groups")
        .select(
            `
            *,
            members:activity_group_members(count)
        `
        )
        .eq("tenant_id", tenantId)
        .eq("is_system", false)
        .order("name", { ascending: true });

    if (error) throw error;

    return (data || []).map(group => ({
        ...group,
        member_count: group.members?.[0]?.count || 0
    }));
}

export async function getGroupWithMembers(
    groupId: string,
    tenantId: string
): Promise<{ group: V2ActivityGroup; activityIds: string[] }> {
    const { data: group, error: groupError } = await supabase
        .from("activity_groups")
        .select("*")
        .eq("id", groupId)
        .eq("tenant_id", tenantId)
        .single();

    if (groupError) throw groupError;

    const { data: members, error: membersError } = await supabase
        .from("activity_group_members")
        .select("activity_id")
        .eq("group_id", groupId)
        .eq("tenant_id", tenantId);

    if (membersError) throw membersError;

    return {
        group,
        activityIds: (members || []).map(m => m.activity_id)
    };
}

export async function createActivityGroup(data: V2ActivityGroupInsert): Promise<V2ActivityGroup> {
    const { data: newGroup, error } = await supabase
        .from("activity_groups")
        .insert({
            tenant_id: data.tenant_id,
            name: data.name,
            description: data.description
        })
        .select()
        .single();

    if (error) throw error;
    return newGroup;
}

export async function updateActivityGroup(
    id: string,
    tenantId: string,
    data: V2ActivityGroupUpdate
): Promise<V2ActivityGroup> {
    const { data: updatedGroup, error } = await supabase
        .from("activity_groups")
        .update(data)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

    if (error) throw error;
    return updatedGroup;
}

export async function deleteActivityGroup(id: string, tenantId: string): Promise<void> {
    const { error } = await supabase
        .from("activity_groups")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .eq("is_system", false); // Protezione extra in app

    if (error) throw error;
}

export async function syncGroupMembers(
    groupId: string,
    tenantId: string,
    activityIds: string[]
): Promise<void> {
    // 1. Fetch current members
    const { data: currentMembers, error: fetchError } = await supabase
        .from("activity_group_members")
        .select("activity_id")
        .eq("group_id", groupId)
        .eq("tenant_id", tenantId);

    if (fetchError) throw fetchError;

    const currentIds = (currentMembers || []).map(m => m.activity_id);

    // 2. Diff
    const toAdd = activityIds.filter(id => !currentIds.includes(id));
    const toRemove = currentIds.filter(id => !activityIds.includes(id));

    // 3. Delete removed
    if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
            .from("activity_group_members")
            .delete()
            .eq("group_id", groupId)
            .eq("tenant_id", tenantId)
            .in("activity_id", toRemove);

        if (deleteError) throw deleteError;
    }

    // 4. Insert new
    if (toAdd.length > 0) {
        const insertData = toAdd.map(activityId => ({
            tenant_id: tenantId,
            group_id: groupId,
            activity_id: activityId
        }));

        const { error: insertError } = await supabase
            .from("activity_group_members")
            .insert(insertData);

        if (insertError) throw insertError;
    }
}

export async function getGroupsForActivity(activityId: string, tenantId: string): Promise<V2ActivityGroup[]> {
    const { data, error } = await supabase
        .from("activity_group_members")
        .select("group:activity_groups(*)")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return (data || []).map(m => (m as any).group).filter(Boolean);
}
