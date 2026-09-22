import type { ActivityFee, ActivityFeeKey } from "@/types/activity";
import { FEE_DEFINITIONS } from "@/constants/activityFees";

export type FeesState = Record<ActivityFeeKey, string>;

export function feesToState(fees: ActivityFee[] | null | undefined): FeesState {
    const next: FeesState = {
        coperto: "",
        servizio: "",
        prenotazione_minima: "",
        spesa_minima: "",
        eta_minima: ""
    };
    if (!fees) return next;
    for (const fee of fees) {
        if (fee.key in next) {
            next[fee.key] = fee.value ?? "";
        }
    }
    return next;
}

export function buildFeesPayload(state: FeesState): ActivityFee[] {
    return FEE_DEFINITIONS.map(def => {
        const raw = state[def.key]?.trim() ?? "";
        if (!raw || raw === "0") return null;
        return { key: def.key, value: raw };
    }).filter((x): x is ActivityFee => x !== null);
}

export function feesStateEqual(a: FeesState, b: FeesState): boolean {
    return FEE_DEFINITIONS.every(def => a[def.key] === b[def.key]);
}
