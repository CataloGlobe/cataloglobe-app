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
    /** Whether the tenant has completed Stripe checkout */
    hasPaymentMethod: boolean;
}

export function useSubscriptionGuard(): SubscriptionGuard {
    const { selectedTenant } = useTenant();

    return useMemo(() => {
        if (!selectedTenant) {
            return { canEdit: false, status: null, trialDaysLeft: null, hasPaymentMethod: false };
        }

        const status = selectedTenant.subscription_status;
        const canEdit = status === "trialing" || status === "active";
        const hasPaymentMethod = !!selectedTenant.stripe_subscription_id;

        let trialDaysLeft: number | null = null;
        if (status === "trialing" && selectedTenant.trial_until) {
            const diff = new Date(selectedTenant.trial_until).getTime() - Date.now();
            trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }

        return { canEdit, status, trialDaysLeft, hasPaymentMethod };
    }, [selectedTenant?.subscription_status, selectedTenant?.trial_until, selectedTenant?.stripe_subscription_id]);
}
