/**
 * Chi ha pagato cosa, e come si resta in pari (decisione di Alex del
 * 2026-10-05). Puro: legge addebiti, spese, movimenti e nomi del team già
 * caricati.
 *
 * Regola:
 *   * contano gli addebiti fino a oggi; ognuno pesa su chi l'ha pagato
 *     (`paid_by`, senza maiuscole né spazi in più);
 *   * le spese del conto comune non pesano su nessuno: le avete pagate
 *     insieme. I versamenti sul conto contano come spese pagate da chi versa;
 *   * le spese senza «Pagata da» restano fuori, e si dice quante sono;
 *   * il totale si divide in parti uguali fra le persone (il team, più chi
 *     compare come pagatore);
 *   * un rimborso da A a B sposta il saldo: A ha dato di più, B di meno.
 *
 * Con carte e conti (mig 20261016120000, `expenseTerms.ts`): chi paga viene
 * dal conto dell'addebito (personale = il titolare, comune = nessuno, metà a
 * testa); un versamento è sul conto comune se il suo conto è comune o se va a
 * «Conto comune». I rimborsi dei fornitori arrivano come addebiti negativi.
 * Ogni conto comune ha il suo saldo: versato meno speso.
 */
import { parseEuroToCents } from "@shared/crmExpenses";
import type {
    CrmExpense,
    CrmExpenseAccount,
    CrmExpenseCharge,
    CrmExpenseSettlement,
    CrmExpenseSettlementInput,
    CrmExpenseTerm
} from "@/types/crm";
import { payerResolver } from "@/utils/crm/expenseTerms";

export const JOINT_ACCOUNT = "Conto comune";

/** Sotto questa soglia (in centesimi) siete in pari: niente rimborsi da 3 centesimi. */
export const EVEN_TOLERANCE_CENTS = 50;

export function payerKey(name: string | null | undefined): string | null {
    const clean = (name ?? "").replace(/\s+/g, " ").trim();
    return clean ? clean.toLocaleLowerCase("it") : null;
}

export function isJointAccount(name: string | null | undefined): boolean {
    return payerKey(name) === payerKey(JOINT_ACCOUNT);
}

/** Un movimento a parole: versamento su un conto comune o soldi da una persona all'altra. */
export function settlementText(s: CrmExpenseSettlement): string {
    if (s.account_id) return `${s.from_name} versa su ${s.to_name}`;
    return isJointAccount(s.to_name) ? `${s.from_name} versa sul conto comune` : `${s.from_name} dà a ${s.to_name}`;
}

export interface PersonBalance {
    /** Il nome come lo si scrive (quello del team, se c'è). */
    name: string;
    /** Spese pagate di tasca propria, più i versamenti sul conto comune. */
    paidCents: number;
    /** Rimborsi dati meno rimborsi ricevuti. */
    settledCents: number;
    /** Positivo: deve ricevere. Negativo: deve dare. */
    balanceCents: number;
}

export interface BalanceTransfer {
    from: string;
    to: string;
    amountCents: number;
}

export interface ExpenseBalance {
    people: PersonBalance[];
    /** Quanto tocca a ciascuno (totale diviso le persone). */
    shareCents: number;
    /** Spese pagate di tasca propria più versamenti: quello che si divide. */
    sharedCents: number;
    /** Spese pagate dal conto comune. */
    jointCents: number;
    /** Spese senza «Pagata da»: restano fuori dal conto. */
    unassignedCents: number;
    unassignedCount: number;
    /** Chi dà quanto a chi per tornare in pari; vuoto se siete in pari. */
    transfers: BalanceTransfer[];
    even: boolean;
    /** Per ogni conto comune: versato, speso, saldo. `accountId` null = «Conto comune» scritto a mano. */
    jointAccounts: JointAccountBalance[];
}

export interface JointAccountBalance {
    accountId: string | null;
    depositedCents: number;
    spentCents: number;
    /** Versato meno speso: positivo = soldi ancora sul conto. */
    balanceCents: number;
}

export interface BalanceSources {
    charges: CrmExpenseCharge[];
    expenses: CrmExpense[];
    settlements: CrmExpenseSettlement[];
    /** I nomi del team (`crm_team_members.display_name`). */
    team: string[];
    today: string;
    /** Carte e conti, cambi da una data, titolari: facoltativi finché le tabelle non ci sono. */
    accounts?: CrmExpenseAccount[];
    terms?: CrmExpenseTerm[];
    memberNames?: Map<string, string>;
}

export function computeExpenseBalance({
    charges,
    expenses,
    settlements,
    team,
    today,
    accounts = [],
    terms = [],
    memberNames = new Map()
}: BalanceSources): ExpenseBalance {
    const names = new Map<string, string>();
    const paid = new Map<string, number>();
    const settled = new Map<string, number>();
    const note = (raw: string): string | null => {
        const key = payerKey(raw);
        if (!key || key === payerKey(JOINT_ACCOUNT)) return null;
        if (!names.has(key)) names.set(key, raw.replace(/\s+/g, " ").trim());
        return key;
    };
    const add = (map: Map<string, number>, key: string, cents: number) => map.set(key, (map.get(key) ?? 0) + cents);

    for (const name of team) note(name);

    const payerOf = payerResolver({ expenses, terms, accounts, memberNames, isJointName: isJointAccount });
    const jointById = new Map(accounts.filter(a => a.kind === "joint").map(a => [a.id, a]));
    const joint = new Map<string | null, JointAccountBalance>();
    const jointOf = (accountId: string | null): JointAccountBalance => {
        const entry = joint.get(accountId) ?? { accountId, depositedCents: 0, spentCents: 0, balanceCents: 0 };
        joint.set(accountId, entry);
        return entry;
    };
    let jointCents = 0;
    let unassignedCents = 0;
    const unassigned = new Set<string>();

    for (const charge of charges) {
        if (charge.chargedOn > today) continue;
        const payer = payerOf(charge.expenseId, charge.chargedOn);
        if (payer.type === "joint") {
            jointCents += charge.amountCents;
            jointOf(payer.accountId).spentCents += charge.amountCents;
            continue;
        }
        const key = payer.type === "person" ? note(payer.name) : null;
        if (!key) {
            unassignedCents += charge.amountCents;
            unassigned.add(charge.expenseId);
            continue;
        }
        add(paid, key, charge.amountCents);
    }

    for (const s of settlements) {
        if (s.settled_on > today) continue;
        const from = note(s.from_name);
        const toJointAccount = s.account_id ? jointById.get(s.account_id) : undefined;
        if (toJointAccount || isJointAccount(s.to_name)) {
            // Versamento sul conto comune: come una spesa pagata da chi versa.
            if (from) add(paid, from, s.amount_cents);
            jointOf(toJointAccount?.id ?? null).depositedCents += s.amount_cents;
            continue;
        }
        const to = note(s.to_name);
        if (from) add(settled, from, s.amount_cents);
        if (to) add(settled, to, -s.amount_cents);
    }

    const keys = [...names.keys()];
    const sharedCents = [...paid.values()].reduce((a, b) => a + b, 0);
    const shareCents = keys.length > 0 ? sharedCents / keys.length : 0;

    const people: PersonBalance[] = keys
        .map(key => {
            const paidCents = paid.get(key) ?? 0;
            const settledCents = settled.get(key) ?? 0;
            return {
                name: names.get(key) as string,
                paidCents,
                settledCents,
                balanceCents: Math.round(paidCents - shareCents + settledCents)
            };
        })
        .sort((a, b) => b.paidCents - a.paidCents || a.name.localeCompare(b.name, "it"));

    const transfers = settleTransfers(people);
    return {
        people,
        shareCents: Math.round(shareCents),
        sharedCents,
        jointCents,
        unassignedCents,
        unassignedCount: unassigned.size,
        transfers,
        even: transfers.length === 0,
        jointAccounts: [...joint.values()].map(j => ({ ...j, balanceCents: j.depositedCents - j.spentCents }))
    };
}

/** Chi deve dà a chi deve ricevere, dal debito più grande: meno passaggi possibile. */
function settleTransfers(people: PersonBalance[]): BalanceTransfer[] {
    const debtors = people.filter(p => p.balanceCents < 0).map(p => ({ name: p.name, left: -p.balanceCents }));
    const creditors = people.filter(p => p.balanceCents > 0).map(p => ({ name: p.name, left: p.balanceCents }));
    debtors.sort((a, b) => b.left - a.left);
    creditors.sort((a, b) => b.left - a.left);

    const transfers: BalanceTransfer[] = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amount = Math.min(debtors[i].left, creditors[j].left);
        if (amount >= EVEN_TOLERANCE_CENTS) transfers.push({ from: debtors[i].name, to: creditors[j].name, amountCents: amount });
        debtors[i].left -= amount;
        creditors[j].left -= amount;
        if (debtors[i].left === 0) i++;
        if (creditors[j].left === 0) j++;
    }
    return transfers;
}

/** I movimenti da salvare con «Segna come pareggiato». */
export function transfersToSettlements(transfers: BalanceTransfer[], today: string): CrmExpenseSettlementInput[] {
    return transfers.map(t => ({ fromName: t.from, toName: t.to, amountCents: t.amountCents, settledOn: today, note: "Pareggio" }));
}

/** I nomi da proporre in «Pagata da»: il team, poi il conto comune. */
export function payerSuggestions(team: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...team, JOINT_ACCOUNT]) {
        const key = payerKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(name.trim());
    }
    return out;
}

// -----------------------------------------------------------------------------
// Form «Registra un movimento»
// -----------------------------------------------------------------------------

export interface SettlementDraft {
    fromName: string;
    toName: string;
    /** Come lo si scrive: «120» o «120,50». */
    amount: string;
    settledOn: string;
    note: string;
    /** Il conto comune scelto in «A»; "" o assente = una persona o «Conto comune» a mano. */
    accountId?: string;
}

export type SettlementDraftErrors = Partial<Record<keyof SettlementDraft, string>>;

export function validateSettlementDraft(draft: SettlementDraft): SettlementDraftErrors {
    const errors: SettlementDraftErrors = {};
    if (!payerKey(draft.fromName)) errors.fromName = "Scegli chi dà i soldi.";
    if (!payerKey(draft.toName)) errors.toName = "Scegli chi li riceve.";
    else if (payerKey(draft.fromName) === payerKey(draft.toName)) errors.toName = "Serve una persona diversa.";
    if (isJointAccount(draft.fromName)) errors.fromName = "Dal conto comune non si rimborsa: scegli una persona.";
    const cents = parseEuroToCents(draft.amount);
    if (cents === null) errors.amount = "Scrivi un importo fino a 100.000 €, per esempio 120 o 120,50.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.settledOn)) errors.settledOn = "Scegli il giorno.";
    if (draft.note.length > 300) errors.note = "Massimo 300 caratteri.";
    return errors;
}

export function settlementDraftToInput(draft: SettlementDraft): CrmExpenseSettlementInput {
    return {
        fromName: draft.fromName.trim(),
        toName: draft.toName.trim(),
        amountCents: parseEuroToCents(draft.amount) as number,
        settledOn: draft.settledOn,
        note: draft.note.trim() || null,
        accountId: draft.accountId || null
    };
}

/**
 * Pareggiare con un versamento sul conto comune invece che a mano: chi deve
 * versa il doppio del debito, perché metà di quello che mette sul conto comune
 * è anche sua. Solo in due e con un solo passaggio; altrimenti null.
 */
export function evenByDeposit(balance: ExpenseBalance): { from: string; amountCents: number } | null {
    if (balance.people.length !== 2 || balance.transfers.length !== 1) return null;
    const t = balance.transfers[0];
    return { from: t.from, amountCents: t.amountCents * 2 };
}
