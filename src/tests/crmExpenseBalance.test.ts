import { describe, expect, it } from "vitest";
import type { CrmExpense, CrmExpenseCharge, CrmExpenseSettlement } from "@/types/crm";
import {
    computeExpenseBalance,
    JOINT_ACCOUNT,
    payerSuggestions,
    settlementDraftToInput,
    validateSettlementDraft,
    transfersToSettlements,
    type BalanceSources
} from "@/utils/crm/expenseBalance";

const TODAY = "2026-10-05";

let seq = 0;
const id = () => `e-${seq++}`;

function expense(paidBy: string | null): CrmExpense {
    return {
        id: id(),
        kind: "one_off",
        name: "Spesa",
        category: "software",
        amount_cents: 0,
        paid_by: paidBy,
        paid_on: "2026-10-01",
        first_charge_on: null,
        billing_interval: null,
        cancelled_on: null,
        remind_days_before: null,
        reminded_for: null,
        notes: null,
        created_by: null,
        created_at: "2026-10-01T08:00:00Z",
        updated_at: "2026-10-01T08:00:00Z"
    };
}

function settlement(from: string, to: string, cents: number, on = "2026-10-02"): CrmExpenseSettlement {
    return { id: id(), from_name: from, to_name: to, amount_cents: cents, settled_on: on, note: null, created_by: null, created_at: "" };
}

/** Una spesa pagata da `who` con un solo addebito. */
function paid(who: string | null, cents: number, on = "2026-10-01"): { e: CrmExpense; c: CrmExpenseCharge } {
    const e = expense(who);
    return { e, c: { expenseId: e.id, chargedOn: on, amountCents: cents } };
}

function sources(items: { e: CrmExpense; c: CrmExpenseCharge }[], extra: Partial<BalanceSources> = {}): BalanceSources {
    return {
        expenses: items.map(i => i.e),
        charges: items.map(i => i.c),
        settlements: [],
        team: ["Alex", "Lorenzo"],
        today: TODAY,
        ...extra
    };
}

describe("computeExpenseBalance", () => {
    it("divide a metà e dice chi dà a chi", () => {
        const b = computeExpenseBalance(sources([paid("Alex", 30000), paid("Lorenzo", 10000)]));
        expect(b.sharedCents).toBe(40000);
        expect(b.shareCents).toBe(20000);
        expect(b.transfers).toEqual([{ from: "Lorenzo", to: "Alex", amountCents: 10000 }]);
        expect(b.even).toBe(false);
    });

    it("unisce i nomi scritti in modo diverso e tiene quello del team", () => {
        const b = computeExpenseBalance(sources([paid(" alex ", 10000), paid("ALEX", 10000)]));
        expect(b.people.map(p => [p.name, p.paidCents])).toEqual([
            ["Alex", 20000],
            ["Lorenzo", 0]
        ]);
        expect(b.transfers).toEqual([{ from: "Lorenzo", to: "Alex", amountCents: 10000 }]);
    });

    it("le spese del conto comune non pesano su nessuno", () => {
        const b = computeExpenseBalance(sources([paid(JOINT_ACCOUNT, 50000), paid("conto comune", 1000)]));
        expect(b.jointCents).toBe(51000);
        expect(b.sharedCents).toBe(0);
        expect(b.even).toBe(true);
    });

    it("i versamenti sul conto comune contano come spese di chi versa", () => {
        const b = computeExpenseBalance({
            ...sources([]),
            settlements: [settlement("Alex", JOINT_ACCOUNT, 50000), settlement("Lorenzo", JOINT_ACCOUNT, 30000)]
        });
        expect(b.transfers).toEqual([{ from: "Lorenzo", to: "Alex", amountCents: 10000 }]);
    });

    it("un rimborso pareggia il conto", () => {
        const b = computeExpenseBalance({
            ...sources([paid("Alex", 30000), paid("Lorenzo", 10000)]),
            settlements: [settlement("Lorenzo", "Alex", 10000)]
        });
        expect(b.even).toBe(true);
        expect(b.people.every(p => p.balanceCents === 0)).toBe(true);
    });

    it("lascia fuori le spese senza pagatore e gli addebiti futuri", () => {
        const b = computeExpenseBalance(sources([paid(null, 9900), paid(null, 100), paid("Alex", 20000, "2026-11-01")]));
        expect(b.unassignedCents).toBe(10000);
        expect(b.unassignedCount).toBe(2);
        expect(b.sharedCents).toBe(0);
    });

    it("sotto i 50 centesimi siete in pari", () => {
        const b = computeExpenseBalance(sources([paid("Alex", 10060), paid("Lorenzo", 10000)]));
        expect(b.even).toBe(true);
    });

    it("chi paga e non è nel team entra nella divisione", () => {
        const b = computeExpenseBalance(sources([paid("Alex", 9000), paid("Sara", 0)], { team: ["Alex"] }));
        expect(b.people.map(p => p.name)).toEqual(["Alex", "Sara"]);
        expect(b.transfers).toEqual([{ from: "Sara", to: "Alex", amountCents: 4500 }]);
    });

    it("trasforma i passaggi nei movimenti del pareggio", () => {
        expect(transfersToSettlements([{ from: "Lorenzo", to: "Alex", amountCents: 100 }], TODAY)).toEqual([
            { fromName: "Lorenzo", toName: "Alex", amountCents: 100, settledOn: TODAY, note: "Pareggio" }
        ]);
    });
});

describe("payerSuggestions", () => {
    it("propone il team e il conto comune, senza doppioni", () => {
        expect(payerSuggestions(["Alex", "alex", "Lorenzo"])).toEqual(["Alex", "Lorenzo", JOINT_ACCOUNT]);
    });
});

describe("validateSettlementDraft", () => {
    const ok = { fromName: "Lorenzo", toName: "Alex", amount: "120,50", settledOn: TODAY, note: "" };

    it("un rimborso giusto passa e diventa centesimi", () => {
        expect(validateSettlementDraft(ok)).toEqual({});
        expect(settlementDraftToInput(ok)).toEqual({
            fromName: "Lorenzo",
            toName: "Alex",
            amountCents: 12050,
            settledOn: TODAY,
            note: null
        });
    });

    it("la stessa persona, il conto comune che dà, l'importo sbagliato", () => {
        expect(validateSettlementDraft({ ...ok, toName: " lorenzo " }).toName).toBeDefined();
        expect(validateSettlementDraft({ ...ok, fromName: JOINT_ACCOUNT }).fromName).toBeDefined();
        expect(validateSettlementDraft({ ...ok, amount: "dieci" }).amount).toBeDefined();
        expect(validateSettlementDraft({ ...ok, settledOn: "" }).settledOn).toBeDefined();
    });
});
