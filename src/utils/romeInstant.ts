import { toRomeDateTime, type RomeDateTime } from "@/services/supabase/schedulingNow";

/** Un giorno del calendario di Roma (mese 0-based, come `RomeDateTime`). */
export type RomeDay = { year: number; month: number; day: number };

const HOUR = 60 * 60 * 1000;

/** Il giorno di Roma in cui cade `date`, qualunque sia il fuso del browser. */
export function romeDayOf(date: Date): RomeDay {
    const { year, month, day } = toRomeDateTime(date);
    return { year, month, day };
}

/**
 * «Il giorno `day` alle HH:MM di Roma» come istante: il cursore della banda
 * di Programmazione (§50.7). Roma è a +1 o +2; l'istante giusto è quello che,
 * riletto a Roma, dà l'ora chiesta.
 * - il 25/10 le ore fra 2 e 3 capitano due volte: vale la prima (+2);
 * - il 29/03 le ore fra 2 e 3 non esistono: vale l'istante a +1, che a Roma
 *   si legge un'ora dopo (le 2:30 diventano le 3:30).
 */
export function romeInstantAt(day: RomeDay, minutes: number): RomeDateTime {
    const wall = Date.UTC(day.year, day.month, day.day, Math.floor(minutes / 60), minutes % 60);
    for (const offset of [2, 1]) {
        const candidate = toRomeDateTime(new Date(wall - offset * HOUR));
        if (candidate.day === day.day && candidate.hour * 60 + candidate.minute === minutes) return candidate;
    }
    return toRomeDateTime(new Date(wall - HOUR));
}
