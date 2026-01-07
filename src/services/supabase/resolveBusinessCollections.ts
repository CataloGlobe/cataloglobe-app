import { supabase } from "@/services/supabase/client";
import type { BusinessScheduleRow } from "./schedules";

type ResolvedCollections = {
    primary: string | null;
    overlay: string | null;
};

function isScheduleActive(schedule: BusinessScheduleRow, now: Date) {
    if (!schedule.is_active) return false;

    const day = now.getDay(); // 0 = domenica
    if (!schedule.days_of_week.includes(day)) return false;

    const time = now.toTimeString().slice(0, 5); // "HH:MM"

    return schedule.start_time <= time && time < schedule.end_time;
}

function pickWinner(schedules: BusinessScheduleRow[]): BusinessScheduleRow | null {
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0];

    return schedules.slice().sort((a, b) => {
        // 1️⃣ start_time più tardo
        if (a.start_time !== b.start_time) {
            return a.start_time > b.start_time ? -1 : 1;
        }
        // 2️⃣ più recente
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
}

export async function resolveBusinessCollections(
    businessId: string,
    now: Date = new Date()
): Promise<ResolvedCollections> {
    const { data, error } = await supabase
        .from("business_collection_schedules")
        .select("*")
        .eq("business_id", businessId)
        .eq("is_active", true);

    if (error) throw error;

    const schedules = data ?? [];

    /* ============================
       1) ATTIVE ORA
    ============================ */
    const activeNow = schedules.filter(s => isScheduleActive(s, now));

    const activePrimary = pickWinner(activeNow.filter(s => s.slot === "primary"));

    const activeOverlay = pickWinner(activeNow.filter(s => s.slot === "overlay"));

    /* ============================
       2) FALLBACK PRIMARY
       (solo se non attiva ora)
    ============================ */
    let fallbackPrimary: BusinessScheduleRow | null = null;

    if (!activePrimary) {
        const day = now.getDay();
        const time = now.toTimeString().slice(0, 5);

        const pastPrimary = schedules.filter(
            s =>
                s.slot === "primary" &&
                s.is_active &&
                s.days_of_week.includes(day) &&
                s.end_time < time
        );

        fallbackPrimary = pickWinner(pastPrimary);
    }

    const finalPrimary = activePrimary ?? fallbackPrimary;

    return {
        primary: finalPrimary?.collection_id ?? null,
        overlay: activeOverlay?.collection_id ?? null
    };
}
