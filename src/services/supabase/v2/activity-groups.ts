import { supabase } from "../client";
import {
    V2ActivityGroup,
    V2ActivityGroupInsert,
    V2ActivityGroupUpdate,
    V2ActivityGroupWithCounts
} from "@/types/v2/activity-group";

export async function getActivityGroups(tenantId: string): Promise<V2ActivityGroupWithCounts[]> {
    const { data, error } = await supabase
        .from("v2_activity_groups")
        .select(
            `
            *,
            members:v2_activity_group_members(count)
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
    groupId: string
): Promise<{ group: V2ActivityGroup; activityIds: string[] }> {
    const { data: group, error: groupError } = await supabase
        .from("v2_activity_groups")
        .select("*")
        .eq("id", groupId)
        .single();

    if (groupError) throw groupError;

    const { data: members, error: membersError } = await supabase
        .from("v2_activity_group_members")
        .select("activity_id")
        .eq("group_id", groupId);

    if (membersError) throw membersError;

    return {
        group,
        activityIds: (members || []).map(m => m.activity_id)
    };
}

export async function createActivityGroup(data: V2ActivityGroupInsert): Promise<V2ActivityGroup> {
    const { data: newGroup, error } = await supabase
        .from("v2_activity_groups")
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
    data: V2ActivityGroupUpdate
): Promise<V2ActivityGroup> {
    const { data: updatedGroup, error } = await supabase
        .from("v2_activity_groups")
        .update(data)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return updatedGroup;
}

export async function deleteActivityGroup(id: string): Promise<void> {
    const { error } = await supabase
        .from("v2_activity_groups")
        .delete()
        .eq("id", id)
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
        .from("v2_activity_group_members")
        .select("activity_id")
        .eq("group_id", groupId);

    if (fetchError) throw fetchError;

    const currentIds = (currentMembers || []).map(m => m.activity_id);

    // 2. Diff
    const toAdd = activityIds.filter(id => !currentIds.includes(id));
    const toRemove = currentIds.filter(id => !activityIds.includes(id));

    // 3. Delete removed
    if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
            .from("v2_activity_group_members")
            .delete()
            .eq("group_id", groupId)
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
            .from("v2_activity_group_members")
            .insert(insertData);

        if (insertError) throw insertError;
    }
}

export async function getGroupsForActivity(activityId: string): Promise<V2ActivityGroup[]> {
    const { data, error } = await supabase
        .from("v2_activity_group_members")
        .select("group:v2_activity_groups(*)")
        .eq("activity_id", activityId);

    if (error) throw error;
    return (data || []).map(m => (m as any).group).filter(Boolean);
}
