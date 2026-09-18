// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

// ---------------------------------------------------------------------------
// plan_prices — risoluzione piano ⇄ Price Stripe (con intervallo)
//
// Una riga per (plan_code, billing_interval). Sostituisce plans.stripe_price_id
// (colonna 1:1, deprecata) cosi' che la risoluzione inversa Price → piano
// restituisca ANCHE l'intervallo di fatturazione: e' la primitiva che manca
// per l'abbonamento annuale. Vedi migration 20260915120000_create_plan_prices.
// ---------------------------------------------------------------------------

export const ALLOWED_PLAN_CODES: ReadonlySet<string> = new Set(["base", "pro"]);
export type PlanCode = "base" | "pro";

/** Stesso dominio di Stripe `recurring.interval` per gli abbonamenti CataloGlobe. */
export type BillingInterval = "month" | "year";
export const ALLOWED_INTERVALS: ReadonlySet<string> = new Set(["month", "year"]);

export type PlanPriceMatch = {
    planCode: PlanCode;
    billingInterval: BillingInterval;
};

type AdminClient = ReturnType<typeof createClient>;

/**
 * Risoluzione inversa: Price Stripe → (piano, intervallo) via `plan_prices`.
 * Ritorna null se il Price non mappa una riga valida (piano o intervallo
 * fuori dominio, riga assente, errore query — loggato, mai lanciato: i
 * chiamanti degradano al fallback che avevano prima).
 */
export async function lookupPlanPriceByStripeId(
    admin: AdminClient,
    priceId: string | null | undefined
): Promise<PlanPriceMatch | null> {
    if (!priceId) return null;
    const { data, error } = await admin
        .from("plan_prices")
        .select("plan_code, billing_interval")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
    if (error) {
        console.warn(`plan_prices reverse-lookup failed for price ${priceId}: ${error.message}`);
        return null;
    }
    const code = data?.plan_code?.toLowerCase();
    const interval = data?.billing_interval?.toLowerCase();
    if (!code || !ALLOWED_PLAN_CODES.has(code)) return null;
    if (!interval || !ALLOWED_INTERVALS.has(interval)) return null;
    return { planCode: code as PlanCode, billingInterval: interval as BillingInterval };
}

/**
 * Risoluzione diretta: (piano, intervallo) → Price Stripe. Ritorna null se la
 * combinazione non e' configurata (es. annuale non ancora inserito).
 */
export async function lookupStripePriceId(
    admin: AdminClient,
    planCode: string,
    billingInterval: BillingInterval
): Promise<string | null> {
    const { data, error } = await admin
        .from("plan_prices")
        .select("stripe_price_id")
        .eq("plan_code", planCode)
        .eq("billing_interval", billingInterval)
        .maybeSingle();
    if (error) {
        console.warn(`plan_prices lookup failed for ${planCode}/${billingInterval}: ${error.message}`);
        return null;
    }
    const id = data?.stripe_price_id?.trim();
    return id || null;
}

/**
 * Intervallo dal Price dell'item della subscription (fallback quando
 * `plan_prices` non risolve). Stripe espone sempre `recurring.interval`
 * sull'item; valori fuori dominio (day/week) → null.
 */
export function intervalFromSubscription(subscription: Stripe.Subscription): BillingInterval | null {
    const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
    return interval && ALLOWED_INTERVALS.has(interval) ? (interval as BillingInterval) : null;
}
