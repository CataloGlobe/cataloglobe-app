/**
 * Query param carried by every Stripe Checkout `success_url` (appended by
 * the stripe-checkout edge as `checkout_session={CHECKOUT_SESSION_ID}`).
 * On the return page it drives `useCheckoutReturnSync`: the session id is
 * handed to stripe-checkout-confirm so the tenant gets linked to its
 * subscription without waiting for the webhook.
 */
export const CHECKOUT_SESSION_PARAM = "checkout_session";

// Checkout Session ids: `cs_test_…` / `cs_live_…`. Anything else (including
// the un-substituted `{CHECKOUT_SESSION_ID}` placeholder) is not a session.
const SESSION_ID_RE = /^cs_(live|test)_[A-Za-z0-9]+$/;

/** The Checkout Session id from `location.search`, or null when absent/invalid. */
export function readCheckoutSessionId(search: string): string | null {
    const value = new URLSearchParams(search).get(CHECKOUT_SESSION_PARAM);
    if (!value || !SESSION_ID_RE.test(value)) return null;
    return value;
}

/** `location.search` without the checkout param (empty string when nothing is left). */
export function stripCheckoutSessionParam(search: string): string {
    const params = new URLSearchParams(search);
    params.delete(CHECKOUT_SESSION_PARAM);
    const next = params.toString();
    return next ? `?${next}` : "";
}
