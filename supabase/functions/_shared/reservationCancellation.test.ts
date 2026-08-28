import { describe, it, expect } from "vitest";
import {
    DEFAULT_CANCELLATION_CUTOFF_MINUTES,
    MAX_CANCELLATION_CUTOFF_MINUTES,
    evaluateCancellationWindow,
    normalizeCutoffMinutes,
    wallClockToInstant
} from "./reservationCancellation.ts";

/** Booking at 20:00 Rome on a summer date → 18:00 UTC (CEST, +2). */
const DATE = "2026-07-15";
const TIME = "20:00:00";
const BOOKED_AT = Date.UTC(2026, 6, 15, 18, 0, 0);

function minutesBefore(n: number): Date {
    return new Date(BOOKED_AT - n * 60_000);
}

describe("wallClockToInstant — fuso e ora legale", () => {
    it("interpreta l'orario come ora locale di Roma, non UTC", () => {
        expect(wallClockToInstant("2026-07-15", "20:00:00")?.toISOString()).toBe(
            "2026-07-15T18:00:00.000Z"
        );
    });

    it("accetta HH:MM senza secondi", () => {
        expect(wallClockToInstant("2026-07-15", "20:00")?.toISOString()).toBe(
            "2026-07-15T18:00:00.000Z"
        );
    });

    it("applica CET (+1) in inverno", () => {
        expect(wallClockToInstant("2026-01-15", "20:00:00")?.toISOString()).toBe(
            "2026-01-15T19:00:00.000Z"
        );
    });

    it("il giorno prima del passaggio a ora legale è ancora +1", () => {
        expect(wallClockToInstant("2026-03-28", "20:00:00")?.toISOString()).toBe(
            "2026-03-28T19:00:00.000Z"
        );
    });

    it("il giorno del passaggio a ora legale (29/3) è già +2", () => {
        expect(wallClockToInstant("2026-03-29", "20:00:00")?.toISOString()).toBe(
            "2026-03-29T18:00:00.000Z"
        );
    });

    it("il giorno del ritorno all'ora solare (25/10) è di nuovo +1", () => {
        expect(wallClockToInstant("2026-10-25", "20:00:00")?.toISOString()).toBe(
            "2026-10-25T19:00:00.000Z"
        );
    });

    it("il giorno prima del ritorno all'ora solare è ancora +2", () => {
        expect(wallClockToInstant("2026-10-24", "20:00:00")?.toISOString()).toBe(
            "2026-10-24T18:00:00.000Z"
        );
    });

    it("non esplode su un orario locale che non esiste (salto in avanti)", () => {
        // Le 02:30 del 29/3 non esistono a Roma: l'orologio salta 02:00 → 03:00.
        // Nessuna prenotazione dovrebbe caderci, ma il modulo non deve lanciare.
        const instant = wallClockToInstant("2026-03-29", "02:30:00");
        expect(instant).toBeInstanceOf(Date);
        expect(Number.isNaN(instant?.getTime())).toBe(false);
    });

    it.each([
        ["data assente", null, "20:00"],
        ["ora assente", "2026-07-15", null],
        ["data non ISO", "15/07/2026", "20:00"],
        ["data inesistente", "2026-02-30", "20:00"],
        ["mese fuori range", "2026-13-01", "20:00"],
        ["ora fuori range", "2026-07-15", "25:00"],
        ["minuti fuori range", "2026-07-15", "20:99"],
        ["ora non numerica", "2026-07-15", "sera"],
        ["stringa vuota", "", ""],
        ["timestamp completo", "2026-07-15T20:00:00Z", "20:00"]
    ])("restituisce null su %s", (_label, date, time) => {
        expect(wallClockToInstant(date, time)).toBeNull();
    });
});

describe("normalizeCutoffMinutes", () => {
    it("conserva 0 (nessun limite) invece di sostituirlo col default", () => {
        expect(normalizeCutoffMinutes(0)).toBe(0);
    });

    it.each([30, 120, 240, MAX_CANCELLATION_CUTOFF_MINUTES])("conserva %i", value => {
        expect(normalizeCutoffMinutes(value)).toBe(value);
    });

    it("tronca i decimali", () => {
        expect(normalizeCutoffMinutes(45.9)).toBe(45);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
        ["stringa", "120"],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["negativo", -1],
        ["oltre il massimo", MAX_CANCELLATION_CUTOFF_MINUTES + 1]
    ])("ripiega sul default su %s", (_label, value) => {
        expect(normalizeCutoffMinutes(value)).toBe(DEFAULT_CANCELLATION_CUTOFF_MINUTES);
    });

    it("un valore rotto ripiega sul default, MAI su 'nessun limite'", () => {
        for (const broken of [null, undefined, "0", -5, Number.NaN]) {
            expect(normalizeCutoffMinutes(broken)).not.toBe(0);
        }
    });
});

describe("cutoff 0 = nessun limite (NON 'mai annullabile')", () => {
    const base = { reservationDate: DATE, reservationTime: TIME, cutoffMinutes: 0 };

    it("annullabile con largo anticipo", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(600) })).toMatchObject({
            allowed: true,
            reason: "ok",
            cutoffMinutes: 0
        });
    });

    it("annullabile un minuto prima", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(1) }).allowed).toBe(true);
    });

    it("annullabile all'orario esatto", () => {
        expect(evaluateCancellationWindow({ ...base, now: new Date(BOOKED_AT) }).allowed).toBe(
            true
        );
    });

    it("annullabile anche a prenotazione già iniziata da un'ora", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(-60) })).toMatchObject({
            allowed: true,
            reason: "ok"
        });
    });

    it("annullabile anche il giorno dopo", () => {
        expect(
            evaluateCancellationWindow({ ...base, now: minutesBefore(-1440) }).allowed
        ).toBe(true);
    });
});

describe("cutoff 120 (default)", () => {
    const base = { reservationDate: DATE, reservationTime: TIME, cutoffMinutes: 120 };

    it("annullabile a 3 ore dall'orario", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(180) })).toMatchObject({
            allowed: true,
            reason: "ok",
            minutesUntilReservation: 180,
            cutoffMinutes: 120
        });
    });

    it("annullabile esattamente sul limite (120 minuti)", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(120) }).allowed).toBe(
            true
        );
    });

    it("non annullabile a 119 minuti", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(119) })).toMatchObject({
            allowed: false,
            reason: "cutoff_passed",
            minutesUntilReservation: 119
        });
    });

    it("non annullabile a prenotazione passata", () => {
        expect(evaluateCancellationWindow({ ...base, now: minutesBefore(-30) })).toMatchObject({
            allowed: false,
            reason: "cutoff_passed",
            minutesUntilReservation: -30
        });
    });
});

describe("cutoff assente o rotto", () => {
    it("un cutoff nullo applica il default di 120, non 'nessun limite'", () => {
        const result = evaluateCancellationWindow({
            reservationDate: DATE,
            reservationTime: TIME,
            cutoffMinutes: null,
            now: minutesBefore(60)
        });
        expect(result).toMatchObject({ allowed: false, reason: "cutoff_passed", cutoffMinutes: 120 });
    });

    it("un cutoff negativo applica il default", () => {
        expect(
            evaluateCancellationWindow({
                reservationDate: DATE,
                reservationTime: TIME,
                cutoffMinutes: -10,
                now: minutesBefore(60)
            }).allowed
        ).toBe(false);
    });
});

describe("date inutilizzabili — fail closed", () => {
    it.each([
        ["data non ISO", "15/07/2026", TIME],
        ["ora non valida", DATE, "25:61"],
        ["data assente", null, TIME],
        ["ora assente", DATE, undefined]
    ])("non annullabile su %s", (_label, date, time) => {
        expect(
            evaluateCancellationWindow({
                reservationDate: date,
                reservationTime: time,
                cutoffMinutes: 120,
                now: minutesBefore(600)
            })
        ).toMatchObject({
            allowed: false,
            reason: "invalid_datetime",
            minutesUntilReservation: null
        });
    });

    it("una data illeggibile con cutoff 0 resta annullabile (nessun limite è nessun limite)", () => {
        expect(
            evaluateCancellationWindow({
                reservationDate: "non-una-data",
                reservationTime: TIME,
                cutoffMinutes: 0,
                now: minutesBefore(600)
            })
        ).toMatchObject({ allowed: true, reason: "ok", minutesUntilReservation: null });
    });
});

describe("il cutoff attraversa il cambio d'ora senza slittare", () => {
    it("2 ore prima di una cena del 29/3 sono 2 ore reali", () => {
        // Cena alle 20:00 del 29/3 (CEST) = 18:00 UTC. Due ore prima = 16:00 UTC.
        const result = evaluateCancellationWindow({
            reservationDate: "2026-03-29",
            reservationTime: "20:00:00",
            cutoffMinutes: 120,
            now: new Date(Date.UTC(2026, 2, 29, 16, 0, 0))
        });
        expect(result).toMatchObject({ allowed: true, minutesUntilReservation: 120 });
    });

    it("un minuto dopo il limite, sempre il 29/3, non è più annullabile", () => {
        expect(
            evaluateCancellationWindow({
                reservationDate: "2026-03-29",
                reservationTime: "20:00:00",
                cutoffMinutes: 120,
                now: new Date(Date.UTC(2026, 2, 29, 16, 1, 0))
            }).allowed
        ).toBe(false);
    });
});
