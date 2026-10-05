import { describe, expect, it } from "vitest";
import {
    draftFromPrevious,
    expenseDateOf,
    expenseDraftSummary,
    expenseDraftToInput,
    frequencyOf,
    quickExpenseDraft,
    suggestExpenses,
    validateExpenseDraft,
    withExpenseDate,
    withFrequency
} from "@/utils/crm/expenses";
import type { CrmExpense } from "@/types/crm";

function expense(overrides: Partial<CrmExpense>): CrmExpense {
    return {
        id: "e1",
        kind: "subscription",
        name: "Claude Max",
        category: "software",
        amount_cents: 9000,
        paid_by: "Alessandro",
        paid_on: null,
        first_charge_on: "2026-09-02",
        billing_interval: "month",
        cancelled_on: null,
        remind_days_before: 3,
        reminded_for: null,
        notes: "nota",
        created_by: null,
        created_at: "2026-09-02T10:00:00Z",
        updated_at: "2026-09-02T10:00:00Z",
        ...overrides
    };
}

const TODAY = "2026-10-05";

describe("Quanto spesso", () => {
    it("la riga veloce parte da ogni mese, categoria Altro, paga chi è entrato", () => {
        const d = quickExpenseDraft(TODAY, "Alessandro");
        expect(frequencyOf(d)).toBe("month");
        expect(d.category).toBe("other");
        expect(d.paidBy).toBe("Alessandro");
        expect(expenseDateOf(d)).toBe(TODAY);
    });

    it("una volta scrive una tantum con la data come pagamento", () => {
        const d = withFrequency(withExpenseDate(quickExpenseDraft(TODAY, ""), "2026-10-01"), "once");
        const input = expenseDraftToInput({ ...d, name: "Dominio", amount: "12" });
        expect(input).toMatchObject({ kind: "one_off", paidOn: "2026-10-01", firstChargeOn: null, billingInterval: null });
    });

    it("ogni anno scrive un abbonamento annuale con la data come primo addebito", () => {
        const d = withFrequency(withExpenseDate(quickExpenseDraft(TODAY, ""), "2026-10-01"), "year");
        const input = expenseDraftToInput({ ...d, name: "Dominio", amount: "12" });
        expect(input).toMatchObject({ kind: "subscription", billingInterval: "year", firstChargeOn: "2026-10-01", paidOn: null });
    });

    it("cambiare frequenza non perde la data", () => {
        const d = withExpenseDate(quickExpenseDraft(TODAY, ""), "2026-09-20");
        expect(expenseDateOf(withFrequency(withFrequency(d, "once"), "year"))).toBe("2026-09-20");
    });
});

describe("suggestExpenses", () => {
    const list = [
        expense({ id: "a", name: "Claude Max", amount_cents: 9000, created_at: "2026-09-01T00:00:00Z" }),
        expense({ id: "b", name: "claude max", amount_cents: 10980, created_at: "2026-10-01T00:00:00Z" }),
        expense({ id: "c", name: "Dominio", kind: "one_off", created_at: "2026-08-01T00:00:00Z" }),
        expense({ id: "d", name: "Account Claude API", created_at: "2026-08-01T00:00:00Z" })
    ];

    it("sotto le due lettere niente", () => {
        expect(suggestExpenses(list, "c")).toEqual([]);
    });

    it("l'ultima per nome, prima chi comincia così", () => {
        expect(suggestExpenses(list, "clau").map(e => e.id)).toEqual(["b", "d"]);
    });

    it("senza maiuscole né accenti", () => {
        expect(suggestExpenses([expense({ id: "x", name: "Caffè" })], "CAFFE").map(e => e.id)).toEqual(["x"]);
    });
});

describe("draftFromPrevious", () => {
    it("copia importo, frequenza e chi paga, con la data di oggi, senza note né disdetta", () => {
        const d = draftFromPrevious(expense({ cancelled_on: "2026-09-30", billing_interval: "year" }), TODAY);
        expect(d).toMatchObject({ name: "Claude Max", amount: "90,00", paidBy: "Alessandro", cancelled: false, notes: "" });
        expect(frequencyOf(d)).toBe("year");
        expect(expenseDateOf(d)).toBe(TODAY);
        expect(validateExpenseDraft(d)).toEqual({});
    });
});

describe("expenseDraftSummary", () => {
    const base = quickExpenseDraft(TODAY, "");
    const norm = (s: string | null) => s?.replace(/\u00a0/g, " ");

    it("null finché l'importo non è valido", () => {
        expect(expenseDraftSummary({ ...base, amount: "" })).toBeNull();
    });

    it("al mese dice anche l'anno, all'anno anche il mese", () => {
        expect(norm(expenseDraftSummary({ ...base, amount: "90" }))).toBe("90,00 € al mese, 1080,00 € l'anno");
        expect(norm(expenseDraftSummary(withFrequency({ ...base, amount: "120" }, "year")))).toBe("120,00 € l'anno, 10,00 € al mese");
        expect(norm(expenseDraftSummary(withFrequency({ ...base, amount: "12" }, "once")))).toBe("12,00 € una volta sola");
    });
});
