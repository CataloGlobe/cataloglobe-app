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

const pad = (n: number) => String(n).padStart(2, "0");

/** Il giorno di Roma di `date` come `YYYY-MM-DD`: il formato dei campi data. */
export function romeDateString(date: Date): string {
    const { year, month, day } = romeDayOf(date);
    return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** `YYYY-MM-DD` (campo data) come giorno di Roma; null se non è una data. */
export function parseRomeDay(value: string): RomeDay | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
    const check = new Date(Date.UTC(year, month, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return null;
    return { year, month, day };
}

/** L'ora di Roma di `date` come `YYYY-MM-DDTHH:MM`: il formato di `datetime-local`. */
export function romeDateTimeLocalValue(date: Date): string {
    const t = toRomeDateTime(date);
    return `${t.year}-${pad(t.month + 1)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
}

/**
 * Un valore `datetime-local` letto come ora di Roma, qualunque sia il fuso
 * del browser (`new Date(value)` lo leggerebbe nel fuso del browser).
 */
export function parseRomeDateTimeLocal(value: string): RomeDateTime | null {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (!match) return null;
    const day = parseRomeDay(match[1]);
    const [hour, minute] = [Number(match[2]), Number(match[3])];
    if (!day || hour > 23 || minute > 59) return null;
    return romeInstantAt(day, hour * 60 + minute);
}
