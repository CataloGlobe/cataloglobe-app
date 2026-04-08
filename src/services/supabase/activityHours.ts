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
        .order("day_of_week", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function upsertActivityHours(
    tenantId: string,
    activityId: string,
    hours: Array<{
        day_of_week: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
        hours_public: boolean;
    }>
): Promise<V2ActivityHours[]> {
    const rows = hours.map(h => ({
        ...h,
        tenant_id: tenantId,
        activity_id: activityId,
        updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from("activity_hours")
        .upsert(rows, { onConflict: "activity_id,day_of_week" })
        .select();

    if (error) throw error;
    return data ?? [];
}
