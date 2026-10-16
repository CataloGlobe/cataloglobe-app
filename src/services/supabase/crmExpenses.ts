/**
 * Sezione costi del CRM (/admin/costi): spese inserite a mano.
 *
 * Tabella di piattaforma `crm_expenses` (migration 20261003120000): niente
 * tenant_id, RLS su `is_platform_admin()`. Gli addebiti non sono righe: li
 * calcola `crm_expense_charges` (20261003120100), una regola sola per la
 * pagina e per il promemoria dei rinnovi.
 */
import { supabase } from "@/services/supabase/client";
import type {
    CrmExpense,
    CrmExpenseAccount,
    CrmExpenseAccountInput,
    CrmExpenseCharge,
    CrmExpenseInput,
    CrmExpenseRefund,
    CrmExpenseRefundInput,
    CrmExpenseSettlement,
    CrmExpenseSettlementInput,
    CrmExpenseTerm,
    CrmExpenseTermInput
} from "@/types/crm";

export async function listCrmExpenses(): Promise<CrmExpense[]> {
    const { data, error } = await supabase
        .from("crm_expenses")
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmExpense[];
}

type ChargeRow = { r_expense_id: string; r_charged_on: string; r_amount_cents: number };

/** Addebiti fino a `until` compreso («AAAA-MM-GG»). */
export async function listCrmExpenseCharges(until: string): Promise<CrmExpenseCharge[]> {
    const { data, error } = await supabase.rpc("crm_expense_charges", { p_until: until });
    if (error) throw error;
    return ((data ?? []) as ChargeRow[]).map(row => ({
        expenseId: row.r_expense_id,
        chargedOn: row.r_charged_on,
        amountCents: row.r_amount_cents
    }));
}

type NextChargeRow = { r_expense_id: string; r_next_charge_on: string };

/** Prossimo addebito di ogni abbonamento attivo, da `today` compreso. */
export async function listCrmExpenseNextCharges(today: string): Promise<Map<string, string>> {
    const { data, error } = await supabase.rpc("crm_expense_next_charges", { p_today: today });
    if (error) throw error;
    return new Map(((data ?? []) as NextChargeRow[]).map(row => [row.r_expense_id, row.r_next_charge_on]));
}

function toRow(input: CrmExpenseInput) {
    const isSubscription = input.kind === "subscription";
    return {
        kind: input.kind,
        name: input.name,
        category: input.category,
        amount_cents: input.amountCents,
        paid_by: input.paidBy,
        // Solo se c'è: prima della mig 20261016120000 la colonna non esiste
        // e una chiave in più farebbe fallire ogni salvataggio (PGRST204).
        ...(input.accountId ? { account_id: input.accountId } : {}),
        paid_on: isSubscription ? null : input.paidOn,
        first_charge_on: isSubscription ? input.firstChargeOn : null,
        billing_interval: isSubscription ? input.billingInterval : null,
        cancelled_on: isSubscription ? input.cancelledOn : null,
        remind_days_before: isSubscription ? input.remindDaysBefore : null,
        notes: input.notes
    };
}

export async function createCrmExpense(input: CrmExpenseInput): Promise<CrmExpense> {
    const { data, error } = await supabase
        .from("crm_expenses")
        .insert(toRow(input))
        .select("*")
        .single();
    if (error) throw error;
    return data as CrmExpense;
}

/**
 * `reminded_for` non si tocca: è la data del rinnovo già ricordato, e se la
 * data cambia il rinnovo nuovo è diverso e viene ricordato comunque.
 */
export async function updateCrmExpense(id: string, input: CrmExpenseInput): Promise<CrmExpense> {
    const { data, error } = await supabase
        .from("crm_expenses")
        .update(toRow(input))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw error;
    return data as CrmExpense;
}

export async function deleteCrmExpense(id: string): Promise<void> {
    const { error } = await supabase.from("crm_expenses").delete().eq("id", id);
    if (error) throw error;
}

// -----------------------------------------------------------------------------
// Chi ha pagato cosa: rimborsi e versamenti sul conto comune (mig 20261005180000)
// -----------------------------------------------------------------------------

/** I movimenti tra le persone, i più recenti prima. */
export async function listCrmExpenseSettlements(): Promise<CrmExpenseSettlement[]> {
    const { data, error } = await supabase
        .from("crm_expense_settlements")
        .select("*")
        .order("settled_on", { ascending: false })
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmExpenseSettlement[];
}

/** Più movimenti insieme («Segna come pareggiato»): tutti o nessuno. */
export async function createCrmExpenseSettlements(inputs: CrmExpenseSettlementInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const { error } = await supabase.from("crm_expense_settlements").insert(
        inputs.map(input => ({
            from_name: input.fromName.trim(),
            to_name: input.toName.trim(),
            amount_cents: input.amountCents,
            settled_on: input.settledOn,
            note: input.note,
            ...(input.accountId ? { account_id: input.accountId } : {})
        }))
    );
    if (error) throw error;
}

export async function deleteCrmExpenseSettlement(id: string): Promise<void> {
    const { error } = await supabase.from("crm_expense_settlements").delete().eq("id", id);
    if (error) throw error;
}

// -----------------------------------------------------------------------------
// Carte e conti, cambi da una data, rimborsi (mig 20261016120000)
// -----------------------------------------------------------------------------

/** Carte e conti, prima quelli aperti, per nome. */
export async function listCrmExpenseAccounts(): Promise<CrmExpenseAccount[]> {
    const { data, error } = await supabase
        .from("crm_expense_accounts")
        .select("*")
        .order("closed_on", { ascending: true, nullsFirst: true })
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CrmExpenseAccount[];
}

export async function createCrmExpenseAccount(input: CrmExpenseAccountInput): Promise<CrmExpenseAccount> {
    const { data, error } = await supabase
        .from("crm_expense_accounts")
        .insert({
            name: input.name.trim(),
            kind: input.kind,
            owner_member_id: input.kind === "personal" ? input.ownerMemberId : null
        })
        .select("*")
        .single();
    if (error) throw error;
    return data as CrmExpenseAccount;
}

/** Chiude un conto (resta nello storico) o lo riapre con `closedOn` null. */
export async function setCrmExpenseAccountClosed(id: string, closedOn: string | null): Promise<void> {
    const { error } = await supabase.from("crm_expense_accounts").update({ closed_on: closedOn }).eq("id", id);
    if (error) throw error;
}

export async function listCrmExpenseTerms(): Promise<CrmExpenseTerm[]> {
    const { data, error } = await supabase
        .from("crm_expense_terms")
        .select("*")
        .order("valid_from", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CrmExpenseTerm[];
}

/** «Cambia da…». Errori 22023 dal trigger: `term_not_subscription`, `term_before_first_charge`. */
export async function createCrmExpenseTerm(input: CrmExpenseTermInput): Promise<void> {
    const { error } = await supabase.from("crm_expense_terms").insert({
        expense_id: input.expenseId,
        valid_from: input.validFrom,
        amount_cents: input.amountCents,
        account_id: input.accountId
    });
    if (error) throw error;
}

export async function deleteCrmExpenseTerm(id: string): Promise<void> {
    const { error } = await supabase.from("crm_expense_terms").delete().eq("id", id);
    if (error) throw error;
}

export async function listCrmExpenseRefunds(): Promise<CrmExpenseRefund[]> {
    const { data, error } = await supabase
        .from("crm_expense_refunds")
        .select("*")
        .order("refunded_on", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CrmExpenseRefund[];
}

export async function createCrmExpenseRefund(input: CrmExpenseRefundInput): Promise<void> {
    const { error } = await supabase.from("crm_expense_refunds").insert({
        expense_id: input.expenseId,
        refunded_on: input.refundedOn,
        amount_cents: input.amountCents,
        note: input.note
    });
    if (error) throw error;
}

export async function deleteCrmExpenseRefund(id: string): Promise<void> {
    const { error } = await supabase.from("crm_expense_refunds").delete().eq("id", id);
    if (error) throw error;
}
