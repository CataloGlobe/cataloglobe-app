import { describe, expect, it } from "vitest";
import {
    makeNow,
    nextOpening,
    nowLabel,
    openNow,
    todayClosure,
    todaySpans
} from "@/pages/Operativita/Attivita/scheda/schedaModel";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";

// «Oggi» nella Scheda della sede è la giornata di servizio in ora di Roma
// (review #336, punto 13), qualunque sia il fuso del dispositivo.
describe("makeNow", () => {
    it("di giorno è la data di Roma, coi minuti dalla mezzanotte", () => {
        const now = makeNow(new Date("2026-10-09T12:30:00+02:00"));
        expect(now).toEqual({ iso: "2026-10-09", weekday: 4, minutes: 12 * 60 + 30 });
        expect(nowLabel(now)).toBe("venerdì 12:30");
    });

    it("dopo mezzanotte e prima delle 5 è ancora la sera di ieri", () => {
        const now = makeNow(new Date("2026-10-10T01:15:00+02:00"));
        expect(now).toEqual({ iso: "2026-10-09", weekday: 4, minutes: 1440 + 75 });
        expect(nowLabel(now)).toBe("sabato 1:15");
    });

    it("alle 5 comincia il giorno nuovo", () => {
        expect(makeNow(new Date("2026-10-10T05:00:00+02:00"))).toMatchObject({ iso: "2026-10-10", weekday: 5, minutes: 300 });
    });

    it("legge l'ora di Roma, non quella del dispositivo (anche col cambio d'ora)", () => {
        // 25 ottobre 2026: alle 3 si torna alle 2. Le 4:30 dopo il cambio sono le 3:30 UTC.
        expect(makeNow(new Date("2026-10-25T03:30:00Z"))).toMatchObject({ iso: "2026-10-24", weekday: 5, minutes: 1440 + 270 });
        // Lunedì a mezzanotte e mezza a Roma: ancora la domenica, giorno 6.
        expect(makeNow(new Date("2026-10-11T22:30:00Z"))).toMatchObject({ iso: "2026-10-11", weekday: 6, minutes: 1440 + 30 });
    });
});

// D169: «Chiuso oggi» è solo della chiusura straordinaria; dopo l'ultimo
// turno la Scheda dice quando si riapre.
describe("openNow dopo l'ultimo turno", () => {
    const hour = (day: number, opens: string, closes: string, next = false): V2ActivityHours => ({
        id: `h-${day}-${opens}`,
        tenant_id: "t",
        activity_id: "a",
        day_of_week: day,
        slot_index: 0,
        opens_at: opens,
        closes_at: closes,
        closes_next_day: next,
        is_closed: false,
        created_at: "",
        updated_at: ""
    });
    const closure = (date: string, label: string): V2ActivityClosure => ({
        id: "c",
        tenant_id: "t",
        activity_id: "a",
        closure_date: date,
        end_date: null,
        label,
        is_closed: true,
        slots: null,
        created_at: "",
        updated_at: ""
    });
    // Mercoledì-sabato 12-15, domenica 19-2, lunedì e martedì chiusi.
    const hours = [2, 3, 4, 5].map(d => hour(d, "12:00", "15:00")).concat(hour(6, "19:00", "02:00", true));
    const text = (at: string, closures: V2ActivityClosure[] = []) => {
        const now = makeNow(new Date(at));
        return openNow(todaySpans(hours, closures, now), todayClosure(closures, now), now, nextOpening(hours, closures, now)).text;
    };

    it("finito il turno: riapre domani", () => {
        expect(text("2026-10-07T20:00:00+02:00")).toBe("Chiuso · riapre domani alle 12");
    });

    it("i giorni di riposo in mezzo: dice il giorno", () => {
        // Lunedì alle 3, finita la sera di domenica: si riapre mercoledì.
        expect(text("2026-10-12T03:00:00+02:00")).toBe("Chiuso · riapre mercoledì alle 12");
    });

    it("dopo mezzanotte il giorno dopo è già oggi", () => {
        // Venerdì chiuso alle 15; all'una di sabato si riapre alle 12 di oggi.
        expect(text("2026-10-10T01:00:00+02:00")).toBe("Chiuso · riapre alle 12");
    });

    it("una chiusura domani sposta la riapertura", () => {
        expect(text("2026-10-07T20:00:00+02:00", [closure("2026-10-08", "Inventario")])).toBe("Chiuso · riapre venerdì alle 12");
    });

    it("la chiusura straordinaria resta «Chiuso oggi»", () => {
        expect(text("2026-10-07T20:00:00+02:00", [closure("2026-10-07", "Chiuso oggi")])).toBe("Chiuso oggi, straordinario");
    });
});
