import type { V2Activity } from "@/types/activity";

export type InactiveReason = NonNullable<V2Activity["inactive_reason"]>;

/** La sede accesa: la vetrina si vede in rete (D147, era «Pubblicata»). */
export const ACTIVE_LABEL = "Online";

export const INACTIVE_REASON_LABEL: Record<InactiveReason, string> = {
    maintenance: "Manutenzione",
    closed: "Chiusura temporanea",
    unavailable: "Non disponibile"
};

export function formatInactiveReason(
    reason: V2Activity["inactive_reason"]
): string {
    if (!reason) return "Sospesa";
    return INACTIVE_REASON_LABEL[reason] ?? "Sospesa";
}
