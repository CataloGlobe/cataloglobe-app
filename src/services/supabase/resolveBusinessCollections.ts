import { supabase } from "@/services/supabase/client";
import type { BusinessScheduleRow } from "./schedules";

type ResolvedCollections = {
    primary: string | null;
    overlay: string | null;
};

function toMinutes(hhmm: string) {
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function prevDay(d: number) {
    return (d + 6) % 7;
}

/**
 * ATTIVA ORA:
 * - all-day: start == end  => attivo tutto il giorno (se day incluso)
 * - normale: start < end   => start <= time < end (se day incluso)
 * - overnight: start > end => attivo:
 *      - nel giorno "di partenza" se time >= start (day incluso)
 *      - nel giorno successivo se time < end (prevDay incluso)
 */
function isScheduleActive(schedule: BusinessScheduleRow, now: Date) {
    if (!schedule.is_active) return false;

    const day = now.getDay(); // 0..6
    const time = toMinutes(now.toTimeString().slice(0, 5));

    const start = toMinutes(schedule.start_time);
    const end = toMinutes(schedule.end_time);

    // all-day
    if (start === end) {
        return schedule.days_of_week.includes(day);
    }

    // normal same-day interval
    if (start < end) {
        if (!schedule.days_of_week.includes(day)) return false;
        return start <= time && time < end;
    }

    // overnight (spans midnight)
    // active on "start day" late part
    const isStartDayActive = schedule.days_of_week.includes(day) && time >= start;

    // active on "next day" early part (requires previous day included)
    const isNextDayActive = schedule.days_of_week.includes(prevDay(day)) && time < end;

    return isStartDayActive || isNextDayActive;
}

function pickWinner(schedules: BusinessScheduleRow[]): BusinessScheduleRow | null {
    if (schedules.length === 0) return null;
    if (schedules.length === 1) return schedules[0];

    return schedules.slice().sort((a, b) => {
        // 1) start_time più tardo
        if (a.start_time !== b.start_time) {
            return a.start_time > b.start_time ? -1 : 1;
        }
        // 2) più recente
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
}

/**
 * Fallback primary:
 * - Se oggi c’è almeno una regola che include "today" (anche overnight):
 *    - preferisci quella "appena finita" (più vicina nel passato)
 *    - altrimenti prendi la "prossima che deve iniziare" (più vicina nel futuro)
 * - Se oggi non c’è nessuna regola per today:
 *    - prendi la più vicina tra i prossimi giorni (prima occorrenza)
 */
function pickFallbackPrimary(
    schedules: BusinessScheduleRow[],
    now: Date
): BusinessScheduleRow | null {
    const day = now.getDay();
    const time = toMinutes(now.toTimeString().slice(0, 5));

    const primary = schedules.filter(s => s.is_active && s.slot === "primary");
    if (primary.length === 0) return null;

    // helper: does schedule "apply" to a given day at all?
    // (overnight affects also next day)
    const affectsDay = (s: BusinessScheduleRow, d: number) => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === end) return s.days_of_week.includes(d);
        if (start < end) return s.days_of_week.includes(d);

        // overnight affects start-day AND next-day
        return s.days_of_week.includes(d) || s.days_of_week.includes(prevDay(d));
    };

    const todayCandidates = primary.filter(s => affectsDay(s, day));

    // 1) Preferisci "appena finita" oggi (solo per intervalli normali nel day corrente)
    // NB: per overnight, la parte "finita" dipende dal segmento. Per non complicare troppo,
    // qui prendiamo una logica semplice: se NON è overnight, posso calcolare ended today.
    const pastEndedToday = todayCandidates.filter(s => {
        const start = toMinutes(s.start_time);
        const end = toMinutes(s.end_time);

        if (start === end) return false; // all-day => fallback ok
        if (start < end) return end <= time; // finita oggi
        // overnight: se ora è nel mattino e la regola arriva da ieri, sarebbe attiva (quindi non serve fallback)
        // se ora è nel pomeriggio e la regola parte la sera, non è "finita"
        return false;
    });

    if (pastEndedToday.length > 0) {
        // scegli quella col end più vicino (massimo end <= now)
        return pastEndedToday.slice().sort((a, b) => {
            const aEnd = toMinutes(a.end_time);
            const bEnd = toMinutes(b.end_time);

            if (aEnd !== bEnd) return bEnd - aEnd; // end più grande (più vicino a now)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })[0];
    }

    // 2) Altrimenti prendi la prossima che deve iniziare oggi (per start >= now)
    const nextStartingToday = todayCandidates
        .filter(s => {
            const start = toMinutes(s.start_time);
            const end = toMinutes(s.end_time);

            if (start === end) return false; // all-day
            if (start < end) return start >= time;
            // overnight (es. 18:00->02:00): nel pomeriggio è "prossima" se start >= now
            return start >= time;
        })
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    if (nextStartingToday.length > 0) return nextStartingToday[0];

    // 3) Se oggi non ho nulla (o sono in un caso particolare), prendo la prima regola disponibile in settimana:
    // scegliamo la regola con il prossimo day più vicino e start più basso
    const ranked = primary
        .map(s => {
            const start = toMinutes(s.start_time);
            const days = s.days_of_week;

            // calcolo distanza in giorni fino al prossimo giorno incluso
            let bestDeltaDays = 7;
            for (let delta = 0; delta < 7; delta++) {
                const d = (day + delta) % 7;
                // se overnight, consideriamo anche la possibilità che "valga" come next-day
                const ok =
                    days.includes(d) ||
                    (toMinutes(s.start_time) > toMinutes(s.end_time) && days.includes(prevDay(d)));

                if (ok) {
                    bestDeltaDays = delta;
                    break;
                }
            }

            return { s, bestDeltaDays, start };
        })
        .sort((a, b) => {
            if (a.bestDeltaDays !== b.bestDeltaDays) return a.bestDeltaDays - b.bestDeltaDays;
            return a.start - b.start;
        });

    return ranked[0]?.s ?? null;
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

    const schedules = (data ?? []) as BusinessScheduleRow[];

    // 1) attive ora
    const activeNow = schedules.filter(s => isScheduleActive(s, now));
    const activePrimary = pickWinner(activeNow.filter(s => s.slot === "primary"));
    const activeOverlay = pickWinner(activeNow.filter(s => s.slot === "overlay"));

    // 2) fallback primary (se nessuna attiva ora)
    const fallbackPrimary = activePrimary ? null : pickFallbackPrimary(schedules, now);

    const finalPrimary = activePrimary ?? fallbackPrimary;

    return {
        primary: finalPrimary?.collection_id ?? null,
        overlay: activeOverlay?.collection_id ?? null
    };
}
