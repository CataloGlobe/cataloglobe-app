// @ts-nocheck
import type Stripe from "https://esm.sh/stripe@17?target=deno";
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapStripeStatus } from "./subscriptionStatusSync.ts";
import {
    ALLOWED_PLAN_CODES,
    intervalFromSubscription,
    lookupPlanPriceByStripeId,
    type BillingInterval
} from "./planPrices.ts";

/**
 * Snapshot of a LIVE Stripe subscription as the `tenants` row stores it.
 *
 * Two writers link a tenant to its subscription: `stripe-webhook`
 * (checkout.session.completed) and `stripe-checkout-confirm` (the
 * return-from-payment fallback that does not wait for the webhook). Both
 * must write the same fields with the same rules — this module is the single
 * place where a subscription becomes a `tenants` UPDATE payload.
 *
 * Every helper reads the subscription object only; nothing here touches the
 * database except `resolvePlanAndInterval` (plan_prices lookup).
 */

/**
 * Number of seats from the subscription.
 *
 * Il modello attuale ha un solo product/price: la quantity e' sempre su
 * items[0]. Se in futuro la subscription avra' piu' line item (es. add-on),
 * bisogna:
 *   - Identificare l'item del piano base (es. via metadata o price_id).
 *   - Sommare le quantity di tutti gli item se la semantica è "seats totali".
 */
export function getSubscriptionQuantity(subscription: Stripe.Subscription): number {
    const items = subscription.items?.data;
    if (!items || items.length === 0) return 1;
    // Defensive: the single-product model guarantees exactly 1 line item. If a
    // subscription ever carries more, items[0] silently drops the others — warn
    // so the multi-product migration (see note above) is not missed in prod.
    if (items.length > 1) {
        console.warn(
            `[subscriptionSnapshot] subscription ${subscription.id} has ${items.length} line items; ` +
            `getSubscriptionQuantity reads only items[0].quantity.`
        );
    }
    return items[0].quantity ?? 1;
}

/**
 * Extract a validated plan_code from subscription metadata.
 * Returns null if missing or not in the allowed set — caller MUST skip the
 * `plan` update in that case to avoid poisoning the tenants row.
 */
export function getSubscriptionPlanCode(subscription: Stripe.Subscription): string | null {
    const code = subscription.metadata?.plan_code?.toLowerCase();
    return code && ALLOWED_PLAN_CODES.has(code) ? code : null;
}

/**
 * Piano + intervallo di fatturazione della subscription, risolti dal Price
 * del primo line item via `plan_prices` (stripe_price_id → plan_code +
 * billing_interval). Fonte di verità complementare al metadata per il piano:
 * un cambio via subscriptions.update / subscription schedule che NON propaga
 * metadata.plan_code viene comunque sincronizzato dal Price. Per l'intervallo
 * il Price è l'UNICA fonte (i metadata non vengono riscritti da uno schedule
 * release): se `plan_prices` non risolve, fallback su
 * items[0].price.recurring.interval; mai sui metadata.
 *
 * Ritorna `plan` null se il Price non mappa un piano valido (il caller NON
 * scrive `plan` in quel caso) e `interval` null se non determinabile (il
 * caller NON scrive `billing_interval`: mai azzerare un valore buono).
 */
export async function resolvePlanAndInterval(
    admin: ReturnType<typeof createClient>,
    subscription: Stripe.Subscription
): Promise<{ plan: string | null; interval: BillingInterval | null }> {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const match = await lookupPlanPriceByStripeId(admin, priceId);
    if (match) return { plan: match.planCode, interval: match.billingInterval };
    if (priceId) {
        console.warn(`[subscriptionSnapshot] price ${priceId} not in plan_prices (subscription ${subscription.id}); falling back to recurring.interval`);
    }
    return { plan: null, interval: intervalFromSubscription(subscription) };
}

export function toIsoTimestamp(seconds: number | null | undefined): string | null {
    return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Read `current_period_end` from the subscription. In recent Stripe API
 * versions (2024+) the top-level field has been moved to the item level;
 * we prefer the item value and fall back to the top-level for older payloads.
 */
export function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): string | null {
    const itemEnd = subscription.items?.data?.[0]?.current_period_end;
    if (itemEnd) return toIsoTimestamp(itemEnd);
    return toIsoTimestamp(subscription.current_period_end);
}

/**
 * Read `current_period_start` from the subscription. Same item-level →
 * top-level fallback as getSubscriptionCurrentPeriodEnd (recent Stripe API
 * versions moved the period fields to the item level).
 */
export function getSubscriptionCurrentPeriodStart(subscription: Stripe.Subscription): string | null {
    const itemStart = subscription.items?.data?.[0]?.current_period_start;
    if (itemStart) return toIsoTimestamp(itemStart);
    return toIsoTimestamp(subscription.current_period_start);
}

/**
 * Valore mensile CONTRATTUALE del piano in centesimi, AL LORDO di coupon/
 * sconti: price × quantity come lo vede Stripe PRIMA di ogni discount (un
 * comped 100%-off deve risultare al valore pieno, non a 0 — serve alla quota
 * AI di FASE 4). NON usare mai invoice.amount_due (è post-coupon).
 *
 * I Price CataloGlobe sono graduated-tiered (billing_scheme=tiered): l'item
 * della subscription NON porta i tiers, serve un prices.retrieve con expand.
 * Stessa aritmetica di graduatedTotalFromPrice in stripe-change-subscription
 * (duplicazione consapevole: quell'edge non espone helper condivisi).
 * Ritorna null su errore/shape inattesa: il caller NON scrive la colonna in
 * quel caso (mai azzerare un valore buono per un blip API).
 */
export async function computePlanMonthlyValueCents(
    stripe: Stripe,
    subscription: Stripe.Subscription
): Promise<number | null> {
    const item = subscription.items?.data?.[0];
    if (!item?.price?.id) return null;
    const quantity = item.quantity ?? 1;

    // Price flat per-unit: nessun fetch necessario.
    if (item.price.billing_scheme === "per_unit" && item.price.unit_amount != null) {
        return item.price.unit_amount * quantity;
    }

    try {
        const price = await stripe.prices.retrieve(item.price.id, { expand: ["tiers"] });
        if (
            price.billing_scheme !== "tiered" ||
            price.tiers_mode !== "graduated" ||
            !Array.isArray(price.tiers)
        ) {
            console.warn(
                `[subscriptionSnapshot] price ${item.price.id} non graduated-tiered (scheme=${price.billing_scheme}, mode=${price.tiers_mode}) — plan_monthly_value_cents skipped`
            );
            return null;
        }
        const tiers = [...price.tiers].sort((a, b) => {
            const au = a.up_to ?? Number.POSITIVE_INFINITY;
            const bu = b.up_to ?? Number.POSITIVE_INFINITY;
            return au - bu;
        });
        let remaining = quantity;
        let lower = 0;
        let total = 0;
        for (const tier of tiers) {
            if (remaining <= 0) break;
            const upTo = tier.up_to ?? Number.POSITIVE_INFINITY;
            const capacity = upTo - lower;
            const units = Math.min(remaining, capacity);
            if (units <= 0) continue;
            total += (tier.flat_amount ?? 0) + (tier.unit_amount ?? 0) * units;
            remaining -= units;
            lower = upTo;
        }
        if (remaining > 0) {
            console.warn(`[subscriptionSnapshot] quantity ${quantity} oltre i tiers di ${item.price.id} — plan_monthly_value_cents skipped`);
            return null;
        }
        return total;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[subscriptionSnapshot] prices.retrieve fallito per ${item.price.id}: ${message}`);
        return null;
    }
}

export interface BuildSubscriptionLinkUpdatesParams {
    admin: ReturnType<typeof createClient>;
    stripe: Stripe;
    /** LIVE subscription (already retrieved), never an event payload. */
    subscription: Stripe.Subscription;
    stripeCustomerId: string;
    /**
     * Baseline for the ordering guard in syncSubscriptionStatus
     * (`subscription_status_event_at`). The webhook passes `event.created`;
     * the confirm fallback passes `subscription.created`, which precedes every
     * event about that subscription so the webhook still wins afterwards.
     */
    appliedAtIso: string;
    /**
     * plan_code carried by the Checkout Session metadata. Used only when the
     * subscription metadata has no valid plan_code.
     */
    sessionPlanCode?: string | null;
}

/**
 * The `tenants` UPDATE payload that links a tenant to a live subscription.
 *
 * Rules (shared by webhook and confirm fallback):
 *   - `plan` only when a valid code is known (metadata → session fallback).
 *   - `billing_interval` only when resolved from the Price.
 *   - `plan_monthly_value_cents` only when computed (API blip must not wipe).
 *   - `trial_until` only when the subscription has a trial_end.
 */
export async function buildSubscriptionLinkUpdates(
    params: BuildSubscriptionLinkUpdatesParams
): Promise<Record<string, unknown>> {
    const { admin, stripe, subscription, stripeCustomerId, appliedAtIso, sessionPlanCode } = params;

    const paidSeats = getSubscriptionQuantity(subscription);
    const subscriptionStatus = mapStripeStatus(subscription.status);
    const trialUntil = toIsoTimestamp(subscription.trial_end);
    const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);
    const currentPeriodStart = getSubscriptionCurrentPeriodStart(subscription);
    const planMonthlyValueCents = await computePlanMonthlyValueCents(stripe, subscription);
    // Piano: dai metadata (scritti dal checkout) — il fallback al Price qui e'
    // volutamente NON applicato per non cambiare il comportamento del checkout
    // mensile. Intervallo: SOLO dal Price (plan_prices → recurring.interval).
    let planCode = getSubscriptionPlanCode(subscription);
    const billingInterval = (await resolvePlanAndInterval(admin, subscription)).interval;

    if (!planCode) {
        const fallback = sessionPlanCode?.toLowerCase();
        if (fallback && ALLOWED_PLAN_CODES.has(fallback)) planCode = fallback;
    }

    const updates: Record<string, unknown> = {
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
        subscription_status: subscriptionStatus,
        subscription_status_event_at: appliedAtIso,
        paid_seats: paidSeats,
        current_period_end: currentPeriodEnd,
        current_period_start: currentPeriodStart
    };
    if (planCode) updates.plan = planCode;
    if (billingInterval !== null) updates.billing_interval = billingInterval;
    if (planMonthlyValueCents !== null) updates.plan_monthly_value_cents = planMonthlyValueCents;
    if (trialUntil !== null) updates.trial_until = trialUntil;
    return updates;
}
