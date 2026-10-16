import { describe, expect, it } from "vitest";
import type { CrmExpenseSettlement } from "@/types/crm";
import { categoryMatches, moveMatches, parseFilterList, payerMatches } from "@/utils/crm/expenseFilters";

const move = (from: string, to: string): CrmExpenseSettlement => ({
    id: "m",
    from_name: from,
    to_name: to,
    amount_cents: 100,
    settled_on: "2026-10-01",
    note: null,
    account_id: null,
    created_by: null,
    created_at: ""
});

describe("filtri delle spese", () => {
    it("legge l'indirizzo tenendo solo i valori ammessi, senza doppioni", () => {
        const isKnown = (v: string): v is "a" | "b" => v === "a" || v === "b";
        expect(parseFilterList("a,x,b,a", isKnown)).toEqual(["a", "b"]);
        expect(parseFilterList(null, isKnown)).toEqual([]);
    });

    it("chi paga: vuoto passa tutto, persone e conto comune a scelta multipla", () => {
        const lorenzo = { type: "person", name: "Lorenzo", accountId: null } as const;
        const joint = { type: "joint", accountId: null } as const;
        expect(payerMatches(lorenzo, [])).toBe(true);
        expect(payerMatches(lorenzo, ["lorenzo"])).toBe(true);
        expect(payerMatches(lorenzo, ["Alessandro"])).toBe(false);
        expect(payerMatches(joint, ["Alessandro", "comune"])).toBe(true);
        expect(payerMatches({ type: "none" }, ["Lorenzo"])).toBe(false);
    });

    it("un movimento passa per chi lo fa o lo riceve, mai col filtro per tipo", () => {
        expect(moveMatches(move("Lorenzo", "Alessandro"), { who: ["Alessandro"], types: [] })).toBe(true);
        expect(moveMatches(move("Lorenzo", "Conto comune"), { who: ["comune"], types: [] })).toBe(true);
        expect(moveMatches(move("Lorenzo", "Alessandro"), { who: [], types: ["software"] })).toBe(false);
    });

    it("tipo: vuoto passa tutto", () => {
        expect(categoryMatches("software", [])).toBe(true);
        expect(categoryMatches("software", ["advertising", "software"])).toBe(true);
        expect(categoryMatches("other", ["software"])).toBe(false);
    });
});
