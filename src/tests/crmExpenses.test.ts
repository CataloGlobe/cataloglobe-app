import { describe, expect, it } from "vitest";
import {
    buildRenewalReminderMessage,
    daysBetween,
    formatDayIt,
    formatDaysLeft,
    formatEuroCents,
    monthlyEquivalentCents,
    parseEuroToCents
} from "@shared/crmExpenses";
import {
    expenseDraftFrom,
    expenseDraftToInput,
    formatMonthIt,
    recurringMonthlyCents,
    romeTodayIso,
    summarizeCharges,
    upcomingRenewals,
    validateExpenseDraft
} from "@/utils/crm/expenses";
import type { CrmExpense } from "@/types/crm";

function expense(overrides: Partial<CrmExpense>): CrmExpense {
    return {
        id: "e1",
        kind: "subscription",
        name: "Claude Max",
        category: "software",
        amount_cents: 10980,
        paid_by: null,
        paid_on: null,
        first_charge_on: "2026-11-02",
        billing_interval: "month",
        cancelled_on: null,
        remind_days_before: 3,
        reminded_for: null,
        notes: null,
        created_by: null,
        created_at: "2026-10-03T10:00:00Z",
        updated_at: "2026-10-03T10:00:00Z",
        ...overrides
    };
}

describe("parseEuroToCents", () => {
    it.each([
        ["109,80", 10980],
        ["94.46", 9446],
        ["90", 9000],
        ["1.200", 120000],
        ["1.200,50", 120050],
        ["20,19 €", 2019],
        [" 144 ", 14400],
        ["0,5", 50]
    ])("%s → %d", (input, cents) => {
        expect(parseEuroToCents(input)).toBe(cents);
    });

    it.each(["", "0", "abc", "-5", "1,234", "10,", "1.2.3"])("%s non è un importo", input => {
        expect(parseEuroToCents(input)).toBeNull();
    });
});

describe("formati", () => {
    it("euro all'italiana", () => {
        expect(formatEuroCents(1234567).replace(/\s/g, " ")).toBe("12.345,67 €");
    });
    it("mensile equivalente", () => {
        expect(monthlyEquivalentCents(14400, "year")).toBe(1200);
        expect(monthlyEquivalentCents(10980, "month")).toBe(10980);
    });
    it("giorni e date", () => {
        expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
        expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2); // cambio dell'ora
        expect(formatDayIt("2026-11-02")).toBe("lunedì 2 novembre");
        expect(formatDaysLeft(0)).toBe("oggi");
        expect(formatDaysLeft(1)).toBe("domani");
        expect(formatDaysLeft(3)).toBe("tra 3 giorni");
        expect(formatMonthIt("2026-10")).toBe("ottobre 2026");
    });
    it("oggi è quello di Roma", () => {
        // 23:30 UTC del 31 ottobre = 00:30 del 1° novembre a Roma (ora solare).
        expect(romeTodayIso(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
    });
});

describe("buildRenewalReminderMessage", () => {
    it("dice cosa, quando, quanto e chi paga, col link ai costi", () => {
        const message = buildRenewalReminderMessage({
            name: "Claude <Max>",
            amountCents: 10980,
            interval: "month",
            nextChargeOn: "2026-11-02",
            today: "2026-10-30",
            paidBy: "Alex",
            costsUrl: "https://example.test/admin/costi"
        });
        expect(message.text).toContain("<b>Claude &lt;Max&gt; si rinnova tra 3 giorni</b>");
        expect(message.text).toContain("lunedì 2 novembre");
        expect(message.text).toContain("al mese");
        expect(message.text).toContain("Lo paga: Alex");
        expect(message.reply_markup.inline_keyboard).toEqual([
            [{ text: "Apri i costi nel CRM", url: "https://example.test/admin/costi" }]
        ]);
    });
    it("senza link niente tasti", () => {
        const message = buildRenewalReminderMessage({
            name: "Dominio",
            amountCents: 1500,
            interval: "year",
            nextChargeOn: "2026-10-04",
            today: "2026-10-03",
            paidBy: null,
            costsUrl: null
        });
        expect(message.text).toContain("si rinnova domani");
        expect(message.text).not.toContain("Lo paga");
        expect(message.reply_markup.inline_keyboard).toEqual([]);
    });
});

describe("summarizeCharges", () => {
    const expenses = [
        expense({ id: "sub", kind: "subscription" }),
        expense({ id: "one", kind: "one_off", paid_on: "2026-08-10", first_charge_on: null, billing_interval: null })
    ];

    it("totale del mese, da inizio e mesi a zero in mezzo", () => {
        const summary = summarizeCharges(
            [
                { expenseId: "one", chargedOn: "2026-08-10", amountCents: 2019 },
                { expenseId: "sub", chargedOn: "2026-10-02", amountCents: 9446 },
                { expenseId: "sub", chargedOn: "2026-11-02", amountCents: 10980 }
            ],
            expenses,
            "2026-10-15"
        );
        expect(summary.thisMonthCents).toBe(9446);
        expect(summary.sinceStartCents).toBe(9446 + 2019);
        expect(summary.months.map(m => m.month)).toEqual(["2026-10", "2026-09", "2026-08"]);
        expect(summary.months[0]).toMatchObject({ subscriptionCents: 9446, oneOffCents: 0 });
        expect(summary.months[1].totalCents).toBe(0);
        expect(summary.months[2]).toMatchObject({ oneOffCents: 2019, subscriptionCents: 0 });
    });

    it("senza addebiti niente mesi", () => {
        const summary = summarizeCharges([], expenses, "2026-10-15");
        expect(summary).toEqual({ thisMonthCents: 0, sinceStartCents: 0, months: [] });
    });

    it("attraversa il cambio d'anno", () => {
        const summary = summarizeCharges(
            [{ expenseId: "one", chargedOn: "2025-12-20", amountCents: 100 }],
            expenses,
            "2026-01-05"
        );
        expect(summary.months.map(m => m.month)).toEqual(["2026-01", "2025-12"]);
    });
});

describe("abbonamenti attivi", () => {
    const expenses = [
        expense({ id: "a", name: "Wispr Flow", amount_cents: 14400, billing_interval: "year" }),
        expense({ id: "b", name: "Claude Max", amount_cents: 10980, billing_interval: "month" }),
        expense({ id: "c", name: "Disdetto", amount_cents: 5000 })
    ];
    const next = new Map([
        ["a", "2027-10-01"],
        ["b", "2026-11-02"]
    ]);

    it("peso al mese solo di quelli con un prossimo addebito", () => {
        expect(recurringMonthlyCents(expenses, next)).toBe(1200 + 10980);
    });
    it("prossimi rinnovi dal più vicino", () => {
        expect(upcomingRenewals(expenses, next).map(r => r.expense.name)).toEqual(["Claude Max", "Wispr Flow"]);
    });
});

describe("form", () => {
    it("nuova spesa: abbonamento mensile con promemoria a 3 giorni", () => {
        const draft = expenseDraftFrom(null, "2026-10-03");
        expect(draft).toMatchObject({ kind: "subscription", billingInterval: "month", remind: true, remindDaysBefore: "3" });
        expect(validateExpenseDraft(draft)).toEqual({
            name: "Scrivi cosa hai pagato.",
            amount: "Scrivi un importo in euro, per esempio 109,80."
        });
    });

    it("andata e ritorno di un abbonamento", () => {
        const original = expense({ paid_by: "Alex", cancelled_on: "2026-10-20", notes: "Diviso su Splitwise" });
        const draft = expenseDraftFrom(original, "2026-10-03");
        expect(draft.amount).toBe("109,80");
        expect(validateExpenseDraft(draft)).toEqual({});
        expect(expenseDraftToInput(draft)).toEqual({
            kind: "subscription",
            name: "Claude Max",
            category: "software",
            amountCents: 10980,
            paidBy: "Alex",
            paidOn: null,
            firstChargeOn: "2026-11-02",
            billingInterval: "month",
            cancelledOn: "2026-10-20",
            remindDaysBefore: 3,
            notes: "Diviso su Splitwise"
        });
    });

    it("una tantum: solo il giorno del pagamento, niente campi dell'abbonamento", () => {
        const draft = {
            ...expenseDraftFrom(null, "2026-10-01"),
            kind: "one_off" as const,
            name: " Codice Wispr ",
            amount: "20,19"
        };
        expect(validateExpenseDraft(draft)).toEqual({});
        expect(expenseDraftToInput(draft)).toMatchObject({
            name: "Codice Wispr",
            paidOn: "2026-10-01",
            firstChargeOn: null,
            billingInterval: null,
            cancelledOn: null,
            remindDaysBefore: null
        });
    });

    it("disdetta senza giorno e preavviso fuori scala", () => {
        const draft = {
            ...expenseDraftFrom(expense({}), "2026-10-03"),
            cancelled: true,
            cancelledOn: "",
            remindDaysBefore: "90"
        };
        expect(validateExpenseDraft(draft)).toEqual({
            cancelledOn: "Scegli il giorno della disdetta.",
            remindDaysBefore: "Da 0 a 60 giorni."
        });
    });

    it("promemoria spento: null", () => {
        const draft = { ...expenseDraftFrom(expense({}), "2026-10-03"), remind: false };
        expect(expenseDraftToInput(draft).remindDaysBefore).toBeNull();
    });
});
