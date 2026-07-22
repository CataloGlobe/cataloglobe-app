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

/**
 * Errore tipizzato: l'addebito one-off delle sedi NON è stato incassato in modo
 * verificabile. Sollevato da `chargeOneOffSeatDelta` sia sul decline sincrono di
 * `.pay()` sia quando la verifica post-pagamento fallisce (fattura non `paid` o
 * importo incassato ≠ importo atteso). Il chiamante lo intercetta per ritornare
 * lo stesso codice del caso "pagamento fallito" (PAYMENT_FAILED) e NON procedere
 * agli step a valle (es. aggiornamento schedule).
 */
export class SeatChargeVerificationFailedError extends Error {
    readonly reason: "declined" | "not_paid" | "amount_mismatch";
    readonly invoiceId: string | null;
    readonly expected: number;
    readonly actual: number;
    constructor(
        reason: "declined" | "not_paid" | "amount_mismatch",
        invoiceId: string | null,
        expected: number,
        actual: number
    ) {
        super(`seat charge verification failed (${reason}): invoice=${invoiceId} expected=${expected} actual=${actual}`);
        this.name = "SeatChargeVerificationFailedError";
        this.reason = reason;
        this.invoiceId = invoiceId;
        this.expected = expected;
        this.actual = actual;
    }
}

/** Riconosce un errore Stripe di pagamento/decline sincrono (vs errore API/rete). */
function isPaymentDeclineError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    const type = (err as { type?: string })?.type ?? "";
    const code = (err as { code?: string })?.code ?? "";
    return (
        type === "StripeCardError" ||
        code === "subscription_payment_intent_requires_action" ||
        /incomplete|requires_action|card_declined|payment/i.test(message)
    );
}

export interface ChargeOneOffSeatDeltaParams {
    stripe: Stripe;
    customerId: string;
    /** Importo in centesimi, > 0. È anche l'importo atteso incassato. */
    amount: number;
    currency: string;
    description: string;
    /**
     * Base deterministica da cui derivare le 3 idempotency key (`:invoice`,
     * `:item`, `:pay`). Stabile sulla transizione → replay sicuro sul retry.
     */
    idempotencyKeyBase: string;
}

export interface ChargeOneOffSeatDeltaResult {
    invoiceId: string;
    amountPaid: number;
}

/**
 * Addebita immediatamente un delta sedi one-off (customer-level, NON tocca la
 * subscription né un eventuale schedule) e VERIFICA che sia stato realmente
 * incassato.
 *
 * Sostituisce la sequenza difettosa `invoiceItems.create` (customer-level) →
 * `invoices.create` → `invoices.pay`: l'item non collegato restava "pending",
 * la fattura finalizzava vuota (€0), `.pay()` su fattura vuota NON lanciava, il
 * chiamante logga(va) successo e procedeva senza aver incassato nulla.
 *
 * Sequenza corretta:
 *  1. crea la draft invoice PRIMA (`auto_advance:false`), così l'item può
 *     esserle collegato esplicitamente;
 *  2. crea l'invoice item con `invoice: <id>` esplicito (mai affidarsi al
 *     comportamento di default dei pending item dell'API);
 *  3. `invoices.pay` finalizza la draft e addebita il metodo di pagamento;
 *  4. verifica `status === 'paid'` E `amount_paid === amount`.
 *
 * Su decline sincrono di `.pay()` o su verifica fallita: void best-effort della
 * fattura (mai lanciare dal void stesso) e throw `SeatChargeVerificationFailedError`.
 * Gli errori API/rete (es. `invoices.create` fallita) si propagano grezzi → il
 * chiamante li mappa sul suo codice generico (502).
 */
export async function chargeOneOffSeatDelta(
    params: ChargeOneOffSeatDeltaParams
): Promise<ChargeOneOffSeatDeltaResult> {
    const { stripe, customerId, amount, currency, description, idempotencyKeyBase } = params;

    let invoiceId: string | null = null;
    try {
        // 1 — draft invoice PRIMA (per poterle collegare l'item esplicitamente).
        const invoice = await stripe.invoices.create(
            {
                customer: customerId,
                auto_advance: false,
                collection_method: "charge_automatically"
            },
            { idempotencyKey: `${idempotencyKeyBase}:invoice` }
        );
        invoiceId = invoice.id;

        // 2 — invoice item COLLEGATO esplicitamente alla fattura.
        await stripe.invoiceItems.create(
            {
                customer: customerId,
                invoice: invoice.id,
                amount,
                currency,
                description
            },
            { idempotencyKey: `${idempotencyKeyBase}:item` }
        );

        // 3 — finalizza (draft → open) e addebita.
        const paid = await stripe.invoices.pay(invoice.id, {
            idempotencyKey: `${idempotencyKeyBase}:pay`
        });

        // 4 — verifica esito REALE: pagare una fattura vuota riuscirebbe a €0
        // senza lanciare. Richiedi paid + importo pieno atteso.
        const amountPaid = paid.amount_paid ?? 0;
        if (paid.status !== "paid" || amountPaid !== amount) {
            const reason = paid.status !== "paid" ? "not_paid" : "amount_mismatch";
            // Void best-effort: solo su fattura non pagata (una paid non è
            // voidable in Stripe). Mai lanciare dal void.
            if (paid.status !== "paid") {
                try {
                    await stripe.invoices.voidInvoice(invoice.id);
                } catch (vErr) {
                    const vMsg = vErr instanceof Error ? vErr.message : String(vErr);
                    console.error(`chargeOneOffSeatDelta: void after verification failure failed: ${vMsg}`);
                }
            }
            throw new SeatChargeVerificationFailedError(reason, invoice.id, amount, amountPaid);
        }

        return { invoiceId: invoice.id, amountPaid };
    } catch (err) {
        // Già tipizzato (verifica fallita sopra) → rilancia intatto.
        if (err instanceof SeatChargeVerificationFailedError) throw err;

        // Decline sincrono di `.pay()`: void best-effort + errore tipizzato.
        if (isPaymentDeclineError(err)) {
            if (invoiceId) {
                try {
                    await stripe.invoices.voidInvoice(invoiceId);
                } catch (vErr) {
                    const vMsg = vErr instanceof Error ? vErr.message : String(vErr);
                    console.error(`chargeOneOffSeatDelta: void after decline failed: ${vMsg}`);
                }
            }
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`chargeOneOffSeatDelta: seat charge payment declined: ${message}`);
            throw new SeatChargeVerificationFailedError("declined", invoiceId, amount, 0);
        }

        // Errore API/rete (es. invoices.create): void best-effort se la fattura
        // esiste, poi propaga grezzo (il chiamante mappa su 502).
        if (invoiceId) {
            try {
                await stripe.invoices.voidInvoice(invoiceId);
            } catch (vErr) {
                const vMsg = vErr instanceof Error ? vErr.message : String(vErr);
                console.error(`chargeOneOffSeatDelta: void after error failed: ${vMsg}`);
            }
        }
        throw err;
    }
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
