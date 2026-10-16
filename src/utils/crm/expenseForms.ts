/**
 * Form piccoli dei costi: carta o conto, «Cambia da…», rimborso (mig
 * 20261016120000). Puro, provato in `src/tests/crmExpenseForms.test.ts`.
 * Il database ripete i controlli che contano (CHECK e trigger 22023): qui
 * servono a dirlo in parole prima di salvare.
 */
import { formatEuroCents, parseEuroToCents } from "@shared/crmExpenses";
import type {
    CrmExpense,
    CrmExpenseAccount,
    CrmExpenseAccountInput,
    CrmExpenseAccountKind,
    CrmExpenseRefundInput,
    CrmExpenseTerm,
    CrmExpenseTermInput
} from "@/types/crm";
import { formatShortDateIt } from "@/utils/crm/expenses";
import { chargeOnOrAfter, termAt } from "@/utils/crm/expenseTerms";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Come il CHECK di `crm_expense_accounts.name`: niente numeri di carta o di conto. */
const LONG_NUMBER_RE = /[0-9]{8,}/;

/** Un errore 23505 (riga uguale già presente). */
export function isDuplicateError(err: unknown): boolean {
    return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505";
}

// -----------------------------------------------------------------------------
// Carta o conto
// -----------------------------------------------------------------------------

export interface AccountDraft {
    name: string;
    kind: CrmExpenseAccountKind;
    /** `crm_team_members.user_id`; "" per un conto comune. */
    ownerMemberId: string;
}

export type AccountDraftErrors = Partial<Record<keyof AccountDraft, string>>;

export function validateAccountDraft(draft: AccountDraft, existing: CrmExpenseAccount[]): AccountDraftErrors {
    const errors: AccountDraftErrors = {};
    const name = draft.name.replace(/\s+/g, " ").trim();
    if (!name) errors.name = "Scrivi un nome, per esempio «Postepay Alex».";
    else if (name.length > 60) errors.name = "Massimo 60 caratteri.";
    else if (LONG_NUMBER_RE.test(name.replace(/[\s-]/g, ""))) {
        errors.name = "Niente numeri di carta o di conto: basta un nome come «Postepay Alex».";
    } else if (existing.some(a => a.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"))) {
        errors.name = "C'è già un conto con questo nome.";
    }
    if (draft.kind === "personal" && !draft.ownerMemberId) errors.ownerMemberId = "Scegli di chi è.";
    return errors;
}

export function accountDraftToInput(draft: AccountDraft): CrmExpenseAccountInput {
    return {
        name: draft.name.replace(/\s+/g, " ").trim(),
        kind: draft.kind,
        ownerMemberId: draft.kind === "personal" ? draft.ownerMemberId : null
    };
}

// -----------------------------------------------------------------------------
// «Cambia da…»
// -----------------------------------------------------------------------------

export interface TermDraft {
    validFrom: string;
    /** Come scritto («20,00»). */
    amount: string;
    /** "" = resta sul conto di prima. */
    accountId: string;
}

export type TermDraftErrors = Partial<Record<keyof TermDraft, string>>;

/** La bozza di partenza: dal prossimo addebito, allo stesso prezzo e sullo stesso conto. */
export function termDraftFor(expense: CrmExpense, terms: CrmExpenseTerm[], today: string): TermDraft {
    const from = chargeOnOrAfter(expense, today) ?? today;
    const { amountCents } = termAt(expense, terms, from);
    return { validFrom: from, amount: (amountCents / 100).toFixed(2).replace(".", ","), accountId: "" };
}

export function validateTermDraft(draft: TermDraft, expense: CrmExpense, terms: CrmExpenseTerm[]): TermDraftErrors {
    const errors: TermDraftErrors = {};
    if (!DATE_RE.test(draft.validFrom)) errors.validFrom = "Scegli il giorno.";
    else if (expense.first_charge_on && draft.validFrom <= expense.first_charge_on) {
        errors.validFrom = `Scegli un giorno dopo il primo addebito (${formatShortDateIt(expense.first_charge_on)}): per quello si modifica l'importo qui sopra.`;
    } else if (terms.some(t => t.expense_id === expense.id && t.valid_from === draft.validFrom)) {
        errors.validFrom = "C'è già un cambio da questo giorno: toglilo e rifallo.";
    }
    if (parseEuroToCents(draft.amount) == null) errors.amount = "Scrivi un importo, per esempio 20 o 19,99.";
    return errors;
}

export function termDraftToInput(draft: TermDraft, expenseId: string): CrmExpenseTermInput {
    return {
        expenseId,
        validFrom: draft.validFrom,
        amountCents: parseEuroToCents(draft.amount) as number,
        accountId: draft.accountId || null
    };
}

/** L'anteprima in parole: «Il primo addebito a 20,00 € sarà il 31 mar 2026, su Revolut cointestato.» */
export function termDraftPreview(
    draft: TermDraft,
    expense: CrmExpense,
    terms: CrmExpenseTerm[],
    accounts: CrmExpenseAccount[]
): string | null {
    const cents = parseEuroToCents(draft.amount);
    if (!DATE_RE.test(draft.validFrom) || cents == null) return null;
    const on = chargeOnOrAfter(expense, draft.validFrom);
    if (!on) return "Da quel giorno non ci sono addebiti: l'abbonamento è disdetto prima.";
    const accountId = draft.accountId || termAt(expense, terms, on).accountId;
    const account = accountId ? accounts.find(a => a.id === accountId) : undefined;
    return `Il primo addebito a ${formatEuroCents(cents)} sarà il ${formatShortDateIt(on)}${account ? `, su ${account.name}` : ""}. I mesi prima restano come sono.`;
}

// -----------------------------------------------------------------------------
// Rimborso
// -----------------------------------------------------------------------------

export interface RefundDraft {
    refundedOn: string;
    amount: string;
    note: string;
}

export type RefundDraftErrors = Partial<Record<keyof RefundDraft, string>>;

export function validateRefundDraft(draft: RefundDraft): RefundDraftErrors {
    const errors: RefundDraftErrors = {};
    if (!DATE_RE.test(draft.refundedOn)) errors.refundedOn = "Scegli il giorno in cui sono rientrati.";
    if (parseEuroToCents(draft.amount) == null) errors.amount = "Scrivi quanto è rientrato, per esempio 5 o 4,99.";
    if (draft.note.length > 300) errors.note = "Massimo 300 caratteri.";
    return errors;
}

export function refundDraftToInput(draft: RefundDraft, expenseId: string): CrmExpenseRefundInput {
    return {
        expenseId,
        refundedOn: draft.refundedOn,
        amountCents: parseEuroToCents(draft.amount) as number,
        note: draft.note.trim() || null
    };
}
