import { supabase } from "./client";
import type { V2ActivityClosure } from "@/types/activity-closures";

export async function listActivityClosures(
    activityId: string,
    tenantId: string
): Promise<V2ActivityClosure[]> {
    const { data, error } = await supabase
        .from("activity_closures")
        .select("*")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId)
        .order("closure_date", { ascending: true });
    if (error) throw error;
    return data ?? [];
}

export async function getActivityClosure(
    id: string,
    tenantId: string
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
    if (error) throw error;
    if (!data) {
        const notFound = new Error("Chiusura non trovata");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data;
}

type ClosurePayload = {
    activity_id: string;
    closure_date: string;
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
};

export async function createActivityClosure(
    tenantId: string,
    payload: ClosurePayload
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .insert({ ...payload, tenant_id: tenantId })
        .select()
        .single();
    if (error) throw error;
    return data;
}

type ClosureUpdatePayload = {
    closure_date: string;
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
};

export async function updateActivityClosure(
    id: string,
    tenantId: string,
    payload: ClosureUpdatePayload
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteActivityClosure(
    id: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("activity_closures")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}
