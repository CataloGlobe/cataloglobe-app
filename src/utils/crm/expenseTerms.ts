/**
 * Carte e conti, cambi da una data e rimborsi (mig 20261016120000, piano di
 * Alex del 2026-10-16). Puro.
 *
 * Regole:
 *   * un term vale dall'addebito con data uguale o successiva a `valid_from`
 *     (la stessa regola di `crm_expense_charges`, che ne prende l'importo);
 *   * il conto di un addebito è quello dell'ultimo term con un conto, se no
 *     `crm_expenses.account_id`: spostare un abbonamento non cambia chi ha
 *     pagato i mesi prima;
 *   * un rimborso pesa su chi pagava la spesa il giorno del rimborso;
 *   * un conto chiuso con abbonamenti ancora attivi vuol dire «da spostare»:
 *     gli addebiti restano suoi (il saldo del conto va in negativo) finché un
 *     «Cambia da…» non li sposta; il quadro li elenca in `toMove`;
 *   * un conto personale il cui titolare non è nel team ricade su `paid_by`;
 *   * senza conto si ricade su `paid_by` (righe vecchie).
 */
import type { CrmExpense, CrmExpenseAccount, CrmExpenseCharge, CrmExpenseRefund, CrmExpenseTerm } from "@/types/crm";

/** Chi paga un addebito: un conto comune (metà a testa) o una persona. */
export type ChargePayer =
    | { type: "joint"; accountId: string | null }
    | { type: "person"; name: string; accountId: string | null }
    | { type: "none" };

export interface PayerContext {
    expenses: CrmExpense[];
    terms: CrmExpenseTerm[];
    accounts: CrmExpenseAccount[];
    /** `crm_team_members.user_id` → `display_name`. */
    memberNames: Map<string, string>;
    /** Per le righe senza conto: `paid_by` è il conto comune? */
    isJointName: (name: string | null | undefined) => boolean;
}

function termsByExpense(terms: CrmExpenseTerm[]): Map<string, CrmExpenseTerm[]> {
    const map = new Map<string, CrmExpenseTerm[]>();
    for (const t of terms) {
        const list = map.get(t.expense_id) ?? [];
        list.push(t);
        map.set(t.expense_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    return map;
}

/** Importo e conto di un abbonamento a una data. */
export function termAt(
    expense: CrmExpense,
    terms: CrmExpenseTerm[],
    date: string
): { amountCents: number; accountId: string | null } {
    let amountCents = expense.amount_cents;
    let accountId = expense.account_id;
    if (expense.kind !== "subscription") return { amountCents, accountId };
    const own = terms.filter(t => t.expense_id === expense.id).sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    for (const t of own) {
        if (t.valid_from > date) break;
        // Come crm_expense_charges: il primo addebito è sempre amount_cents,
        // anche se first_charge_on è stato spostato dopo un term.
        if (expense.first_charge_on && t.valid_from <= expense.first_charge_on) continue;
        amountCents = t.amount_cents;
        if (t.account_id) accountId = t.account_id;
    }
    return { amountCents, accountId };
}

/** Una funzione che dice chi paga la spesa `expenseId` il giorno `date`. */
export function payerResolver(ctx: PayerContext): (expenseId: string, date: string) => ChargePayer {
    const expenses = new Map(ctx.expenses.map(e => [e.id, e]));
    const accounts = new Map(ctx.accounts.map(a => [a.id, a]));
    const byExpense = termsByExpense(ctx.terms);

    return (expenseId, date) => {
        const expense = expenses.get(expenseId);
        if (!expense) return { type: "none" };
        const { accountId } = termAt(expense, byExpense.get(expenseId) ?? [], date);
        const account = accountId ? accounts.get(accountId) : undefined;
        if (account) {
            if (account.kind === "joint") return { type: "joint", accountId: account.id };
            const owner = account.owner_member_id ? ctx.memberNames.get(account.owner_member_id) : undefined;
            if (owner) return { type: "person", name: owner, accountId: account.id };
        }
        if (ctx.isJointName(expense.paid_by)) return { type: "joint", accountId: null };
        const name = (expense.paid_by ?? "").trim();
        return name ? { type: "person", name, accountId: null } : { type: "none" };
    };
}

/** I rimborsi come addebiti negativi, nel giorno in cui sono rientrati. */
export function refundsAsCharges(refunds: CrmExpenseRefund[]): CrmExpenseCharge[] {
    return refunds.map(r => ({ expenseId: r.expense_id, chargedOn: r.refunded_on, amountCents: -r.amount_cents }));
}

/** Il `paid_by` da scrivere per un conto, finché promemoria e righe vecchie lo leggono. */
export function paidByForAccount(
    account: CrmExpenseAccount,
    memberNames: Map<string, string>,
    jointName: string
): string | null {
    if (account.kind === "joint") return jointName;
    return account.owner_member_id ? (memberNames.get(account.owner_member_id) ?? null) : null;
}
