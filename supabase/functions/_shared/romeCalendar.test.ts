import { describe, it, expect } from "vitest";
import { addDaysToIsoDate, isoDateInTimeZone, tomorrowIsoDate } from "./romeCalendar.ts";

/** Istante UTC corrispondente a un orario di Roma, per leggibilità dei casi. */
function utc(y: number, m: number, d: number, h: number, min = 0): Date {
    return new Date(Date.UTC(y, m - 1, d, h, min, 0));
}

describe("isoDateInTimeZone", () => {
    it("usa il giorno di Roma, non quello UTC", () => {
        // 22:30 UTC del 14 luglio sono già le 00:30 del 15 a Roma (CEST).
        expect(isoDateInTimeZone(utc(2026, 7, 14, 22, 30))).toBe("2026-07-15");
    });

    it("resta sul giorno precedente prima della mezzanotte locale", () => {
        expect(isoDateInTimeZone(utc(2026, 7, 14, 21, 30))).toBe("2026-07-14");
    });

    it("in inverno lo scarto è di un'ora sola", () => {
        expect(isoDateInTimeZone(utc(2026, 1, 14, 23, 30))).toBe("2026-01-15");
        expect(isoDateInTimeZone(utc(2026, 1, 14, 22, 30))).toBe("2026-01-14");
    });
});

describe("addDaysToIsoDate", () => {
    it("avanza di un giorno", () => {
        expect(addDaysToIsoDate("2026-08-29", 1)).toBe("2026-08-30");
    });

    it("attraversa il cambio del mese", () => {
        expect(addDaysToIsoDate("2026-08-31", 1)).toBe("2026-09-01");
    });

    it("attraversa il cambio dell'anno", () => {
        expect(addDaysToIsoDate("2026-12-31", 1)).toBe("2027-01-01");
    });

    it("gestisce il 29 febbraio di un anno bisestile", () => {
        expect(addDaysToIsoDate("2028-02-28", 1)).toBe("2028-02-29");
        expect(addDaysToIsoDate("2028-02-29", 1)).toBe("2028-03-01");
    });

    it("in un anno non bisestile salta al 1 marzo", () => {
        expect(addDaysToIsoDate("2026-02-28", 1)).toBe("2026-03-01");
    });

    it("attraversa i due cambi d'ora senza saltare o ripetere un giorno", () => {
        expect(addDaysToIsoDate("2026-03-28", 1)).toBe("2026-03-29");
        expect(addDaysToIsoDate("2026-03-29", 1)).toBe("2026-03-30");
        expect(addDaysToIsoDate("2026-10-24", 1)).toBe("2026-10-25");
        expect(addDaysToIsoDate("2026-10-25", 1)).toBe("2026-10-26");
    });

    it("accetta valori negativi e zero", () => {
        expect(addDaysToIsoDate("2026-03-01", -1)).toBe("2026-02-28");
        expect(addDaysToIsoDate("2026-03-01", 0)).toBe("2026-03-01");
    });

    it.each([
        ["data non ISO", "29/08/2026"],
        ["data inesistente", "2026-02-30"],
        ["mese fuori range", "2026-13-01"],
        ["timestamp completo", "2026-08-29T18:00:00Z"],
        ["stringa vuota", ""],
        ["non stringa", null],
        ["non stringa", 20260829]
    ])("restituisce null su %s", (_label, value) => {
        expect(addDaysToIsoDate(value, 1)).toBeNull();
    });

    it("restituisce null se lo scarto non è un intero", () => {
        expect(addDaysToIsoDate("2026-08-29", 1.5)).toBeNull();
        expect(addDaysToIsoDate("2026-08-29", Number.NaN)).toBeNull();
    });
});

describe("tomorrowIsoDate — il bersaglio del promemoria", () => {
    it("alle 18:00 di Roma punta al giorno dopo (estate)", () => {
        // 16:00 UTC = 18:00 CEST.
        expect(tomorrowIsoDate(utc(2026, 7, 15, 16))).toBe("2026-07-16");
    });

    it("alle 18:00 di Roma punta al giorno dopo (inverno)", () => {
        // 17:00 UTC = 18:00 CET.
        expect(tomorrowIsoDate(utc(2026, 1, 15, 17))).toBe("2026-01-16");
    });

    it("il giorno del passaggio all'ora legale punta al 30 marzo", () => {
        expect(tomorrowIsoDate(utc(2026, 3, 29, 16))).toBe("2026-03-30");
    });

    it("il giorno del ritorno all'ora solare punta al 26 ottobre", () => {
        expect(tomorrowIsoDate(utc(2026, 10, 25, 17))).toBe("2026-10-26");
    });

    it("la vigilia del cambio punta al giorno del cambio", () => {
        expect(tomorrowIsoDate(utc(2026, 3, 28, 17))).toBe("2026-03-29");
        expect(tomorrowIsoDate(utc(2026, 10, 24, 16))).toBe("2026-10-25");
    });

    it("l'ultimo giorno dell'anno punta al primo dell'anno dopo", () => {
        expect(tomorrowIsoDate(utc(2026, 12, 31, 17))).toBe("2027-01-01");
    });

    it("un anno intero di esecuzioni alle 18:00 di Roma non salta né ripete un giorno", () => {
        // 16 e 17 UTC: una delle due è le 18:00 a Roma. Si verifica che il
        // bersaglio sia sempre esattamente il giorno successivo a quello locale.
        const visti = new Set<string>();
        for (let i = 0; i < 365; i++) {
            const instant = new Date(Date.UTC(2026, 0, 1, 16, 0, 0) + i * 86400000);
            const oggi = isoDateInTimeZone(instant);
            const domani = tomorrowIsoDate(instant);
            expect(domani).toBe(addDaysToIsoDate(oggi, 1));
            visti.add(domani);
        }
        expect(visti.size).toBe(365);
    });
});
