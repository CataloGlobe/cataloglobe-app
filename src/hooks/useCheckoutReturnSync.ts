import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "@/context/useTenant";
import { useToast } from "@/context/Toast/ToastContext";
import { confirmCheckoutSession } from "@/services/supabase/billing";
import { readCheckoutSessionId, stripCheckoutSessionParam } from "@/utils/checkoutReturn";

export const CHECKOUT_CONFIRM_LOADER_TEXT = "Stiamo confermando il tuo pagamento…";

export const CHECKOUT_CONFIRM_FAILED_TEXT =
    "Il pagamento è andato a buon fine. L'attivazione sta richiedendo qualche secondo in più: aggiorna la pagina tra poco.";

/**
 * Return from Stripe Checkout: links the tenant to its subscription without
 * waiting for the webhook.
 *
 * Mounted on both landing pages — `SetupWizardPage` (first subscription,
 * outside MainLayout) and `MainLayout` (re-subscribe on /subscription, where
 * the "no subscription → workspace" gate would otherwise fire before the page
 * mounts). While `syncing` is true the caller must show a loader and must NOT
 * evaluate that gate.
 *
 * Flow: `?checkout_session=cs_…` present → if the tenant is already linked
 * (webhook was faster) just drop the param; otherwise call
 * stripe-checkout-confirm, refresh tenants, drop the param. On failure the
 * user is told the payment went through and the param is dropped anyway, so
 * the existing behaviour (gate/redirect) takes over instead of looping.
 */
export function useCheckoutReturnSync(): { syncing: boolean } {
    const location = useLocation();
    const navigate = useNavigate();
    const { selectedTenant, loading, refreshTenants } = useTenant();
    const { showToast } = useToast();

    const sessionId = readCheckoutSessionId(location.search);
    // The param is the trigger; `syncing` starts true whenever it is present
    // so the first render never shows the gate/redirect, and one session id is
    // handled once even if the tenant context re-renders during the call.
    const [syncing, setSyncing] = useState(sessionId !== null);
    const handledRef = useRef<string | null>(null);

    useEffect(() => {
        if (sessionId === null) {
            setSyncing(false);
            return;
        }
        if (loading || !selectedTenant) return;
        if (handledRef.current === sessionId) return;
        handledRef.current = sessionId;

        const dropParam = () => {
            navigate(
                { pathname: location.pathname, search: stripCheckoutSessionParam(location.search), hash: location.hash },
                { replace: true }
            );
        };

        if (selectedTenant.stripe_subscription_id) {
            dropParam();
            setSyncing(false);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                await confirmCheckoutSession({ tenantId: selectedTenant.id, sessionId });
                await refreshTenants();
            } catch (err) {
                console.error("[useCheckoutReturnSync] confirm failed:", err);
                if (!cancelled) showToast({ message: CHECKOUT_CONFIRM_FAILED_TEXT, type: "warning" });
            } finally {
                if (!cancelled) {
                    dropParam();
                    setSyncing(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // `location` is read inside dropParam at call time; re-running on every
        // location change would re-trigger the effect after the param strip.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, loading, selectedTenant, refreshTenants, navigate, showToast]);

    return { syncing };
}
