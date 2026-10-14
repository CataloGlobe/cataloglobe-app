/**
 * Represents the current instant expressed in Europe/Rome wall-clock time.
 * `epoch` is the true UTC timestamp (Date.now()) — independent of runtime timezone.
 * All other fields are Rome wall-clock components derived via Intl.DateTimeFormat.
 *
 * Keep this aligned with edge `_shared/schedulingNow.ts`.
 */
export type RomeDateTime = {
    /** True UTC epoch — use this for start_at/end_at comparisons. */
    epoch: number;
    year: number;
    /** 0-based (0 = gennaio). */
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    /** 0 = domenica, 1 = lunedì, … 6 = sabato. */
    dayOfWeek: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
};

/**
 * Converts any Date to a RomeDateTime.
 * Use this when the caller has a Date (e.g. a simulation timestamp) and needs
 * to express it in Europe/Rome wall-clock terms.
 */
export function toRomeDateTime(date: Date): RomeDateTime {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });

    const parts = formatter.formatToParts(date);
    const read = (type: string) => parts.find(p => p.type === type)?.value ?? "00";

    return {
        epoch: date.getTime(),
        year: Number(read("year")),
        month: Number(read("month")) - 1,
        day: Number(read("day")),
        hour: Number(read("hour")),
        minute: Number(read("minute")),
        second: Number(read("second")),
        dayOfWeek: WEEKDAY_INDEX[read("weekday")] ?? 0
    };
}

/** Returns the current instant as a RomeDateTime. */
export function getNowInRome(): RomeDateTime {
    return toRomeDateTime(new Date());
}

/**
 * L'istante di Roma di un minuto dello stesso giorno di `now` (0-1439), per
 * chiedere al giudice «e alle 19:00?» (`laterMenusToday`). Il giorno del cambio
 * d'ora l'orologio salta o ripete un'ora: si parte dallo scarto di oggi e si
 * corregge una volta sull'ora letta a Roma. Un minuto che non esiste (02:30
 * dell'ultima domenica di marzo) cade sull'istante subito dopo il salto.
 */
export function romeInstantAtMinute(now: RomeDateTime, minuteOfDay: number): RomeDateTime {
    const nowMinute = now.hour * 60 + now.minute;
    const guess = now.epoch - now.second * 1000 + (minuteOfDay - nowMinute) * 60_000;
    const first = toRomeDateTime(new Date(guess));
    const dayShift = first.day === now.day ? 0 : first.epoch > now.epoch ? 1440 : -1440;
    const drift = minuteOfDay - (first.hour * 60 + first.minute + dayShift);
    if (drift === 0) return first;
    const second = toRomeDateTime(new Date(guess + drift * 60_000));
    return second.hour * 60 + second.minute === minuteOfDay ? second : first;
}
