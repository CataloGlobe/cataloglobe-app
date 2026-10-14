import { describe, expect, it } from "vitest";
import {
    openRequests,
    openRequestsText,
    seatingRequests,
    tableRequestsById
} from "@/utils/tableRequests";

const table = (id: string, label: string, bill = 0, waiter = 0) => ({
    id,
    label,
    bill_requested_count: bill,
    waiter_called_count: waiter
});

const TABLES = [table("t10", "10", 1, 0), table("t3", "3", 0, 1), table("t2", "2"), table("t5", "5", 1, 2)];

describe("tableRequests", () => {
    it("tiene solo i tavoli con una richiesta aperta", () => {
        const byId = tableRequestsById(TABLES);
        expect([...byId.keys()].sort()).toEqual(["t10", "t3", "t5"]);
        expect(byId.get("t5")).toEqual({ bill: true, waiter: true });
        expect(byId.get("t3")).toEqual({ bill: false, waiter: true });
    });

    it("una tavolata ha la richiesta se ce l'ha uno dei suoi tavoli", () => {
        const byId = tableRequestsById(TABLES);
        expect(seatingRequests(["t2", "t3"], byId)).toEqual({ bill: false, waiter: true });
        expect(seatingRequests(["t2"], byId)).toEqual({ bill: false, waiter: false });
        expect(seatingRequests([], byId)).toEqual({ bill: false, waiter: false });
    });

    it("prima il cameriere, poi il conto, per tavolo in ordine umano", () => {
        expect(openRequests(TABLES).map(r => `${r.kind}:${r.label}`)).toEqual([
            "waiter:3",
            "waiter:5",
            "bill:5",
            "bill:10"
        ]);
    });

    it("il testo raggruppa i tavoli per richiesta", () => {
        expect(openRequestsText(openRequests(TABLES))).toBe(
            "Tavoli 3 + 5: cameriere chiamato · Tavoli 5 + 10: conto richiesto"
        );
        expect(openRequestsText(openRequests([table("a", "Terrazza 1", 1)]))).toBe("Tavolo Terrazza 1: conto richiesto");
        expect(openRequestsText([])).toBe("");
    });
});
