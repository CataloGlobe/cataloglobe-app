import { describe, expect, it } from "vitest";
import { romeDayOf, romeInstantAt } from "@/utils/romeInstant";

// Il cursore della banda (§50.7): «oggi alle HH:MM» a Roma, con l'epoch
// giusto anche nei due giorni del cambio d'ora. Non parte dalla mezzanotte
// del browser (bug 4 del simulatore).

const iso = (epoch: number) => new Date(epoch).toISOString();

describe("romeDayOf", () => {
    it("il giorno è quello di Roma, non quello di UTC", () => {
        // 22:30Z del 28/03 è già domenica 29 a Roma.
        expect(romeDayOf(new Date("2026-03-28T23:30:00Z"))).toEqual({ year: 2026, month: 2, day: 29 });
        expect(romeDayOf(new Date("2026-09-23T10:00:00Z"))).toEqual({ year: 2026, month: 8, day: 23 });
    });
});

describe("romeInstantAt", () => {
    const sep23 = { year: 2026, month: 8, day: 23 };

    it("un giorno qualsiasi: ora legale, +2", () => {
        const at = romeInstantAt(sep23, 12 * 60);
        expect(iso(at.epoch)).toBe("2026-09-23T10:00:00.000Z");
        expect(at).toMatchObject({ year: 2026, month: 8, day: 23, hour: 12, minute: 0, dayOfWeek: 3 });
    });

    it("la mezzanotte è quella di Roma: il giorno resta lo stesso", () => {
        const at = romeInstantAt(sep23, 0);
        expect(iso(at.epoch)).toBe("2026-09-22T22:00:00.000Z");
        expect(at).toMatchObject({ day: 23, hour: 0, dayOfWeek: 3 });
        expect(iso(romeInstantAt(sep23, 23 * 60 + 30).epoch)).toBe("2026-09-23T21:30:00.000Z");
    });

    it("29/03, si va avanti: prima delle 2 è +1, dopo le 3 è +2", () => {
        const mar29 = { year: 2026, month: 2, day: 29 };
        expect(iso(romeInstantAt(mar29, 90).epoch)).toBe("2026-03-29T00:30:00.000Z");
        expect(iso(romeInstantAt(mar29, 3 * 60).epoch)).toBe("2026-03-29T01:00:00.000Z");
        expect(iso(romeInstantAt(mar29, 23 * 60).epoch)).toBe("2026-03-29T21:00:00.000Z");
    });

    it("29/03 alle 2:30 non esiste: si legge l'istante dopo il salto, le 3:30", () => {
        const at = romeInstantAt({ year: 2026, month: 2, day: 29 }, 150);
        expect(iso(at.epoch)).toBe("2026-03-29T01:30:00.000Z");
        expect(at).toMatchObject({ hour: 3, minute: 30, day: 29 });
    });

    it("25/10, si torna indietro: le 2:30 capitano due volte, vale la prima (+2)", () => {
        const oct25 = { year: 2026, month: 9, day: 25 };
        const at = romeInstantAt(oct25, 150);
        expect(iso(at.epoch)).toBe("2026-10-25T00:30:00.000Z");
        expect(at).toMatchObject({ hour: 2, minute: 30, dayOfWeek: 0 });
        expect(iso(romeInstantAt(oct25, 3 * 60).epoch)).toBe("2026-10-25T02:00:00.000Z");
        expect(iso(romeInstantAt(oct25, 23 * 60 + 30).epoch)).toBe("2026-10-25T22:30:00.000Z");
    });
});
