import { supabase } from "./client";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import { computeFieldHash } from "@/services/translation/hashUtils";
import { enqueueWithSilentError } from "./translationJobs";
import { deleteTranslationsForEntity } from "./translations";

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
    end_date: string | null;
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

export async function createActivityClosure(
    tenantId: string,
    payload: ClosurePayload
): Promise<V2ActivityClosure> {
    const labelHash = await computeFieldHash(payload.label);

    const { data, error } = await supabase
        .from("activity_closures")
        .insert({ ...payload, tenant_id: tenantId, label_hash: labelHash })
        .select()
        .single();
    if (error) throw error;

    if (labelHash !== null) {
        await enqueueWithSilentError({
            tenantId,
            entityType: "closure",
            entityId: data.id,
            field: "label",
            newSourceText: payload.label,
            newSourceHash: labelHash
        });
    }

    return data;
}

type ClosureUpdatePayload = {
    closure_date: string;
    end_date: string | null;
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

export async function updateActivityClosure(
    id: string,
    tenantId: string,
    payload: ClosureUpdatePayload
): Promise<V2ActivityClosure> {
    const labelHash = await computeFieldHash(payload.label);

    const { data, error } = await supabase
        .from("activity_closures")
        .update({
            ...payload,
            label_hash: labelHash,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
    if (error) throw error;

    // payload include sempre label (firma full update). Enqueue per allineare
    // translations al nuovo source.
    await enqueueWithSilentError({
        tenantId,
        entityType: "closure",
        entityId: id,
        field: "label",
        newSourceText: payload.label,
        newSourceHash: labelHash
    });

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

    try {
        await deleteTranslationsForEntity(tenantId, "closure", id, "label");
    } catch (err) {
        console.error("[translations] cleanup on deleteActivityClosure failed:", err);
    }
}
