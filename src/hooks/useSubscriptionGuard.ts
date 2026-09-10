import { useMemo } from "react";
import { useTenant } from "@/context/useTenant";
import type { SubscriptionStatus } from "@/types/tenant";

export interface SubscriptionGuard {
    /** true if the tenant can create/edit/delete resources */
    canEdit: boolean;
    /** Current subscription status */
    status: SubscriptionStatus | null;
    /** Days remaining in trial (null if not trialing) */
    trialDaysLeft: number | null;
    /** Whether the tenant has ever completed a Stripe checkout (stripe_subscription_id set, never cleared) */
    hasSubscriptionRecord: boolean;
    /** Whether a NEW checkout can be started: no subscription yet, or the existing one is terminally canceled */
    canStartCheckout: boolean;
}

export function useSubscriptionGuard(): SubscriptionGuard {
    const { selectedTenant } = useTenant();

    return useMemo(() => {
        if (!selectedTenant) {
            return { canEdit: false, status: null, trialDaysLeft: null, hasSubscriptionRecord: false, canStartCheckout: true };
        }

        const status = selectedTenant.subscription_status;
        const canEdit = status === "trialing" || status === "active" || status === "past_due";
        const hasSubscriptionRecord = !!selectedTenant.stripe_subscription_id;
        // `suspended` (incomplete/unpaid/paused su Stripe) si recupera dal portale
        // (metodo di pagamento o resume), non con un nuovo checkout. Solo
        // `canceled` è terminale-e-riavviabile con una subscription nuova.
        const canStartCheckout = !hasSubscriptionRecord || status === "canceled";

        let trialDaysLeft: number | null = null;
        if (status === "trialing" && selectedTenant.trial_until) {
            const diff = new Date(selectedTenant.trial_until).getTime() - Date.now();
            trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }

        return { canEdit, status, trialDaysLeft, hasSubscriptionRecord, canStartCheckout };
    }, [selectedTenant?.subscription_status, selectedTenant?.trial_until, selectedTenant?.stripe_subscription_id]);
}
