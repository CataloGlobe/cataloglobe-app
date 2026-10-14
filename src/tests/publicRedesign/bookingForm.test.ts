import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import {
    firstBookableDate,
    firstErrorField,
    isOwnBookingUrl,
    validateStep,
    whenSummary,
    type BookingConfig
} from "@components/PublicCollectionView/redesign/booking/bookingForm";
import { EMPTY_FORM } from "@/pages/ReservationPage/types";
import type { OpeningHoursEntry, UpcomingClosure } from "@/pages/ReservationPage/availability";

// "2026-01-05" è un lunedì (day_of_week = 0), il 7 un mercoledì. Orario locale, come il picker.
const MONDAY = "2026-01-05";
const WEDNESDAY = "2026-01-07";

function hourRow(dayOfWeek: number, opensAt: string, closesAt: string): OpeningHoursEntry {
    return { day_of_week: dayOfWeek, slot_index: 0, opens_at: opensAt, closes_at: closesAt, is_closed: false, closes_next_day: false };
}

function config(overrides: Partial<BookingConfig> = {}): BookingConfig {
    return {
        slug: "da-mario",
        venueName: "Da Mario",
        hours: [hourRow(0, "19:00", "22:00"), hourRow(2, "19:00", "22:00")],
        closures: [],
        pacingSlotMinutes: 30,
        horizonDays: 30,
        minNoticeMinutes: 0,
        phone: null,
        ...overrides
    };
}

// Chiave + parametri, per vedere quale messaggio esce senza i18n.
const t = ((key: string) => key) as unknown as TFunction;

describe("firstBookableDate: il giorno già scelto all'apertura", () => {
    it("oggi, se c'è ancora un orario prenotabile", () => {
        expect(firstBookableDate(config(), new Date(`${MONDAY}T12:00:00`), MONDAY)).toBe(MONDAY);
    });

    it("dopo l'ultimo orario di oggi salta al prossimo giorno aperto (martedì chiuso)", () => {
        expect(firstBookableDate(config(), new Date(`${MONDAY}T21:45:00`), MONDAY)).toBe(WEDNESDAY);
    });

    it("col preavviso che copre la serata di oggi, il prossimo giorno aperto", () => {
        expect(firstBookableDate(config({ minNoticeMinutes: 240 }), new Date(`${MONDAY}T18:30:00`), MONDAY)).toBe(WEDNESDAY);
    });

    it("un giorno chiuso per ferie non è il giorno di partenza", () => {
        const closures: UpcomingClosure[] = [{ closure_date: MONDAY, end_date: null, label: "Ferie", is_closed: true, slots: null }];
        expect(firstBookableDate(config({ closures }), new Date(`${MONDAY}T12:00:00`), MONDAY)).toBe(WEDNESDAY);
    });

    it("senza orari prenotabili nell'orizzonte resta da scegliere", () => {
        expect(firstBookableDate(config({ hours: [] }), new Date(`${MONDAY}T12:00:00`), MONDAY)).toBe("");
    });
});

describe("validateStep: ogni passo controlla solo i suoi campi", () => {
    it("Quando senza ora: manca l'ora, e il primo campo da sistemare è quello", () => {
        const errors = validateStep("when", { ...EMPTY_FORM, reservation_date: "2099-01-05" }, config(), t);
        expect(errors.reservation_time).toBe("reservation.val_time_invalid");
        expect(errors.customer_name).toBeUndefined();
        expect(firstErrorField("when", errors)).toBe("reservation_time");
    });

    it("Quando su un giorno chiuso lo dice sulla data", () => {
        // 2099-01-06 è un martedì: chiuso.
        const errors = validateStep("when", { ...EMPTY_FORM, reservation_date: "2099-01-06", reservation_time: "20:00" }, config(), t);
        expect(errors.reservation_date).toBe("reservation.closed_day");
        expect(firstErrorField("when", errors)).toBe("reservation_date");
    });

    it("Quando completo e in orario passa", () => {
        const errors = validateStep("when", { ...EMPTY_FORM, reservation_date: "2099-01-05", reservation_time: "20:00" }, config(), t);
        expect(errors).toEqual({});
    });

    it("I tuoi dati: nome, email e telefono obbligatori, note facoltative", () => {
        const errors = validateStep("who", EMPTY_FORM, config(), t);
        expect(Object.keys(errors).sort()).toEqual(["customer_email", "customer_name", "customer_phone"]);
        expect(firstErrorField("who", errors)).toBe("customer_name");
        const filled = { ...EMPTY_FORM, customer_name: "Anna", customer_email: "anna@example.com", customer_phone: "+39 333 1234567" };
        expect(validateStep("who", filled, config(), t)).toEqual({});
    });
});

describe("whenSummary: il riepilogo del pulsante", () => {
    const people = (count: number) => `${count} persone`;

    it("giorno, ora e persone", () => {
        const summary = whenSummary({ ...EMPTY_FORM, reservation_date: MONDAY, reservation_time: "20:30" }, "it-IT", people);
        expect(summary).toBe("lun 5 gen · 20:30 · 2 persone");
    });

    it("senza ora non c'è riepilogo (il pulsante chiede l'orario)", () => {
        expect(whenSummary({ ...EMPTY_FORM, reservation_date: MONDAY }, "it-IT", people)).toBeNull();
    });
});

describe("isOwnBookingUrl: il pulsante di In evidenza che prenota qui", () => {
    const origin = "https://staging.example.app";

    it("la pagina di prenotazione di questa sede, anche con la lingua o assoluta", () => {
        expect(isOwnBookingUrl("/da-mario/prenota", "da-mario", origin)).toBe(true);
        expect(isOwnBookingUrl("/da-mario/en/prenota", "da-mario", origin)).toBe(true);
        expect(isOwnBookingUrl("https://cataloglobe.com/da-mario/prenota?utm=x", "da-mario", origin)).toBe(true);
        expect(isOwnBookingUrl(`${origin}/da-mario/prenota`, "da-mario", origin)).toBe(true);
    });

    it("un'altra sede, un altro sito o un'altra pagina restano link", () => {
        expect(isOwnBookingUrl("/altra-sede/prenota", "da-mario", origin)).toBe(false);
        expect(isOwnBookingUrl("https://thefork.it/da-mario/prenota", "da-mario", origin)).toBe(false);
        expect(isOwnBookingUrl("/da-mario", "da-mario", origin)).toBe(false);
        expect(isOwnBookingUrl("/da-mario/privacy-prenotazioni", "da-mario", origin)).toBe(false);
        expect(isOwnBookingUrl("javascript:alert(1)", "da-mario", origin)).toBe(false);
        expect(isOwnBookingUrl(null, "da-mario", origin)).toBe(false);
    });
});
