import { describe, it, expect } from "vitest";
import {
    SERVICE_DAY_START_HOUR,
    isFromPreviousServiceDay,
    serviceDayOf
} from "@/pages/Dashboard/Reservations/serviceDay";

// La giornata di servizio inizia alle cinque di Roma. Gli istanti portano
// l'offset esplicito (settembre: +02:00; gennaio: +01:00) così il test non
// dipende dal fuso della macchina che lo esegue.
const rome = (iso: string) => new Date(iso);

describe("serviceDay — l'ultima cinque del mattino trascorsa (⚠️ SYNC get_service_day_start)", () => {
    it("il confine è alle cinque", () => {
        expect(SERVICE_DAY_START_HOUR).toBe(5);
    });

    // Le cinque righe della specifica: (aperta, adesso) → esito.
    it("ieri 21:00, adesso 00:30 → servizio in corso (dopo l'ultima 05:00, ieri)", () => {
        expect(
            isFromPreviousServiceDay("2026-09-11T21:00:00+02:00", rome("2026-09-12T00:30:00+02:00"))
        ).toBe(false);
    });

    it("oggi 01:00, adesso 03:00 → notte in corso (dopo l'ultima 05:00, ieri)", () => {
        expect(
            isFromPreviousServiceDay("2026-09-12T01:00:00+02:00", rome("2026-09-12T03:00:00+02:00"))
        ).toBe(false);
    });

    it("ieri 21:00, adesso 06:00 → servizio precedente (prima dell'ultima 05:00, oggi)", () => {
        expect(
            isFromPreviousServiceDay("2026-09-11T21:00:00+02:00", rome("2026-09-12T06:00:00+02:00"))
        ).toBe(true);
    });

    it("oggi 01:00, adesso 06:00 → era la notte scorsa (prima dell'ultima 05:00, oggi)", () => {
        expect(
            isFromPreviousServiceDay("2026-09-12T01:00:00+02:00", rome("2026-09-12T06:00:00+02:00"))
        ).toBe(true);
    });

    it("oggi 07:00, adesso 12:00 → servizio in corso (dopo l'ultima 05:00, oggi)", () => {
        expect(
            isFromPreviousServiceDay("2026-09-12T07:00:00+02:00", rome("2026-09-12T12:00:00+02:00"))
        ).toBe(false);
    });

    it("il confine è inclusivo: alle 05:00 in punto inizia il servizio nuovo", () => {
        expect(serviceDayOf(rome("2026-09-12T04:59:59+02:00"))).toBe("2026-09-11");
        expect(serviceDayOf(rome("2026-09-12T05:00:00+02:00"))).toBe("2026-09-12");
    });

    it("la data è quella di Roma, non quella UTC: alle 05:30 di Roma sono le 03:30 UTC", () => {
        // 2026-09-12T03:30Z: per l'UTC la giornata di servizio sarebbe ancora
        // l'11; per Roma sono le 05:30 del 12, e il servizio è quello del 12.
        expect(serviceDayOf(rome("2026-09-12T03:30:00Z"))).toBe("2026-09-12");
    });

    it("in inverno lo stesso (offset +01:00)", () => {
        expect(
            isFromPreviousServiceDay("2026-01-10T23:30:00+01:00", rome("2026-01-11T00:30:00+01:00"))
        ).toBe(false);
        expect(
            isFromPreviousServiceDay("2026-01-10T23:30:00+01:00", rome("2026-01-11T05:00:00+01:00"))
        ).toBe(true);
    });

    it("un istante rotto non è mai di un servizio precedente", () => {
        expect(serviceDayOf(new Date("boh"))).toBeNull();
        expect(isFromPreviousServiceDay("boh", rome("2026-09-12T12:00:00+02:00"))).toBe(false);
        expect(isFromPreviousServiceDay("2026-09-11T21:00:00+02:00", new Date("boh"))).toBe(false);
    });
});
