import { supabase } from "@/services/supabase/client";

/**
 * Calls the stripe-checkout Edge Function.
 * Returns the Stripe Checkout URL to redirect the user to.
 *
 * @param quantity — number of seats (locations). Defaults to 1.
 */
export async function createCheckoutSession(
    tenantId: string,
    successUrl?: string,
    cancelUrl?: string,
    quantity: number = 1
): Promise<string> {
    const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { tenantId, successUrl, cancelUrl, quantity }
    });

    if (error) throw error;
    if (!data?.checkout_url) throw new Error("Nessun URL di checkout ricevuto.");
    return data.checkout_url as string;
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
