import { describe, expect, it } from "vitest";

import {
    agendaWeekRange,
    applyRealtimeEvents,
    dayContextRange,
    isRowInWindow,
    mergeDateRanges
} from "@/pages/Dashboard/Reservations/loadWindow";
import type { V2Reservation } from "@/types/reservation";

// FASE 5.2a — la pagina chiede al server solo le date che mostra. Questo
// modulo decide quali: qui si prova che la settimana è quella dell'Agenda,
// che due finestre che si toccano diventano una query sola e che il realtime
// sa distinguere una riga «in memoria» da una fuori finestra.

describe("agendaWeekRange", () => {
    it("lunedì–domenica della settimana di oggi (2026-09-17 è giovedì)", () => {
        expect(agendaWeekRange("2026-09-17", 0)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
    });

    it("domenica appartiene alla settimana che finisce con lei, non a quella dopo", () => {
        expect(agendaWeekRange("2026-09-20", 0)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
    });

    it("l'offset sposta di settimane intere, avanti e indietro", () => {
        expect(agendaWeekRange("2026-09-17", 1)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
        expect(agendaWeekRange("2026-09-17", -2)).toEqual({ from: "2026-08-31", to: "2026-09-06" });
    });
});

describe("dayContextRange", () => {
    it("D-1 .. D+1, come reservation_peak_with_candidate", () => {
        expect(dayContextRange("2026-10-01")).toEqual({ from: "2026-09-30", to: "2026-10-02" });
    });
});

describe("mergeDateRanges", () => {
    it("intervalli sovrapposti o adiacenti diventano uno", () => {
        expect(
            mergeDateRanges([
                { from: "2026-09-14", to: "2026-09-20" },
                { from: "2026-09-16", to: "2026-09-18" }, // oggi ±1, dentro la settimana
                { from: "2026-09-21", to: "2026-09-23" } // adiacente: 21 = 20+1
            ])
        ).toEqual([{ from: "2026-09-14", to: "2026-09-23" }]);
    });

    it("intervalli lontani restano separati e ordinati", () => {
        expect(
            mergeDateRanges([
                { from: "2027-07-12", to: "2027-07-18" },
                { from: "2026-09-16", to: "2026-09-18" }
            ])
        ).toEqual([
            { from: "2026-09-16", to: "2026-09-18" },
            { from: "2027-07-12", to: "2027-07-18" }
        ]);
    });

    it("scarta gli intervalli rovesciati e non muta l'input", () => {
        const input = [{ from: "2026-09-20", to: "2026-09-14" }, { from: "2026-09-01", to: "2026-09-02" }];
        const copy = input.map(r => ({ ...r }));
        expect(mergeDateRanges(input)).toEqual([{ from: "2026-09-01", to: "2026-09-02" }]);
        expect(input).toEqual(copy);
    });
});

describe("isRowInWindow", () => {
    const ranges = [{ from: "2026-09-14", to: "2026-09-20" }];

    it("una pending è sempre in finestra, a qualunque data", () => {
        expect(isRowInWindow({ status: "pending", reservation_date: "2027-07-14" }, ranges)).toBe(true);
    });

    it("una confirmed conta solo se la data è dentro una finestra", () => {
        expect(isRowInWindow({ status: "confirmed", reservation_date: "2026-09-20" }, ranges)).toBe(true);
        expect(isRowInWindow({ status: "confirmed", reservation_date: "2026-09-21" }, ranges)).toBe(false);
    });
});

describe("applyRealtimeEvents", () => {
    const ranges = [{ from: "2026-09-14", to: "2026-09-20" }];
    const base = (id: string, date: string, status: V2Reservation["status"], time = "20:00:00") =>
        ({ id, reservation_date: date, reservation_time: time, status }) as V2Reservation;
    const rows = [base("a", "2026-09-15", "confirmed"), base("b", "2026-09-16", "confirmed")];

    it("UPDATE dentro finestra sostituisce la riga e la segna da rileggere", () => {
        const out = applyRealtimeEvents(rows, [{ type: "UPDATE", row: base("a", "2026-09-15", "seated") }], ranges);
        expect(out.rows.find(r => r.id === "a")?.status).toBe("seated");
        expect(out.touchedIds).toEqual(["a"]);
        expect(out.removedIds).toEqual([]);
    });

    it("INSERT fuori finestra e non pending si ignora; pending entra sempre", () => {
        const out = applyRealtimeEvents(rows, [
            { type: "INSERT", row: base("far", "2027-07-14", "confirmed") },
            { type: "INSERT", row: base("p", "2027-07-14", "pending") }
        ], ranges);
        expect(out.rows.map(r => r.id)).toEqual(["a", "b", "p"]);
        expect(out.touchedIds).toEqual(["p"]);
    });

    it("una riga che si sposta fuori finestra esce dalla memoria", () => {
        const out = applyRealtimeEvents(rows, [{ type: "UPDATE", row: base("a", "2026-10-01", "confirmed") }], ranges);
        expect(out.rows.map(r => r.id)).toEqual(["b"]);
        expect(out.removedIds).toEqual(["a"]);
        expect(out.touchedIds).toEqual([]);
    });

    it("DELETE toglie per id; l'ordine resta data + ora; l'input non muta", () => {
        const copy = rows.map(r => ({ ...r }));
        const out = applyRealtimeEvents(rows, [
            { type: "DELETE", id: "b" },
            { type: "INSERT", row: base("c", "2026-09-15", "confirmed", "19:00:00") }
        ], ranges);
        expect(out.rows.map(r => r.id)).toEqual(["c", "a"]);
        expect(out.removedIds).toEqual(["b"]);
        expect(rows).toEqual(copy);
    });
});
