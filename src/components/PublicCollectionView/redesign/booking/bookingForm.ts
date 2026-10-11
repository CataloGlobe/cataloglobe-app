import type { TFunction } from "i18next";
import type { FieldErrors, FormFields } from "@/pages/ReservationPage/types";
import { validateField } from "@/pages/ReservationPage/validators";
import { availabilityErrors, type OpeningHoursEntry, type UpcomingClosure } from "@/pages/ReservationPage/availability";
import { buildHorizonDays, getReservationPeriodsForDate } from "@/pages/ReservationPage/utils/reservationSlots";
import { todayIsoDate } from "@/utils/dateLocal";

/**
 * Prenota a passi nel foglio unico (spec v25): Quando, I tuoi dati, Riepilogo,
 * poi la conferma. Qui solo le regole, senza React: quali campi chiede ogni
 * passo, il giorno di partenza, il riepilogo del pulsante. Orari, chiusure e
 * validazione dei campi sono quelli della pagina `/:slug/prenota`, importati e
 * non riscritti (la regola degli orari sta in tre file con `⚠️ SYNC`).
 */
export type BookingStep = "when" | "who" | "recap";

export const BOOKING_STEPS: readonly BookingStep[] = ["when", "who", "recap"];

/** Campi che ogni passo controlla prima di andare avanti. */
export const STEP_FIELDS: Record<BookingStep, readonly (keyof FormFields)[]> = {
    when: ["reservation_date", "party_size", "reservation_time"],
    who: ["customer_name", "customer_email", "customer_phone", "notes", "allergies"],
    recap: []
};

/** Dati della sede per il modulo: gli stessi che legge la pagina di prenotazione. */
export type BookingConfig = {
    slug: string;
    venueName: string;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    pacingSlotMinutes: number;
    horizonDays: number;
    minNoticeMinutes: number;
    /** Solo se il locale lo mostra: l'alternativa quando la prenotazione online non si può. */
    phone: string | null;
};

/**
 * Il giorno già scelto all'apertura (spec v25: «giorno preselezionato, chiusi
 * spenti, ora mai preselezionata»): il primo dell'orizzonte con almeno un orario
 * ancora prenotabile. Oggi a sera tardi, o col preavviso già passato, è domani.
 * Stringa vuota se non c'è (il calendario resta da scegliere).
 */
export function firstBookableDate(config: BookingConfig, now: Date = new Date(), today: string = todayIsoDate()): string {
    const days = buildHorizonDays(config.hours, config.closures, config.horizonDays, today);
    for (const day of days) {
        if (day.disabled) continue;
        const periods = getReservationPeriodsForDate(
            day.iso,
            config.hours,
            config.closures,
            now,
            config.pacingSlotMinutes,
            undefined,
            config.minNoticeMinutes
        );
        if (periods.some(period => period.slots.some(slot => slot.state === "available"))) return day.iso;
    }
    return "";
}

/**
 * Errori del passo: i controlli di formato di ogni campo, poi (al primo passo)
 * giorno chiuso e orario fuori apertura. Vuoto = si può andare avanti.
 */
export function validateStep(step: BookingStep, form: FormFields, config: BookingConfig, t: TFunction): FieldErrors {
    const errors: FieldErrors = {};
    for (const field of STEP_FIELDS[step]) {
        const error = validateField(field, form[field], t);
        if (error) errors[field] = error;
    }
    if (step === "when") {
        const availability = availabilityErrors(form.reservation_date, form.reservation_time, config.hours, config.closures, t);
        if (!errors.reservation_date && availability.dateError) errors.reservation_date = availability.dateError;
        if (!errors.reservation_time && availability.timeError) errors.reservation_time = availability.timeError;
    }
    return errors;
}

/** Il primo campo con un errore, nell'ordine in cui il passo lo mostra. */
export function firstErrorField(step: BookingStep, errors: FieldErrors): keyof FormFields | null {
    return STEP_FIELDS[step].find(field => errors[field]) ?? null;
}

/**
 * Riepilogo del pulsante del primo passo: «sab 18 ott · 20:00 · 2 persone».
 * Null finché manca l'ora (il pulsante dice di sceglierla).
 */
export function whenSummary(form: FormFields, locale: string, people: (count: number) => string): string | null {
    if (!form.reservation_date || !form.reservation_time) return null;
    const [year, month, day] = form.reservation_date.split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(
        new Date(year, month - 1, day)
    );
    const count = Number(form.party_size);
    const parts = [date, form.reservation_time.slice(0, 5)];
    if (Number.isInteger(count) && count >= 1) parts.push(people(count));
    return parts.join(" · ");
}

/** Domini della pagina pubblica, oltre a quello in cui si è (staging, anteprime). */
const PUBLIC_HOSTS = new Set(["cataloglobe.com", "www.cataloglobe.com"]);

/**
 * Il pulsante di un contenuto in evidenza porta alla prenotazione di questa sede
 * (`/:slug/prenota` o `/:slug/:lang/prenota`, sulla pagina pubblica): il foglio
 * apre i passi invece di lasciare il menu. Un link a un'altra sede, a un altro
 * sito o a un'altra pagina resta un link.
 */
export function isOwnBookingUrl(url: string | null | undefined, slug: string, currentOrigin?: string): boolean {
    if (!url) return false;
    const origin = currentOrigin ?? (typeof window !== "undefined" ? window.location.origin : "https://cataloglobe.com");
    let parsed: URL;
    try {
        parsed = new URL(url, origin);
    } catch {
        return false;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.origin !== origin && !PUBLIC_HOSTS.has(parsed.hostname)) return false;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] !== slug) return false;
    return (
        (segments.length === 2 && segments[1] === "prenota") ||
        (segments.length === 3 && /^[a-z]{2}$/.test(segments[1]) && segments[2] === "prenota")
    );
}
