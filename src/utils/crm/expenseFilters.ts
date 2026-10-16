import type { CrmExpenseCategory, CrmExpenseSettlement } from "@/types/crm";
import { isJointAccount, payerKey } from "@/utils/crm/expenseBalance";
import type { ChargePayer } from "@/utils/crm/expenseTerms";

/** «comune» nell'indirizzo = i conti comuni; un nome = quella persona. */
export const JOINT_FILTER = "comune";

/**
 * Filtri delle spese (Alex, 2026-10-16): chi paga e tipo, a scelta multipla,
 * validi in tutte le schede. Vuoto = tutti.
 */
export interface ExpenseFilters {
    who: string[];
    types: CrmExpenseCategory[];
}

/** «a,b» dall'indirizzo, tenendo solo i valori ammessi. */
export function parseFilterList<T extends string>(raw: string | null, allowed: (value: string) => value is T): T[] {
    if (!raw) return [];
    return [...new Set(raw.split(",").map(v => v.trim()))].filter(allowed);
}

export function payerMatches(payer: ChargePayer, who: string[]): boolean {
    if (who.length === 0) return true;
    if (payer.type === "joint") return who.includes(JOINT_FILTER);
    if (payer.type === "person") return who.some(w => w !== JOINT_FILTER && payerKey(w) === payerKey(payer.name));
    return false;
}

/** Un movimento passa se l'ha fatto o ricevuto chi è scelto; il filtro per tipo lo lascia fuori: non è una spesa. */
export function moveMatches(move: CrmExpenseSettlement, filters: ExpenseFilters): boolean {
    if (filters.types.length > 0) return false;
    if (filters.who.length === 0) return true;
    return filters.who.some(w =>
        w === JOINT_FILTER
            ? isJointAccount(move.to_name) || isJointAccount(move.from_name)
            : payerKey(w) === payerKey(move.from_name) || payerKey(w) === payerKey(move.to_name)
    );
}

export function categoryMatches(category: CrmExpenseCategory, types: CrmExpenseCategory[]): boolean {
    return types.length === 0 || types.includes(category);
}
