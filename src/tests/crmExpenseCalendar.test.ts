import { describe, expect, it } from "vitest";
import type { CrmExpense } from "@/types/crm";
import {
    calendarDays,
    chargesByDay,
    lastDayOfMonth,
    oneOffByMonth,
    previousChargeOn,
    renewalProgress,
    shiftMonth
} from "@/utils/crm/expenseCalendar";

function oneOff(name: string, cents: number, paidOn: string): CrmExpense {
    return {
        id: name,
        kind: "one_off",
        name,
        category: "other",
        amount_cents: cents,
        paid_by: null,
        paid_on: paidOn,
        first_charge_on: null,
        billing_interval: null,
        cancelled_on: null,
        remind_days_before: null,
        reminded_for: null,
        notes: null,
        created_by: null,
        created_at: "",
        updated_at: ""
    };
}

describe("calendario del mese", () => {
    it("ottobre 2026 parte da lunedì 28 settembre e finisce domenica 1 novembre", () => {
        const days = calendarDays("2026-10");
        expect(days.length).toBe(35);
        expect(days[0]).toEqual({ date: "2026-09-28", day: 28, inMonth: false });
        expect(days[3]).toEqual({ date: "2026-10-01", day: 1, inMonth: true });
        expect(days.at(-1)).toEqual({ date: "2026-11-01", day: 1, inMonth: false });
    });

    it("febbraio 2027 che inizia di lunedì sta in quattro settimane", () => {
        const days = calendarDays("2027-02");
        expect(days.length).toBe(28);
        expect(days[0].date).toBe("2027-02-01");
    });

    it("mesi e fine mese, anche a cavallo d'anno", () => {
        expect(shiftMonth("2026-12", 1)).toBe("2027-01");
        expect(shiftMonth("2026-01", -1)).toBe("2025-12");
        expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    });

    it("raggruppa gli addebiti per giorno", () => {
        const map = chargesByDay([
            { expenseId: "a", chargedOn: "2026-10-08", amountCents: 1 },
            { expenseId: "b", chargedOn: "2026-10-08", amountCents: 2 }
        ]);
        expect(map.get("2026-10-08")?.length).toBe(2);
    });
});

describe("rinnovi", () => {
    it("il rinnovo prima tiene il giorno, o l'ultimo del mese", () => {
        expect(previousChargeOn("2026-10-17", "month")).toBe("2026-09-17");
        expect(previousChargeOn("2026-03-31", "month")).toBe("2026-02-28");
        expect(previousChargeOn("2027-01-05", "year")).toBe("2026-01-05");
    });

    it("la barra si riempie avvicinandosi al rinnovo", () => {
        expect(renewalProgress("2026-10-31", "month", "2026-09-30")).toBe(0);
        expect(renewalProgress("2026-10-31", "month", "2026-10-15")).toBeCloseTo(0.5, 1);
        expect(renewalProgress("2026-10-31", "month", "2026-10-31")).toBe(1);
    });
});

describe("una tantum per mese", () => {
    it("dal mese più recente, dentro dalla più cara", () => {
        const months = oneOffByMonth([oneOff("a", 100, "2026-09-02"), oneOff("b", 500, "2026-10-01"), oneOff("c", 900, "2026-10-03")]);
        expect(months.map(m => [m.month, m.totalCents, m.expenses.map(e => e.name)])).toEqual([
            ["2026-10", 1400, ["c", "b"]],
            ["2026-09", 100, ["a"]]
        ]);
    });
});
