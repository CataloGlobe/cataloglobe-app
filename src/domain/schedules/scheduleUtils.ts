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
function toMinutes(hhmm: string) {
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function prevDay(d: number) {
    return (d + 6) % 7;
}

export function isNowActive(rule: BusinessScheduleRow, now: Date | string | number = new Date()) {
    const date = now instanceof Date ? now : new Date(now);

    if (isNaN(date.getTime())) return false;
    if (!rule.is_active) return false;

    const day = date.getDay(); // 0..6
    const nowMin = toMinutes(date.toTimeString());

    const start = toMinutes(rule.start_time);
    const end = toMinutes(rule.end_time);

    // ALL DAY
    if (start === end) {
        return rule.days_of_week.includes(day);
    }

    // SAME DAY
    if (start < end) {
        if (!rule.days_of_week.includes(day)) return false;
        return start <= nowMin && nowMin < end;
    }

    // OVERNIGHT
    const todayActive = rule.days_of_week.includes(day) && nowMin >= start;

    const yesterdayActive = rule.days_of_week.includes(prevDay(day)) && nowMin < end;

    return todayActive || yesterdayActive;
}

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
