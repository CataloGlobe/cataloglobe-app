/**
 * Sezione costi del CRM: totali, mesi e form. Puro, provato in
 * `src/tests/crmExpenses.test.ts`. Gli addebiti arrivano già calcolati da
 * `crm_expense_charges` (una regola sola, in SQL): qui si sommano soltanto.
 */
import {
    formatEuroCents,
    monthlyEquivalentCents,
    parseEuroToCents,
    type CrmBillingInterval,
    type CrmExpenseCategory,
    type CrmExpenseKind
} from "@shared/crmExpenses";
import type { CrmExpense, CrmExpenseAccount, CrmExpenseCharge, CrmExpenseInput, CrmExpenseTerm } from "@/types/crm";
import { termAt } from "@/utils/crm/expenseTerms";

const MONTHS = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];

/** «AAAA-MM-GG» del giorno a Roma. */
export function romeTodayIso(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);
}

/** «ottobre 2026» da «2026-10». */
export function formatMonthIt(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
}

/** «2 nov 2026» da «AAAA-MM-GG». */
export function formatShortDateIt(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function previousMonth(month: string): string {
    const [y, m] = month.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface CrmExpenseMonth {
    /** «AAAA-MM». */
    month: string;
    totalCents: number;
    oneOffCents: number;
    subscriptionCents: number;
    /** Per categoria, rimborsi tolti; solo quelle con addebiti nel mese. */
    byCategory: Partial<Record<CrmExpenseCategory, number>>;
}

export interface CrmExpenseSummary {
    thisMonthCents: number;
    sinceStartCents: number;
    /** Dal mese corrente al primo addebito, compresi i mesi a zero. */
    months: CrmExpenseMonth[];
}

/** Totali degli addebiti fino a `today` compreso. */
export function summarizeCharges(
    charges: CrmExpenseCharge[],
    expenses: CrmExpense[],
    today: string
): CrmExpenseSummary {
    const kindOf = new Map(expenses.map(e => [e.id, e.kind]));
    const categoryOf = new Map(expenses.map(e => [e.id, e.category]));
    const byMonth = new Map<string, CrmExpenseMonth>();
    const currentMonth = today.slice(0, 7);
    let sinceStartCents = 0;
    let firstMonth = currentMonth;

    for (const charge of charges) {
        if (charge.chargedOn > today) continue;
        const month = charge.chargedOn.slice(0, 7);
        const row = byMonth.get(month) ?? { month, totalCents: 0, oneOffCents: 0, subscriptionCents: 0, byCategory: {} };
        row.totalCents += charge.amountCents;
        const category = categoryOf.get(charge.expenseId) ?? "other";
        row.byCategory[category] = (row.byCategory[category] ?? 0) + charge.amountCents;
        if (kindOf.get(charge.expenseId) === "subscription") row.subscriptionCents += charge.amountCents;
        else row.oneOffCents += charge.amountCents;
        byMonth.set(month, row);
        sinceStartCents += charge.amountCents;
        if (month < firstMonth) firstMonth = month;
    }

    const months: CrmExpenseMonth[] = [];
    if (byMonth.size > 0) {
        for (let m = currentMonth; m >= firstMonth; m = previousMonth(m)) {
            months.push(byMonth.get(m) ?? { month: m, totalCents: 0, oneOffCents: 0, subscriptionCents: 0, byCategory: {} });
        }
    }

    return {
        thisMonthCents: byMonth.get(currentMonth)?.totalCents ?? 0,
        sinceStartCents,
        months
    };
}

/**
 * Quanto pesano al mese gli abbonamenti ancora attivi (l'annuale diviso 12),
 * al prezzo del prossimo addebito: un «Cambia da…» già deciso conta.
 */
export function recurringMonthlyCents(
    expenses: CrmExpense[],
    nextCharges: Map<string, string>,
    terms: CrmExpenseTerm[] = []
): number {
    return expenses.reduce((sum, e) => {
        const next = nextCharges.get(e.id);
        if (e.kind !== "subscription" || !e.billing_interval || !next) return sum;
        return sum + monthlyEquivalentCents(termAt(e, terms, next).amountCents, e.billing_interval);
    }, 0);
}

export interface CostsOverview {
    /** Addebiti fino a oggi, meno i rimborsi. */
    spentSoFarCents: number;
    /** Abbonamenti attivi al mese, da ora (annuali /12, se contati). */
    monthlyFromNowCents: number;
    /** La parte di `monthlyFromNowCents` che il prossimo addebito prende da un conto comune aperto. */
    monthlyOnJointCents: number;
    /** Ricarica mensile a testa sul cointestato: metà del mensile, all'euro in su. */
    rechargePerPersonCents: number;
    /** Abbonamenti attivi il cui prossimo addebito sta su un conto chiuso. */
    toMove: { expense: CrmExpense; accountName: string; nextChargeOn: string }[];
    /** Gli annuali attivi: quanto l'anno e quanti, contati o no nel mensile. */
    yearlyCents: number;
    yearlyCount: number;
}

/**
 * Il quadro in cima a Costi (decisione di Alex del 2026-10-16): la ricarica
 * conta tutti gli abbonamenti attivi, non solo quelli già sul cointestato,
 * perché tutto si sposta lì; le una tantum restano fuori.
 */
export function buildCostsOverview({
    expenses,
    charges,
    nextCharges,
    terms,
    accounts,
    today,
    people = 2,
    includeYearly = true
}: {
    expenses: CrmExpense[];
    /** Addebiti e rimborsi (negativi). */
    charges: CrmExpenseCharge[];
    nextCharges: Map<string, string>;
    terms: CrmExpenseTerm[];
    accounts: CrmExpenseAccount[];
    today: string;
    people?: number;
    /** false: costo al mese e ricarica coi soli mensili (D258, Alex 2026-10-16). */
    includeYearly?: boolean;
}): CostsOverview {
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const spentSoFarCents = charges.reduce((sum, c) => (c.chargedOn <= today ? sum + c.amountCents : sum), 0);
    let monthlyFromNowCents = 0;
    let monthlyOnJointCents = 0;
    let yearlyCents = 0;
    let yearlyCount = 0;
    const toMove: CostsOverview["toMove"] = [];

    for (const e of expenses) {
        const next = nextCharges.get(e.id);
        if (e.kind !== "subscription" || !e.billing_interval || !next) continue;
        const term = termAt(e, terms, next);
        if (e.billing_interval === "year") {
            yearlyCents += term.amountCents;
            yearlyCount += 1;
        }
        const counted = includeYearly || e.billing_interval !== "year";
        const monthly = counted ? monthlyEquivalentCents(term.amountCents, e.billing_interval) : 0;
        monthlyFromNowCents += monthly;
        const account = term.accountId ? accountById.get(term.accountId) : undefined;
        if (!account) continue;
        if (account.closed_on && account.closed_on <= next) {
            toMove.push({ expense: e, accountName: account.name, nextChargeOn: next });
        } else if (account.kind === "joint" && counted) {
            monthlyOnJointCents += monthly;
        }
    }

    toMove.sort((a, b) => a.nextChargeOn.localeCompare(b.nextChargeOn));
    const rechargePerPersonCents = people > 0 ? Math.ceil(monthlyFromNowCents / people / 100) * 100 : 0;
    return { spentSoFarCents, monthlyFromNowCents, monthlyOnJointCents, rechargePerPersonCents, toMove, yearlyCents, yearlyCount };
}

export interface CrmUpcomingRenewal {
    expense: CrmExpense;
    nextChargeOn: string;
}

/** Abbonamenti attivi, dal rinnovo più vicino. */
export function upcomingRenewals(
    expenses: CrmExpense[],
    nextCharges: Map<string, string>
): CrmUpcomingRenewal[] {
    return expenses
        .filter(e => nextCharges.has(e.id))
        .map(e => ({ expense: e, nextChargeOn: nextCharges.get(e.id) as string }))
        .sort((a, b) =>
            a.nextChargeOn === b.nextChargeOn
                ? a.expense.name.localeCompare(b.expense.name, "it")
                : a.nextChargeOn < b.nextChargeOn ? -1 : 1
        );
}

// -----------------------------------------------------------------------------
// Form
// -----------------------------------------------------------------------------

export interface CrmExpenseDraft {
    kind: CrmExpenseKind;
    name: string;
    category: CrmExpenseCategory;
    /** Come scritto («109,80»). */
    amount: string;
    paidBy: string;
    /** Carta o conto; "" = nessuno (si usa «Pagata da»). */
    accountId: string;
    paidOn: string;
    firstChargeOn: string;
    billingInterval: CrmBillingInterval;
    cancelled: boolean;
    cancelledOn: string;
    remind: boolean;
    /** Come scritto, giorni prima del rinnovo. */
    remindDaysBefore: string;
    notes: string;
}

export type CrmExpenseDraftErrors = Partial<Record<keyof CrmExpenseDraft, string>>;

function centsToInput(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
}

export function expenseDraftFrom(expense: CrmExpense | null, today: string): CrmExpenseDraft {
    if (!expense) {
        return {
            kind: "subscription",
            name: "",
            category: "software",
            amount: "",
            paidBy: "",
            accountId: "",
            paidOn: today,
            firstChargeOn: today,
            billingInterval: "month",
            cancelled: false,
            cancelledOn: today,
            remind: true,
            remindDaysBefore: "3",
            notes: ""
        };
    }
    return {
        kind: expense.kind,
        name: expense.name,
        category: expense.category,
        amount: centsToInput(expense.amount_cents),
        paidBy: expense.paid_by ?? "",
        accountId: expense.account_id ?? "",
        paidOn: expense.paid_on ?? today,
        firstChargeOn: expense.first_charge_on ?? today,
        billingInterval: expense.billing_interval ?? "month",
        cancelled: expense.cancelled_on != null,
        cancelledOn: expense.cancelled_on ?? today,
        remind: expense.remind_days_before != null,
        remindDaysBefore: String(expense.remind_days_before ?? 3),
        notes: expense.notes ?? ""
    };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateExpenseDraft(draft: CrmExpenseDraft): CrmExpenseDraftErrors {
    const errors: CrmExpenseDraftErrors = {};
    if (!draft.name.trim()) errors.name = "Scrivi cosa hai pagato.";
    if (parseEuroToCents(draft.amount) == null) {
        errors.amount = "Scrivi un importo in euro, per esempio 109,80.";
    }
    if (draft.kind === "one_off") {
        if (!DATE_RE.test(draft.paidOn)) errors.paidOn = "Scegli il giorno del pagamento.";
    } else {
        if (!DATE_RE.test(draft.firstChargeOn)) errors.firstChargeOn = "Scegli il giorno del primo addebito.";
        // Disdetta prima del primo addebito: ammessa (disdetto prima del
        // rinnovo, l'addebito non arriva mai).
        if (draft.cancelled && !DATE_RE.test(draft.cancelledOn)) {
            errors.cancelledOn = "Scegli il giorno della disdetta.";
        }
        if (draft.remind) {
            const days = Number(draft.remindDaysBefore);
            if (!/^\d+$/.test(draft.remindDaysBefore.trim()) || days > 60) {
                errors.remindDaysBefore = "Da 0 a 60 giorni.";
            }
        }
    }
    return errors;
}

/** Da chiamare solo con una bozza senza errori. */
export function expenseDraftToInput(draft: CrmExpenseDraft): CrmExpenseInput {
    const isSubscription = draft.kind === "subscription";
    return {
        kind: draft.kind,
        name: draft.name.trim(),
        category: draft.category,
        amountCents: parseEuroToCents(draft.amount) as number,
        paidBy: draft.paidBy.trim() || null,
        accountId: draft.accountId || null,
        paidOn: isSubscription ? null : draft.paidOn,
        firstChargeOn: isSubscription ? draft.firstChargeOn : null,
        billingInterval: isSubscription ? draft.billingInterval : null,
        cancelledOn: isSubscription && draft.cancelled ? draft.cancelledOn : null,
        remindDaysBefore: isSubscription && draft.remind ? Number(draft.remindDaysBefore.trim()) : null,
        notes: draft.notes.trim() || null
    };
}

// -----------------------------------------------------------------------------
// Riga veloce e «Quanto spesso» (D38, scelta da Alex il 2026-10-05)
// -----------------------------------------------------------------------------

/** Come la dice il form: una sola scelta al posto di Tipo + Si rinnova. */
export type CrmExpenseFrequency = "once" | "month" | "year";

export const CRM_EXPENSE_FREQUENCY_OPTIONS: { value: CrmExpenseFrequency; label: string }[] = [
    { value: "once", label: "Una volta" },
    { value: "month", label: "Ogni mese" },
    { value: "year", label: "Ogni anno" }
];

export function frequencyOf(draft: CrmExpenseDraft): CrmExpenseFrequency {
    return draft.kind === "one_off" ? "once" : draft.billingInterval;
}

/** La data a vista: «Pagata il» per una volta, il primo addebito per gli abbonamenti. */
export function expenseDateOf(draft: CrmExpenseDraft): string {
    return draft.kind === "one_off" ? draft.paidOn : draft.firstChargeOn;
}

/** La data vale per tutte e due le forme: cambiando frequenza non si perde. */
export function withExpenseDate(draft: CrmExpenseDraft, date: string): CrmExpenseDraft {
    return { ...draft, paidOn: date, firstChargeOn: date };
}

export function withFrequency(draft: CrmExpenseDraft, frequency: CrmExpenseFrequency): CrmExpenseDraft {
    const date = expenseDateOf(draft);
    const next: CrmExpenseDraft =
        frequency === "once"
            ? { ...draft, kind: "one_off" }
            : { ...draft, kind: "subscription", billingInterval: frequency };
    return withExpenseDate(next, date);
}

/** Bozza vuota della riga veloce: chi è entrato paga, categoria «Altro». */
export function quickExpenseDraft(today: string, paidBy: string): CrmExpenseDraft {
    return { ...expenseDraftFrom(null, today), category: "other", paidBy };
}

function nameKey(name: string): string {
    return name.trim().toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Spese già viste che somigliano a quello che si sta scrivendo: l'ultima per
 * ogni nome, prima chi comincia così, poi chi lo contiene. Da 2 lettere.
 */
export function suggestExpenses(expenses: CrmExpense[], typed: string, limit = 3): CrmExpense[] {
    const q = nameKey(typed);
    if (q.length < 2) return [];
    const latest = new Map<string, CrmExpense>();
    for (const e of expenses) {
        const key = nameKey(e.name);
        const seen = latest.get(key);
        if (!seen || e.created_at > seen.created_at) latest.set(key, e);
    }
    const starts: CrmExpense[] = [];
    const contains: CrmExpense[] = [];
    for (const [key, e] of latest) {
        if (key.startsWith(q)) starts.push(e);
        else if (key.includes(q)) contains.push(e);
    }
    const byName = (a: CrmExpense, b: CrmExpense) => a.name.localeCompare(b.name, "it");
    return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** Come l'ultima con quel nome, con la data di oggi; disdetta e note no. */
export function draftFromPrevious(expense: CrmExpense, today: string): CrmExpenseDraft {
    const base = expenseDraftFrom(expense, today);
    return withExpenseDate({ ...base, cancelled: false, cancelledOn: today, notes: "" }, today);
}

/** «90,00 € al mese, 1.080,00 € l'anno»; null finché l'importo non è valido. */
export function expenseDraftSummary(draft: CrmExpenseDraft): string | null {
    const cents = parseEuroToCents(draft.amount);
    if (cents == null) return null;
    const amount = formatEuroCents(cents);
    switch (frequencyOf(draft)) {
        case "once":
            return `${amount} una volta sola`;
        case "month":
            return `${amount} al mese, ${formatEuroCents(cents * 12)} l'anno`;
        case "year":
            return `${amount} l'anno, ${formatEuroCents(monthlyEquivalentCents(cents, "year"))} al mese`;
    }
}
