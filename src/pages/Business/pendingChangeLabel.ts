import type { BillingInterval } from "@/types/plan";
import { INTERVAL_ADJECTIVE } from "@/utils/planPricing";

export type PendingChangeLabelInput = {
    planName: string;
    seats: number;
    /** Billing interval of the future phase; null when not resolvable. */
    interval: BillingInterval | null;
    /** Already formatted date ("17 ottobre 2027"). */
    dateLabel: string;
};

/**
 * Label of the "Prossimo cambio" summary. The interval is named whenever it
 * is known (passo 4b): a year → month change keeps plan and seats, so without
 * it the banner would read as a change to itself — and this line is where the
 * customer checks that the request was taken.
 */
export function formatPendingChangeLabel(input: PendingChangeLabelInput): string {
    const seats = `${input.seats} ${input.seats === 1 ? "sede" : "sedi"}`;
    const interval = input.interval ? ` · fatturazione ${INTERVAL_ADJECTIVE[input.interval]}` : "";
    return `${input.planName} · ${seats}${interval} dal ${input.dateLabel}`;
}
