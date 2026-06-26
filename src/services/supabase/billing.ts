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
//   - "NO_SUBSCRIPTION"         → tenant senza subscription attiva
//   - "forbidden"               → manca il permesso billing.manage
//   - "SCHEDULE_RELEASE_FAILED" → (combinato) sub ancora schedule-managed, abort
//   - "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED" → (combinato) sedi addebitate ma
//                                  il downgrade non è stato programmato (riprova)
//
// `classification` può valere "combined" quando il tier scende e le sedi
// aumentano nello stesso cambio: le sedi sono addebitate subito (prorata a
// tariffa corrente) e il downgrade è programmato al rinnovo.
// ---------------------------------------------------------------------------

export type SubscriptionChangeInput = {
    plan: PlanCode;
    seats: number;
};

export type SubscriptionChangeClassification = "upgrade" | "downgrade" | "combined";

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
};

async function invokeSubscriptionChange<T>(
    tenantId: string,
    action: "preview" | "commit",
    input: SubscriptionChangeInput
): Promise<T> {
    const { data, error } = await supabase.functions.invoke("stripe-change-subscription", {
        body: { tenantId, action, plan: input.plan, seats: input.seats }
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
export async function commitSubscriptionChange(
    tenantId: string,
    input: SubscriptionChangeInput
): Promise<SubscriptionChangeCommitResult> {
    return invokeSubscriptionChange<SubscriptionChangeCommitResult>(tenantId, "commit", input);
}

// ---------------------------------------------------------------------------
// Stato abbonamento live + disdetta / riattiva (action state/cancel/reactivate)
//
// Fonte di verità = Stripe (la pagina lo legge on mount per il banner
// persistente: cambio programmato e/o disdetta a fine periodo).
// ---------------------------------------------------------------------------

export type SubscriptionPendingChange = {
    targetPlan: PlanCode | null;
    targetSeats: number | null;
    /** ISO della data di effetto (fine periodo corrente). */
    effectiveDate: string | null;
};

export type SubscriptionState = {
    /** ISO del fine periodo corrente. */
    currentPeriodEnd: string | null;
    /** true se l'abbonamento è disdetto a fine periodo. */
    cancelAtPeriodEnd: boolean;
    /** Cambio piano/sedi programmato al rinnovo, o null. */
    pendingChange: SubscriptionPendingChange | null;
};

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

/** Stato abbonamento corrente da Stripe (read-only). Permesso: billing.manage. */
export async function getSubscriptionState(tenantId: string): Promise<SubscriptionState> {
    return invokeBillingAction<SubscriptionState>(tenantId, "state");
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
