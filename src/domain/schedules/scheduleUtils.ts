// scheduleUtils.ts

import { BusinessScheduleRow } from "@/services/supabase/schedules";

/**
 * Ritorna ora locale spezzata (come già fai)
 */
export const nowPartsLocal = () => {
    const d = new Date();
    const dow = d.getDay(); // 0..6
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return { dow, time: `${hh}:${mm}:${ss}` };
};

/**
 * Dice se una singola rule è attiva ORA
 */
export const isNowActive = (rule: BusinessScheduleRow) => {
    const { dow, time } = nowPartsLocal();
    if (!rule.days_of_week.includes(dow)) return false;
    // confronto lessicografico ok con HH:MM:SS
    return time >= rule.start_time && time < rule.end_time;
};

/**
 * Se più rule sono attive, decide quale vince
 */
export const getActiveWinner = <T extends BusinessScheduleRow>(
    rules: T[],
    isNowActiveFn: (r: T) => boolean
): T | null => {
    const active = rules.filter(isNowActiveFn);

    if (active.length <= 1) return active[0] ?? null;

    return active.slice().sort((a, b) => {
        // 1️⃣ vince chi inizia più tardi
        if (a.start_time !== b.start_time) {
            return a.start_time > b.start_time ? -1 : 1;
        }
        // 2️⃣ a parità, vince la più recente
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
};
