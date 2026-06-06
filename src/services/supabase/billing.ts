import { supabase } from "@/services/supabase/client";

export type PlanCode = "base" | "pro";

export type CreateCheckoutSessionInput = {
    tenantId: string;
    successUrl?: string;
    cancelUrl?: string;
    quantity?: number;
    planCode?: PlanCode;
    promotionCode?: string;
};

/**
 * Calls the stripe-checkout Edge Function.
 * Returns the Stripe Checkout URL to redirect the user to.
 *
 * On a 4xx response the Edge Function returns `{ error: "<code>" }`. We attempt
 * to parse the code so callers can branch on it (e.g. `"promo_code_invalid"`).
 * The parsed code is attached as `name` on the thrown Error.
 */
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<string> {
    const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
            tenantId: input.tenantId,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            quantity: input.quantity ?? 1,
            planCode: input.planCode,
            promotionCode: input.promotionCode
        }
    });

    if (error) {
        const code = await extractEdgeErrorCode(error);
        if (code) {
            const wrapped = new Error(code);
            wrapped.name = code;
            throw wrapped;
        }
        throw error;
    }
    if (!data?.checkout_url) throw new Error("Nessun URL di checkout ricevuto.");
    return data.checkout_url as string;
}

async function extractEdgeErrorCode(error: unknown): Promise<string | null> {
    if (!error || typeof error !== "object") return null;
    const ctx = (error as { context?: unknown }).context;
    if (!ctx || typeof (ctx as Response).clone !== "function") return null;
    try {
        const body = await (ctx as Response).clone().json();
        if (body && typeof body.error === "string") return body.error;
    } catch {
        // Body not JSON → fall back to default error
    }
    return null;
}

/**
 * Calls the stripe-update-seats Edge Function.
 * Updates the subscription quantity (number of seats/locations) on Stripe.
 * The webhook then syncs paid_seats to the DB.
 */
export async function updateSeats(tenantId: string, quantity: number): Promise<void> {
    const { error } = await supabase.functions.invoke("stripe-update-seats", {
        body: { tenantId, quantity }
    });

    if (error) throw error;
}

/**
 * Calls the stripe-portal Edge Function.
 * Returns the Stripe Billing Portal URL to redirect the user to.
 */
export async function createPortalSession(
    tenantId: string,
    returnUrl?: string
): Promise<string> {
    const { data, error } = await supabase.functions.invoke("stripe-portal", {
        body: { tenantId, returnUrl }
    });

    if (error) throw error;
    if (!data?.portal_url) throw new Error("Nessun URL del portale ricevuto.");
    return data.portal_url as string;
}
