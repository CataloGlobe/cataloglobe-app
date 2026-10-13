import i18next from "i18next";
import { openSheet, openSheetAt, pushSheetPage, type SheetPage } from "../sheets/sheetStack";
import type { BookingStep } from "./bookingForm";

/**
 * Pagine della prenotazione nel foglio unico: un passo per pagina, a spinta,
 * così «‹ Quando» torna indietro senza perdere niente. La conferma sostituisce
 * la pila: dopo l'invio non si torna al modulo.
 */
export const BOOKING_PREFIX = "book:";
export const BOOKING_DONE_KEY = "book:done";

const TITLE_KEYS: Record<BookingStep, string> = {
    when: "more.reservation_label",
    who: "booking.title_who",
    recap: "booking.title_recap"
};

function stepPage(step: BookingStep): SheetPage {
    return {
        key: `${BOOKING_PREFIX}${step}`,
        title: i18next.t(TITLE_KEYS[step], { ns: "public" }),
        size: "large"
    };
}

/** Da fondo pagina, In evidenza: il foglio si apre sul primo passo. */
export function openBookingSheet(): void {
    openSheet(stepPage("when"));
}

/** Dal ⋯: il primo passo entra a spinta, con «‹ Opzioni». */
export function pushBookingSheet(): void {
    pushSheetPage(stepPage("when"));
}

/** Avanti di un passo; su un passo già in pila torna indietro fino a lui (CAPACITY_FULL → Quando). */
export function goToBookingStep(step: BookingStep): void {
    pushSheetPage(stepPage(step));
}

export function showBookingDone(): void {
    openSheetAt([{ key: BOOKING_DONE_KEY, title: i18next.t("booking.title_done", { ns: "public" }), size: "large", titleHidden: true }]);
}

/** Il passo di una pagina della prenotazione (null per la conferma e per le altre pagine). */
export function bookingStepOf(page: SheetPage): BookingStep | null {
    if (!page.key.startsWith(BOOKING_PREFIX)) return null;
    const step = page.key.slice(BOOKING_PREFIX.length);
    return step === "when" || step === "who" || step === "recap" ? step : null;
}

export function isBookingPage(page: SheetPage): boolean {
    return page.key.startsWith(BOOKING_PREFIX);
}
