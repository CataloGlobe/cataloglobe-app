import { supabase } from "./client";

export type ScheduleSlot = "primary" | "overlay";
export type CollectionKind = "standard" | "special";

export type BusinessScheduleRow = {
    id: string;
    business_id: string;
    collection_id: string;
    slot: ScheduleSlot;
    days_of_week: number[];
    start_time: string; // HH:MM:SS
    end_time: string; // HH:MM:SS
    priority: number;
    is_active: boolean;
    created_at: string;
    collection: {
        id: string;
        name: string;
        kind: CollectionKind;
    };
};

/** Tipo raw restituito da Supabase: la relazione può arrivare come array */
type RawBusinessScheduleRow = Omit<BusinessScheduleRow, "collection"> & {
    collection:
        | { id: string; name: string; kind: CollectionKind }
        | { id: string; name: string; kind: CollectionKind }[]
        | null;
};

function normalizeCollection(
    raw:
        | { id: string; name: string; kind: CollectionKind }
        | { id: string; name: string; kind: CollectionKind }[]
        | null
) {
    if (!raw) return null;
    return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function assertScheduleRow(row: RawBusinessScheduleRow): BusinessScheduleRow {
    const collection = normalizeCollection(row.collection);
    if (!collection) {
        throw new Error("Schedule row is missing collection relation");
    }
    return {
        ...row,
        collection
    };
}

/* ============================
   READ
============================ */
export async function listBusinessSchedules(businessId: string): Promise<BusinessScheduleRow[]> {
    const { data, error } = await supabase
        .from("business_collection_schedules")
        .select(
            `
            id,
            business_id,
            collection_id,
            slot,
            days_of_week,
            start_time,
            end_time,
            priority,
            is_active,
            created_at,
            collection:collections (
                id,
                name,
                kind
            )
        `
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("slot", { ascending: true })
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as RawBusinessScheduleRow[];
    return rows.map(assertScheduleRow);
}

/* ============================
   CREATE (solo una regola)
============================ */
export async function createBusinessSchedule(input: {
    businessId: string;
    collectionId: string;
    slot: ScheduleSlot;
    days: number[];
    start: string; // HH:MM
    end: string; // HH:MM
}) {
    const { error } = await supabase.from("business_collection_schedules").insert({
        business_id: input.businessId,
        collection_id: input.collectionId,
        slot: input.slot,
        days_of_week: input.days,
        start_time: input.start,
        end_time: input.end
    });

    if (error) throw error;
}

/* ============================
   UPDATE
============================ */
export async function updateBusinessSchedule(
    scheduleId: string,
    input: {
        collectionId: string;
        days: number[];
        start: string; // HH:MM
        end: string; // HH:MM
    }
) {
    const { error } = await supabase
        .from("business_collection_schedules")
        .update({
            collection_id: input.collectionId,
            days_of_week: input.days,
            start_time: input.start,
            end_time: input.end
        })
        .eq("id", scheduleId);

    if (error) throw error;
}

/* ============================
   DELETE
============================ */
export async function deleteBusinessSchedule(scheduleId: string) {
    const { error } = await supabase
        .from("business_collection_schedules")
        .delete()
        .eq("id", scheduleId);

    if (error) throw error;
}
