// @ts-nocheck
import Stripe from "https://esm.sh/stripe@17?target=deno";

// ---------------------------------------------------------------------------
// Shared Stripe helpers for tenant lifecycle flows.
//
// All helpers are idempotent and non-throwing: they log errors and return a
// status code. Callers should NEVER let a Stripe failure abort the primary
// DB flow (soft-delete, recovery, purge).
//
// Each mutating helper accepts an optional `idempotencyKey` forwarded to Stripe
// as request options (see idempotency.ts for deterministic key construction).
// Supply a deterministic key ONLY for non-reversible operations such as
// immediate cancel and customer delete. Do NOT pass deterministic keys to the
// reversible toggles scheduleStripeCancel and reactivateStripeSubIfScheduled: a
// legitimate re-toggle within Stripe's 24h idempotency window would be silently
// swallowed as a replay. Default (no key) preserves the pre-existing behavior.
//
// API version pinned to 2025-04-30.basil for parity with stripe-webhook.
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * Opzioni condivise per OGNI costruzione di `new Stripe(...)` nelle edge.
 * Fonte unica per evitare drift tra l'helper e i 4 edge che costruiscono il
 * client per conto proprio.
 *
 * - `telemetry: false` → disattiva il task di metriche post-response dell'SDK,
 *   che sul runtime Edge (Deno ristretto) emette il diagnostic non-fatale
 *   "event loop error: Deno.core.runMicrotasks() is not supported".
 * - `httpClient: createFetchHttpClient()` → transport fetch nativo Deno
 *   (deterministico, niente shim Node-http).
 */
export function stripeClientOptions() {
    return {
        apiVersion: "2025-04-30.basil",
        httpClient: Stripe.createFetchHttpClient(),
        telemetry: false
    };
}

export function createStripeClient(): Stripe | null {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return null;
    return new Stripe(key, stripeClientOptions());
}

/**
 * Rilascia uno subscription schedule se presente. No-op se scheduleId è
 * assente. Non-throwing: logga e prosegue (la subscription resta valida anche
 * se il release fallisce / lo schedule è già rilasciato/terminale).
 */
export async function releaseScheduleIfAny(
    stripe: Stripe,
    scheduleId?: string | null,
    idempotencyKey?: string
): Promise<void> {
    if (!scheduleId) return;
    try {
        await stripe.subscriptionSchedules.release(
            scheduleId,
            undefined,
            idempotencyKey ? { idempotencyKey } : undefined
        );
    } catch (relErr) {
        const message = relErr instanceof Error ? relErr.message : String(relErr);
        console.warn(`releaseScheduleIfAny: release of ${scheduleId} failed (continuing): ${message}`);
    }
}

/**
 * Item di una fase di subscription schedule (price ID + quantity).
 */
export interface SchedulePhaseItem {
    price: string;
    quantity: number;
}

/**
 * Parametri per aggiornare le due fasi di uno schedule ESISTENTE senza
 * release+ricrea. Riusabile dai path differiti (proration 'none', nessun
 * addebito) e — in un passo successivo — dall'addebito sedi sulla fase corrente
 * (proration 'always_invoice').
 */
export interface UpdateSchedulePhasesParams {
    /** Items della fase CORRENTE, replicati verbatim dallo schedule esistente. */
    currentPhaseItems: SchedulePhaseItem[];
    /** start_date della fase corrente (obbligatorio sull'edit, va preservato). */
    currentPhaseStart: number;
    /** end_date della fase corrente (coincide con lo start della fase futura). */
    currentPhaseEnd: number;
    /** Items della fase FUTURA: nuovo piano target + nuova qty. */
    futurePhaseItems: SchedulePhaseItem[];
    /** plan_code scritto nei metadata della fase futura. */
    futurePhasePlanCode: string;
    /**
     * Proration applicata se l'update cambia la billing config della fase
     * CORRENTE: 'none' = nessun addebito (cambio differito, FASE 2.2);
     * 'always_invoice' = addebito immediato (aggiunta sedi sulla fase corrente,
     * FASE 2.3).
     */
    prorationBehavior: "none" | "always_invoice" | "create_prorations";
    idempotencyKey?: string;
}

/**
 * Aggiorna le fasi di uno schedule esistente (fase corrente verbatim + fase
 * futura con nuovo target/qty) SENZA rilasciarlo. Sostituisce il pattern
 * release+ricrea quando esiste gia' un cambio programmato, evitando di
 * distruggere il pending (chiude il flag 3). NON idempotente di per se':
 * passare un `idempotencyKey` deterministico per il replay sicuro.
 *
 * Vincolo Stripe: `start_date` della prima fase e' obbligatorio sull'edit e va
 * preservato verbatim (ricalcolarlo fa rifiutare l'update con "phase has
 * already ended"). Le fasi passate sono omettibili.
 */
export async function updateSchedulePhases(
    stripe: Stripe,
    scheduleId: string,
    params: UpdateSchedulePhasesParams
): Promise<Stripe.SubscriptionSchedule> {
    return await stripe.subscriptionSchedules.update(
        scheduleId,
        {
            end_behavior: "release",
            proration_behavior: params.prorationBehavior,
            phases: [
                {
                    items: params.currentPhaseItems,
                    start_date: params.currentPhaseStart,
                    end_date: params.currentPhaseEnd,
                    proration_behavior: "none"
                },
                {
                    items: params.futurePhaseItems,
                    proration_behavior: "none",
                    metadata: { plan_code: params.futurePhasePlanCode }
                }
            ]
        },
        params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
    );
}

function isResourceMissing(message: string): boolean {
    return /no such (subscription|customer)|resource_missing|404/i.test(message);
}

export type ScheduleCancelResult =
    | "scheduled"
    | "already_scheduled"
    | "already_canceled"
    | "error";

/**
 * Mark a subscription as cancel_at_period_end = true.
 * Idempotent: skips if already scheduled or terminally canceled.
 */
export async function scheduleStripeCancel(
    stripe: Stripe,
    subscriptionId: string,
    context: Record<string, unknown> = {},
    idempotencyKey?: string
): Promise<ScheduleCancelResult> {
    try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        if (TERMINAL_STATUSES.has(sub.status)) {
            console.log(JSON.stringify({
                event: "stripe_already_canceled",
                subscription_id: subscriptionId,
                status: sub.status,
                ...context
            }));
            return "already_canceled";
        }

        if (sub.cancel_at_period_end) {
            console.log(JSON.stringify({
                event: "stripe_already_scheduled_for_cancel",
                subscription_id: subscriptionId,
                ...context
            }));
            return "already_scheduled";
        }

        await stripe.subscriptions.update(
            subscriptionId,
            { cancel_at_period_end: true },
            idempotencyKey ? { idempotencyKey } : undefined
        );
        console.log(JSON.stringify({
            event: "stripe_scheduled_for_cancel",
            subscription_id: subscriptionId,
            ...context
        }));
        return "scheduled";
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isResourceMissing(message)) {
            console.log(JSON.stringify({
                event: "stripe_subscription_missing",
                subscription_id: subscriptionId,
                ...context
            }));
            return "already_canceled";
        }
        console.error(JSON.stringify({
            event: "stripe_schedule_cancel_failed",
            subscription_id: subscriptionId,
            error: message,
            ...context
        }));
        return "error";
    }
}

export type ReactivateResult =
    | "reactivated"
    | "not_scheduled"
    | "already_canceled"
    | "error";

/**
 * Reactivate a subscription previously scheduled for cancellation at period end.
 * If the subscription is already terminally canceled, logs a warning and
 * returns "already_canceled" — the caller must restart checkout.
 * Idempotent: skips if not scheduled.
 */
export async function reactivateStripeSubIfScheduled(
    stripe: Stripe,
    subscriptionId: string,
    context: Record<string, unknown> = {},
    idempotencyKey?: string
): Promise<ReactivateResult> {
    try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        if (TERMINAL_STATUSES.has(sub.status)) {
            console.warn(JSON.stringify({
                event: "stripe_subscription_terminally_canceled",
                subscription_id: subscriptionId,
                status: sub.status,
                ...context
            }));
            return "already_canceled";
        }

        if (!sub.cancel_at_period_end) {
            console.log(JSON.stringify({
                event: "stripe_subscription_not_scheduled",
                subscription_id: subscriptionId,
                ...context
            }));
            return "not_scheduled";
        }

        await stripe.subscriptions.update(
            subscriptionId,
            { cancel_at_period_end: false },
            idempotencyKey ? { idempotencyKey } : undefined
        );
        console.log(JSON.stringify({
            event: "stripe_subscription_reactivated",
            subscription_id: subscriptionId,
            ...context
        }));
        return "reactivated";
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isResourceMissing(message)) {
            console.warn(JSON.stringify({
                event: "stripe_subscription_missing",
                subscription_id: subscriptionId,
                ...context
            }));
            return "already_canceled";
        }
        console.error(JSON.stringify({
            event: "stripe_reactivate_failed",
            subscription_id: subscriptionId,
            error: message,
            ...context
        }));
        return "error";
    }
}

export type ImmediateCancelResult = "canceled" | "already_canceled" | "error";

/**
 * Immediately cancel a subscription. Used by hard-delete (purge) flows.
 * Idempotent: catches missing/already-canceled subs.
 */
export async function cancelStripeSubImmediate(
    stripe: Stripe,
    subscriptionId: string,
    context: Record<string, unknown> = {},
    idempotencyKey?: string
): Promise<ImmediateCancelResult> {
    try {
        await stripe.subscriptions.cancel(
            subscriptionId,
            undefined,
            idempotencyKey ? { idempotencyKey } : undefined
        );
        console.log(JSON.stringify({
            event: "stripe_sub_canceled_immediate",
            subscription_id: subscriptionId,
            ...context
        }));
        return "canceled";
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isResourceMissing(message)) {
            console.log(JSON.stringify({
                event: "stripe_sub_already_canceled_or_missing",
                subscription_id: subscriptionId,
                ...context
            }));
            return "already_canceled";
        }
        console.error(JSON.stringify({
            event: "stripe_sub_cancel_failed",
            subscription_id: subscriptionId,
            error: message,
            ...context
        }));
        return "error";
    }
}

export type DeleteCustomerResult = "deleted" | "already_deleted" | "error";

/**
 * Delete a Stripe customer. GDPR cleanup for hard-delete flows.
 * Idempotent: catches missing customer.
 */
export async function deleteStripeCustomer(
    stripe: Stripe,
    customerId: string,
    context: Record<string, unknown> = {},
    idempotencyKey?: string
): Promise<DeleteCustomerResult> {
    try {
        await stripe.customers.del(
            customerId,
            undefined,
            idempotencyKey ? { idempotencyKey } : undefined
        );
        console.log(JSON.stringify({
            event: "stripe_customer_deleted",
            customer_id: customerId,
            ...context
        }));
        return "deleted";
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isResourceMissing(message)) {
            console.log(JSON.stringify({
                event: "stripe_customer_already_deleted",
                customer_id: customerId,
                ...context
            }));
            return "already_deleted";
        }
        console.error(JSON.stringify({
            event: "stripe_customer_delete_failed",
            customer_id: customerId,
            error: message,
            ...context
        }));
        return "error";
    }
}
