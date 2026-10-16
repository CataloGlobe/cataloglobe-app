import { describe, expect, it } from "vitest";
import { formatEuroCents } from "@shared/crmExpenses";
import type { CrmExpense, CrmExpenseAccount, CrmExpenseTerm } from "@/types/crm";
import {
    accountDraftToInput,
    termDraftFor,
    termDraftPreview,
    termDraftToInput,
    validateAccountDraft,
    validateRefundDraft,
    validateTermDraft
} from "@/utils/crm/expenseForms";

const cointestato: CrmExpenseAccount = {
    id: "a-joint",
    name: "Revolut cointestato",
    kind: "joint",
    owner_member_id: null,
    closed_on: null,
    created_at: "",
    updated_at: ""
};

const sub: CrmExpense = {
    id: "e-1",
    kind: "subscription",
    name: "Claude",
    category: "software",
    amount_cents: 1000,
    paid_by: "Alex",
    account_id: null,
    paid_on: null,
    first_charge_on: "2026-01-31",
    billing_interval: "month",
    cancelled_on: null,
    remind_days_before: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: ""
} as CrmExpense;

const term = (validFrom: string, amountCents: number, accountId: string | null = null): CrmExpenseTerm => ({
    id: `t-${validFrom}`,
    expense_id: sub.id,
    valid_from: validFrom,
    amount_cents: amountCents,
    account_id: accountId,
    created_at: ""
});

describe("validateAccountDraft", () => {
    it("rifiuta numeri di carta anche scritti a gruppi", () => {
        const errors = validateAccountDraft({ name: "Carta 1234 5678 9012", kind: "joint", ownerMemberId: "" }, []);
        expect(errors.name).toMatch(/numeri/);
    });

    it("nome già usato, senza maiuscole; personale senza titolare", () => {
        const errors = validateAccountDraft({ name: " revolut  COINTESTATO ", kind: "personal", ownerMemberId: "" }, [cointestato]);
        expect(errors.name).toMatch(/già/);
        expect(errors.ownerMemberId).toBeDefined();
    });

    it("comune: il titolare non si scrive", () => {
        expect(accountDraftToInput({ name: " Qonto ", kind: "joint", ownerMemberId: "m-1" })).toEqual({
            name: "Qonto",
            kind: "joint",
            ownerMemberId: null
        });
    });
});

describe("Cambia da…", () => {
    it("parte dal prossimo addebito, al prezzo che varrà quel giorno", () => {
        expect(termDraftFor(sub, [term("2026-03-31", 2000)], "2026-04-15")).toEqual({
            validFrom: "2026-04-30",
            amount: "20,00",
            accountId: ""
        });
    });

    it("niente sul primo addebito o prima, niente due cambi lo stesso giorno", () => {
        const ok = { validFrom: "2026-03-31", amount: "20", accountId: "" };
        expect(validateTermDraft(ok, sub, [])).toEqual({});
        expect(validateTermDraft({ ...ok, validFrom: "2026-01-31" }, sub, []).validFrom).toMatch(/dopo il primo addebito/);
        expect(validateTermDraft(ok, sub, [term("2026-03-31", 1500)]).validFrom).toMatch(/già un cambio/);
        expect(validateTermDraft({ ...ok, amount: "venti" }, sub, []).amount).toBeDefined();
    });

    it("l'anteprima dice data, prezzo e conto del primo addebito toccato", () => {
        const draft = { validFrom: "2026-03-15", amount: "20", accountId: cointestato.id };
        expect(termDraftPreview(draft, sub, [], [cointestato])).toBe(
            `Il primo addebito a ${formatEuroCents(2000)} sarà il 31 mar 2026, su Revolut cointestato. I mesi prima restano come sono.`
        );
        expect(termDraftPreview(draft, { ...sub, cancelled_on: "2026-03-20" }, [], [cointestato])).toMatch(/disdetto/);
        expect(termDraftToInput(draft, sub.id)).toEqual({
            expenseId: sub.id,
            validFrom: "2026-03-15",
            amountCents: 2000,
            accountId: cointestato.id
        });
    });
});

describe("validateRefundDraft", () => {
    it("giorno e importo obbligatori", () => {
        expect(validateRefundDraft({ refundedOn: "2026-04-02", amount: "5", note: "" })).toEqual({});
        const errors = validateRefundDraft({ refundedOn: "", amount: "", note: "" });
        expect(errors.refundedOn).toBeDefined();
        expect(errors.amount).toBeDefined();
    });
});
