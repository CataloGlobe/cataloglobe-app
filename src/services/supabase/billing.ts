import { supabase } from "@/services/supabase/client";
import type { BillingInterval } from "@/types/plan";

export type PlanCode = "base" | "pro";
export type { BillingInterval };

export type CreateCheckoutSessionInput = {
    tenantId: string;
    successUrl?: string;
    cancelUrl?: string;
    quantity?: number;
    planCode?: PlanCode;
    /**
     * Always sent by the frontend. The edge function defaults an ABSENT field
     * to "month" (older callers) but rejects an invalid value.
     */
    billingInterval: BillingInterval;
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
            billingInterval: input.billingInterval,
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

export type ConfirmCheckoutInput = {
    tenantId: string;
    /**
     * Checkout Session id from the `?checkout_session=` return param. Omit to
     * self-repair: the edge adopts the customer's single live subscription
     * (the "paid, closed the tab, webhook lost" case).
     */
    sessionId?: string;
};

export type ConfirmCheckoutResult = {
    status: "linked" | "already_synced";
    subscriptionId: string;
    subscriptionStatus: string;
};

/**
 * Calls the stripe-checkout-confirm Edge Function: links the tenant to its
 * Stripe subscription without waiting for the webhook. Owner only.
 *
 * Edge error codes are attached as `name` on the thrown Error, like
 * `createCheckoutSession` (e.g. `checkout_not_complete`,
 * `multiple_live_subscriptions`, `no_live_subscription`).
 */
export async function confirmCheckoutSession(input: ConfirmCheckoutInput): Promise<ConfirmCheckoutResult> {
    const { data, error } = await supabase.functions.invoke("stripe-checkout-confirm", {
        body: { tenantId: input.tenantId, sessionId: input.sessionId }
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
    if (data?.status !== "linked" && data?.status !== "already_synced") {
        throw new Error("Risposta di conferma non valida.");
    }
    return {
        status: data.status,
        subscriptionId: data.subscription_id as string,
        subscriptionStatus: data.subscription_status as string
    };
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

// ---------------------------------------------------------------------------
// Cambio piano / sedi self-service (edge stripe-change-subscription)
//
// `effective` è "now" per gli upgrade (immediati) oppure un timestamp ISO
// (fine del periodo già pagato) per i downgrade programmati.
//
// Codici errore lanciati dall'edge (attaccati come `error.name`):
//   - "SEATS_OVER_SELF_SERVICE" → oltre il cap self-service (contatta assistenza)
//   - "SEATS_BELOW_ACTIVITIES"  → sotto il numero di sedi del tenant
//   - "NO_CHANGE"               → nessuna variazione reale
//   - "PAYMENT_FAILED"          → addebito prorata rifiutato / richiede azione
//   - "NO_SUBSCRIPTION"         → tenant senza stripe_subscription_id
//   - "SUBSCRIPTION_NOT_FOUND"  → stripe_subscription_id punta a una subscription
//                                  che Stripe non ha più (permanente: assistenza)
//   - "STRIPE_UNAVAILABLE"      → Stripe non raggiungibile (transitorio: riprova)
//   - "forbidden"               → manca il permesso billing.manage
//   - "SCHEDULE_RELEASE_FAILED" → (combinato) sub ancora schedule-managed, abort
//   - "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED" → (combinato) sedi addebitate ma
//                                  il downgrade non è stato programmato (riprova)
//   - "SEATS_ADDED_SCHEDULE_NOT_UPDATED" → (B2: sedi su schedule pendente) sedi
//                                  addebitate ma le fasi non aggiornate; il cambio
//                                  programmato resta intatto, retry idempotente
//                                  converge. Stesso messaggio utente del codice
//                                  SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED
//   - "INTERVAL_CHANGE_BLOCKED" → (passi 4a/4b) cambio di intervallo rifiutato;
//                                  `details.reason` (IntervalBlockReason) dice
//                                  perché. Lanciato come IntervalChangeBlockedError.
//                                  Con reason "interval_pending" è un cambio di
//                                  PIANO/SEDI a essere rifiutato, perché c'è già
//                                  un cambio di intervallo programmato.
//   - "INTERVAL_CHANGE_MIXED"   → intervallo + piano/sedi nella stessa richiesta
//   - "INTERVAL_DOWN_NOT_SUPPORTED" → non più emesso (passo 4b); tenuto per
//                                  compatibilità con funzioni non aggiornate
//   - "invalid_interval"        → valore fuori dominio month|year
//
// `classification` può valere "combined" quando il tier scende e le sedi
// aumentano nello stesso cambio: le sedi sono addebitate subito (prorata a
// tariffa corrente) e il downgrade è programmato al rinnovo.
// ---------------------------------------------------------------------------

export type SubscriptionChangeInput = {
    plan: PlanCode;
    seats: number;
    /**
     * Passi 4a/4b: target billing interval. Omit to keep the current one (every
     * plan/seat change). Accepted only at unchanged plan and seats.
     */
    interval?: BillingInterval;
};

/**
 * "interval-up" = passaggio mensile → annuale (immediato, ciclo riancorato a oggi).
 * "interval-down" = passaggio annuale → mensile (programmato al rinnovo;
 * immediato a €0 in prova, `effective: "now"`).
 */
export type SubscriptionChangeClassification = "upgrade" | "downgrade" | "combined" | "interval-up" | "interval-down";

/**
 * Why the edge refuses a change (`INTERVAL_CHANGE_BLOCKED` → `details.reason`).
 * `interval_pending` is the only one raised on a PLAN/SEAT change: a scheduled
 * interval change is pending and would be dropped by a rewrite of its phase.
 */
export type IntervalBlockReason =
    | "pending_change"
    | "cancel_scheduled"
    | "past_due"
    | "not_active"
    | "discount"
    | "interval_pending";

const INTERVAL_BLOCK_REASONS: ReadonlySet<string> = new Set([
    "pending_change",
    "cancel_scheduled",
    "past_due",
    "not_active",
    "discount",
    "interval_pending"
]);

export class IntervalChangeBlockedError extends Error {
    readonly reason: IntervalBlockReason | null;
    constructor(reason: IntervalBlockReason | null) {
        super("INTERVAL_CHANGE_BLOCKED");
        this.name = "INTERVAL_CHANGE_BLOCKED";
        this.reason = reason;
    }
}

export type SubscriptionChangePreview = {
    classification: SubscriptionChangeClassification;
    plan: PlanCode;
    seats: number;
    /** ISO 4217, lowercase (es. "eur"). */
    currency: string;
    /** Importo addebitato oggi, in centesimi (0 per i downgrade puri; delta sedi
     * prorato a tariffa corrente per il caso "combined"). */
    chargeToday: number;
    /** Importo del prossimo addebito ricorrente, in centesimi. */
    nextAmount: number;
    /** Data del prossimo addebito (ISO) o null se non disponibile. */
    nextDate: string | null;
    /** "now" per upgrade immediati, timestamp ISO per downgrade programmati. */
    effective: string;
    /**
     * ISO della fine prova se l'abbonamento è in prova al momento della preview,
     * altrimenti null. Fatto letto live da Stripe nella stessa richiesta: in
     * prova `chargeToday` è la prima fattura (a fine prova), non un addebito di
     * oggi, e la UI lo dice. Opzionale per compatibilità con risposte precedenti.
     */
    trialEndsAt?: string | null;
    /**
     * In prova: importo della prima fattura (a fine prova) per il cambio
     * richiesto, letto dall'anteprima Stripe. Null fuori prova o se l'anteprima
     * non è disponibile: in quel caso la UI dice la data senza importo — mai
     * una cifra ricavata altrimenti.
     */
    trialFirstInvoiceCents?: number | null;
    /**
     * Passo 4a (solo classification "interval-up"): credito per il non consumato
     * del mese in corso, in centesimi NEGATIVI (0 in prova). Già scalato da
     * `chargeToday`; esposto per spiegare l'importo, mai per ricalcolarlo.
     */
    prorationCreditCents?: number;
    currentInterval?: BillingInterval;
    targetInterval?: BillingInterval;
};

export type SubscriptionChangeCommitResult = {
    ok: true;
    classification: SubscriptionChangeClassification;
    plan: PlanCode;
    seats: number;
    /** "now" (upgrade) oppure ISO del fine periodo (downgrade). */
    effective: string | null;
    scheduledChange?: boolean;
    scheduleId?: string;
    /** Passo 4a: intervallo applicato + nuova fine periodo (ciclo riancorato a oggi). */
    interval?: BillingInterval;
    currentPeriodEnd?: string | null;
};

/** Reads `{ error, details }` from an edge error response body, if any. */
async function extractEdgeErrorBody(error: unknown): Promise<{ error: string; details?: Record<string, unknown> } | null> {
    if (!error || typeof error !== "object") return null;
    const ctx = (error as { context?: unknown }).context;
    if (!ctx || typeof (ctx as Response).clone !== "function") return null;
    try {
        const body = await (ctx as Response).clone().json();
        if (body && typeof body.error === "string") {
            return { error: body.error, details: typeof body.details === "object" && body.details ? body.details : undefined };
        }
    } catch {
        // Body not JSON → fall back to default error
    }
    return null;
}

async function invokeSubscriptionChange<T>(
    tenantId: string,
    action: "preview" | "commit" | "preview-scheduled-change" | "update-scheduled-change",
    input: SubscriptionChangeInput
): Promise<T> {
    // Per-attempt id: generated fresh at THIS invocation (one call == one
    // "Conferma" click). Scopes the Stripe idempotency keys built edge-side to a
    // single user attempt — a network retry of the same invoke reuses it (intended
    // double-submit protection), while a new click after a visible error produces
    // a new call, hence a new id, so the genuine retry is not swallowed as a stale
    // replay inside Stripe's 24h idempotency window.
    const requestId = crypto.randomUUID();
    // `interval` is sent only when set: the edge treats an absent field as
    // "keep the current interval", so plan/seat changes are byte-identical.
    const { data, error } = await supabase.functions.invoke("stripe-change-subscription", {
        body: {
            tenantId,
            action,
            plan: input.plan,
            seats: input.seats,
            request_id: requestId,
            ...(input.interval ? { interval: input.interval } : {})
        }
    });

    if (error) {
        const body = await extractEdgeErrorBody(error);
        if (body) {
            if (body.error === "INTERVAL_CHANGE_BLOCKED") {
                const reason = body.details?.reason;
                throw new IntervalChangeBlockedError(
                    typeof reason === "string" && INTERVAL_BLOCK_REASONS.has(reason) ? (reason as IntervalBlockReason) : null
                );
            }
            const wrapped = new Error(body.error);
            wrapped.name = body.error;
            throw wrapped;
        }
        throw error;
    }
    if (!data) throw new Error("Nessuna risposta dall'edge di cambio abbonamento.");
    return data as T;
}

/**
 * Anteprima del cambio piano/sedi: non modifica nulla su Stripe.
 * Ritorna gli importi esatti calcolati da Stripe (preview proration).
 */
export async function previewSubscriptionChange(
    tenantId: string,
    input: SubscriptionChangeInput
): Promise<SubscriptionChangePreview> {
    return invokeSubscriptionChange<SubscriptionChangePreview>(tenantId, "preview", input);
}

/**
 * Applica il cambio piano/sedi.
 * Upgrade → immediato (addebito prorata). Downgrade → programmato a fine periodo.
 * La sincronizzazione di `tenants` avviene via webhook Stripe.
 */
/**
 * Passi 4a/4b — anteprima del cambio di intervallo a piano e sedi correnti.
 * Non modifica nulla. Lancia IntervalChangeBlockedError quando il cambio è
 * rifiutato (cambio programmato, disdetta, pagamento in sofferenza, sconto
 * attivo).
 */
export async function previewIntervalChange(
    tenantId: string,
    input: { plan: PlanCode; seats: number; interval: BillingInterval }
): Promise<SubscriptionChangePreview> {
    return invokeSubscriptionChange<SubscriptionChangePreview>(tenantId, "preview", input);
}

/**
 * Passi 4a/4b — applica il cambio di intervallo. "year": addebito immediato,
 * ciclo riancorato a oggi. "month": programmato al rinnovo (`scheduledChange`),
 * immediato a €0 in prova (`effective: "now"`).
 */
export async function commitIntervalChange(
    tenantId: string,
    input: { plan: PlanCode; seats: number; interval: BillingInterval }
): Promise<SubscriptionChangeCommitResult> {
    return invokeSubscriptionChange<SubscriptionChangeCommitResult>(tenantId, "commit", input);
}

export async function commitSubscriptionChange(
    tenantId: string,
    input: SubscriptionChangeInput
): Promise<SubscriptionChangeCommitResult> {
    return invokeSubscriptionChange<SubscriptionChangeCommitResult>(tenantId, "commit", input);
}

// ---------------------------------------------------------------------------
// B5 — modifica IN-PLACE del bersaglio futuro di un cambio programmato.
// SEMPRE €0: tocca solo la fase futura dello schedule (piano e/o sedi diversi
// al rinnovo). Niente addebito, niente declino. Si attiva solo quando esiste un
// cambio programmato. Permesso: billing.manage.
//
// Caso degenere (nuovo futuro == stato corrente live) → l'edge rilascia lo
// schedule (equivale ad annullare) e ritorna `action: "released"`.
//
// Error code (oltre a quelli comuni): "NO_SCHEDULED_CHANGE" → nessun cambio
// programmato da modificare (race: il pending non esiste più).
// ---------------------------------------------------------------------------

export type ScheduledChangeUpdateResult = {
    ok: true;
    /** "updated" = fase futura riscritta; "released" = schedule rilasciato (degenere). */
    action: "updated" | "released";
    classification?: "scheduled";
    plan?: PlanCode;
    seats?: number;
    effective?: string | null;
    scheduleId?: string;
};

/** Anteprima €0 della modifica del cambio programmato (nuovo target futuro). */
export async function previewScheduledChange(
    tenantId: string,
    input: SubscriptionChangeInput
): Promise<SubscriptionChangePreview> {
    return invokeSubscriptionChange<SubscriptionChangePreview>(tenantId, "preview-scheduled-change", input);
}

/** Applica la modifica del cambio programmato (solo fase futura, €0). */
export async function updateScheduledChange(
    tenantId: string,
    input: SubscriptionChangeInput
): Promise<ScheduledChangeUpdateResult> {
    return invokeSubscriptionChange<ScheduledChangeUpdateResult>(tenantId, "update-scheduled-change", input);
}

// ---------------------------------------------------------------------------
// Stato abbonamento live + disdetta / riattiva (action state/cancel/reactivate)
//
// Fonte di verità = Stripe (la pagina lo legge on mount per il banner
// persistente: cambio programmato e/o disdetta a fine periodo).
// ---------------------------------------------------------------------------

export type SubscriptionPendingChange = {
    targetPlan: PlanCode | null;
    /** Intervallo del Price della fase futura (da `plan_prices`), null se non risolto. */
    targetInterval: BillingInterval | null;
    targetSeats: number | null;
    /** ISO della data di effetto (fine periodo corrente). */
    effectiveDate: string | null;
};

/** Coupon Stripe attivo sulla subscription (`discounts[0].coupon`), o null. */
export type SubscriptionDiscount = {
    /** Percentuale di sconto (es. 100 per "100% off"), null se il coupon è amount_off. */
    percentOff: number | null;
    /** Sconto fisso in centesimi, null se il coupon è percent_off. */
    amountOff: number | null;
    /** ISO 4217 lowercase, presente solo per coupon amount_off. */
    currency: string | null;
    /** ISO di scadenza del coupon (duration `repeating`), null se `once`/`forever`. */
    end: string | null;
    name: string | null;
    /** `once` = si applica solo al prossimo rinnovo, poi prezzo pieno. `forever` = sempre. `repeating` = fino a `end`. */
    duration: "forever" | "once" | "repeating";
};

/** Sconto già consumato sul periodo corrente + totale effettivo della fattura scontata. */
export type ConsumedDiscountThisPeriod = SubscriptionDiscount & {
    /** Totale effettivamente addebitato dalla fattura scontata, in centesimi (stessa unità di `amountOff`). */
    invoiceTotal: number;
};

export type SubscriptionState = {
    /** ISO del fine periodo corrente. */
    currentPeriodEnd: string | null;
    /**
     * Intervallo di fatturazione corrente (dal Price live via `plan_prices`),
     * null se non risolvibile. Popolato solo dall'action "state".
     */
    currentInterval?: BillingInterval | null;
    /** ISO della fine prova se in prova, altrimenti null. Popolato solo dall'action "state". */
    trialEndsAt?: string | null;
    /** true se l'abbonamento è disdetto a fine periodo. */
    cancelAtPeriodEnd: boolean;
    /** Cambio piano/sedi programmato al rinnovo, o null. */
    pendingChange: SubscriptionPendingChange | null;
    /** Coupon attivo, o null. Popolato solo dall'action "state". */
    discount?: SubscriptionDiscount | null;
    /**
     * Sconto già consumato ma relativo al periodo corrente, o null. Copre il
     * caso coupon `once` rimosso da Stripe alla finalizzazione della fattura:
     * non è uno sconto attivo sul futuro (niente prezzo barrato), solo nota
     * informativa sul perché il periodo in corso è costato meno. Mutuamente
     * esclusivo con `discount`. Popolato solo dall'action "state".
     */
    consumedDiscountThisPeriod?: ConsumedDiscountThisPeriod | null;
    /**
     * true se la subscription o il customer hanno un metodo di pagamento
     * predefinito; false se nessuno dei due (prova senza carta); null se non
     * determinabile (lettura customer fallita). Popolato solo dall'action "state".
     */
    hasPaymentMethod?: boolean | null;
};

/**
 * Why the current subscription could not be read (action "state" answers 200
 * with `reconciled:false` instead of an error, so the page can tell "loaded
 * badly" from "not loaded yet"):
 * - `subscription_missing`: the tenant points to a subscription Stripe no
 *   longer has. Permanent — needs support, never self-repaired.
 * - `stripe_unavailable`: Stripe could not be reached. Transient, reload.
 */
export type SubscriptionStateUnavailableReason = "subscription_missing" | "stripe_unavailable";

export type SubscriptionStateUnavailable = {
    reconciled: false;
    reason: SubscriptionStateUnavailableReason;
};

export type SubscriptionStateResult = SubscriptionState | SubscriptionStateUnavailable;

export function isSubscriptionStateUnavailable(
    state: SubscriptionStateResult
): state is SubscriptionStateUnavailable {
    return (state as SubscriptionStateUnavailable).reconciled === false;
}

async function invokeBillingAction<T>(
    tenantId: string,
    action: "state" | "cancel" | "reactivate" | "cancel-scheduled-change"
): Promise<T> {
    const { data, error } = await supabase.functions.invoke("stripe-change-subscription", {
        body: { tenantId, action }
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
    if (!data) throw new Error("Nessuna risposta dall'edge abbonamento.");
    return data as T;
}

/**
 * Stato abbonamento corrente da Stripe (read-only). Permesso: billing.manage.
 * Ritorna `SubscriptionStateUnavailable` quando la subscription non si legge
 * (vedi `isSubscriptionStateUnavailable`); lancia solo per errori di chiamata.
 */
export async function getSubscriptionState(tenantId: string): Promise<SubscriptionStateResult> {
    return invokeBillingAction<SubscriptionStateResult>(tenantId, "state");
}

/** Disdetta a fine periodo (nessun rimborso). Permesso: billing.cancel. */
export async function cancelSubscription(tenantId: string): Promise<SubscriptionState> {
    return invokeBillingAction<SubscriptionState>(tenantId, "cancel");
}

/** Annulla la disdetta programmata. Permesso: billing.cancel. */
export async function reactivateSubscription(tenantId: string): Promise<SubscriptionState> {
    return invokeBillingAction<SubscriptionState>(tenantId, "reactivate");
}

/**
 * Annulla un cambio programmato (downgrade / riduzione futura) rilasciando lo
 * schedule Stripe. NON disdice l'abbonamento: la subscription resta attiva e in
 * rinnovo sulla fase corrente, sedi correnti invariate (tocca solo il tier
 * futuro). Idempotente: no-op se non c'e' alcun cambio programmato.
 * Permesso: billing.manage.
 *
 * Error code (attaccato come `error.name`):
 *   - "CANCEL_SCHEDULED_CHANGE_FAILED" → subscription ancora schedule-managed
 *     dopo il release (re-read fail-closed) → riprova.
 */
export async function cancelScheduledChange(tenantId: string): Promise<SubscriptionState> {
    return invokeBillingAction<SubscriptionState>(tenantId, "cancel-scheduled-change");
}
