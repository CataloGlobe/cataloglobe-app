// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

/**
 * Single writer for `tenants.subscription_status`.
 *
 * Rationale — two independent failure modes were possible while the webhook
 * inferred the status from the EVENT TYPE and wrote it last-write-wins:
 *
 *   1. Wrong source of truth. `invoice.payment_failed` fires for ANY invoice of
 *      the customer, including one-off charges (seat delta via
 *      `chargeOneOffSeatDelta`). A failed one-off flipped a healthy
 *      subscription to `past_due` and nothing corrected it until the next
 *      event happened to arrive.
 *   2. No ordering. Redelivered / out-of-order events (Stripe "Resend",
 *      retries) could overwrite a newer state with an older one.
 *
 * This helper fixes both:
 *   - Ordering guard on `tenants.subscription_status_event_at` (Stripe
 *     `event.created`, never `now()`): an event older than or equal to the last
 *     applied one is ignored for status purposes.
 *   - The status is ALWAYS read back from the live subscription
 *     (`stripe.subscriptions.retrieve`) and mapped via `mapStripeStatus` —
 *     never deduced from the event type.
 *   - If the retrieve fails (network / Stripe blip) nothing is written: the
 *     last known state is safer than a guessed one. The failure is logged to
 *     `webhook_errors` and the webhook keeps going (never blocks the delivery).
 */

/**
 * Map a Stripe subscription status to our DB status values.
 * Stripe statuses: trialing, active, past_due, canceled, incomplete,
 *                  incomplete_expired, unpaid, paused
 * Our statuses:    trialing, active, past_due, suspended, canceled
 */
export function mapStripeStatus(stripeStatus: string): string {
    switch (stripeStatus) {
        case "trialing":
            return "trialing";
        case "active":
            return "active";
        case "past_due":
            return "past_due";
        case "canceled":
        case "incomplete_expired":
            return "canceled";
        case "incomplete":
        case "unpaid":
        case "paused":
            return "suspended";
        default:
            console.warn(`stripe-webhook: Unknown Stripe status '${stripeStatus}', mapping to 'suspended'`);
            return "suspended";
    }
}

/**
 * Resolve the subscription id carried by an invoice across Stripe API versions:
 * legacy top-level `subscription`, 2025+ `parent.subscription_details.
 * subscription`, and the line-item level fallback. Returns null for invoices
 * that carry no subscription at all (one-off charges) — the caller then falls
 * back to the tenant's own `stripe_subscription_id`.
 */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const direct = (invoice as { subscription?: string | { id?: string } }).subscription;
    if (typeof direct === "string" && direct) return direct;
    if (direct && typeof direct === "object" && direct.id) return direct.id;

    const parentSub = (invoice as {
        parent?: { subscription_details?: { subscription?: string | { id?: string } } };
    }).parent?.subscription_details?.subscription;
    if (typeof parentSub === "string" && parentSub) return parentSub;
    if (parentSub && typeof parentSub === "object" && parentSub.id) return parentSub.id;

    const lineSub = invoice.lines?.data?.find(
        line => (line as { subscription?: string }).subscription
    ) as { subscription?: string } | undefined;
    if (typeof lineSub?.subscription === "string" && lineSub.subscription) return lineSub.subscription;

    return null;
}

export type SyncSkipReason =
    | "no_tenant_matched"
    | "ambiguous_tenant_match"
    | "tenant_lookup_failed"
    | "stale_event"
    | "no_subscription_id"
    | "stripe_retrieve_failed"
    | "db_update_failed";

export interface SyncSubscriptionStatusResult {
    applied: boolean;
    reason?: SyncSkipReason;
    tenantId?: string;
    status?: string;
}

export interface SyncSubscriptionStatusParams {
    admin: ReturnType<typeof createClient>;
    stripe: Stripe;
    event: Stripe.Event;
    /** Tenant lookup key. Exactly one of the two is required. */
    stripeCustomerId?: string | null;
    tenantId?: string | null;
    /** Explicit subscription to read. Falls back to the tenant's stored one. */
    subscriptionId?: string | null;
    /**
     * Extra columns to write in the SAME update as the status. Computed from the
     * LIVE subscription (not from the event payload) so every field written by
     * this path shares one source of truth and one ordering guard.
     */
    buildExtraUpdates?: (
        subscription: Stripe.Subscription
    ) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

/**
 * Best-effort audit trail. The webhook already returns 200/5xx on its own; a
 * failure to log must never surface.
 */
async function logWebhookError(
    admin: ReturnType<typeof createClient>,
    event: Stripe.Event,
    message: string,
    stack: string | null
): Promise<void> {
    try {
        await admin.from("webhook_errors").insert({
            source: "stripe-webhook",
            event_id: event?.id ?? null,
            event_type: event?.type ?? null,
            error_message: message,
            error_stack: stack,
            payload: {
                id: event?.id ?? null,
                type: event?.type ?? null,
                created: event?.created ?? null,
                livemode: event?.livemode ?? null
            }
        });
    } catch (auditErr) {
        console.error("stripe-webhook: Failed to write audit trail:", auditErr);
    }
}

export async function syncSubscriptionStatus(
    params: SyncSubscriptionStatusParams
): Promise<SyncSubscriptionStatusResult> {
    const { admin, stripe, event, stripeCustomerId, tenantId, subscriptionId, buildExtraUpdates } = params;

    if (!stripeCustomerId && !tenantId) {
        console.error(`stripe-webhook: syncSubscriptionStatus called without a tenant key (event ${event.id})`);
        return { applied: false, reason: "no_tenant_matched" };
    }

    // --- 1. Locate the tenant -------------------------------------------------
    let query = admin
        .from("tenants")
        .select("id, subscription_status, subscription_status_event_at, stripe_subscription_id");
    query = tenantId ? query.eq("id", tenantId) : query.eq("stripe_customer_id", stripeCustomerId);

    const { data: rows, error: lookupError } = await query;

    if (lookupError) {
        console.error(`stripe-webhook: tenant lookup failed for event ${event.id}:`, lookupError.message);
        return { applied: false, reason: "tenant_lookup_failed" };
    }
    if (!rows || rows.length === 0) {
        console.warn(
            `stripe-webhook: NO TENANT MATCHED ${tenantId ? `id ${tenantId}` : `customer ${stripeCustomerId}`} ` +
            `for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`
        );
        return { applied: false, reason: "no_tenant_matched" };
    }
    if (rows.length > 1) {
        console.error(
            `stripe-webhook: AMBIGUOUS tenant match (${rows.length} rows) for customer ${stripeCustomerId} ` +
            `on event ${event.id} (${event.type}). Status not written.`
        );
        return { applied: false, reason: "ambiguous_tenant_match" };
    }

    const tenant = rows[0];

    // --- 2. Ordering guard ----------------------------------------------------
    // `event.created` is Unix seconds. Stale (or exactly-as-old) events are
    // ignored for status purposes: they carry no newer information, and a
    // redelivery of an old event must not resurrect an old state.
    const eventCreatedMs = (event.created ?? 0) * 1000;
    const eventCreatedIso = new Date(eventCreatedMs).toISOString();
    const appliedAt = tenant.subscription_status_event_at
        ? new Date(tenant.subscription_status_event_at).getTime()
        : null;

    if (appliedAt !== null && eventCreatedMs <= appliedAt) {
        console.log(
            `stripe-webhook: event ${event.id} (${event.type}, created=${eventCreatedIso}) is stale for tenant ` +
            `${tenant.id} (last applied ${tenant.subscription_status_event_at}); status left at ` +
            `'${tenant.subscription_status}'.`
        );
        return { applied: false, reason: "stale_event", tenantId: tenant.id };
    }

    // --- 3. Read the LIVE subscription ---------------------------------------
    const targetSubscriptionId = subscriptionId || tenant.stripe_subscription_id || null;
    if (!targetSubscriptionId) {
        console.warn(
            `stripe-webhook: no subscription id available for tenant ${tenant.id} on event ${event.id} ` +
            `(${event.type}); subscription_status left at '${tenant.subscription_status}'.`
        );
        return { applied: false, reason: "no_subscription_id", tenantId: tenant.id };
    }

    let subscription: Stripe.Subscription;
    try {
        subscription = await stripe.subscriptions.retrieve(targetSubscriptionId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : null;
        console.error(
            `stripe-webhook: subscriptions.retrieve(${targetSubscriptionId}) failed on event ${event.id} ` +
            `(${event.type}): ${message}. subscription_status left unchanged.`
        );
        await logWebhookError(
            admin,
            event,
            `syncSubscriptionStatus: subscriptions.retrieve(${targetSubscriptionId}) failed: ${message}`,
            stack
        );
        return { applied: false, reason: "stripe_retrieve_failed", tenantId: tenant.id };
    }

    const newStatus = mapStripeStatus(subscription.status);

    // --- 4. Single write: status + ordering stamp + caller extras -------------
    const extras = buildExtraUpdates ? await buildExtraUpdates(subscription) : {};
    const updates: Record<string, unknown> = {
        ...extras,
        subscription_status: newStatus,
        subscription_status_event_at: eventCreatedIso
    };

    const { error: updateError } = await admin.from("tenants").update(updates).eq("id", tenant.id);

    if (updateError) {
        console.error(
            `stripe-webhook: failed to write subscription_status for tenant ${tenant.id} ` +
            `(event ${event.id}): ${updateError.message}`
        );
        return { applied: false, reason: "db_update_failed", tenantId: tenant.id };
    }

    console.log(
        `stripe-webhook: tenant ${tenant.id} subscription_status '${tenant.subscription_status}' → '${newStatus}' ` +
        `(live sub ${targetSubscriptionId}, event ${event.id} ${event.type}, created=${eventCreatedIso})`
    );

    return { applied: true, tenantId: tenant.id, status: newStatus };
}
