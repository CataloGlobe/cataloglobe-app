import { supabase } from "@/services/supabase/client";
import type { V2ActivityHours } from "@/types/activity-hours";

export async function listActivityHours(
    activityId: string,
    tenantId: string
): Promise<V2ActivityHours[]> {
    const { data, error } = await supabase
        .from("activity_hours")
        .select("*")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId)
        .order("day_of_week", { ascending: true })
        .order("slot_index", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function upsertActivityHours(
    tenantId: string,
    activityId: string,
    hours: Array<{
        day_of_week: number;
        slot_index: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
        closes_next_day: boolean;
    }>
): Promise<V2ActivityHours[]> {
    // 1. Delete orphan rows not present in the incoming payload
    const keepKeys = new Set(
        hours.map(h => `${h.day_of_week}:${h.slot_index}`)
    );

    const { data: existing } = await supabase
        .from("activity_hours")
        .select("id, day_of_week, slot_index")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId);

    if (existing) {
        const orphanIds = existing
            .filter(row => !keepKeys.has(`${row.day_of_week}:${row.slot_index}`))
            .map(row => row.id);

        if (orphanIds.length > 0) {
            const { error: deleteError } = await supabase
                .from("activity_hours")
                .delete()
                .in("id", orphanIds)
                .eq("tenant_id", tenantId);

            if (deleteError) throw deleteError;
        }
    }

    // 2. Upsert incoming rows
    const rows = hours.map(h => ({
        ...h,
        tenant_id: tenantId,
        activity_id: activityId,
        updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from("activity_hours")
        .upsert(rows, { onConflict: "activity_id,day_of_week,slot_index" })
        .select();

    if (error) throw error;
    return data ?? [];
}
