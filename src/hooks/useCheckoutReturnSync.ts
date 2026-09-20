import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "@/context/useTenant";
import { confirmCheckoutSession } from "@/services/supabase/billing";
import { readCheckoutSessionId, stripCheckoutSessionParam } from "@/utils/checkoutReturn";

export const CHECKOUT_CONFIRM_LOADER_TEXT = "Stiamo confermando il tuo pagamento…";

/**
 * Confirm codes that mean a genuine conflict, NOT a transient delay: the
 * payment is real but it does not belong to this tenant (or the row points at
 * a still-live different subscription). Retrying cannot fix these — a human
 * must look — so the UI shows the "mismatch" screen with no retry button.
 * Everything else (500, network, 502, checkout_not_complete, …) is treated as
 * retryable.
 */
const MISMATCH_CODES = new Set([
    "subscription_mismatch",
    "session_tenant_mismatch",
    "subscription_tenant_mismatch"
]);

// Auto-retry backoff before surfacing the "failed" screen. Two silent attempts
// absorb the common "webhook a couple of seconds behind" case without ever
// showing the user anything alarming. This ONLY holds because confirm is
// idempotent (a second call after the first already linked returns
// `already_synced`, 200) — if that ever changes, auto-retry must go.
const RETRY_DELAYS_MS = [2000, 5000];

/**
 * Return-from-checkout state machine, driven by the confirm outcome:
 *   - "idle":     nothing to do (no param, or the tenant is already linked).
 *   - "syncing":  confirm in flight (incl. the silent auto-retry waits).
 *   - "failed":   retryable error after the auto-retries — the user can retry.
 *   - "mismatch": genuine conflict — no retry, contact support.
 */
export type CheckoutConfirmStatus = "idle" | "syncing" | "failed" | "mismatch";

export interface CheckoutReturnSync {
    status: CheckoutConfirmStatus;
    /** Session (or tenant) id the user quotes to support. Null unless failed/mismatch. */
    reference: string | null;
    /** Re-run confirm from scratch (the "Completa l'attivazione" button). */
    retry: () => void;
}

/**
 * Return from Stripe Checkout: links the tenant to its subscription without
 * waiting for the webhook.
 *
 * Mounted on both landing pages — `SetupWizardPage` (first subscription,
 * outside MainLayout) and `MainLayout` (re-subscribe on /subscription, where
 * the "no subscription → workspace" gate would otherwise fire before the page
 * mounts). While `status !== "idle"` the caller renders `CheckoutConfirmScreen`
 * INSTEAD of the page and must NOT evaluate that gate.
 *
 * Flow: `?checkout_session=cs_…` present → if the tenant is already linked
 * (webhook was faster) just drop the param; otherwise call
 * stripe-checkout-confirm, refresh tenants, drop the param. On a retryable
 * error the param is KEPT (so retry / reload re-run confirm); on a mismatch the
 * param is kept too but no retry is offered.
 */
export function useCheckoutReturnSync(): CheckoutReturnSync {
    const location = useLocation();
    const navigate = useNavigate();
    const { selectedTenant, refreshTenants } = useTenant();

    const sessionId = readCheckoutSessionId(location.search);
    const tenantId = selectedTenant?.id ?? null;

    // The param is the trigger; `status` starts "syncing" whenever it is present
    // so the first render never shows the gate/redirect.
    const [status, setStatus] = useState<CheckoutConfirmStatus>(sessionId !== null ? "syncing" : "idle");
    const [reference, setReference] = useState<string | null>(null);
    const handledRef = useRef<string | null>(null);
    // Bumped by `retry()` to re-run the effect (which also resets `handledRef`).
    const [retryKey, setRetryKey] = useState(0);

    // Live values read by the effect WITHOUT being deps. `refreshTenants()`
    // updates the tenant, whose identity would otherwise change the deps and
    // re-run/cancel the effect mid-confirm, stranding the loader. Keeping these
    // in a ref lets the deps stay minimal so a run always reaches a terminal
    // status.
    const latest = useRef({ selectedTenant, refreshTenants, navigate, location });
    latest.current = { selectedTenant, refreshTenants, navigate, location };

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const retry = useCallback(() => {
        handledRef.current = null;
        setReference(null);
        setStatus("syncing");
        setRetryKey(k => k + 1);
    }, []);

    useEffect(() => {
        if (sessionId === null) {
            setStatus("idle");
            return;
        }
        // `tenantId !== null` is the readiness signal (the tenant has loaded);
        // while it is null the effect bails and re-runs when it becomes set.
        if (tenantId === null) return;
        if (handledRef.current === sessionId) return;
        handledRef.current = sessionId;

        const dropParam = () => {
            const { navigate, location } = latest.current;
            navigate(
                { pathname: location.pathname, search: stripCheckoutSessionParam(location.search), hash: location.hash },
                { replace: true }
            );
        };

        if (latest.current.selectedTenant?.stripe_subscription_id) {
            dropParam();
            setStatus("idle");
            return;
        }

        const timers: number[] = [];

        const attempt = async (n: number) => {
            try {
                await confirmCheckoutSession({ tenantId, sessionId });
                await latest.current.refreshTenants();
                if (!mountedRef.current) return;
                dropParam();
                setStatus("idle");
            } catch (err) {
                const code = err instanceof Error ? err.name : "";
                console.error("[useCheckoutReturnSync] confirm failed:", err);
                if (!mountedRef.current) return;

                if (MISMATCH_CODES.has(code)) {
                    // Genuine conflict: keep the param (a reload just lands here
                    // again, idempotently) and show the no-retry screen.
                    setReference(sessionId ?? tenantId);
                    setStatus("mismatch");
                    return;
                }

                if (n < RETRY_DELAYS_MS.length) {
                    // Silent auto-retry: stay on the loader.
                    setStatus("syncing");
                    const t = window.setTimeout(() => void attempt(n + 1), RETRY_DELAYS_MS[n]);
                    timers.push(t);
                    return;
                }

                // Out of auto-retries: keep the param (retry/reload re-run
                // confirm) and offer the manual action.
                setReference(sessionId ?? tenantId);
                setStatus("failed");
            }
        };

        setStatus("syncing");
        void attempt(0);

        return () => {
            timers.forEach(t => clearTimeout(t));
        };
        // Deps are only the identity keys plus `retryKey`; live context values
        // come from `latest` so a tenant refresh during confirm can't cancel a run.
    }, [sessionId, tenantId, retryKey]);

    return { status, reference, retry };
}
